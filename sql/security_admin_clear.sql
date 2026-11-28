-- ============================================================
-- 🛡️ 安检体验投票：管理员清空 / 单标签清零 RPC（修复 HTTP 400 版）
-- 直接整段复制到 Supabase SQL Editor 执行，可重复运行
-- 关键修复：
--   1) show_id 在函数内统一 show_id::text 比对，无论表里是 text/bigint/uuid 都不会类型不匹配
--   2) 管理员口令哈希放到 security_admin_config 表（开启 RLS 且无 policy，anon 读不到）
--   3) 执行后 NOTIFY pgrst 让 PostgREST 立即重载 schema
-- ============================================================
create extension if not exists pgcrypto;

-- ① 管理员口令哈希配置表（只有 SECURITY DEFINER 函数能读，匿名端拿不到哈希）
create table if not exists public.security_admin_config (
  id         integer primary key default 1,
  key_sha256 text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.security_admin_config (id) values (1)
on conflict (id) do nothing;

alter table public.security_admin_config enable row level security;
revoke all on table public.security_admin_config from anon, authenticated;

-- ② 写入管理员口令的 sha256（把 你的管理员密码 换成 /api/admin 使用的同一口令）
update public.security_admin_config
   set key_sha256 = encode(digest('你的管理员密码', 'sha256'), 'hex'),
       updated_at = now()
 where id = 1;

-- ③ 清空 / 单标签清零函数（参数名与前端 JSON 键名一一对应）
create or replace function public.admin_clear_security_votes(
  p_show_id   text,
  p_admin_key text,
  p_tag       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_expected text := '';
  v_deleted  integer := 0;
begin
  if p_show_id is null or length(btrim(p_show_id)) = 0 then
    raise exception 'Missing show id' using errcode = '22023';
  end if;

  select coalesce(key_sha256, '') into v_expected
    from public.security_admin_config where id = 1;
  v_expected := lower(btrim(coalesce(v_expected, '')));

  if v_expected = '' then
    raise exception 'Admin key hash not configured' using errcode = '28000';
  end if;

  if encode(digest(coalesce(btrim(p_admin_key), ''), 'sha256'), 'hex') <> v_expected then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  -- show_id::text 兼容 text / bigint / integer / uuid 各种真实列类型
  if p_tag is null or length(btrim(p_tag)) = 0 then
    delete from public.show_security_votes
     where show_id::text = p_show_id;
  else
    delete from public.show_security_votes
     where show_id::text = p_show_id
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

-- ④ 权限：允许匿名 / 登录用户调用（函数内部自行校验口令）
revoke all on function public.admin_clear_security_votes(text, text, text) from public;
grant execute on function public.admin_clear_security_votes(text, text, text) to anon, authenticated;

-- ⑤ 让 PostgREST 立即重载函数签名，避免旧缓存继续返回 400 / 404
notify pgrst, 'reload schema';

-- ⑥ 自检（可选）：把 你的管理员密码 换成真实口令，应返回 {"ok":true,"deleted":N}
-- select public.admin_clear_security_votes('大草地音乐秀场::上海', '你的管理员密码', null);
