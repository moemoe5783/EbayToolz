-- ============================================================
-- EbayToolz - Initial Database Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable UUID extension (usually pre-enabled in Supabase)
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLE: ebay_transactions
-- Stores all eBay orders (sales and refunds)
-- ============================================================
create table if not exists public.ebay_transactions (
  id                        uuid primary key default uuid_generate_v4(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  date                      timestamptz,
  order_number              text not null,
  total                     numeric(12, 2),
  net                       numeric(12, 2),
  type                      text not null check (type in ('sale', 'refund')),
  status                    text,
  buyer                     text,
  shipping_address          text,
  -- Array of sub-transactions (line items) for orders with multiple items
  transactions_json         jsonb default '[]'::jsonb,
  -- Reference to matched Amazon order
  corresponding_amazon_order text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists ebay_transactions_user_id_idx     on public.ebay_transactions (user_id);
create index if not exists ebay_transactions_order_number_idx on public.ebay_transactions (user_id, order_number);
create index if not exists ebay_transactions_date_idx         on public.ebay_transactions (user_id, date desc);
create index if not exists ebay_transactions_type_idx         on public.ebay_transactions (user_id, type);

-- Auto-update updated_at on row changes
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ebay_transactions_updated_at
  before update on public.ebay_transactions
  for each row execute procedure public.handle_updated_at();

-- ============================================================
-- TABLE: amazon_transactions
-- Stores all Amazon orders (complete, refund, cancel)
-- ============================================================
create table if not exists public.amazon_transactions (
  id                       uuid primary key default uuid_generate_v4(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  date                     timestamptz,
  order_number             text not null,
  total                    numeric(12, 2),
  cost                     numeric(12, 2),
  type                     text not null check (type in ('complete', 'refund', 'cancel')),
  status                   text,
  shipping_address         text,
  tracking_url             text,
  -- Reference to matched eBay order
  corresponding_ebay_order text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists amazon_transactions_user_id_idx     on public.amazon_transactions (user_id);
create index if not exists amazon_transactions_order_number_idx on public.amazon_transactions (user_id, order_number);
create index if not exists amazon_transactions_date_idx         on public.amazon_transactions (user_id, date desc);
create index if not exists amazon_transactions_type_idx         on public.amazon_transactions (user_id, type);

create trigger amazon_transactions_updated_at
  before update on public.amazon_transactions
  for each row execute procedure public.handle_updated_at();

-- ============================================================
-- TABLE: user_settings
-- Per-user configuration toggles
-- ============================================================
create table if not exists public.user_settings (
  user_id                      uuid primary key references auth.users(id) on delete cascade,
  -- Whether to apply the 5% Amazon cost adjustment in cluster calculations
  apply_amazon_5pct_adjustment  boolean not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute procedure public.handle_updated_at();

-- Auto-create default settings row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Strictly enforces per-user data isolation at the DB level
-- ============================================================

-- ebay_transactions RLS
alter table public.ebay_transactions enable row level security;

drop policy if exists "Users can access own eBay transactions" on public.ebay_transactions;
create policy "Users can access own eBay transactions"
  on public.ebay_transactions
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- amazon_transactions RLS
alter table public.amazon_transactions enable row level security;

drop policy if exists "Users can access own Amazon transactions" on public.amazon_transactions;
create policy "Users can access own Amazon transactions"
  on public.amazon_transactions
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- user_settings RLS
alter table public.user_settings enable row level security;

drop policy if exists "Users can access own settings" on public.user_settings;
create policy "Users can access own settings"
  on public.user_settings
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- GRANT public schema access to authenticated role
-- ============================================================
grant usage on schema public to authenticated;
grant all on public.ebay_transactions   to authenticated;
grant all on public.amazon_transactions to authenticated;
grant all on public.user_settings       to authenticated;
