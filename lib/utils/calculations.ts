/**
 * Cluster calculation utilities.
 *
 * An "order cluster" links one eBay sale/refund to the corresponding
 * Amazon purchase used to fulfill it (dropshipping model).
 *
 * Adjustment logic (configurable per user):
 * - 'complete' Amazon orders → add 5% to the cost (e.g. tax/fee buffer)
 * - 'refund' / 'cancel' Amazon orders → subtract 5% from the cost
 *
 * Raw transaction views always show un-adjusted values.
 * Only cluster net calculations apply the adjustment.
 */
import type {
  EbayTransaction,
  AmazonTransaction,
  OrderCluster,
} from '@/lib/types/database'

const ADJUSTMENT_RATE = 0.05 // 5%

/**
 * Compute the adjusted Amazon cost for a single Amazon transaction.
 */
export function computeAdjustedAmazonCost(
  tx: AmazonTransaction,
  applyAdjustment: boolean
): number {
  const rawCost = tx.cost ?? 0

  if (!applyAdjustment) return rawCost

  if (tx.type === 'complete') {
    return rawCost * (1 + ADJUSTMENT_RATE) // +5%
  }

  if (tx.type === 'refund' || tx.type === 'cancel') {
    return rawCost * (1 - ADJUSTMENT_RATE) // -5%
  }

  return rawCost
}

/**
 * Build order clusters from parallel arrays of eBay and Amazon transactions.
 *
 * Matching strategy:
 * 1. ebay.corresponding_amazon_order ↔ amazon.order_number
 * 2. amazon.corresponding_ebay_order ↔ ebay.order_number
 * Unmatched eBay orders still appear as clusters (with no Amazon side).
 */
export function buildClusters(
  ebayTxs: EbayTransaction[],
  amazonTxs: AmazonTransaction[],
  applyAdjustment: boolean
): OrderCluster[] {
  // Index Amazon orders for O(1) lookup
  const amazonByOrderNumber = new Map<string, AmazonTransaction[]>()
  for (const tx of amazonTxs) {
    const existing = amazonByOrderNumber.get(tx.order_number) ?? []
    existing.push(tx)
    amazonByOrderNumber.set(tx.order_number, existing)
  }

  // Index Amazon orders by the eBay order they reference
  const amazonByEbayOrderNumber = new Map<string, AmazonTransaction[]>()
  for (const tx of amazonTxs) {
    if (tx.corresponding_ebay_order) {
      const existing =
        amazonByEbayOrderNumber.get(tx.corresponding_ebay_order) ?? []
      existing.push(tx)
      amazonByEbayOrderNumber.set(tx.corresponding_ebay_order, existing)
    }
  }

  const clusters: OrderCluster[] = []

  for (const ebay of ebayTxs) {
    // Find matching Amazon transactions (try both reference directions)
    let matched: AmazonTransaction[] = []

    if (ebay.corresponding_amazon_order) {
      matched =
        amazonByOrderNumber.get(ebay.corresponding_amazon_order) ??
        matched
    }

    if (matched.length === 0) {
      matched = amazonByEbayOrderNumber.get(ebay.order_number) ?? []
    }

    const ebayNet = ebay.net ?? 0
    const amazonCostRaw = matched.reduce((sum, tx) => sum + (tx.cost ?? 0), 0)
    const amazonCostAdjusted = matched.reduce(
      (sum, tx) => sum + computeAdjustedAmazonCost(tx, applyAdjustment),
      0
    )

    clusters.push({
      ebay,
      amazon: matched,
      ebayNet,
      amazonCostRaw,
      amazonCostAdjusted,
      netProfit: ebayNet - amazonCostAdjusted,
      adjustmentApplied: applyAdjustment,
    })
  }

  return clusters
}

/**
 * Sum the net profit from an array of clusters.
 */
export function totalNetProfit(clusters: OrderCluster[]): number {
  return clusters.reduce((sum, c) => sum + c.netProfit, 0)
}

/**
 * Filter clusters to those whose eBay transaction date falls within the
 * last `days` days.
 */
export function filterClustersByDays(
  clusters: OrderCluster[],
  days: number
): OrderCluster[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  return clusters.filter((c) => {
    if (!c.ebay.date) return false
    return new Date(c.ebay.date) >= cutoff
  })
}

/**
 * Format a number as currency (USD).
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

/**
 * Safely parse a numeric value (handles null/undefined).
 */
export function safeNumber(value: number | null | undefined): number {
  return value ?? 0
}
