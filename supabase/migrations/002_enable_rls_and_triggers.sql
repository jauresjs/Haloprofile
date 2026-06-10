-- ============================================================
-- HaloProfile — Part 2: RLS, Triggers & Functions
-- Tables already exist, this adds security & automation.
-- ============================================================

-- 1. Enable RLS on all tables
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS training_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS generated_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS orders ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies first (so we can recreate safely)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own uploads" ON uploads;
DROP POLICY IF EXISTS "Users can insert own uploads" ON uploads;
DROP POLICY IF EXISTS "Users can update own uploads" ON uploads;
DROP POLICY IF EXISTS "Users can view own training jobs" ON training_jobs;
DROP POLICY IF EXISTS "Users can insert own training jobs" ON training_jobs;
DROP POLICY IF EXISTS "Users can update own training jobs" ON training_jobs;
DROP POLICY IF EXISTS "Users can view own generated photos" ON generated_photos;
DROP POLICY IF EXISTS "Users can insert own generated photos" ON generated_photos;
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can insert own orders" ON orders;

-- ============================================================
-- 3. RLS Policies
-- ============================================================

-- Profiles
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
CREATE POLICY "Users can view own generated photos"
  ON generated_photos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generated photos"
  ON generated_photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Orders
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 4. Auto-create profile on user signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 5. Updated_at trigger function
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

-- Add updated_at column to profiles if missing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add updated_at column to training_jobs if missing
ALTER TABLE training_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_training_jobs_updated_at ON training_jobs;
CREATE TRIGGER set_training_jobs_updated_at
  BEFORE UPDATE ON training_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 6. Add missing columns to profiles if they don't exist
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';

-- ============================================================
-- 7. Grant Data API access
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ============================================================
-- 8. Create exec_sql function for admin scripts
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
-- 9. Storage bucket access via service_role (already public buckets)
-- Storage buckets policies are created separately via Supabase dashboard
-- since they require different handling through the storage API.
-- For now, service_role key already has full access.
-- ============================================================
