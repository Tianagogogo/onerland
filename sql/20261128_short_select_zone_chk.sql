-- 🎟️ 短选项三级联动：放宽 zone 约束（支持 VIP2区 / E3区 / 100–330区 / 1–29号包厢 等字母+数字组合）
begin;

alter table public.show_ticket_seats drop constraint if exists show_ticket_seats_zone_chk;

alter table public.show_ticket_seats add constraint show_ticket_seats_zone_chk
  check (
    coalesce(zone, '') ~ '^(内场|一层看台|二层看台|三层看台|包厢区|音乐节站区)$'
    or coalesce(zone, '') ~ '^(内场|一层看台|二层看台|三层看台|包厢区|音乐节站区) · (无细分区|VIP区|VIP[1-6]区|[A-F][1-6]?区|VIP包厢|[0-9]{1,2}号包厢|通用站区|VIP前排区|普通区|[123][0-3][0-9]区)$'
  );

commit;
