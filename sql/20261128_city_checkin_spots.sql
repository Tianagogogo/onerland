-- ============================================================
-- 🍜 同款打卡：建表 + RLS + 全量 RPC（幂等，可反复执行）
-- 访客投稿 → status='pending'（对外静默）
-- 管理员：全站待审核队列 / 通过 / 驳回物理删除 / 免审直发
-- 口令与安检投票、反馈箱、抢票表完全一致：security_admin_config.key_sha256
-- 参数名与前端 100% 对齐：p_admin_key / p_city / p_members / p_category
--                         p_spot_name / p_note / p_proof_data / p_device_id / p_id / p_action
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- 1) 建表 + 补齐缺失列 ----------
create table if not exists public.city_checkin_spots (
  id uuid primary key default gen_random_uuid(),
  city text not null default '',
  members text[] not null default array['ONER全员']::text[],
  category text not null default '🍜 餐厅美食',
  spot_name text not null default '',
  note text not null default '',
  proof_data text not null default '',
  status text not null default 'pending',
  device_id text not null default '',
  created_at timestamptz not null default now()
);

alter table public.city_checkin_spots add column if not exists id uuid default gen_random_uuid();
alter table public.city_checkin_spots add column if not exists city text not null default '';
alter table public.city_checkin_spots add column if not exists members text[] not null default array['ONER全员']::text[];
alter table public.city_checkin_spots add column if not exists category text not null default '🍜 餐厅美食';
alter table public.city_checkin_spots add column if not exists spot_name text not null default '';
alter table public.city_checkin_spots add column if not exists note text not null default '';
alter table public.city_checkin_spots add column if not exists proof_data text not null default '';
alter table public.city_checkin_spots add column if not exists status text not null default 'pending';
alter table public.city_checkin_spots add column if not exists device_id text not null default '';
alter table public.city_checkin_spots add column if not exists created_at timestamptz not null default now();

-- 历史脏数据修正：空状态 / 大写状态统一归入 pending，避免管理员队列漏记录
update public.city_checkin_spots
   set status = 'pending'
 where status is null or btrim(status) = '' or lower(btrim(status)) not in ('pending', 'approved');

update public.city_checkin_spots set status = lower(btrim(status))
 where status <> lower(btrim(status));

alter table public.city_checkin_spots alter column status set default 'pending';

alter table public.city_checkin_spots drop constraint if exists city_checkin_spots_status_chk;
alter table public.city_checkin_spots
  add constraint city_checkin_spots_status_chk check (status in ('pending', 'approved'));

create index if not exists city_checkin_spots_city_status_idx
  on public.city_checkin_spots (city, status, created_at desc);
create index if not exists city_checkin_spots_status_created_idx
  on public.city_checkin_spots (status, created_at asc);
create index if not exists city_checkin_spots_device_idx
  on public.city_checkin_spots (device_id, created_at desc);

-- ---------- 2) RLS：只允许通过 RPC（security definer）访问 ----------
alter table public.city_checkin_spots enable row level security;

drop policy if exists city_checkin_no_select on public.city_checkin_spots;
drop policy if exists city_checkin_no_insert on public.city_checkin_spots;
drop policy if exists city_checkin_no_update on public.city_checkin_spots;
drop policy if exists city_checkin_no_delete on public.city_checkin_spots;

revoke all on table public.city_checkin_spots from anon, authenticated;

-- ---------- 3) 管理员口令校验（与全站共用同一张表） ----------
create or replace function public._checkin_admin_ok(p_admin_key text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_expected text := '';
begin
  select coalesce(key_sha256, '') into v_expected
    from public.security_admin_config where id = 1;
  v_expected := lower(btrim(coalesce(v_expected, '')));

  if v_expected = '' then
    raise exception 'Admin key hash not configured' using errcode = '28000';
  end if;

  if encode(digest(coalesce(btrim(p_admin_key), ''), 'sha256'), 'hex') <> v_expected then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  return true;
end;
$$;

revoke all on function public._checkin_admin_ok(text) from public, anon, authenticated;

-- ---------- 4) 公开读取：仅 approved ----------
create or replace function public.get_approved_checkin_spots(p_city text)
returns table (
  id uuid,
  city text,
  members text[],
  category text,
  spot_name text,
  note text,
  proof_data text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select s.id, s.city, s.members, s.category, s.spot_name, s.note, s.proof_data, s.created_at
  from public.city_checkin_spots s
  where s.status = 'approved'
    and (p_city is null or btrim(p_city) = '' or s.city = btrim(p_city))
  order by s.created_at desc
  limit 200;
$$;

-- ---------- 5) 访客投稿：强制 pending ----------
create or replace function public.submit_checkin_spot(
  p_city text,
  p_members text[],
  p_category text,
  p_spot_name text,
  p_note text,
  p_proof_data text,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_city text := btrim(coalesce(p_city, ''));
  v_name text := btrim(coalesce(p_spot_name, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_cat  text := btrim(coalesce(p_category, ''));
  v_proof text := coalesce(p_proof_data, '');
  v_device text := btrim(coalesce(p_device_id, ''));
  v_members text[];
  v_recent int := 0;
  v_id uuid;
begin
  if v_city = '' then raise exception 'city_required' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'spot_name_required' using errcode = '22023'; end if;
  if length(v_name) > 30 then raise exception 'spot_name_too_long' using errcode = '22023'; end if;
  if length(v_note) > 60 then raise exception 'note_too_long' using errcode = '22023'; end if;
  if length(v_proof) > 280000 then raise exception 'proof_too_large' using errcode = '22023'; end if;
  if v_proof <> '' and v_proof !~ '^(data:image/|https?://)' then
    raise exception 'proof_invalid' using errcode = '22023';
  end if;

  if v_cat = '' then v_cat := '🍜 餐厅美食'; end if;
  if v_cat not in ('🍜 餐厅美食', '☕ 咖啡甜品', '📸 拍照地标') then
    raise exception 'category_invalid' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct m), array['ONER全员']::text[])
    into v_members
  from unnest(coalesce(p_members, array['ONER全员']::text[])) as m
  where m in ('ONER全员', '岳岳', '木子洋', '灵超');

  if v_members is null or array_length(v_members, 1) is null then
    v_members := array['ONER全员']::text[];
  end if;

  if v_device <> '' then
    select count(*) into v_recent
    from public.city_checkin_spots
    where device_id = v_device
      and created_at > now() - interval '24 hours'
      and status in ('pending', 'approved');
    if v_recent >= 3 then
      raise exception 'rate_limited' using errcode = '22023';
    end if;
  end if;

  insert into public.city_checkin_spots
    (city, members, category, spot_name, note, proof_data, status, device_id)
  values
    (v_city, v_members, v_cat, v_name, v_note, v_proof, 'pending', v_device)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'pending');
end;
$$;

-- ---------- 6) 管理员：全站待审核队列（不限城市） ----------
create or replace function public.admin_get_pending_checkin_spots(p_admin_key text)
returns table (
  id uuid,
  city text,
  members text[],
  category text,
  spot_name text,
  note text,
  proof_data text,
  device_id text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._checkin_admin_ok(p_admin_key);

  return query
    select s.id, s.city, s.members, s.category, s.spot_name, s.note, s.proof_data, s.device_id, s.created_at
    from public.city_checkin_spots s
    where s.status = 'pending'
    order by s.created_at asc
    limit 500;
end;
$$;

-- ---------- 7) 管理员：通过 / 驳回（物理删除） ----------
create or replace function public.admin_review_checkin_spot(p_id uuid, p_action text, p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_count int := 0;
begin
  perform public._checkin_admin_ok(p_admin_key);

  if v_action = 'approve' then
    update public.city_checkin_spots set status = 'approved' where id = p_id;
    get diagnostics v_count = row_count;
    if v_count = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
    return jsonb_build_object('ok', true, 'action', 'approved', 'id', p_id);
  end if;

  if v_action in ('reject', 'delete') then
    delete from public.city_checkin_spots where id = p_id;
    get diagnostics v_count = row_count;
    if v_count = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
    return jsonb_build_object('ok', true, 'action', 'deleted', 'id', p_id);
  end if;

  raise exception 'action_invalid' using errcode = '22023';
end;
$$;

-- ---------- 8) 管理员：免审直发 ----------
create or replace function public.admin_create_checkin_spot(
  p_city text,
  p_members text[],
  p_category text,
  p_spot_name text,
  p_note text,
  p_proof_data text,
  p_device_id text,
  p_admin_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_city text := btrim(coalesce(p_city, ''));
  v_name text := btrim(coalesce(p_spot_name, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_cat  text := btrim(coalesce(p_category, ''));
  v_proof text := coalesce(p_proof_data, '');
  v_device text := btrim(coalesce(p_device_id, ''));
  v_members text[];
  v_id uuid;
begin
  perform public._checkin_admin_ok(p_admin_key);

  if v_city = '' then raise exception 'city_required' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'spot_name_required' using errcode = '22023'; end if;
  if length(v_name) > 30 then raise exception 'spot_name_too_long' using errcode = '22023'; end if;
  if length(v_note) > 60 then raise exception 'note_too_long' using errcode = '22023'; end if;
  if length(v_proof) > 280000 then raise exception 'proof_too_large' using errcode = '22023'; end if;
  if v_proof <> '' and v_proof !~ '^(data:image/|https?://)' then
    raise exception 'proof_invalid' using errcode = '22023';
  end if;

  if v_cat = '' then v_cat := '🍜 餐厅美食'; end if;
  if v_cat not in ('🍜 餐厅美食', '☕ 咖啡甜品', '📸 拍照地标') then
    raise exception 'category_invalid' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct m), array['ONER全员']::text[])
    into v_members
  from unnest(coalesce(p_members, array['ONER全员']::text[])) as m
  where m in ('ONER全员', '岳岳', '木子洋', '灵超');

  if v_members is null or array_length(v_members, 1) is null then
    v_members := array['ONER全员']::text[];
  end if;

  insert into public.city_checkin_spots
    (city, members, category, spot_name, note, proof_data, status, device_id)
  values
    (v_city, v_members, v_cat, v_name, v_note, v_proof, 'approved', v_device)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'approved');
end;
$$;

-- ---------- 9) 授权 + 刷新 PostgREST schema 缓存 ----------
grant execute on function public.get_approved_checkin_spots(text) to anon, authenticated;
grant execute on function public.submit_checkin_spot(text, text[], text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_get_pending_checkin_spots(text) to anon, authenticated;
grant execute on function public.admin_review_checkin_spot(uuid, text, text) to anon, authenticated;
grant execute on function public.admin_create_checkin_spot(text, text[], text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
