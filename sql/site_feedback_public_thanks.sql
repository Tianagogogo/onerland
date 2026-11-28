-- ============================================================
-- ✨ 共建感谢名单（公开脱敏）+ 💌 提交致谢：增量 SQL
-- 前提：已执行过 sql/site_feedback.sql（site_feedback 表与管理员口令校验函数）
-- 原则：anon 依然只有 INSERT，绝不开放表级 SELECT；公开数据只能经 SECURITY DEFINER 函数取得，
--       返回值中严禁出现 content（正文）字段。
-- ============================================================

-- 1) 新增公开开关字段
alter table public.site_feedback
  add column if not exists is_public boolean not null default true;

create index if not exists site_feedback_public_idx
  on public.site_feedback (is_public, created_at desc);

-- 权限保持不变：anon 只能 INSERT，绝不能 SELECT / UPDATE / DELETE
revoke all on public.site_feedback from public, anon, authenticated;
grant insert on public.site_feedback to anon, authenticated;

-- 2) 公开只读榜单：仅昵称 / 分类 / 时间，绝无正文
create or replace function public.get_public_thanks_list()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_items jsonb;
  v_anon int;
begin
  -- 按昵称去重，保留每位伙伴最新的一条分类；最多 30 位
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
    into v_items
  from (
    select distinct on (btrim(nickname))
           btrim(nickname) as nickname,
           category,
           created_at
    from public.site_feedback
    where is_public = true
      and coalesce(btrim(nickname), '') <> ''
    order by btrim(nickname), created_at desc
    limit 30
  ) t;

  -- 匿名（未填昵称或被屏蔽昵称）的贡献人数
  select count(*) into v_anon
  from public.site_feedback
  where coalesce(btrim(nickname), '') = ''
     or is_public = false;

  return jsonb_build_object(
    'items', v_items,
    'anon_count', coalesce(v_anon, 0)
  );
end;
$$;

-- 3) 管理员：移出 / 恢复公开鸣谢
create or replace function public.admin_toggle_feedback_public(
  p_id uuid,
  p_admin_key text,
  p_is_public boolean
)
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
     set is_public = coalesce(p_is_public, true)
   where id = p_id;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', v_count > 0, 'updated', v_count, 'is_public', coalesce(p_is_public, true));
end;
$$;

-- 4) 管理员收件箱：把 is_public 一并返回（否则前端开关拿不到状态）
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
    select id, category, content, nickname, page_url, status, is_public, created_at
    from public.site_feedback
    order by created_at desc
    limit 200
  ) t;

  return v_items;
end;
$$;

-- 5) 授权 + 刷新 PostgREST schema 缓存
grant execute on function public.get_public_thanks_list() to anon, authenticated;
grant execute on function public.admin_toggle_feedback_public(uuid, text, boolean) to anon, authenticated;
grant execute on function public.admin_get_feedbacks(text) to anon, authenticated;

notify pgrst, 'reload schema';
