-- ============================================================
-- Loraloop — Supabase Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Businesses table
CREATE TABLE IF NOT EXISTS businesses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ      DEFAULT NOW(),
  updated_at    TIMESTAMPTZ      DEFAULT NOW(),
  business_name TEXT,
  website       TEXT             NOT NULL,
  status        TEXT             DEFAULT 'scraping'
                CHECK (status IN ('scraping','enriching','generating','completed','failed')),
  error_message TEXT,

  -- Raw scraped data
  scraped_data      JSONB DEFAULT '{}',

  -- AI-enriched brand DNA
  enriched_data     JSONB DEFAULT '{}',

  -- Brand guidelines: colors, fonts, images, logos
  brand_guidelines  JSONB DEFAULT '{}',

  -- Brand memory: voice, identity, content patterns
  brand_memory      JSONB DEFAULT '{}',

  -- Knowledge-base documents (markdown)
  business_profile  TEXT,
  market_research   TEXT,
  social_strategy   TEXT
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_businesses_updated_at ON businesses;
CREATE TRIGGER trg_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Row-level security
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS
DROP POLICY IF EXISTS "service_role_all"    ON businesses;
CREATE POLICY "service_role_all"
  ON businesses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon can read
DROP POLICY IF EXISTS "anon_read" ON businesses;
CREATE POLICY "anon_read"
  ON businesses FOR SELECT TO anon USING (true);

-- 3. Supabase Storage bucket (brand-assets — public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read objects in brand-assets
DROP POLICY IF EXISTS "brand_assets_public_read" ON storage.objects;
CREATE POLICY "brand_assets_public_read"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'brand-assets');

-- Allow service role to insert / upsert objects
DROP POLICY IF EXISTS "brand_assets_service_insert" ON storage.objects;
CREATE POLICY "brand_assets_service_insert"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'brand-assets');

DROP POLICY IF EXISTS "brand_assets_service_update" ON storage.objects;
CREATE POLICY "brand_assets_service_update"
  ON storage.objects FOR UPDATE TO service_role
  USING (bucket_id = 'brand-assets');

-- ============================================================
-- Billing: users + credits
-- ============================================================

-- 4. Billing users table
CREATE TABLE IF NOT EXISTS billing_users (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at             TIMESTAMPTZ  DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  DEFAULT NOW(),
  email                  TEXT         NOT NULL UNIQUE,
  stripe_customer_id     TEXT         UNIQUE,
  plan                   TEXT         NOT NULL DEFAULT 'FREE'
                           CHECK (plan IN ('FREE','SOLO','PRO','AGENCY','ENTERPRISE')),
  subscription_status    TEXT         NOT NULL DEFAULT 'inactive'
                           CHECK (subscription_status IN ('active','trialing','past_due','canceled','paused','inactive')),
  credits_used_this_month INTEGER      NOT NULL DEFAULT 0,
  credits_reset_at       TIMESTAMPTZ  DEFAULT NOW(),
  plan_expires_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_users_email_idx          ON billing_users (email);
CREATE UNIQUE INDEX IF NOT EXISTS billing_users_stripe_cid_idx     ON billing_users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_billing_users_updated_at ON billing_users;
CREATE TRIGGER trg_billing_users_updated_at
  BEFORE UPDATE ON billing_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE billing_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_service_role_all" ON billing_users;
CREATE POLICY "billing_service_role_all"
  ON billing_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Credit usage log
CREATE TABLE IF NOT EXISTS credit_usage (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  user_id     UUID        NOT NULL REFERENCES billing_users (id) ON DELETE CASCADE,
  agent_name  TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  credits     INTEGER     NOT NULL
);

CREATE INDEX IF NOT EXISTS credit_usage_user_idx ON credit_usage (user_id);

ALTER TABLE credit_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_usage_service_role_all" ON credit_usage;
CREATE POLICY "credit_usage_service_role_all"
  ON credit_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
