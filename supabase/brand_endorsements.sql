-- ============================================================
-- 💼 ONERLAND 商务档案：Supabase 云端表 + 管理员 RPC
-- 直接整段复制到 Supabase SQL Editor 执行，可重复运行（幂等）。
--
-- 设计：
--   1) brand_endorsements 对 anon / authenticated 只开放 SELECT，所有设备共享同一份云端数据；
--   2) 新增 / 编辑 / 切换状态 / 删除 / 批量导入只能调用 admin_* RPC，函数内部校验
--      全站统一管理员口令哈希 security_admin_config.key_sha256；
--   3) 不开放 anon 直接写表，前端失败时必须明确报错，禁止静默降级 localStorage；
--   4) 兼容旧版 brand / category / period 列：首次执行会把旧数据迁移到 brand_name / artist / period_text。
--
-- ⚠️ 管理员口令哈希与 fan_chants / 同款打卡 / 安检投票 / 反馈箱共用 security_admin_config。
--    若尚未配置，请把 “你的管理员密码” 换成全站解锁口令后单独执行一次：
--    update public.security_admin_config
--       set key_sha256 = encode(digest('你的管理员密码','sha256'),'hex'),
--           updated_at = now()
--     where id = 1;
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- 0) 全站统一管理员口令哈希配置（与其它模块共用） ----------
create table if not exists public.security_admin_config (
  id         integer primary key default 1,
  key_sha256 text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.security_admin_config (id) values (1)
on conflict (id) do nothing;

alter table public.security_admin_config enable row level security;
revoke all on table public.security_admin_config from anon, authenticated;

-- ---------- 1) 商务档案主表 ----------
create table if not exists public.brand_endorsements (
  id            uuid primary key default gen_random_uuid(),
  brand_name    text not null,
  title         text,
  artist        text not null default 'ONER全员'
                check (artist in ('ONER全员', '岳岳', '木子洋', '灵超')),
  is_active     boolean not null default true,
  period_text   text,
  note          text,
  official_url  text,
  announce_date date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 兼容旧版表：补齐新列
alter table public.brand_endorsements add column if not exists brand_name text;
alter table public.brand_endorsements add column if not exists title text;
alter table public.brand_endorsements add column if not exists artist text;
alter table public.brand_endorsements add column if not exists is_active boolean not null default true;
alter table public.brand_endorsements add column if not exists period_text text;
alter table public.brand_endorsements add column if not exists note text;
alter table public.brand_endorsements add column if not exists official_url text;
alter table public.brand_endorsements add column if not exists announce_date date;
alter table public.brand_endorsements add column if not exists created_at timestamptz not null default now();
alter table public.brand_endorsements add column if not exists updated_at timestamptz not null default now();

-- 旧版 brand → brand_name，并解除旧列的非空约束，避免新 RPC 插入被旧列卡住
do $migrate$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'brand_endorsements' and column_name = 'brand'
  ) then
    execute 'update public.brand_endorsements
                set brand_name = brand
              where (brand_name is null or length(btrim(brand_name)) = 0)
                and brand is not null';
    execute 'alter table public.brand_endorsements alter column brand drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'brand_endorsements' and column_name = 'category'
  ) then
    execute 'update public.brand_endorsements
                set artist = category
              where (artist is null or length(btrim(artist)) = 0)
                and category is not null';
    execute 'alter table public.brand_endorsements alter column category drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'brand_endorsements' and column_name = 'period'
  ) then
    execute 'update public.brand_endorsements
                set period_text = period
              where (period_text is null or length(btrim(period_text)) = 0)
                and period is not null';
  end if;
end
$migrate$;

update public.brand_endorsements
   set brand_name = '未命名品牌'
 where brand_name is null or btrim(brand_name) = '';

update public.brand_endorsements
   set artist = 'ONER全员'
 where artist is null or btrim(artist) = '';

update public.brand_endorsements
   set artist = 'ONER全员'
 where artist not in ('ONER全员', '岳岳', '木子洋', '灵超');

update public.brand_endorsements
   set is_active = true
 where is_active is null;

alter table public.brand_endorsements alter column title drop not null;
alter table public.brand_endorsements alter column brand_name set not null;
alter table public.brand_endorsements alter column artist set default 'ONER全员';
alter table public.brand_endorsements alter column artist set not null;
alter table public.brand_endorsements alter column is_active set not null;
alter table public.brand_endorsements alter column created_at set not null;

alter table public.brand_endorsements drop constraint if exists brand_endorsements_artist_chk;
alter table public.brand_endorsements
  add constraint brand_endorsements_artist_chk
  check (artist in ('ONER全员', '岳岳', '木子洋', '灵超'));

create index if not exists brand_endorsements_active_date_idx
  on public.brand_endorsements (is_active desc, announce_date desc);
create index if not exists brand_endorsements_artist_idx
  on public.brand_endorsements (artist);
create index if not exists brand_endorsements_created_idx
  on public.brand_endorsements (created_at asc);

-- 自动维护 updated_at
create or replace function public.touch_brand_endorsements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brand_endorsements_touch_updated_at on public.brand_endorsements;
create trigger brand_endorsements_touch_updated_at
  before update on public.brand_endorsements
  for each row execute function public.touch_brand_endorsements_updated_at();

-- ---------- 2) RLS：所有人可公开读取，写入只走 SECURITY DEFINER RPC ----------
alter table public.brand_endorsements enable row level security;

drop policy if exists "brand_endorsements anon read" on public.brand_endorsements;
create policy "brand_endorsements anon read"
  on public.brand_endorsements for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.brand_endorsements from anon, authenticated;
grant select on public.brand_endorsements to anon, authenticated;

-- ---------- 3) 管理员口令校验（复用全站 security_admin_config） ----------
create or replace function public._brand_admin_ok(p_admin_key text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
      from public.security_admin_config
     where id = 1
       and key_sha256 <> ''
       and key_sha256 = encode(digest(btrim(coalesce(p_admin_key, '')), 'sha256'), 'hex')
  );
$$;

revoke all on function public._brand_admin_ok(text) from public, anon, authenticated;

-- ---------- 4) 新增商务合作 ----------
create or replace function public.admin_create_brand_endorsement(
  p_admin_key     text,
  p_brand_name    text,
  p_title         text default null,
  p_artist        text default 'ONER全员',
  p_is_active     boolean default true,
  p_period_text   text default null,
  p_note          text default null,
  p_official_url  text default null,
  p_announce_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.brand_endorsements%rowtype;
  v_artist text;
  v_url text;
begin
  if not public._brand_admin_ok(p_admin_key) then
    raise exception '管理员口令校验失败，请确认与全站解锁口令一致' using errcode = '42501';
  end if;
  if btrim(coalesce(p_brand_name, '')) = '' then
    raise exception '品牌名称不能为空' using errcode = '22023';
  end if;

  v_artist := coalesce(nullif(btrim(coalesce(p_artist, '')), ''), 'ONER全员');
  if v_artist not in ('ONER全员', '岳岳', '木子洋', '灵超') then
    raise exception '合作对象只能是 ONER全员 / 岳岳 / 木子洋 / 灵超' using errcode = '22023';
  end if;

  v_url := nullif(btrim(coalesce(p_official_url, '')), '');
  if v_url is not null and v_url !~* '^https?://' then
    raise exception '官方链接需以 http:// 或 https:// 开头' using errcode = '22023';
  end if;

  insert into public.brand_endorsements (
    brand_name, title, artist, is_active, period_text, note, official_url, announce_date
  ) values (
    btrim(p_brand_name),
    nullif(btrim(coalesce(p_title, '')), ''),
    v_artist,
    coalesce(p_is_active, true),
    nullif(btrim(coalesce(p_period_text, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    v_url,
    p_announce_date
  )
  returning * into v_row;

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$$;

-- ---------- 5) 编辑商务合作 ----------
create or replace function public.admin_update_brand_endorsement(
  p_admin_key     text,
  p_id            uuid,
  p_brand_name    text,
  p_title         text default null,
  p_artist        text default 'ONER全员',
  p_is_active     boolean default true,
  p_period_text   text default null,
  p_note          text default null,
  p_official_url  text default null,
  p_announce_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.brand_endorsements%rowtype;
  v_artist text;
  v_url text;
begin
  if not public._brand_admin_ok(p_admin_key) then
    raise exception '管理员口令校验失败，请确认与全站解锁口令一致' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception '缺少商务记录 id' using errcode = '22023';
  end if;
  if btrim(coalesce(p_brand_name, '')) = '' then
    raise exception '品牌名称不能为空' using errcode = '22023';
  end if;

  v_artist := coalesce(nullif(btrim(coalesce(p_artist, '')), ''), 'ONER全员');
  if v_artist not in ('ONER全员', '岳岳', '木子洋', '灵超') then
    raise exception '合作对象只能是 ONER全员 / 岳岳 / 木子洋 / 灵超' using errcode = '22023';
  end if;

  v_url := nullif(btrim(coalesce(p_official_url, '')), '');
  if v_url is not null and v_url !~* '^https?://' then
    raise exception '官方链接需以 http:// 或 https:// 开头' using errcode = '22023';
  end if;

  update public.brand_endorsements
     set brand_name    = btrim(p_brand_name),
         title         = nullif(btrim(coalesce(p_title, '')), ''),
         artist        = v_artist,
         is_active     = coalesce(p_is_active, true),
         period_text   = nullif(btrim(coalesce(p_period_text, '')), ''),
         note          = nullif(btrim(coalesce(p_note, '')), ''),
         official_url  = v_url,
         announce_date = p_announce_date,
         updated_at    = now()
   where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception '商务记录不存在或已被删除' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$$;

-- ---------- 6) 切换「正在合作中 / 合作已结束」 ----------
create or replace function public.admin_set_brand_endorsement_status(
  p_admin_key text,
  p_id        uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.brand_endorsements%rowtype;
begin
  if not public._brand_admin_ok(p_admin_key) then
    raise exception '管理员口令校验失败，请确认与全站解锁口令一致' using errcode = '42501';
  end if;

  update public.brand_endorsements
     set is_active  = coalesce(p_is_active, true),
         updated_at = now()
   where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception '商务记录不存在或已被删除' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$$;

-- ---------- 7) 删除商务合作 ----------
create or replace function public.admin_delete_brand_endorsement(
  p_admin_key text,
  p_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.brand_endorsements%rowtype;
begin
  if not public._brand_admin_ok(p_admin_key) then
    raise exception '管理员口令校验失败，请确认与全站解锁口令一致' using errcode = '42501';
  end if;

  delete from public.brand_endorsements
   where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception '商务记录不存在或已被删除' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'deleted_id', v_row.id);
end;
$$;

-- ---------- 8) 批量导入（本机历史草稿一键上云） ----------
create or replace function public.admin_import_brand_endorsements(
  p_admin_key text,
  p_rows      jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_item jsonb;
  v_row public.brand_endorsements%rowtype;
  v_artist text;
  v_url text;
  v_count integer := 0;
begin
  if not public._brand_admin_ok(p_admin_key) then
    raise exception '管理员口令校验失败，请确认与全站解锁口令一致' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception '批量导入数据必须是 JSON 数组' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    if btrim(coalesce(v_item->>'brand_name', '')) = '' then
      raise exception '批量导入中存在品牌名称为空的记录' using errcode = '22023';
    end if;

    v_artist := coalesce(nullif(btrim(coalesce(v_item->>'artist', '')), ''), 'ONER全员');
    if v_artist not in ('ONER全员', '岳岳', '木子洋', '灵超') then
      raise exception '批量导入中存在非法合作对象：%', v_artist using errcode = '22023';
    end if;

    v_url := nullif(btrim(coalesce(v_item->>'official_url', '')), '');
    if v_url is not null and v_url !~* '^https?://' then
      raise exception '批量导入中存在非法官方链接：%', v_url using errcode = '22023';
    end if;

    insert into public.brand_endorsements (
      brand_name, title, artist, is_active, period_text, note, official_url, announce_date
    ) values (
      btrim(v_item->>'brand_name'),
      nullif(btrim(coalesce(v_item->>'title', '')), ''),
      v_artist,
      coalesce((v_item->>'is_active')::boolean, true),
      nullif(btrim(coalesce(v_item->>'period_text', '')), ''),
      nullif(btrim(coalesce(v_item->>'note', '')), ''),
      v_url,
      nullif(v_item->>'announce_date', '')::date
    )
    returning * into v_row;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

-- ---------- 9) 执行权限：匿名可调用，但函数内部强制校验管理员口令 ----------
revoke all on function public.admin_create_brand_endorsement(text, text, text, text, boolean, text, text, text, date) from public;
revoke all on function public.admin_update_brand_endorsement(text, uuid, text, text, text, boolean, text, text, text, date) from public;
revoke all on function public.admin_set_brand_endorsement_status(text, uuid, boolean) from public;
revoke all on function public.admin_delete_brand_endorsement(text, uuid) from public;
revoke all on function public.admin_import_brand_endorsements(text, jsonb) from public;

grant execute on function public.admin_create_brand_endorsement(text, text, text, text, boolean, text, text, text, date) to anon, authenticated;
grant execute on function public.admin_update_brand_endorsement(text, uuid, text, text, text, boolean, text, text, text, date) to anon, authenticated;
grant execute on function public.admin_set_brand_endorsement_status(text, uuid, boolean) to anon, authenticated;
grant execute on function public.admin_delete_brand_endorsement(text, uuid) to anon, authenticated;
grant execute on function public.admin_import_brand_endorsements(text, jsonb) to anon, authenticated;

comment on table public.brand_endorsements is 'ONERLAND 商务档案：品牌代言与合作记录（匿名只读，管理员经口令校验 RPC 写入）';
comment on function public.admin_create_brand_endorsement(text, text, text, text, boolean, text, text, text, date) is '新增商务合作（校验全站管理员口令）';
comment on function public.admin_update_brand_endorsement(text, uuid, text, text, text, boolean, text, text, text, date) is '编辑商务合作（校验全站管理员口令）';
comment on function public.admin_set_brand_endorsement_status(text, uuid, boolean) is '切换商务合作状态（校验全站管理员口令）';
comment on function public.admin_delete_brand_endorsement(text, uuid) is '删除商务合作（校验全站管理员口令）';
comment on function public.admin_import_brand_endorsements(text, jsonb) is '批量导入本机商务草稿（校验全站管理员口令）';
