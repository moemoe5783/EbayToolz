'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/lib/types/database'
import { getValidEbayAccessToken, updateLastSynced } from '@/lib/ebay/tokens'
import {
  fetchOrders,
  fetchFinanceTransactions,
  formatShipAddress,
  type EbayOrder,
  type EbayFinanceTransaction,
} from '@/lib/ebay/client'

type SyncResult = { ok: boolean; synced?: number; error?: string; warning?: string }

/**
 * Core sync logic — callable from both the server action and the cron job.
 * Does NOT verify auth; callers must ensure userId is trusted.
 */
export async function syncEbayOrdersForUser(
  userId: string,
  options?: { dateFrom?: string }
): Promise<SyncResult> {
  const accessToken = await getValidEbayAccessToken(userId)
  if (!accessToken) {
    return {
      ok: false,
      error: 'eBay account not connected or session expired.',
    }
  }

  const dateFrom = options?.dateFrom
    ? new Date(options.dateFrom)
    : (() => {
        const d = new Date()
        d.setDate(d.getDate() - 90)
        return d
      })()

  let orders: EbayOrder[] = []
  let finances: EbayFinanceTransaction[] = []
  let financeWarning: string | undefined

  try {
    orders = await fetchOrders(accessToken, dateFrom)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch eBay orders',
    }
  }

  try {
    finances = await fetchFinanceTransactions(accessToken, dateFrom)
  } catch (err) {
    // Finance API is non-fatal — orders sync succeeds but net amounts won't be populated
    financeWarning =
      err instanceof Error
        ? `Net amounts unavailable: ${err.message}`
        : 'Net amounts unavailable: Finance API error'
  }

  // Build per-order net payout from the Finances API.
  // SALE:   seller receives (amount - fees)       → positive credit
  // REFUND: seller pays back (amount - fee_credit) → negative debit
  // Both can exist for the same orderId (e.g. partial return after a sale).
  const netMap = new Map<string, number>()
  const saleOrderIds = new Set<string>()   // orderId had at least one SALE txn
  const refundOrderIds = new Set<string>() // orderId had at least one REFUND txn

  for (const t of finances) {
    if (!t.orderId || !t.amount?.value) continue
    // The Finance API `amount` is already the net payout to the seller —
    // eBay pre-deducts its fees before setting this value. Do NOT subtract
    // totalFeeAmount again; that would double-count the fees.
    const amount = parseFloat(t.amount.value)
    const prev = netMap.get(t.orderId) ?? 0

    if (t.transactionType === 'SALE') {
      saleOrderIds.add(t.orderId)
      netMap.set(t.orderId, prev + amount)
    } else if (t.transactionType === 'REFUND') {
      refundOrderIds.add(t.orderId)
      netMap.set(t.orderId, prev - amount)
    }
  }

  type EbayInsert = Database['public']['Tables']['ebay_transactions']['Insert']

  const rows: EbayInsert[] = orders.map((o) => {
    const isCanceled = o.cancelStatus?.cancelState === 'CANCEL_COMPLETE'
    const hasRefund = refundOrderIds.has(o.orderId)
    const hasSale  = saleOrderIds.has(o.orderId)
    // Return with no SALE in the sync window → original sale was in a prior
    // period; only the return/refund transaction appeared this window.
    const isReturnOnly = hasRefund && !hasSale

    const total = parseFloat(o.pricingSummary?.total?.value ?? '0') || 0
    const net = netMap.get(o.orderId) ?? null

    // Derive a human-readable status using cancel + finance signals.
    // orderFulfillmentStatus is only about shipping ("FULFILLED", "IN_PROGRESS",
    // "NOT_STARTED") — it never reflects returns or refunds.
    let status: string
    if (isCanceled) {
      status = 'Cancelled'
    } else if (isReturnOnly) {
      status = 'Returned'
    } else if (hasRefund && hasSale) {
      // Both a SALE and REFUND exist within the sync window.
      // Net ≤ 0 means the full amount was refunded (full return).
      // Net > 0 means a partial refund was issued.
      status = (net ?? 0) <= 0 ? 'Returned' : 'Partially Refunded'
    } else {
      // Pure sale — translate the fulfillment shipping status.
      const fs = o.orderFulfillmentStatus ?? ''
      if (fs === 'FULFILLED') status = 'Fulfilled'
      else if (fs === 'IN_PROGRESS') status = 'In Progress'
      else if (fs === 'NOT_STARTED') status = 'Pending'
      else status = fs.replace(/_/g, ' ')
    }

    // type drives financial calculations: mark anything that resulted in a
    // net payout loss as a 'refund'.
    const type: 'sale' | 'refund' =
      isCanceled || isReturnOnly || (hasRefund && hasSale && (net ?? 0) <= 0)
        ? 'refund'
        : 'sale'

    const buyerName =
      o.buyer?.buyerRegistrationAddress?.fullName ?? o.buyer?.username ?? null

    const lineItems = (o.lineItems ?? []).map((li) => ({
      name: li.title ?? '',
      qty: li.quantity ?? 1,
      price: parseFloat(li.lineItemCost?.value ?? '0') || 0,
      ...(li.sku ? { sku: li.sku } : {}),
    }))

    return {
      user_id: userId,
      order_number: o.orderId,
      date: o.creationDate,
      total,
      net,
      type,
      status,
      buyer: buyerName,
      shipping_address: formatShipAddress(o) || null,
      transactions_json: lineItems,
      // corresponding_amazon_order is intentionally omitted — upsert must
      // never overwrite an existing manual or auto-generated link.
    }
  })

  if (rows.length > 0) {
    const db = getServiceClient()
    const { error } = await db
      .from('ebay_transactions')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(rows as any, { onConflict: 'user_id,order_number', ignoreDuplicates: false })

    if (error) return { ok: false, error: error.message }
  }

  await updateLastSynced(userId)

  return { ok: true, synced: rows.length, warning: financeWarning }
}

/**
 * Server Action — called from the settings UI.
 * Verifies the session then delegates to syncEbayOrdersForUser.
 */
export async function syncEbayOrders(options?: { dateFrom?: string }): Promise<SyncResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Not authenticated' }

  const result = await syncEbayOrdersForUser(user.id, options)

  if (result.ok) {
    revalidatePath('/transactions')
    revalidatePath('/clusters')
    revalidatePath('/dashboard')
  }

  return result
}
