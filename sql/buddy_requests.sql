-- 与线上实际表结构对齐（Supabase 项目：xtgkepaqikpzvmpkoxsa）
-- 真实列：id / buddy_id / note / contact / contact_type /
--         sender_device_id / sender_contact / sender_nickname / status / created_at
create table if not exists public.buddy_requests (
  id uuid primary key default gen_random_uuid(),
  buddy_id uuid not null,
  note text,
  contact text,
  contact_type text,
  sender_device_id text not null,
  sender_contact text not null,
  sender_nickname text,
  status text default 'pending',
  created_at timestamptz default now()
);

alter table public.buddy_requests add column if not exists note text;
alter table public.buddy_requests add column if not exists contact text;
alter table public.buddy_requests add column if not exists contact_type text;
alter table public.buddy_requests add column if not exists sender_device_id text;
alter table public.buddy_requests add column if not exists sender_contact text;
alter table public.buddy_requests add column if not exists sender_nickname text;
alter table public.buddy_requests add column if not exists status text default 'pending';

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
