/**
 * Cluster calculation utilities.
 *
 * An "order cluster" links one eBay sale/refund to the corresponding
 * Amazon purchase used to fulfill it (dropshipping model).
 *
 * Adjustment logic (Amazon Visa 5% cashback, configurable per user):
 * - Only applies to orders where `used_amazon_visa` is true AND the user
 *   has `apply_amazon_5pct_adjustment` enabled in Settings.
 * - 'complete' Amazon orders → cost × 0.95 (5% cashback reduces net cost)
 * - 'refund' Amazon orders   → refund amount × 0.95 subtracted from total
 * - 'cancel' Amazon orders   → contribute $0 to cost
 *
 * Raw transaction views always show un-adjusted values.
 * Only cluster net calculations apply the adjustment.
 */
import type {
  EbayTransaction,
  AmazonTransaction,
  OrderCluster,
} from '@/lib/types/database'

const CASHBACK_RATE = 0.05 // 5% Amazon Visa cashback

/**
 * Compute the adjusted Amazon cost contribution for a single transaction.
 *
 * Returns a signed value:
 *   positive → adds to cluster cost (complete orders)
 *   negative → reduces cluster cost (refund orders credit money back)
 *   zero     → canceled orders have no cost impact
 *
 * The 5% adjustment is only applied when BOTH conditions are true:
 *   1. The user has the setting enabled (`applyAdjustment`)
 *   2. The specific order was placed with the Amazon Visa (`used_amazon_visa`)
 */
export function computeAdjustedAmazonCost(
  tx: AmazonTransaction,
  applyAdjustment: boolean
): number {
  const rawCost = tx.cost ?? 0
  const visaApplies = applyAdjustment && (tx.used_amazon_visa ?? false)

  if (tx.type === 'cancel') return 0

  if (tx.type === 'complete') {
    // Visa cashback means the effective cost is 5% less
    return visaApplies ? rawCost * (1 - CASHBACK_RATE) : rawCost
  }

  if (tx.type === 'refund') {
    // The refund amount (stored as positive in `cost`) credits back against
    // the cluster cost.  If the original order earned Visa cashback, the
    // cashback is reversed on return so we apply the same rate to the refund.
    const refundValue = visaApplies ? rawCost * (1 - CASHBACK_RATE) : rawCost
    return -refundValue // negative = reduces total amazon cost
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

    // Raw cost: complete orders add, refunds subtract, cancels = 0
    const amazonCostRaw = matched.reduce((sum, tx) => {
      if (tx.type === 'cancel') return sum
      if (tx.type === 'refund') return sum - (tx.cost ?? 0)
      return sum + (tx.cost ?? 0)
    }, 0)

    // Adjusted cost: applies Visa cashback only for orders that used the card
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
