-- 💼 商务档案：品牌代言 / 合作记录
-- 读取：匿名 SELECT 公开可读
-- 写入：统一走 /api/admin（管理员口令校验通过后用 service_role 写，绕过 RLS）
-- 在 Supabase SQL Editor 执行本文件即可开箱使用；未执行时前端自动降级本机存储，不报错。

create table if not exists public.brand_endorsements (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  title text not null,
  category text not null default 'ONER全员'
    check (category in ('ONER全员', '岳岳', '木子洋', '灵超')),
  is_active boolean not null default true,
  announce_date date,
  period text,
  note text,
  official_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_endorsements_active_date_idx
  on public.brand_endorsements (is_active desc, announce_date desc);

alter table public.brand_endorsements enable row level security;

-- 访客 / 登录用户均可匿名读取（只读）
drop policy if exists "brand_endorsements anon read" on public.brand_endorsements;
create policy "brand_endorsements anon read"
  on public.brand_endorsements for select
  to anon, authenticated
  using (true);

-- 写入只允许 service_role（/api/admin）；显式收回前台写权限
revoke insert, update, delete on public.brand_endorsements from anon, authenticated;
grant select on public.brand_endorsements to anon, authenticated;

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

comment on table public.brand_endorsements is 'ONERLAND 商务档案：品牌代言与合作记录（匿名只读，管理员经 /api/admin 写）';
