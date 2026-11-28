-- ================= 安检体验云端投票：IP + 硬件指纹跨浏览器去重 =================
-- 在 Supabase SQL Editor 整段执行一次即可。
-- 设计要点：
--   * 前端不直接写表，只调用 SECURITY DEFINER 函数；
--   * voter_key = md5(出口 IP || ':' || 前端硬件指纹)，同一部手机在微信内置浏览器、
--     Safari / 系统浏览器、无痕窗口里打开都命中同一条记录 → 永远只算 1 人；
--   * UNIQUE (show_id, voter_key) 让重复提交自动合并为更新，支持切换等级/标签与取消。

-- ---------- 1. 表 ----------
create table if not exists public.show_security_votes (
  id           bigserial primary key,
  show_id      text        not null,
  venue        text        default '',
  level        text        not null,
  tags         text[]      default '{}'::text[],
  hw_hash      text        default '',
  client_ip    inet,
  voter_key    text        not null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- 一人一票的唯一约束（重复提交 → 更新，不累加人数）
create unique index if not exists show_security_votes_show_voter_uidx
  on public.show_security_votes (show_id, voter_key);

create index if not exists show_security_votes_show_idx
  on public.show_security_votes (show_id);

alter table public.show_security_votes enable row level security;

-- 表层不开放给 anon 直读直写（全部走下面的 SECURITY DEFINER 函数）
drop policy if exists "security_votes rpc only" on public.show_security_votes;

-- ---------- 2. 工具函数：真实出口 IP ----------
create or replace function public.security_client_ip()
returns text
language plpgsql
stable
as $$
declare
  hdr json;
  ip  text;
begin
  begin
    hdr := coalesce(current_setting('request.headers', true), '{}')::json;
  exception when others then
    hdr := '{}'::json;
  end;

  ip := coalesce(hdr->>'cf-connecting-ip', '');
  if ip = '' then
    ip := coalesce(hdr->>'x-real-ip', '');
  end if;
  if ip = '' then
    ip := split_part(coalesce(hdr->>'x-forwarded-for', ''), ',', 1);
  end if;
  ip := btrim(ip);
  if ip = '' then
    ip := '0.0.0.0';
  end if;
  return ip;
end;
$$;

-- ---------- 3. 提交 / 切换 / 取消投票 ----------
-- p_tag 为空字符串表示「取消我这票」
create or replace function public.submit_security_vote(
  p_show_id text,
  p_tag     text,
  p_hw_hash text,
  p_venue   text   default '',
  p_tags    text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip        text;
  v_key       text;
  v_hw        text;
  v_total     integer;
  v_levels    jsonb;
  v_tags      jsonb;
  v_my_level  text := '';
  v_my_tags   text[] := '{}'::text[];
  v_tags_clean text[];
begin
  if p_show_id is null or btrim(p_show_id) = '' then
    raise exception 'p_show_id 不能为空';
  end if;

  v_ip  := public.security_client_ip();
  v_hw  := coalesce(btrim(p_hw_hash), '');
  if v_hw = '' then
    raise exception 'p_hw_hash 不能为空';
  end if;

  -- 脱敏车手键：IP + 硬件指纹 一起 md5，任何单一维度被清掉都仍能命中同一票
  v_key := md5(v_ip || ':' || v_hw);

  -- 取消：删除本设备在该场次的票
  if p_tag is null or btrim(p_tag) = '' then
    delete from public.show_security_votes
     where show_id = btrim(p_show_id)
       and voter_key = v_key;
  else
    -- 只保留无障碍的短标签，避免自由文本污染
    select coalesce(array_agg(distinct t), '{}'::text[])
      into v_tags_clean
      from unnest(coalesce(p_tags, '{}'::text[])) as t
     where t is not null and btrim(t) <> '' and length(btrim(t)) <= 40;

    insert into public.show_security_votes as v
      (show_id, venue, level, tags, hw_hash, client_ip, voter_key, created_at, updated_at)
    values
      (btrim(p_show_id), coalesce(p_venue, ''), btrim(p_tag), v_tags_clean, v_hw,
       nullif(v_ip, '0.0.0.0')::inet, v_key, now(), now())
    on conflict (show_id, voter_key) do update
      set level      = excluded.level,
          tags       = excluded.tags,
          venue      = coalesce(nullif(excluded.venue, ''), v.venue),
          hw_hash    = excluded.hw_hash,
          client_ip  = excluded.client_ip,
          updated_at = now();
  end if;

  -- 返回最新聚合，前端一次请求即可刷新票数与本机状态
  select count(*)::int,
         coalesce(jsonb_object_agg(level, cnt), '{}'::jsonb)
    into v_total, v_levels
    from (
      select level, count(*)::int as cnt
        from public.show_security_votes
       where show_id = btrim(p_show_id)
       group by level
    ) s;

  select coalesce(jsonb_object_agg(tag, cnt), '{}'::jsonb)
    into v_tags
    from (
      select unnest(tags) as tag, count(*)::int as cnt
        from public.show_security_votes
       where show_id = btrim(p_show_id)
       group by tag
    ) t;

  select level, tags
    into v_my_level, v_my_tags
    from public.show_security_votes
   where show_id = btrim(p_show_id)
     and voter_key = v_key
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'total', coalesce(v_total, 0),
    'levels', coalesce(v_levels, '{}'::jsonb),
    'tags', coalesce(v_tags, '{}'::jsonb),
    'my_level', coalesce(v_my_level, ''),
    'my_tags', to_jsonb(coalesce(v_my_tags, '{}'::text[])),
    'voter_key', v_key
  );
end;
$$;

-- ---------- 4. 读取票数 + 本机已选状态 ----------
create or replace function public.get_security_votes(
  p_show_id text,
  p_hw_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip       text;
  v_key      text;
  v_total    integer;
  v_levels   jsonb;
  v_tags     jsonb;
  v_my_level text := '';
  v_my_tags  text[] := '{}'::text[];
begin
  if p_show_id is null or btrim(p_show_id) = '' then
    return jsonb_build_object('total', 0, 'levels', '{}'::jsonb, 'tags', '{}'::jsonb,
                              'my_level', '', 'my_tags', '[]'::jsonb);
  end if;

  v_ip  := public.security_client_ip();
  v_key := md5(v_ip || ':' || coalesce(btrim(p_hw_hash), ''));

  select count(*)::int, coalesce(jsonb_object_agg(level, cnt), '{}'::jsonb)
    into v_total, v_levels
    from (
      select level, count(*)::int as cnt
        from public.show_security_votes
       where show_id = btrim(p_show_id)
       group by level
    ) s;

  select coalesce(jsonb_object_agg(tag, cnt), '{}'::jsonb)
    into v_tags
    from (
      select unnest(tags) as tag, count(*)::int as cnt
        from public.show_security_votes
       where show_id = btrim(p_show_id)
       group by tag
    ) t;

  select level, tags
    into v_my_level, v_my_tags
    from public.show_security_votes
   where show_id = btrim(p_show_id)
     and voter_key = v_key
   limit 1;

  return jsonb_build_object(
    'total', coalesce(v_total, 0),
    'levels', coalesce(v_levels, '{}'::jsonb),
    'tags', coalesce(v_tags, '{}'::jsonb),
    'my_level', coalesce(v_my_level, ''),
    'my_tags', to_jsonb(coalesce(v_my_tags, '{}'::text[]))
  );
end;
$$;

-- ---------- 5. 权限 ----------
revoke all on public.show_security_votes from anon, authenticated;

grant execute on function public.submit_security_vote(text, text, text, text, text[]) to anon, authenticated;
grant execute on function public.get_security_votes(text, text) to anon, authenticated;
grant execute on function public.security_client_ip() to anon, authenticated;

-- ---------- 6.（可选）旧表迁移：把历史 security_votes 汇总为匿名历史票 ----------
-- 旧表按浏览器各自一行，迁移后同一 IP+指纹会合并；如不需要可直接跳过本段。
-- insert into public.show_security_votes (show_id, venue, level, tags, hw_hash, voter_key)
-- select show_key, coalesce(venue, ''), level, coalesce(tags, '{}'::text[]), 'legacy',
--        md5('legacy:' || id::text)
--   from public.security_votes
-- on conflict (show_id, voter_key) do nothing;
