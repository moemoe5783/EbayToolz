/**
 * TypeScript types for the Supabase schema.
 *
 * The Database type must exactly match the shape expected by
 * @supabase/supabase-js v2.47+ (PostgrestVersion "12"):
 *   - Each table entry needs a Relationships array
 *   - Unused maps use `{ [_ in never]: never }` not `Record<string, never>`
 *   - Insert types mark auto-generated columns (id, created_at) as optional
 *
 * TIP: Auto-regenerate from Supabase CLI after schema changes:
 *   npx supabase gen types typescript --project-id <ref> > lib/types/database.ts
 */

// ─── Sub-transaction (line item) stored inside transactions_json ─────────────
export interface TransactionLineItem {
  name: string
  qty: number
  price: number
  sku?: string
}

// ─── eBay Transaction ─────────────────────────────────────────────────────────
export interface EbayTransaction {
  id: string
  user_id: string
  date: string | null
  order_number: string
  total: number | null
  net: number | null
  type: 'sale' | 'refund'
  status: string | null
  buyer: string | null
  shipping_address: string | null
  transactions_json: TransactionLineItem[]
  corresponding_amazon_order: string | null
  created_at: string
  updated_at: string
}

// ─── Amazon Transaction ───────────────────────────────────────────────────────
export interface AmazonTransaction {
  id: string
  user_id: string
  date: string | null
  order_number: string
  total: number | null
  cost: number | null
  type: 'complete' | 'refund' | 'cancel'
  status: string | null
  shipping_address: string | null
  tracking_url: string | null
  corresponding_ebay_order: string | null
  created_at: string
  updated_at: string
}

// ─── Business Expense ─────────────────────────────────────────────────────────
export type ExpenseCategory =
  | 'amazon_order'
  | 'software'
  | 'subscription'
  | 'supplies'
  | 'shipping'
  | 'advertising'
  | 'other'

export interface BusinessExpense {
  id: string
  user_id: string
  date: string
  description: string
  amount: number
  category: ExpenseCategory
  notes: string | null
  amazon_order_number: string | null
  created_at: string
  updated_at: string
}

// ─── eBay OAuth Token ─────────────────────────────────────────────────────────
// Stored in ebay_oauth_tokens which has RLS enabled with NO policies.
// Only accessible via the service_role client server-side.
export interface EbayOAuthToken {
  user_id: string
  access_token: string          // AES-256-GCM encrypted
  refresh_token: string         // AES-256-GCM encrypted
  expires_at: string
  refresh_token_expires_at: string | null
  scope: string | null
  ebay_user_id: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

// ─── User Settings ────────────────────────────────────────────────────────────
export interface UserSettings {
  user_id: string
  apply_amazon_5pct_adjustment: boolean
  created_at: string
  updated_at: string
}

// ─── Order Cluster ────────────────────────────────────────────────────────────
// A "cluster" links an eBay order to its corresponding Amazon purchase
export interface OrderCluster {
  /** The eBay order at the center of this cluster */
  ebay: EbayTransaction
  /** Matched Amazon orders (usually one, could be multiple) */
  amazon: AmazonTransaction[]
  /** eBay net (after fees) */
  ebayNet: number
  /** Raw Amazon cost (sum of cost column) */
  amazonCostRaw: number
  /** Amazon cost after optional 5% adjustment */
  amazonCostAdjusted: number
  /** Final profit = ebayNet - amazonCostAdjusted */
  netProfit: number
  /** Whether the 5% adjustment was applied */
  adjustmentApplied: boolean
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export interface DashboardStats {
  netProfitLast30Days: number
  totalSalesLast30Days: number
  totalOrdersLast30Days: number
  topItems: TopItem[]
  staleItems: StaleItem[]
}

export interface TopItem {
  name: string
  totalQty: number
  totalRevenue: number
  orderCount: number
}

export interface StaleItem {
  name: string
  lastSoldDate: string
  daysSinceLastSale: number
  totalSold: number
}

// ─── Supabase Database type map (for createClient<Database>()) ────────────────
// Structured to match @supabase/supabase-js v2.47+ expectations.
// Key requirements vs older hand-written types:
//   1. Explicit Insert/Update shapes (no Omit<>/Partial<> shortcuts) so the
//      compiler can narrow insert() argument types correctly.
//   2. Every table needs a `Relationships: []` entry.
//   3. Top-level empty maps must use `{ [_ in never]: never }`.
export type Database = {
  public: {
    Tables: {
      ebay_transactions: {
        Row: EbayTransaction
        Insert: {
          id?: string
          user_id: string
          date?: string | null
          order_number: string
          total?: number | null
          net?: number | null
          type: 'sale' | 'refund'
          status?: string | null
          buyer?: string | null
          shipping_address?: string | null
          transactions_json?: TransactionLineItem[]
          corresponding_amazon_order?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          date?: string | null
          order_number?: string
          total?: number | null
          net?: number | null
          type?: 'sale' | 'refund'
          status?: string | null
          buyer?: string | null
          shipping_address?: string | null
          transactions_json?: TransactionLineItem[]
          corresponding_amazon_order?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      amazon_transactions: {
        Row: AmazonTransaction
        Insert: {
          id?: string
          user_id: string
          date?: string | null
          order_number: string
          total?: number | null
          cost?: number | null
          type: 'complete' | 'refund' | 'cancel'
          status?: string | null
          shipping_address?: string | null
          tracking_url?: string | null
          corresponding_ebay_order?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          date?: string | null
          order_number?: string
          total?: number | null
          cost?: number | null
          type?: 'complete' | 'refund' | 'cancel'
          status?: string | null
          shipping_address?: string | null
          tracking_url?: string | null
          corresponding_ebay_order?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: UserSettings
        Insert: {
          user_id: string
          apply_amazon_5pct_adjustment?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          apply_amazon_5pct_adjustment?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      business_expenses: {
        Row: BusinessExpense
        Insert: {
          id?: string
          user_id: string
          date?: string
          description: string
          amount: number
          category?: ExpenseCategory
          notes?: string | null
          amazon_order_number?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          date?: string
          description?: string
          amount?: number
          category?: ExpenseCategory
          notes?: string | null
          amazon_order_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ebay_oauth_tokens: {
        Row: EbayOAuthToken
        Insert: {
          user_id: string
          access_token: string
          refresh_token: string
          expires_at: string
          refresh_token_expires_at?: string | null
          scope?: string | null
          ebay_user_id?: string | null
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          refresh_token?: string
          expires_at?: string
          refresh_token_expires_at?: string | null
          scope?: string | null
          ebay_user_id?: string | null
          last_synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
