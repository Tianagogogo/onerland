-- ============================================================
-- 📣 应援词典：Supabase 云端应援词库 + 管理员 RPC + 访客星级 RPC
-- 直接整段复制到 Supabase SQL Editor 执行，可重复运行（幂等）。
--
-- 设计：
--   1) fan_chants 对 anon / authenticated 只开放 SELECT，访客与所有设备共享同一份云端曲库；
--   2) 增 / 删 / 改只能调用 admin_*_fan_chant RPC，函数内部校验 security_admin_config.key_sha256；
--   3) 星级投票只能调用 vote_chant_star RPC，按 chant_id + visitor_id 去重；
--   4) 不开放 anon 直接写表，避免“假保存”和绕过管理员校验。
--
-- ⚠️ 管理员口令哈希与全站其他 RPC 共用 security_admin_config。
--    若尚未配置，请把下面的 “你的管理员密码” 换成 /api/admin 使用的同一口令后单独执行：
--    update public.security_admin_config
--       set key_sha256 = encode(digest('你的管理员密码','sha256'),'hex'),
--           updated_at = now()
--     where id = 1;
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- 0) 管理员口令哈希配置（与安检投票 / 打卡 / 反馈箱共用） ----------
create table if not exists public.security_admin_config (
  id         integer primary key default 1,
  key_sha256 text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.security_admin_config (id) values (1)
on conflict (id) do nothing;

alter table public.security_admin_config enable row level security;
revoke all on table public.security_admin_config from anon, authenticated;

-- ---------- 1) 应援词主表 ----------
create table if not exists public.fan_chants (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'ONER团歌',
  album text,
  video_url text,
  content text not null,
  star_1 int not null default 0,
  star_2 int not null default 0,
  star_3 int not null default 0,
  star_4 int not null default 0,
  star_5 int not null default 0,
  created_at timestamptz not null default now()
);

-- 兼容历史版本：补齐后续新增列 / 约束
alter table public.fan_chants add column if not exists category text;
alter table public.fan_chants add column if not exists album text;
alter table public.fan_chants add column if not exists video_url text;
alter table public.fan_chants add column if not exists content text;
alter table public.fan_chants add column if not exists star_1 int not null default 0;
alter table public.fan_chants add column if not exists star_2 int not null default 0;
alter table public.fan_chants add column if not exists star_3 int not null default 0;
alter table public.fan_chants add column if not exists star_4 int not null default 0;
alter table public.fan_chants add column if not exists star_5 int not null default 0;
alter table public.fan_chants add column if not exists created_at timestamptz not null default now();

update public.fan_chants set category = 'ONER团歌'
 where category is null or btrim(category) = '';
update public.fan_chants set category = 'ONER团歌'
 where category not in ('ONER团歌', '岳岳', '木子洋', '灵超');

alter table public.fan_chants alter column category set default 'ONER团歌';
alter table public.fan_chants alter column category set not null;

alter table public.fan_chants drop constraint if exists fan_chants_category_chk;
alter table public.fan_chants
  add constraint fan_chants_category_chk
  check (category in ('ONER团歌', '岳岳', '木子洋', '灵超'));

create index if not exists fan_chants_created_idx
  on public.fan_chants (created_at asc);
create index if not exists fan_chants_album_idx
  on public.fan_chants (album);

alter table public.fan_chants enable row level security;

-- 访客 / 所有设备公开读取
drop policy if exists "fan_chants anon read" on public.fan_chants;
create policy "fan_chants anon read"
  on public.fan_chants for select
  to anon, authenticated
  using (true);

-- 写权限只留给 SECURITY DEFINER RPC 与 service_role
revoke insert, update, delete on public.fan_chants from anon, authenticated;
grant select on public.fan_chants to anon, authenticated;

-- ---------- 2) 星级明细表（RPC 专用，不直接暴露 visitor_id） ----------
create table if not exists public.fan_chant_ratings (
  id uuid primary key default gen_random_uuid(),
  chant_id text not null,
  rating int not null check (rating between 1 and 5),
  visitor_id text not null default 'anonymous',
  created_at timestamptz not null default now(),
  unique (chant_id, visitor_id)
);

create index if not exists fan_chant_ratings_chant_idx
  on public.fan_chant_ratings (chant_id);

alter table public.fan_chant_ratings enable row level security;

-- 关闭旧版“匿名直接读写表”的策略，统一走 RPC
drop policy if exists "chant ratings anon read" on public.fan_chant_ratings;
drop policy if exists "chant ratings anon insert" on public.fan_chant_ratings;
drop policy if exists "chant ratings anon update" on public.fan_chant_ratings;
drop policy if exists "chant ratings anon delete" on public.fan_chant_ratings;
revoke all on table public.fan_chant_ratings from anon, authenticated;

-- ---------- 3) 管理员口令校验（内部函数，不对外授权） ----------
create or replace function public._fan_chant_admin_ok(p_admin_key text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_expected text := '';
begin
  select coalesce(key_sha256, '') into v_expected
    from public.security_admin_config
   where id = 1;
  v_expected := lower(btrim(coalesce(v_expected, '')));

  if v_expected = '' then
    raise exception 'Admin key hash not configured; run the security_admin_config update in fan_chants.sql'
      using errcode = '28000';
  end if;

  if encode(digest(coalesce(btrim(p_admin_key), ''), 'sha256'), 'hex') <> v_expected then
    raise exception 'Unauthorized: invalid admin password' using errcode = '28000';
  end if;

  return true;
end;
$$;

revoke all on function public._fan_chant_admin_ok(text) from public, anon, authenticated;

-- ---------- 4) 管理员增 / 改 / 删 RPC ----------
create or replace function public.admin_create_fan_chant(
  p_admin_key text,
  p_title     text,
  p_category  text,
  p_content   text,
  p_album     text default null,
  p_video_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.fan_chants%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_category text := btrim(coalesce(p_category, ''));
  v_content text := btrim(coalesce(p_content, ''));
begin
  perform public._fan_chant_admin_ok(p_admin_key);

  if v_title = '' or v_content = '' then
    raise exception 'title and content are required' using errcode = '22023';
  end if;
  if v_category not in ('ONER团歌', '岳岳', '木子洋', '灵超') then
    raise exception 'invalid chant category' using errcode = '22023';
  end if;

  insert into public.fan_chants (title, category, album, video_url, content)
  values (
    left(v_title, 60),
    v_category,
    nullif(left(btrim(coalesce(p_album, '')), 80), ''),
    nullif(left(btrim(coalesce(p_video_url, '')), 400), ''),
    left(v_content, 12000)
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_update_fan_chant(
  p_admin_key text,
  p_id        uuid,
  p_title     text,
  p_category  text,
  p_content   text,
  p_album     text default null,
  p_video_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.fan_chants%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_category text := btrim(coalesce(p_category, ''));
  v_content text := btrim(coalesce(p_content, ''));
begin
  perform public._fan_chant_admin_ok(p_admin_key);

  if p_id is null then
    raise exception 'missing chant id' using errcode = '22023';
  end if;
  if v_title = '' or v_content = '' then
    raise exception 'title and content are required' using errcode = '22023';
  end if;
  if v_category not in ('ONER团歌', '岳岳', '木子洋', '灵超') then
    raise exception 'invalid chant category' using errcode = '22023';
  end if;

  update public.fan_chants
     set title = left(v_title, 60),
         category = v_category,
         album = nullif(left(btrim(coalesce(p_album, '')), 80), ''),
         video_url = nullif(left(btrim(coalesce(p_video_url, '')), 400), ''),
         content = left(v_content, 12000)
   where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'chant not found' using errcode = 'P0002';
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_delete_fan_chant(
  p_admin_key text,
  p_id        uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  perform public._fan_chant_admin_ok(p_admin_key);

  if p_id is null then
    raise exception 'missing chant id' using errcode = '22023';
  end if;

  delete from public.fan_chants where id = p_id returning id into v_id;
  if not found then
    raise exception 'chant not found' using errcode = 'P0002';
  end if;

  delete from public.fan_chant_ratings where chant_id = v_id::text;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------- 5) 访客星级投票 RPC ----------
create or replace function public.vote_chant_star(
  p_chant_id   uuid,
  p_rating     int,
  p_visitor_id text default 'anonymous'
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_visitor text := left(coalesce(nullif(btrim(p_visitor_id), ''), 'anonymous'), 80);
  v_count int := 0;
  v_avg numeric := 0;
begin
  if p_chant_id is null then
    raise exception 'missing chant id' using errcode = '22023';
  end if;
  if p_rating is null or p_rating < 0 or p_rating > 5 then
    raise exception 'rating must be between 0 and 5' using errcode = '22023';
  end if;
  if not exists (select 1 from public.fan_chants where id = p_chant_id) then
    raise exception 'chant not found' using errcode = 'P0002';
  end if;

  if p_rating = 0 then
    delete from public.fan_chant_ratings
     where chant_id = p_chant_id::text and visitor_id = v_visitor;
  else
    insert into public.fan_chant_ratings (chant_id, rating, visitor_id)
    values (p_chant_id::text, p_rating, v_visitor)
    on conflict (chant_id, visitor_id)
    do update set rating = excluded.rating, created_at = now();
  end if;

  -- 同步 fan_chants 的 1～5 星人数列，便于后台/导出直接读取
  update public.fan_chants c
     set star_1 = (select count(*) from public.fan_chant_ratings r where r.chant_id = p_chant_id::text and r.rating = 1),
         star_2 = (select count(*) from public.fan_chant_ratings r where r.chant_id = p_chant_id::text and r.rating = 2),
         star_3 = (select count(*) from public.fan_chant_ratings r where r.chant_id = p_chant_id::text and r.rating = 3),
         star_4 = (select count(*) from public.fan_chant_ratings r where r.chant_id = p_chant_id::text and r.rating = 4),
         star_5 = (select count(*) from public.fan_chant_ratings r where r.chant_id = p_chant_id::text and r.rating = 5)
   where c.id = p_chant_id;

  select count(*)::int, coalesce(round(avg(rating)::numeric, 2), 0)
    into v_count, v_avg
    from public.fan_chant_ratings
   where chant_id = p_chant_id::text;

  return jsonb_build_object(
    'ok', true,
    'chant_id', p_chant_id,
    'rating', p_rating,
    'avg_rating', v_avg,
    'rating_count', v_count
  );
end;
$$;

create or replace function public.get_chant_star_stats()
returns table (
  chant_id text,
  avg_rating numeric,
  rating_count int
)
language sql
security definer
set search_path = public
as $$
  select r.chant_id,
         round(avg(r.rating)::numeric, 2) as avg_rating,
         count(*)::int as rating_count
    from public.fan_chant_ratings r
   group by r.chant_id;
$$;

-- ---------- 6) 权限：只允许调用 RPC ----------
revoke all on function public.admin_create_fan_chant(text, text, text, text, text, text) from public;
revoke all on function public.admin_update_fan_chant(text, uuid, text, text, text, text, text) from public;
revoke all on function public.admin_delete_fan_chant(text, uuid) from public;
revoke all on function public.vote_chant_star(uuid, int, text) from public;
revoke all on function public.get_chant_star_stats() from public;

grant execute on function public.admin_create_fan_chant(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_update_fan_chant(text, uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_delete_fan_chant(text, uuid) to anon, authenticated;
grant execute on function public.vote_chant_star(uuid, int, text) to anon, authenticated;
grant execute on function public.get_chant_star_stats() to anon, authenticated;

-- ---------- 7) 让 PostgREST 立即重载 ----------
notify pgrst, 'reload schema';
