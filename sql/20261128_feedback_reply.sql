-- ============================================================
-- 📬 反馈箱 v2：站长预设回复 + 未处理/已处理状态 + 前台回显
-- 前提：已执行 sql/site_feedback.sql 与 sql/site_feedback_public_thanks.sql
-- 原则：anon 仍只有 INSERT；读取一律走 SECURITY DEFINER 函数，正文不对外暴露
-- ============================================================

-- 1) 新增字段：站长回复 / 本机反馈凭证
alter table public.site_feedback
  add column if not exists admin_reply text default '';

alter table public.site_feedback
  add column if not exists client_token text default '';

update public.site_feedback set admin_reply = '' where admin_reply is null;

create index if not exists site_feedback_client_token_idx
  on public.site_feedback (client_token);

-- 2) 状态白名单扩到 resolved（已处理）
alter table public.site_feedback drop constraint if exists site_feedback_status_chk;
alter table public.site_feedback add constraint site_feedback_status_chk
  check (status in ('new', 'read', 'resolved'));

-- 权限保持：anon 只能 INSERT，不能 SELECT / UPDATE / DELETE
revoke all on public.site_feedback from public, anon, authenticated;
grant insert on public.site_feedback to anon, authenticated;

-- 3) 管理员：写入预设回复并置为已处理（p_reply 传空字符串 = 退回未处理）
create or replace function public.admin_reply_feedback(
  p_id uuid,
  p_admin_key text,
  p_reply text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_reply text := coalesce(btrim(p_reply), '');
  v_count int;
begin
  if not public._feedback_admin_ok(p_admin_key) then
    raise exception 'Unauthorized';
  end if;

  -- 双重保险：只接受前端两项预设文案或空值（空 = 退回未处理）
  if v_reply <> '' and v_reply not in (
    '已实现，感谢你的反馈🌸',
    '现阶段无法实现，感谢你的反馈🌸',
    '已实现，感谢你的反馈',
    '现阶段无法实现，感谢你的反馈'
  ) then
    raise exception 'Invalid reply template';
  end if;

  update public.site_feedback
     set admin_reply = v_reply,
         status = case when v_reply = '' then 'new' else 'resolved' end
   where id = p_id;
  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', v_count > 0,
    'updated', v_count,
    'status', case when v_reply = '' then 'new' else 'resolved' end,
    'admin_reply', v_reply
  );
end;
$$;

-- 4) 管理员收件箱：带上 admin_reply
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
    select id, category, content, nickname, page_url, status,
           coalesce(admin_reply, '') as admin_reply,
           is_public, created_at
    from public.site_feedback
    order by created_at desc
    limit 200
  ) t;

  return v_items;
end;
$$;

-- 5) 公开鸣谢榜：多返回 admin_reply（仍无正文），供前台展示站长回复胶囊
drop function if exists public.get_public_thanks_list();

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
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
    into v_items
  from (
    select distinct on (btrim(nickname))
           btrim(nickname) as nickname,
           category,
           coalesce(admin_reply, '') as admin_reply,
           created_at
    from public.site_feedback
    where is_public = true
      and coalesce(btrim(nickname), '') <> ''
    order by btrim(nickname), created_at desc
    limit 30
  ) t;

  select count(*) into v_anon
  from public.site_feedback
  where coalesce(btrim(nickname), '') = ''
     or is_public = false;

  return jsonb_build_object(
    'items', v_items,
    'contributors', v_items,
    'anon_count', coalesce(v_anon, 0)
  );
end;
$$;

-- 6) 访客自查：凭本机凭证批量查询自己留言的处理状态与站长回复（不返回正文与他人数据）
create or replace function public.get_my_feedback_status(p_tokens text[])
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_items jsonb;
begin
  if p_tokens is null or array_length(p_tokens, 1) is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
    into v_items
  from (
    select category,
           status,
           coalesce(admin_reply, '') as admin_reply,
           created_at
    from public.site_feedback
    where client_token = any(p_tokens)
      and coalesce(btrim(client_token), '') <> ''
    order by created_at desc
    limit 20
  ) t;

  return v_items;
end;
$$;

-- 7) 授权 + 刷新 PostgREST schema 缓存
grant execute on function public.admin_reply_feedback(uuid, text, text) to anon, authenticated;
grant execute on function public.admin_get_feedbacks(text) to anon, authenticated;
grant execute on function public.get_public_thanks_list() to anon, authenticated;
grant execute on function public.get_my_feedback_status(text[]) to anon, authenticated;

notify pgrst, 'reload schema';
