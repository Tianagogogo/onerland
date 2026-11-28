-- ============================================================
-- 🛡️ 安检体验投票：管理员清空 / 单标签清零 RPC
-- 在 Supabase SQL Editor 整段执行即可（可重复执行）
-- ============================================================
create extension if not exists pgcrypto;

-- ① 先生成管理员口令的 sha256（把 '你的管理员密码' 换成真实口令，执行一次复制结果）
-- select encode(digest('你的管理员密码', 'sha256'), 'hex');

-- ② 把下面的 PUT_YOUR_SHA256_HERE 替换成上一步得到的 64 位哈希，再整段执行
create or replace function public.admin_clear_security_votes(
  p_show_id   text,
  p_admin_key text,
  p_tag       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected constant text := 'PUT_YOUR_SHA256_HERE';
  v_deleted  integer := 0;
begin
  if p_show_id is null or length(btrim(p_show_id)) = 0 then
    raise exception 'Missing show id';
  end if;

  -- 未配置哈希时直接拒绝，避免部署后出现“空口令可清空”的漏洞
  if v_expected = 'PUT_YOUR_SHA256_HERE' then
    raise exception 'Admin key hash not configured';
  end if;

  -- 口令校验：只比对 sha256，函数体内不出现明文口令
  if encode(digest(coalesce(p_admin_key, ''), 'sha256'), 'hex') <> lower(v_expected) then
    raise exception 'Unauthorized';
  end if;

  if p_tag is null or length(btrim(p_tag)) = 0 then
    delete from public.show_security_votes
     where show_id = p_show_id;
  else
    delete from public.show_security_votes
     where show_id = p_show_id
       and tag = p_tag;
  end if;

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'deleted', v_deleted,
    'show_id', p_show_id,
    'tag', p_tag
  );
end;
$$;

revoke all on function public.admin_clear_security_votes(text, text, text) from public;
grant execute on function public.admin_clear_security_votes(text, text, text) to anon, authenticated;

-- ③ 自检（可选）：应返回 {"ok":true,"deleted":N}
-- select public.admin_clear_security_votes('大草地音乐秀场::上海', '你的管理员密码', null);
