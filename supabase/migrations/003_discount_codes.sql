-- ============================================================
-- HaloProfile — Migration 003: Discount Codes for Abandoned Uploads
-- ============================================================

-- Table to track exit-intent discount offers
CREATE TABLE IF NOT EXISTS abandoned_upload_discounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  upload_id       UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  discount_code   TEXT NOT NULL UNIQUE,
  discount_percent INTEGER NOT NULL DEFAULT 50,
  stripe_coupon_id TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,
  email_sent_at   TIMESTAMPTZ,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_discounts_user_id ON abandoned_upload_discounts(user_id);
CREATE INDEX IF NOT EXISTS idx_discounts_code ON abandoned_upload_discounts(discount_code);

-- RLS
ALTER TABLE abandoned_upload_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own discount"
  ON abandoned_upload_discounts FOR SELECT
  USING (auth.uid() = user_id);

-- Grant access
GRANT ALL ON abandoned_upload_discounts TO anon, authenticated;