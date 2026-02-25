/**
 * TypeScript types auto-derived from the Supabase schema.
 * Update these whenever you run new migrations.
 *
 * TIP: You can auto-generate these from Supabase CLI:
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
export type Database = {
  public: {
    Tables: {
      ebay_transactions: {
        Row: EbayTransaction
        Insert: Omit<EbayTransaction, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<EbayTransaction, 'id' | 'user_id' | 'created_at'>>
      }
      amazon_transactions: {
        Row: AmazonTransaction
        Insert: Omit<AmazonTransaction, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<AmazonTransaction, 'id' | 'user_id' | 'created_at'>>
      }
      user_settings: {
        Row: UserSettings
        Insert: Pick<UserSettings, 'user_id'> & Partial<UserSettings>
        Update: Partial<Omit<UserSettings, 'user_id' | 'created_at'>>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
