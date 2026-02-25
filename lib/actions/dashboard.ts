'use server'

/**
 * Server Actions for Dashboard statistics.
 * Aggregates data from both eBay and Amazon transactions.
 */
import { createClient } from '@/lib/supabase/server'
import { getUserSettings } from '@/lib/actions/settings'
import {
  buildClusters,
  filterClustersByDays,
  totalNetProfit,
} from '@/lib/utils/calculations'
import type {
  DashboardStats,
  TopItem,
  StaleItem,
  TransactionLineItem,
} from '@/lib/types/database'

export async function getDashboardStats(): Promise<{
  data: DashboardStats | null
  error?: string
}> {
  const supabase = await createClient()

  // Fetch both transaction types and settings in parallel
  const [ebayResult, amazonResult, settingsResult] = await Promise.all([
    supabase
      .from('ebay_transactions')
      .select('*')
      .order('date', { ascending: false }),
    supabase
      .from('amazon_transactions')
      .select('*')
      .order('date', { ascending: false }),
    getUserSettings(),
  ])

  if (ebayResult.error) return { data: null, error: ebayResult.error.message }
  if (amazonResult.error)
    return { data: null, error: amazonResult.error.message }

  const ebayTxs = ebayResult.data ?? []
  const amazonTxs = amazonResult.data ?? []
  const applyAdjustment =
    settingsResult.data?.apply_amazon_5pct_adjustment ?? true

  // ─── Net profit (last 30 days) ─────────────────────────────────────────────
  const allClusters = buildClusters(ebayTxs, amazonTxs, applyAdjustment)
  const recentClusters = filterClustersByDays(allClusters, 30)
  const netProfitLast30Days = totalNetProfit(recentClusters)

  // ─── Total sales / orders (last 30 days eBay) ──────────────────────────────
  const cutoff30 = new Date()
  cutoff30.setDate(cutoff30.getDate() - 30)

  const recentEbay = ebayTxs.filter(
    (t) => t.date && new Date(t.date) >= cutoff30 && t.type === 'sale'
  )
  const totalSalesLast30Days = recentEbay.reduce(
    (sum, t) => sum + (t.total ?? 0),
    0
  )
  const totalOrdersLast30Days = recentEbay.length

  // ─── Top selling items ──────────────────────────────────────────────────────
  const itemMap = new Map<
    string,
    { totalQty: number; totalRevenue: number; orderCount: number }
  >()

  for (const tx of ebayTxs) {
    if (tx.type !== 'sale') continue
    const items = (tx.transactions_json ?? []) as TransactionLineItem[]

    for (const item of items) {
      const key = item.name.trim().toLowerCase()
      const existing = itemMap.get(key) ?? {
        totalQty: 0,
        totalRevenue: 0,
        orderCount: 0,
      }
      itemMap.set(key, {
        totalQty: existing.totalQty + item.qty,
        totalRevenue: existing.totalRevenue + item.qty * item.price,
        orderCount: existing.orderCount + 1,
      })
    }
  }

  const topItems: TopItem[] = Array.from(itemMap.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10)

  // ─── Stale items (no sales in >90 days) ───────────────────────────────────
  const lastSaleMap = new Map<string, Date>()

  for (const tx of ebayTxs) {
    if (tx.type !== 'sale' || !tx.date) continue
    const items = (tx.transactions_json ?? []) as TransactionLineItem[]
    const txDate = new Date(tx.date)

    for (const item of items) {
      const key = item.name.trim().toLowerCase()
      const existing = lastSaleMap.get(key)
      if (!existing || txDate > existing) {
        lastSaleMap.set(key, txDate)
      }
    }
  }

  const cutoff90 = new Date()
  cutoff90.setDate(cutoff90.getDate() - 90)
  const now = Date.now()

  const staleItems: StaleItem[] = Array.from(lastSaleMap.entries())
    .filter(([, lastDate]) => lastDate < cutoff90)
    .map(([name, lastDate]) => {
      const totalSold =
        itemMap.get(name)?.totalQty ?? 0
      return {
        name,
        lastSoldDate: lastDate.toISOString(),
        daysSinceLastSale: Math.floor(
          (now - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        ),
        totalSold,
      }
    })
    .sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale)
    .slice(0, 10)

  return {
    data: {
      netProfitLast30Days,
      totalSalesLast30Days,
      totalOrdersLast30Days,
      topItems,
      staleItems,
    },
  }
}
