-- 🎟️ 抢票与座位对照表：结构化选择白名单校验（零自由文本）
-- 在 Supabase SQL Editor 执行一次即可；重复执行安全（create or replace）

create or replace function public.upsert_show_ticket_seat(
  p_event_id text,
  p_device_id text,
  p_platform text,
  p_seconds integer,
  p_area text,
  p_seat text
)
returns public.show_ticket_seats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.show_ticket_seats;
  v_platform text := coalesce(trim(p_platform), '');
  v_zone text := coalesce(trim(p_area), '');
  v_seat text := coalesce(trim(p_seat), '');
  v_platforms text[] := array['大麦','猫眼','纷玩岛','票星球','秀动','其他官方平台'];
  v_zones text[] := array[
    '内场VIP / 前区','内场A区','内场B区','内场C区','内场站区',
    '一层看台（前区/正对）','一层看台（两侧）','一层看台（正对）',
    '二层看台','三层看台','包厢区','前区近距离','后区自由站'
  ];
  v_ranges text[] := array['1-3排（前排）','4-8排（中前排）','9-15排（中区）','16-25排（后排）','26排及以后','随机号段 / 音乐节站区'];
  v_details text[] := array['不限号段','中间号段','靠过道号段'];
  v_range text;
  v_detail text;
begin
  if p_event_id is null or trim(p_event_id) = '' then
    raise exception 'event_id 不能为空';
  end if;
  if p_device_id is null or trim(p_device_id) = '' then
    raise exception 'device_id 不能为空';
  end if;
  if p_seconds is null or p_seconds < 0 or p_seconds > 600 then
    raise exception '付款秒数需在 0–600 之间';
  end if;
  if not (v_platform = any(v_platforms)) then
    raise exception '购票平台不在白名单内';
  end if;
  if not (v_zone = any(v_zones)) then
    raise exception '票档/区域不在场馆分区白名单内';
  end if;

  v_range := split_part(v_seat, ' · ', 1);
  v_detail := split_part(v_seat, ' · ', 2);
  if v_detail = '' then v_detail := '不限号段'; end if;
  if not (v_range = any(v_ranges)) then
    raise exception '排数分段不在白名单内';
  end if;
  if not (v_detail = any(v_details)) then
    raise exception '号段不在白名单内';
  end if;

  insert into public.show_ticket_seats (event_id, device_id, platform, seconds, area, seat)
  values (p_event_id, p_device_id, v_platform, p_seconds, v_zone, v_range || ' · ' || v_detail)
  on conflict (event_id, device_id) do update
    set platform = excluded.platform,
        seconds = excluded.seconds,
        area = excluded.area,
        seat = excluded.seat,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.upsert_show_ticket_seat(text, text, text, integer, text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
