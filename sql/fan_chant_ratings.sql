-- ⭐ 应援词典：1～5 星难度评价（全站匿名聚合，按 chant_id + visitor_id 去重）
create table if not exists public.fan_chant_ratings (
  id uuid primary key default gen_random_uuid(),
  chant_id text not null,
  rating int not null check (rating between 1 and 5),
  visitor_id text not null default 'anonymous',
  created_at timestamptz not null default now(),
  unique (chant_id, visitor_id)
);

alter table public.fan_chant_ratings enable row level security;

-- 匿名可读：前端只做平均星级 / 人数聚合
drop policy if exists "chant ratings anon read" on public.fan_chant_ratings;
create policy "chant ratings anon read"
  on public.fan_chant_ratings for select
  to anon, authenticated
  using (true);

-- 匿名可写：同一 visitor_id 对同一首歌只保留一条（前端 upsert / 取消评价删除）
drop policy if exists "chant ratings anon insert" on public.fan_chant_ratings;
create policy "chant ratings anon insert"
  on public.fan_chant_ratings for insert
  to anon, authenticated
  with check (rating between 1 and 5);

drop policy if exists "chant ratings anon update" on public.fan_chant_ratings;
create policy "chant ratings anon update"
  on public.fan_chant_ratings for update
  to anon, authenticated
  using (true)
  with check (rating between 1 and 5);

drop policy if exists "chant ratings anon delete" on public.fan_chant_ratings;
create policy "chant ratings anon delete"
  on public.fan_chant_ratings for delete
  to anon, authenticated
  using (true);

grant select, insert, update, delete on public.fan_chant_ratings to anon, authenticated;
