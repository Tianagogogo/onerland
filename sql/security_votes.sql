-- ================= 安检体验：标签投票（首页微时间轴 + 档案页共用） =================
-- 直接整段粘到 Supabase SQL Editor 执行一次即可。
-- 一人一票靠 UNIQUE (show_id, visitor_id, tag)：并发点击只会 upsert，不会重复计票。

create table if not exists public.show_security_votes (
  id         bigserial   primary key,
  show_id    text        not null,
  visitor_id text        not null,
  tag        text        not null,
  venue      text        default '',
  created_at timestamptz default now()
);

-- 同一访客在同一场次对同一标签只能有一行
create unique index if not exists show_security_votes_unique_idx
  on public.show_security_votes (show_id, visitor_id, tag);

create index if not exists show_security_votes_show_idx
  on public.show_security_votes (show_id);

create index if not exists show_security_votes_venue_idx
  on public.show_security_votes (venue);

alter table public.show_security_votes enable row level security;

-- 匿名读写放行（只存标签与匿名指纹，不涉及账号信息）
drop policy if exists "show_security_votes read"   on public.show_security_votes;
drop policy if exists "show_security_votes insert" on public.show_security_votes;
drop policy if exists "show_security_votes update" on public.show_security_votes;
drop policy if exists "show_security_votes delete" on public.show_security_votes;

create policy "show_security_votes read"
  on public.show_security_votes for select using (true);

create policy "show_security_votes insert"
  on public.show_security_votes for insert with check (true);

create policy "show_security_votes update"
  on public.show_security_votes for update using (true) with check (true);

create policy "show_security_votes delete"
  on public.show_security_votes for delete using (true);

grant select, insert, update, delete on public.show_security_votes to anon, authenticated;
grant usage, select on sequence public.show_security_votes_id_seq to anon, authenticated;
