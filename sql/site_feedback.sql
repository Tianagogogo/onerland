-- ============================================================
-- 💬 帮助与反馈：site_feedback 建表 + 严格 RLS + 管理员 RPC
-- 普通访客：只允许 INSERT 一条留言，数据库层无任何 SELECT/UPDATE/DELETE 权限
-- 管理员：仅能通过带口令校验的 SECURITY DEFINER 函数读取 / 标记已读 / 删除
-- 依赖：public.security_admin_config(id, key_sha256)（与安检投票管理员口令共用）
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists public.site_feedback (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'bug',
  content text not null,
  nickname text,
  page_url text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.site_feedback drop constraint if exists site_feedback_category_chk;
alter table public.site_feedback add constraint site_feedback_category_chk
  check (category in ('bug', 'idea', 'info'));

alter table public.site_feedback drop constraint if exists site_feedback_status_chk;
alter table public.site_feedback add constraint site_feedback_status_chk
  check (status in ('new', 'read'));

-- 正文长度硬约束：1 ~ 500 字（去首尾空白后计）
alter table public.site_feedback drop constraint if exists site_feedback_content_len_chk;
alter table public.site_feedback add constraint site_feedback_content_len_chk
  check (char_length(btrim(content)) between 1 and 500);

create index if not exists site_feedback_created_idx
  on public.site_feedback (created_at desc);

-- ---------- RLS ----------
alter table public.site_feedback enable row level security;

-- 先收回全部权限，再只放行 INSERT
revoke all on public.site_feedback from public;
revoke all on public.site_feedback from anon, authenticated;
grant insert on public.site_feedback to anon, authenticated;

-- 仅有一条 INSERT 策略，且写入内容再做一次服务端校验
drop policy if exists site_feedback_insert_only on public.site_feedback;
create policy site_feedback_insert_only on public.site_feedback
  for insert to anon, authenticated
  with check (
    char_length(btrim(content)) between 1 and 500
    and category in ('bug', 'idea', 'info')
    and coalesce(char_length(nickname), 0) <= 30
    and coalesce(char_length(page_url), 0) <= 200
    and status = 'new'
  );

-- 注意：故意不创建任何 SELECT / UPDATE / DELETE 策略，
-- 因此 anon 与 authenticated 都无法读取、修改、删除任何一条留言。

-- ---------- 管理员口令校验（与安检投票共用 security_admin_config） ----------
create or replace function public._feedback_admin_ok(p_admin_key text)
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

revoke all on function public._feedback_admin_ok(text) from public, anon, authenticated;

-- ---------- 读取留言（时间倒序，最多 200 条） ----------
create or replace function public.admin_get_feedbacks(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_items jsonb;
begin
  if not public._feedback_admin_ok(p_admin_key) then
    raise exception 'Unauthorized';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
    into v_items
  from (
    select id, category, content, nickname, page_url, status, created_at
    from public.site_feedback
    order by created_at desc
    limit 200
  ) t;

  return v_items;
end;
$$;

-- ---------- 标记已读 ----------
create or replace function public.admin_mark_feedback_read(p_id uuid, p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
begin
  if not public._feedback_admin_ok(p_admin_key) then
    raise exception 'Unauthorized';
  end if;

  update public.site_feedback
     set status = 'read'
   where id = p_id;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', v_count > 0, 'updated', v_count);
end;
$$;

-- ---------- 删除单条 ----------
create or replace function public.admin_delete_feedback(p_id uuid, p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
begin
  if not public._feedback_admin_ok(p_admin_key) then
    raise exception 'Unauthorized';
  end if;

  delete from public.site_feedback where id = p_id;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', v_count > 0, 'deleted', v_count);
end;
$$;

grant execute on function public.admin_get_feedbacks(text) to anon, authenticated;
grant execute on function public.admin_mark_feedback_read(uuid, text) to anon, authenticated;
grant execute on function public.admin_delete_feedback(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
