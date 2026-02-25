# EbayToolz — Dropshipping Management App

A production-ready full-stack application for managing eBay and Amazon dropshipping operations. Built with **Next.js 14 App Router**, **Supabase** (Postgres + Auth + RLS), and **Tailwind CSS**, deployable to **Vercel** in minutes.

---

## Features

- **Multi-tenant** — strict per-user data isolation enforced at the database level via Supabase Row Level Security (RLS). Users can only ever see their own data, even with the same anon key.
- **eBay Transactions** — track sales and refunds, buyers, shipping, line items, and order status.
- **Amazon Transactions** — track complete, refund, and cancel orders with costs and tracking URLs.
- **Order Clusters** — automatically links eBay orders to their Amazon fulfillment purchases and computes net profit.
- **5% Adjustment** — optional configurable per-user adjustment applied to Amazon costs in cluster calculations.
- **Dashboard** — 30-day net profit, total sales, order count, top selling items, and stale items (no sales in 90+ days).
- **Secure Auth** — email/password via Supabase Auth with cookie-based SSR sessions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| ORM/Client | @supabase/supabase-js + @supabase/ssr |
| Styling | Tailwind CSS |
| Tables | TanStack Table v8 |
| Validation | Zod |
| Toasts | Sonner |
| Deployment | Vercel |

---

## Project Structure

```
├── app/
│   ├── (auth)/login/          # Public login/signup page
│   ├── (protected)/           # Auth-gated pages (layout with sidebar)
│   │   ├── dashboard/         # Stats overview
│   │   ├── transactions/      # eBay + Amazon transaction tables
│   │   ├── clusters/          # Order cluster profit view
│   │   └── settings/          # User preferences
│   ├── api/auth/callback/     # Supabase OAuth/email callback
│   ├── layout.tsx             # Root layout (fonts, Toaster)
│   └── globals.css
├── components/
│   ├── auth/                  # Login form
│   ├── dashboard/             # Stats cards, top items, stale items
│   ├── transactions/          # Tables + modal form
│   ├── clusters/              # Cluster cards view
│   ├── settings/              # Settings form
│   └── layout/                # Sidebar, Navbar
├── lib/
│   ├── supabase/
│   │   ├── server.ts          # SSR Supabase client (Server Actions, Components)
│   │   └── client.ts          # Browser Supabase client (Client Components)
│   ├── actions/               # Server Actions (CRUD + auth)
│   │   ├── auth.ts
│   │   ├── ebay-transactions.ts
│   │   ├── amazon-transactions.ts
│   │   ├── settings.ts
│   │   └── dashboard.ts
│   ├── types/database.ts      # TypeScript types for all DB tables
│   └── utils/
│       ├── calculations.ts    # Cluster math, adjustments, formatting
│       └── cn.ts              # Tailwind class merging utility
├── middleware.ts               # Session refresh + route protection
├── migrations/
│   └── 001_initial_schema.sql # Full DB schema + RLS policies
└── .env.local.example
```

---

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd ebay-toolz
npm install
```

### 2. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Wait for the project to provision.
3. Navigate to **Settings > API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. Run the Database Migration

1. In your Supabase dashboard, open **SQL Editor**.
2. Paste the entire contents of `migrations/001_initial_schema.sql`.
3. Click **Run**.

This creates the `ebay_transactions`, `amazon_transactions`, and `user_settings` tables with all RLS policies.

### 4. Configure Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login`.

---

## Vercel Deployment

### Option A: Supabase + Vercel Marketplace Integration (Recommended)

This is the easiest path — Vercel injects `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` automatically.

1. Push your code to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import your repo.
3. During setup, click **Add Integration** and search for **Supabase**.
4. Follow the Supabase integration wizard to link your existing Supabase project (or create a new one).
5. Vercel will auto-inject all required Supabase environment variables.
6. Add `NEXT_PUBLIC_APP_URL=https://your-app.vercel.app` manually in **Project Settings > Environment Variables**.
7. Click **Deploy**.

### Option B: Manual Environment Variables

1. Push code to GitHub and import to Vercel.
2. In **Project Settings > Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL` (your Vercel URL, e.g. `https://ebay-toolz.vercel.app`)
3. Deploy.

### Supabase Auth Redirect URL

After deploying, add your Vercel URL to Supabase's allowed redirect URLs:

1. Supabase Dashboard → **Authentication > URL Configuration**
2. Add to **Redirect URLs**: `https://your-app.vercel.app/api/auth/callback`
3. Update **Site URL** to: `https://your-app.vercel.app`

---

## Database Schema

### `ebay_transactions`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | References `auth.users(id)` |
| date | timestamptz | Order date |
| order_number | text | eBay order number |
| total | numeric | Gross sale amount |
| net | numeric | After eBay fees |
| type | text | `sale` or `refund` |
| status | text | Order status |
| buyer | text | Buyer username |
| shipping_address | text | Shipping destination |
| transactions_json | jsonb | Array of `{name, qty, price, sku?}` |
| corresponding_amazon_order | text | Linked Amazon order number |

### `amazon_transactions`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | References `auth.users(id)` |
| date | timestamptz | Order date |
| order_number | text | Amazon order number |
| total | numeric | Total charged |
| cost | numeric | Your cost to fulfill |
| type | text | `complete`, `refund`, or `cancel` |
| status | text | Order status |
| shipping_address | text | Delivery address |
| tracking_url | text | Shipping tracker URL |
| corresponding_ebay_order | text | Linked eBay order number |

### `user_settings`

| Column | Type | Notes |
|---|---|---|
| user_id | uuid | Primary key, references `auth.users(id)` |
| apply_amazon_5pct_adjustment | boolean | Default `true` |

---

## Row Level Security

RLS is enabled on all tables. Policies enforce:

```sql
-- Users can only access their own rows
using  (auth.uid() = user_id)
with check (auth.uid() = user_id)
```

This means even if someone obtains your anon key, they cannot read another user's data. All Server Actions use the server-side Supabase client which automatically applies these policies via the authenticated session cookie.

---

## Order Cluster Logic

An "order cluster" links one eBay sale/refund to its corresponding Amazon purchase(s).

**Matching strategy** (in order):
1. `ebay.corresponding_amazon_order` → `amazon.order_number`
2. `amazon.corresponding_ebay_order` → `ebay.order_number`

**Net profit formula:**
```
Net Profit = eBay Net − Amazon Cost (adjusted)
```

**5% adjustment** (when enabled in Settings):
- `complete` Amazon orders: cost × 1.05 (add 5%)
- `refund` / `cancel` Amazon orders: cost × 0.95 (subtract 5%)

Raw transaction lists always show unadjusted values.

---

## Development

```bash
# Type-check
npm run type-check

# Lint
npm run lint

# Build (production)
npm run build
```

### Auto-generate Supabase types

If you make schema changes, regenerate types with:

```bash
npx supabase gen types typescript \
  --project-id <your-project-ref> \
  > lib/types/database.ts
```

---

## Security Notes

- **Never disable RLS** on any table in production.
- **Never expose** `SUPABASE_SERVICE_ROLE_KEY` to the client — it bypasses RLS entirely.
- The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe to expose; it's limited by RLS policies.
- Sessions are managed via httpOnly cookies via `@supabase/ssr` — no tokens in localStorage.
- All input is validated with **Zod** before hitting the database.
- Route protection is enforced at the middleware level and double-checked in the protected layout.

---

## License

MIT
