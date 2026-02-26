-- eBay OAuth tokens stored encrypted at rest.
-- RLS is ENABLED but NO policies are created — this means only the
-- service_role key (used server-side only) can read or write rows.
-- Browser-level (anon / authenticated) access is completely blocked.

CREATE TABLE IF NOT EXISTS ebay_oauth_tokens (
  user_id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token             TEXT        NOT NULL,  -- AES-256-GCM encrypted
  refresh_token            TEXT        NOT NULL,  -- AES-256-GCM encrypted
  expires_at               TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ,
  scope                    TEXT,
  ebay_user_id             TEXT,
  last_synced_at           TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_ebay_oauth_tokens_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ebay_oauth_tokens_updated_at
  BEFORE UPDATE ON ebay_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION update_ebay_oauth_tokens_updated_at();

-- Enable RLS: no policies are added intentionally.
-- Without any policy, ALL access from anon/authenticated roles is denied.
-- Only the service_role (which bypasses RLS) can read or modify this table.
ALTER TABLE ebay_oauth_tokens ENABLE ROW LEVEL SECURITY;
