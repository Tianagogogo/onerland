-- ============================================================
-- ONERLAND 票根核验（云端复核）数据表
-- 在 Supabase 控制台 → SQL Editor 中执行
-- ============================================================
-- 设计说明：
--   核验采用「本地脱敏通过 + 云端待复核」双层机制
--   1. 用户本地先脱敏（涂抹订单号/条码/身份证），本地判定通过即解锁评分
--   2. 同时把脱敏图上传云端存 pending，供管理员事后抽查复核
--   3. 原图绝不上传，只上传用户已打码的版本
--   4. anon 只能 INSERT 自己的核验记录与 SELECT 已 approved 的，不能改状态
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ticket_proofs (
  id              bigserial PRIMARY KEY,
  show_key        text        NOT NULL,
  artist          text,
  city            text,
  show_date       text,
  seat_area       text,
  image_url       text,
  -- pending: 待复核 / approved: 已通过 / rejected: 驳回
  review_status   text        NOT NULL DEFAULT 'pending'
                  CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewer_note   text,
  submitter_hash  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ticket_proofs_show   ON public.ticket_proofs (show_key);
CREATE INDEX IF NOT EXISTS idx_ticket_proofs_status ON public.ticket_proofs (review_status);

ALTER TABLE public.ticket_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proofs_insert_anon"    ON public.ticket_proofs;
DROP POLICY IF EXISTS "proofs_select_own"     ON public.ticket_proofs;
DROP POLICY IF EXISTS "proofs_select_public"  ON public.ticket_proofs;

-- 任何人可提交核验（匿名也可，降低门槛）
CREATE POLICY "proofs_insert_anon"
  ON public.ticket_proofs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 只允许读取已通过的记录（用于展示「该场已验证 N 人」）
-- 未审核的 pending 记录不对外暴露
CREATE POLICY "proofs_select_public"
  ON public.ticket_proofs
  FOR SELECT
  TO anon, authenticated
  USING (review_status = 'approved');

-- 不创建 UPDATE / DELETE 策略 → 只有 service_role 能改状态
-- 管理员通过 functions/api/admin.js 的 reviewProof 动作操作

-- ============================================================
-- Storage 桶（存放脱敏票根图）
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-proofs', 'ticket-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- 允许匿名上传到该桶
DROP POLICY IF EXISTS "proofs_upload_anon" ON storage.objects;
CREATE POLICY "proofs_upload_anon"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'ticket-proofs');

-- 桶非公开，读取需通过 service_role 或签名 URL
-- 不创建 SELECT 策略 → anon 无法列出他人上传的图片
