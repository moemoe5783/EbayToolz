-- Migration: Add Amazon Visa flag, item scraping, and order match suggestions
-- Run this against your Supabase project before deploying the new extension/app code.

-- ── 1. Add used_amazon_visa to amazon_transactions ───────────────────────────
-- Tracks whether the order was placed with the Amazon Visa card (5% cashback).
-- The 5% adjustment in cluster calculations only fires when this is true.
ALTER TABLE amazon_transactions
  ADD COLUMN IF NOT EXISTS used_amazon_visa boolean NOT NULL DEFAULT false;

-- ── 2. Add items_json to amazon_transactions ─────────────────────────────────
-- Stores scraped line-item names/quantities from the Amazon order page.
-- Used for fuzzy-matching Amazon orders to eBay orders by item name.
ALTER TABLE amazon_transactions
  ADD COLUMN IF NOT EXISTS items_json jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── 3. Create match_suggestions table ────────────────────────────────────────
-- Holds auto-generated pairing candidates between unlinked Amazon and eBay orders.
-- 'high' confidence = strong address+item overlap (user prompted to confirm).
-- 'medium' confidence = weaker signal (user prompted on clusters/transactions page).
CREATE TABLE IF NOT EXISTS match_suggestions (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid        REFERENCES auth.users(id)          ON DELETE CASCADE NOT NULL,
  amazon_tx_id     uuid        REFERENCES amazon_transactions(id) ON DELETE CASCADE NOT NULL,
  ebay_tx_id       uuid        REFERENCES ebay_transactions(id)   ON DELETE CASCADE NOT NULL,
  confidence       text        NOT NULL CHECK (confidence IN ('high', 'medium')),
  dismissed        boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (amazon_tx_id, ebay_tx_id)
);

ALTER TABLE match_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own match suggestions"
  ON match_suggestions FOR ALL
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
