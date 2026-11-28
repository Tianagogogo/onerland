-- ================= 安检体验标签投票：出口 IP + 硬件指纹 双重去重 =================
-- 整段粘到 Supabase SQL Editor 执行一次即可。
-- 设计：
--   * 前端只调 RPC，不裸写表；
--   * voter_key = md5(出口IP || ':' || 硬件指纹)，同一部手机在微信内置浏览器、
--     Safari / 系统浏览器、无痕窗口都命中同一 voter_key → 永远只算 1 票；
--   * UNIQUE (show_id, voter_key, tag)：并发点击只会命中同一条记录，绝不重复累加。

-- ---------- 1. 表 ----------
create table if not exists public.show_security_votes (
  id         bigserial   primary key,
  show_id    text        not null,
  tag        text        not null,
  venue      text        default '',
  hw_hash    text        default '',
  visitor_id text        default '',
  client_ip  inet,
  voter_key  text        not null,
  created_at timestamptz default now()
);

create unique index if not exists show_security_votes_unique_idx
  on public.show_security_votes (show_id, voter_key, tag);

create index if not exists show_security_votes_show_idx
  on public.show_security_votes (show_id);

create index if not exists show_security_votes_venue_idx
  on public.show_security_votes (venue);

create index if not exists show_security_votes_voter_idx
  on public.show_security_votes (show_id, voter_key);

alter table public.show_security_votes enable row level security;

drop policy if exists "show_security_votes read"   on public.show_security_votes;
drop policy if exists "show_security_votes insert" on public.show_security_votes;
drop policy if exists "show_security_votes delete" on public.show_security_votes;

-- RPC 是主通道；这两条策略只用于 RPC 未部署时的 REST 兜底
create policy "show_security_votes read"
  on public.show_security_votes for select using (true);
create policy "show_security_votes insert"
  on public.show_security_votes for insert with check (true);
create policy "show_security_votes delete"
  on public.show_security_votes for delete using (true);

grant select, insert, delete on public.show_security_votes to anon, authenticated;
grant usage, select on sequence public.show_security_votes_id_seq to anon, authenticated;

-- ---------- 2. 真实出口 IP ----------
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

-- ---------- 3. 聚合返回（票数 / 同场馆参考 / 本机已选标签） ----------
create or replace function public.security_vote_summary(
  p_show_id  text,
  p_voter_key text,
  p_venue    text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total       integer := 0;
  v_counts      jsonb := '{}'::jsonb;
  v_venue_total integer := 0;
  v_venue       jsonb := '{}'::jsonb;
  v_my_tags     jsonb := '[]'::jsonb;
begin
  select count(*)::int, coalesce(jsonb_object_agg(tag, cnt), '{}'::jsonb)
    into v_total, v_counts
    from (
      select tag, count(*)::int as cnt
        from public.show_security_votes
       where show_id = btrim(p_show_id)
       group by tag
    ) s;

  if p_venue is not null and btrim(p_venue) <> '' then
    select count(*)::int, coalesce(jsonb_object_agg(tag, cnt), '{}'::jsonb)
      into v_venue_total, v_venue
      from (
        select tag, count(*)::int as cnt
          from public.show_security_votes
         where venue = btrim(p_venue)
         group by tag
      ) v;
  end if;

  select coalesce(jsonb_agg(tag), '[]'::jsonb)
    into v_my_tags
    from public.show_security_votes
   where show_id = btrim(p_show_id)
     and voter_key = p_voter_key;

  return jsonb_build_object(
    'ok', true,
    'total', v_total,
    'counts', v_counts,
    'venue_total', v_venue_total,
    'venue_counts', v_venue,
    'my_tags', v_my_tags
  );
end;
$$;

-- ---------- 4. 提交 / 切换 / 取消（toggle 语义） ----------
create or replace function public.submit_security_vote(
  p_show_id text,
  p_tag     text,
  p_hw_hash text,
  p_venue   text default '',
  p_tags    text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip       text;
  v_hw       text;
  v_key      text;
  v_tag      text;
  v_exists   boolean := false;
begin
  if p_show_id is null or btrim(p_show_id) = '' then
    raise exception 'p_show_id 不能为空';
  end if;

  v_hw := coalesce(btrim(p_hw_hash), '');
  if v_hw = '' then
    raise exception 'p_hw_hash 不能为空';
  end if;

  v_ip  := public.security_client_ip();
  v_key := md5(v_ip || ':' || v_hw);
  v_tag := btrim(coalesce(p_tag, ''));

  if v_tag = '' then
    -- 取消本设备在该场次的全部票
    delete from public.show_security_votes
     where show_id = btrim(p_show_id)
       and voter_key = v_key;
  else
    select true into v_exists
      from public.show_security_votes
     where show_id = btrim(p_show_id)
       and voter_key = v_key
       and tag = v_tag
     limit 1;

    if coalesce(v_exists, false) then
      -- 再点一次 = 取消该标签
      delete from public.show_security_votes
       where show_id = btrim(p_show_id)
         and voter_key = v_key
         and tag = v_tag;
    else
      insert into public.show_security_votes
        (show_id, tag, venue, hw_hash, client_ip, voter_key, created_at)
      values
        (btrim(p_show_id), v_tag, coalesce(btrim(p_venue), ''), v_hw,
         nullif(v_ip, '0.0.0.0')::inet, v_key, now())
      on conflict (show_id, voter_key, tag) do nothing;
    end if;
  end if;

  return public.security_vote_summary(btrim(p_show_id), v_key, coalesce(p_venue, ''));
end;
$$;

-- ---------- 5. 读取票数 + 本机已选标签 ----------
create or replace function public.get_security_votes(
  p_show_id text,
  p_hw_hash text,
  p_venue   text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip  text;
  v_key text;
begin
  if p_show_id is null or btrim(p_show_id) = '' then
    return jsonb_build_object('total', 0, 'counts', '{}'::jsonb,
                              'venue_total', 0, 'venue_counts', '{}'::jsonb, 'my_tags', '[]'::jsonb);
  end if;

  v_ip  := public.security_client_ip();
  v_key := md5(v_ip || ':' || coalesce(btrim(p_hw_hash), ''));

  return public.security_vote_summary(btrim(p_show_id), v_key, coalesce(p_venue, ''));
end;
$$;

-- ---------- 6. 权限 ----------
grant execute on function public.submit_security_vote(text, text, text, text, text[]) to anon, authenticated;
grant execute on function public.get_security_votes(text, text, text) to anon, authenticated;
grant execute on function public.security_vote_summary(text, text, text) to anon, authenticated;
grant execute on function public.security_client_ip() to anon, authenticated;
