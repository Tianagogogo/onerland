-- 搭子互换申请表（可在 Supabase SQL Editor 直接执行，幂等）
create table if not exists public.buddy_requests (
  id bigserial primary key,
  buddy_id text not null,
  event_id text not null,
  requester_device_id text not null,
  requester_nickname text,
  note text,
  contact text,
  owner_device_id text not null,
  status text default 'pending',
  created_at timestamptz default now()
);

alter table public.buddy_requests add column if not exists buddy_id text;
alter table public.buddy_requests add column if not exists event_id text;
alter table public.buddy_requests add column if not exists requester_device_id text;
alter table public.buddy_requests add column if not exists requester_nickname text;
alter table public.buddy_requests add column if not exists note text;
alter table public.buddy_requests add column if not exists contact text;
alter table public.buddy_requests add column if not exists owner_device_id text;
alter table public.buddy_requests add column if not exists status text default 'pending';
alter table public.buddy_requests add column if not exists created_at timestamptz default now();

-- 先解除旧外键（concert_buddies.id 为 uuid，与 text 不兼容会导致 42804 无法实施）
alter table public.buddy_requests drop constraint if exists buddy_requests_buddy_id_fkey;

-- 兼容历史 bigint 自增 ID / UUID 字符串 ID：统一改为 text
alter table public.buddy_requests alter column buddy_id type text using buddy_id::text;
alter table public.buddy_requests alter column buddy_id drop not null;
alter table public.buddy_requests alter column buddy_id set not null;

alter table public.buddy_requests enable row level security;

drop policy if exists "buddy_requests_insert_anon" on public.buddy_requests;
create policy "buddy_requests_insert_anon" on public.buddy_requests
  for insert to anon, authenticated with check (true);

drop policy if exists "buddy_requests_select_anon" on public.buddy_requests;
create policy "buddy_requests_select_anon" on public.buddy_requests
  for select to anon, authenticated using (true);

drop policy if exists "buddy_requests_update_anon" on public.buddy_requests;
create policy "buddy_requests_update_anon" on public.buddy_requests
  for update to anon, authenticated using (true) with check (true);
