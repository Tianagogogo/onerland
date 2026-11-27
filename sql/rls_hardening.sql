-- ============================================================
-- ONERLAND Supabase RLS 加固脚本
-- 在 Supabase 控制台 → SQL Editor 中整段执行
-- ============================================================
-- 设计原则：
--   1. 匿名用户（anon key）只能 SELECT 读取，不能写入
--   2. 所有写操作必须经过 Cloudflare Functions（service_role 校验管理员）
--   3. 即使有人拿到 anon key 直接调用 REST API，也无法增删改数据
-- ============================================================

-- ---------- tickets 表 ----------
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- 丢弃可能存在的宽松策略，避免旧策略叠加
DROP POLICY IF EXISTS "public_read_tickets"   ON public.tickets;
DROP POLICY IF EXISTS "public_write_tickets"  ON public.tickets;
DROP POLICY IF EXISTS "anon_all_tickets"      ON public.tickets;
DROP POLICY IF EXISTS "tickets_select_all"    ON public.tickets;

-- 任何人都可读（这是展示型站点，数据本就公开）
CREATE POLICY "tickets_select_all"
  ON public.tickets
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 不创建任何 INSERT / UPDATE / DELETE 策略
-- → 默认拒绝。anon 与 authenticated 都无法直接写入。

-- ---------- feeds 表 ----------
ALTER TABLE public.feeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_feeds"  ON public.feeds;
DROP POLICY IF EXISTS "public_write_feeds" ON public.feeds;
DROP POLICY IF EXISTS "anon_all_feeds"     ON public.feeds;
DROP POLICY IF EXISTS "feeds_select_all"   ON public.feeds;

CREATE POLICY "feeds_select_all"
  ON public.feeds
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ---------- 存储桶（海报图片）----------
-- 若使用 storage 存海报，同样只给读权限
-- INSERT INTO storage.buckets (id, name, public) VALUES ('posters', 'posters', true)
--   ON CONFLICT (id) DO NOTHING;
-- CREATE POLICY "posters_public_read" ON storage.objects
--   FOR SELECT TO anon, authenticated USING (bucket_id = 'posters');

-- ============================================================
-- 验证：执行后下面两条应返回 rowsecurity = true
-- ============================================================
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename IN ('tickets','feeds');

-- 验证写入被拒绝（应返回错误 42501 permission denied）：
-- curl -X POST "https://<project>.supabase.co/rest/v1/tickets" \
--   -H "apikey: <anon_key>" -H "Content-Type: application/json" \
--   -d '{"title":"hack-test"}'
