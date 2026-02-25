-- ============================================================
-- EbayToolz - Add unique constraints on (user_id, order_number)
--
-- The original schema created plain indexes, not unique indexes.
-- Without these constraints, Supabase accepts duplicate inserts
-- and returns 201, so the extension's 409-based dedup never fired.
--
-- NOTE: If duplicate rows already exist this will fail.
-- Clean them up first:
--   DELETE FROM public.amazon_transactions a
--   WHERE a.id NOT IN (
--     SELECT MIN(id) FROM public.amazon_transactions
--     GROUP BY user_id, order_number
--   );
--   DELETE FROM public.ebay_transactions a
--   WHERE a.id NOT IN (
--     SELECT MIN(id) FROM public.ebay_transactions
--     GROUP BY user_id, order_number
--   );
-- ============================================================

-- Drop the old plain indexes (the unique constraints below create their own indexes)
drop index if exists public.amazon_transactions_order_number_idx;
drop index if exists public.ebay_transactions_order_number_idx;

-- Add unique constraints
alter table public.amazon_transactions
  add constraint amazon_transactions_user_order_unique unique (user_id, order_number);

alter table public.ebay_transactions
  add constraint ebay_transactions_user_order_unique unique (user_id, order_number);
