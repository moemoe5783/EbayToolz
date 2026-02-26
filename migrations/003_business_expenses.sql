-- ============================================================
-- EbayToolz - Business Expenses table
--
-- Tracks non-dropshipping business costs: Amazon orders bought
-- for the business itself, software subscriptions, supplies, etc.
-- These are deducted from net profit in dashboard and clusters views.
-- ============================================================

create table if not exists public.business_expenses (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  date                 timestamptz not null default now(),
  description          text not null,
  amount               numeric(12, 2) not null check (amount > 0),
  category             text not null default 'other'
                         check (category in (
                           'amazon_order', 'software', 'subscription',
                           'supplies', 'shipping', 'advertising', 'other'
                         )),
  notes                text,
  amazon_order_number  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Indexes
create index if not exists business_expenses_user_id_idx  on public.business_expenses (user_id);
create index if not exists business_expenses_date_idx     on public.business_expenses (user_id, date desc);
create index if not exists business_expenses_category_idx on public.business_expenses (user_id, category);

-- Auto-update updated_at
create trigger business_expenses_updated_at
  before update on public.business_expenses
  for each row execute procedure public.handle_updated_at();

-- RLS
alter table public.business_expenses enable row level security;

drop policy if exists "Users can access own business expenses" on public.business_expenses;
create policy "Users can access own business expenses"
  on public.business_expenses
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on public.business_expenses to authenticated;
