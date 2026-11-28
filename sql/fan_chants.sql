-- 📣 应援词典：云端应援词库（匿名只读，写操作仅 /api/admin 的 service_role）
create table if not exists public.fan_chants (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'ONER团歌',
  album text,
  video_url text,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.fan_chants enable row level security;

-- 访客匿名可读
drop policy if exists "fan_chants anon read" on public.fan_chants;
create policy "fan_chants anon read"
  on public.fan_chants for select
  to anon, authenticated
  using (true);

-- 写入只允许 service_role（service_role 绕过 RLS，这里显式不给 anon 写权限）
revoke insert, update, delete on public.fan_chants from anon, authenticated;
