-- ============================================================
-- 🎟️ 抢票与座位对照表 v3：结构化组合选择（零自由文本）+ 二次核对
-- 可直接在 Supabase SQL Editor 整段执行，重复执行安全
-- 说明：所有读写都走 SECURITY DEFINER 函数，表本身对 anon 不开放读写
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1) 建表（新环境直接创建；旧环境自动补齐字段） ----------
create table if not exists public.show_ticket_seats (
  id uuid primary key default gen_random_uuid(),
  show_id text not null,
  device_id text not null,
  platform text not null,
  pay_seconds integer not null default 0,
  zone text not null default '',
  seat_detail text not null default '',
  created_at timestamptz not null default now()
);

alter table public.show_ticket_seats add column if not exists show_id text;
alter table public.show_ticket_seats add column if not exists device_id text;
alter table public.show_ticket_seats add column if not exists platform text;
alter table public.show_ticket_seats add column if not exists pay_seconds integer default 0;
alter table public.show_ticket_seats add column if not exists zone text default '';
alter table public.show_ticket_seats add column if not exists seat_detail text default '';
alter table public.show_ticket_seats add column if not exists created_at timestamptz default now();
alter table public.show_ticket_seats add column if not exists updated_at timestamptz default now();

-- ---------- 2) 旧版字段（event_id / seconds / area / seat）兼容迁移 ----------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'show_ticket_seats' and column_name = 'event_id'
  ) then
    execute 'alter table public.show_ticket_seats alter column event_id drop not null';
    execute $sql$
      update public.show_ticket_seats
         set show_id = coalesce(nullif(show_id, ''), event_id),
             pay_seconds = case when coalesce(pay_seconds, 0) = 0 then coalesce(seconds, 0) else pay_seconds end
       where show_id is null or show_id = ''
    $sql$;
    execute 'alter table public.show_ticket_seats alter column event_id drop default';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'show_ticket_seats' and column_name = 'seconds'
  ) then
    execute 'alter table public.show_ticket_seats alter column seconds drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'show_ticket_seats' and column_name = 'area'
  ) then
    execute 'alter table public.show_ticket_seats alter column area drop not null';
    execute $sql$
      update public.show_ticket_seats
         set zone = coalesce(nullif(zone, ''), area)
       where zone is null or zone = ''
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'show_ticket_seats' and column_name = 'seat'
  ) then
    execute 'alter table public.show_ticket_seats alter column seat drop not null';
    execute $sql$
      update public.show_ticket_seats
         set seat_detail = coalesce(nullif(seat_detail, ''), seat)
       where seat_detail is null or seat_detail = ''
    $sql$;
  end if;
end $$;

update public.show_ticket_seats set pay_seconds = 0 where pay_seconds is null;
update public.show_ticket_seats set zone = '' where zone is null;
update public.show_ticket_seats set seat_detail = '' where seat_detail is null;
update public.show_ticket_seats set updated_at = now() where updated_at is null;
update public.show_ticket_seats set platform = '坤音商城' where platform is null or platform = '';

-- ⚠️ 关键：先移除四个 CHECK 约束，再做数据清洗，避免旧数据被旧约束拦截
alter table public.show_ticket_seats drop constraint if exists show_ticket_seats_platform_chk;
alter table public.show_ticket_seats drop constraint if exists show_ticket_seats_seconds_chk;
alter table public.show_ticket_seats drop constraint if exists show_ticket_seats_zone_chk;
alter table public.show_ticket_seats drop constraint if exists show_ticket_seats_seat_chk;

-- 平台归一化：先去掉空格 / 全角空格 / 零宽字符，再按前缀归入白名单
with cleaned as (
  select id,
         btrim(translate(coalesce(platform, ''), E' \t\r\n\u00a0\u3000\u200b\u200c\u200d\ufeff', '')) as p
  from public.show_ticket_seats
)
update public.show_ticket_seats t
   set platform = case
     when c.p like '坤音%' then '坤音商城'
     when c.p like '大麦%' then '大麦'
     when c.p like '猫眼%' then '猫眼'
     when c.p like '纷玩%' then '纷玩岛'
     when c.p like '票星球%' then '票星球'
     when c.p like '秀动%' then '秀动'
     else '坤音商城'
   end
  from cleaned c
 where t.id = c.id;

-- 区域归一化：旧格式「内场B区 / 一层看台（前区/正对）」→ 新枚举「大类 · 区号」
with parsed as (
  select id,
         case
           when btrim(zone) like '内场%' then '内场'
           when btrim(zone) like '一层%' then '一层看台'
           when btrim(zone) like '二层%' then '二层看台'
           when btrim(zone) like '三层%' then '三层看台'
           when btrim(zone) like '包厢%' then '包厢区'
           when btrim(zone) ~ '站区|音乐节|前区近距离|后区' then '音乐节站区'
           else '内场'
         end as main,
         (regexp_match(btrim(zone), '([A-F]区|[A-D][1-4]区|C[12]区|D[12]区|VIP区|[123](0[1-9]|1[0-9]|2[0-5])区)$'))[1] as sub
    from public.show_ticket_seats
)
update public.show_ticket_seats t
   set zone = case when p.sub is null then p.main else p.main || ' · ' || p.sub end
  from parsed p
 where t.id = p.id
   and not (
     coalesce(t.zone, '') ~ '^(内场|一层看台|二层看台|三层看台|包厢区|音乐节站区)$'
     or coalesce(t.zone, '') ~ '^(内场|一层看台|二层看台|三层看台|包厢区|音乐节站区) · (无细分区|VIP区|[A-F]区|[A-D][1-4]区|C[12]区|D[12]区|[123](0[1-9]|1[0-9]|2[0-5])区)$'
   );

-- 排座归一化：旧格式「9-15排（中区） · 中间号段」→ 新枚举「N排」或「N排 M号」
with parsed as (
  select id, btrim(coalesce(seat_detail, '')) as s
    from public.show_ticket_seats
)
update public.show_ticket_seats t
   set seat_detail = case
     when p.s ~ '站区|音乐节|无排号|自由站' then '站区/无排号'
     when p.s ~ '^([1-9]|[12][0-9]|3[0-5])-' then
       substring(p.s from '^([1-9]|[12][0-9]|3[0-5])') || '排'
     when p.s ~ '([1-9]|[12][0-9]|3[0-5])排' then
       substring(p.s from '([1-9]|[12][0-9]|3[0-5])排') || '排'
       || coalesce(' ' || (regexp_match(p.s, '([1-9]|[1-4][0-9]|50)号'))[1], '')
     else '站区/无排号'
   end
  from parsed p
 where t.id = p.id
   and not (
     coalesce(t.seat_detail, '') = '站区/无排号'
     or coalesce(t.seat_detail, '') ~ '^([1-9]|[12][0-9]|3[0-5])排$'
     or coalesce(t.seat_detail, '') ~ '^([1-9]|[12][0-9]|3[0-5])排 ([1-9]|[1-4][0-9]|50)号$'
   );

update public.show_ticket_seats set pay_seconds = 0 where pay_seconds is null;
update public.show_ticket_seats set pay_seconds = 0 where pay_seconds < 0 or pay_seconds > 600;

-- 清理无法归属场次 / 设备的脏行，并合并同场同设备的重复行（保留最新一条）
delete from public.show_ticket_seats
 where coalesce(btrim(show_id), '') = ''
    or coalesce(btrim(device_id), '') = '';

delete from public.show_ticket_seats a
 using public.show_ticket_seats b
 where a.show_id = b.show_id
   and a.device_id = b.device_id
   and (coalesce(a.updated_at, a.created_at, now()) < coalesce(b.updated_at, b.created_at, now())
        or (coalesce(a.updated_at, a.created_at, now()) = coalesce(b.updated_at, b.created_at, now()) and a.id < b.id));

alter table public.show_ticket_seats alter column show_id set not null;
alter table public.show_ticket_seats alter column device_id set not null;
alter table public.show_ticket_seats alter column platform set not null;

-- 同一场演出、同一台设备只允许 1 条
create unique index if not exists show_ticket_seats_show_device_uidx
  on public.show_ticket_seats (show_id, device_id);

create index if not exists show_ticket_seats_show_idx
  on public.show_ticket_seats (show_id, pay_seconds);

-- 字段级白名单约束（后端第二道防线）
alter table public.show_ticket_seats drop constraint if exists show_ticket_seats_platform_chk;
alter table public.show_ticket_seats add constraint show_ticket_seats_platform_chk
  check (platform in ('坤音商城', '大麦', '猫眼', '纷玩岛', '票星球', '秀动'));

alter table public.show_ticket_seats drop constraint if exists show_ticket_seats_seconds_chk;
alter table public.show_ticket_seats add constraint show_ticket_seats_seconds_chk
  check (pay_seconds between 0 and 600);

-- 区域：大类 + 可选「 · 区号」，区号只允许固定枚举
alter table public.show_ticket_seats drop constraint if exists show_ticket_seats_zone_chk;
alter table public.show_ticket_seats add constraint show_ticket_seats_zone_chk
  check (
    zone ~ '^(内场|一层看台|二层看台|三层看台|包厢区|音乐节站区)$'
    or zone ~ '^(内场|一层看台|二层看台|三层看台|包厢区|音乐节站区) · (无细分区|VIP区|[A-F]区|[A-D][1-4]区|C[12]区|D[12]区|[123](0[1-9]|1[0-9]|2[0-5])区)$'
  );

-- 排座：站区/无排号 或「N排」或「N排 M号」
alter table public.show_ticket_seats drop constraint if exists show_ticket_seats_seat_chk;
alter table public.show_ticket_seats add constraint show_ticket_seats_seat_chk
  check (
    seat_detail = '站区/无排号'
    or seat_detail ~ '^([1-9]|[12][0-9]|3[0-5])排$'
    or seat_detail ~ '^([1-9]|[12][0-9]|3[0-5])排 ([1-9]|[1-4][0-9]|50)号$'
  );

-- ---------- 3) RLS：表不开放给前端，全部走 RPC ----------
alter table public.show_ticket_seats enable row level security;
revoke all on public.show_ticket_seats from public, anon, authenticated;

-- ---------- 4) 公开查询：按场次返回全部出票对照数据 ----------
drop function if exists public.get_show_ticket_seats(text);

create or replace function public.get_show_ticket_seats(p_show_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_items jsonb;
begin
  if p_show_id is null or btrim(p_show_id) = '' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.pay_seconds asc, t.created_at asc), '[]'::jsonb)
    into v_items
  from (
    select id, platform, pay_seconds, zone, seat_detail, device_id, created_at
    from public.show_ticket_seats
    where show_id = btrim(p_show_id)
    limit 500
  ) t;

  return v_items;
end;
$$;

-- ---------- 5) 本机提交 / 修改（同设备同场唯一，重复提交即覆盖） ----------
drop function if exists public.upsert_show_ticket_seat(text, text, text, integer, text, text);

create or replace function public.upsert_show_ticket_seat(
  p_show_id text,
  p_device_id text,
  p_platform text,
  p_pay_seconds integer,
  p_zone text,
  p_seat_detail text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_platform text := coalesce(btrim(p_platform), '');
  v_zone text := coalesce(btrim(p_zone), '');
  v_seat text := coalesce(btrim(p_seat_detail), '');
  v_row public.show_ticket_seats;
begin
  if p_show_id is null or btrim(p_show_id) = '' then
    raise exception 'show_id 不能为空';
  end if;
  if p_device_id is null or btrim(p_device_id) = '' then
    raise exception 'device_id 不能为空';
  end if;
  if p_pay_seconds is null or p_pay_seconds < 0 or p_pay_seconds > 600 then
    raise exception '付款秒数需在 0–600 之间';
  end if;
  if v_platform not in ('坤音商城', '大麦', '猫眼', '纷玩岛', '票星球', '秀动') then
    raise exception '购票平台不在白名单内';
  end if;
  if v_zone = '' then
    raise exception '票档区域不能为空';
  end if;
  if v_seat = '' then
    raise exception '排座位置不能为空';
  end if;

  insert into public.show_ticket_seats (show_id, device_id, platform, pay_seconds, zone, seat_detail, created_at, updated_at)
  values (btrim(p_show_id), btrim(p_device_id), v_platform, p_pay_seconds, v_zone, v_seat, now(), now())
  on conflict (show_id, device_id) do update
     set platform = excluded.platform,
         pay_seconds = excluded.pay_seconds,
         zone = excluded.zone,
         seat_detail = excluded.seat_detail,
         updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'platform', v_row.platform,
    'pay_seconds', v_row.pay_seconds,
    'zone', v_row.zone,
    'seat_detail', v_row.seat_detail,
    'device_id', v_row.device_id,
    'created_at', v_row.created_at
  );
end;
$$;

-- ---------- 6) 本机撤回 ----------
create or replace function public.delete_own_ticket_seat(p_show_id text, p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
begin
  delete from public.show_ticket_seats
   where show_id = btrim(coalesce(p_show_id, ''))
     and device_id = btrim(coalesce(p_device_id, ''));
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', v_count > 0, 'deleted', v_count);
end;
$$;

-- ---------- 7) 管理员口令校验（与安检投票 / 反馈箱共用 security_admin_config） ----------
create or replace function public._ticket_seat_admin_ok(p_admin_key text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if p_admin_key is null or btrim(p_admin_key) = '' then
    return false;
  end if;
  select key_sha256 into v_hash from public.security_admin_config where id = 1;
  if v_hash is null then
    raise exception 'security_admin_config 未初始化，请先执行安检投票管理员口令 SQL';
  end if;
  return encode(digest(btrim(p_admin_key), 'sha256'), 'hex') = v_hash;
end;
$$;

revoke all on function public._ticket_seat_admin_ok(text) from public, anon, authenticated;

-- ---------- 8) 管理员删除任意一条 ----------
create or replace function public.admin_delete_ticket_seat(p_id uuid, p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
begin
  if not public._ticket_seat_admin_ok(p_admin_key) then
    raise exception 'Unauthorized';
  end if;

  delete from public.show_ticket_seats where id = p_id;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', v_count > 0, 'deleted', v_count);
end;
$$;

-- ---------- 9) 授权 + 刷新 PostgREST schema 缓存 ----------
grant execute on function public.get_show_ticket_seats(text) to anon, authenticated;
grant execute on function public.upsert_show_ticket_seat(text, text, text, integer, text, text) to anon, authenticated;
grant execute on function public.delete_own_ticket_seat(text, text) to anon, authenticated;
grant execute on function public.admin_delete_ticket_seat(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
