-- ============================================================
-- HaloProfile — Initial Schema Migration
-- ============================================================
-- Run this in the Supabase SQL Editor or via Management API.
-- ============================================================

-- 0. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  full_name     TEXT,
  avatar_url    TEXT,
  gender        TEXT CHECK (gender IN ('male', 'female')),
  plan          TEXT DEFAULT 'free',
  subscription_credits INTEGER DEFAULT 0,
  purchased_credits     INTEGER DEFAULT 0,
  stripe_subscription_id TEXT,
  subscription_status   TEXT DEFAULT 'inactive',
  current_period_end    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Uploads table
CREATE TABLE IF NOT EXISTS uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  zip_url       TEXT NOT NULL,
  photo_count   INTEGER NOT NULL CHECK (photo_count >= 15 AND photo_count <= 30),
  status        TEXT NOT NULL DEFAULT 'pending_payment'
                CHECK (status IN ('pending_payment', 'paid', 'failed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Training jobs table
CREATE TABLE IF NOT EXISTS training_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  upload_id     UUID REFERENCES uploads(id) ON DELETE SET NULL,
  trigger_word  TEXT,
  lora_url      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'training', 'completed', 'failed')),
  steps         INTEGER DEFAULT 1000,
  plan          TEXT,
  gender        TEXT CHECK (gender IN ('male', 'female')),
  shot_type     TEXT DEFAULT 'bust',
  photo_count   INTEGER,
  fal_request_id TEXT,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Generated photos table
CREATE TABLE IF NOT EXISTS generated_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  training_job_id UUID NOT NULL REFERENCES training_jobs(id) ON DELETE CASCADE,
  image_url       TEXT NOT NULL,
  style           TEXT NOT NULL
                  CHECK (style IN ('outdoor', 'professional', 'lifestyle', 'travel')),
  prompt_used     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Orders table
CREATE TABLE IF NOT EXISTS orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  upload_id               UUID REFERENCES uploads(id) ON DELETE SET NULL,
  stripe_session_id       TEXT,
  stripe_payment_intent_id TEXT,
  amount                  INTEGER,
  plan                    TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_training_jobs_user_id ON training_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_training_jobs_status ON training_jobs(status);
CREATE INDEX IF NOT EXISTS idx_training_jobs_fal_request_id ON training_jobs(fal_request_id);
CREATE INDEX IF NOT EXISTS idx_generated_photos_user_id ON generated_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_photos_training_job_id ON generated_photos(training_job_id);
CREATE INDEX IF NOT EXISTS idx_generated_photos_style ON generated_photos(style);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Uploads
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own uploads"
  ON uploads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own uploads"
  ON uploads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own uploads"
  ON uploads FOR UPDATE
  USING (auth.uid() = user_id);

-- Training jobs
ALTER TABLE training_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own training jobs"
  ON training_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own training jobs"
  ON training_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own training jobs"
  ON training_jobs FOR UPDATE
  USING (auth.uid() = user_id);

-- Generated photos
ALTER TABLE generated_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generated photos"
  ON generated_photos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generated photos"
  ON generated_photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Auto-create profile on user signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_training_jobs_updated_at
  BEFORE UPDATE ON training_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- Grant Data API access (so anon/authenticated roles can use REST)
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ============================================================
-- Create exec_sql function for admin SQL scripts
-- ============================================================
CREATE OR REPLACE FUNCTION public.exec_sql(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE query;
  result := jsonb_build_object('success', true);
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  result := jsonb_build_object('error', SQLERRM);
  RETURN result;
END;
$$;

-- ============================================================
-- Storage buckets (these need to be created via API separately)
-- ============================================================
-- Buckets will be created via the Management API:
--   - pending-uploads
--   - generated-photos
