'use server'

/**
 * syncEbayOrders — Server Action
 *
 * Fetches the last 90 days of eBay orders via the Fulfillment API and
 * payout amounts via the Finances API, then upserts them into
 * ebay_transactions.  Uses the service_role client for the upsert so
 * it can bypass per-user RLS (we verify user identity via Supabase Auth).
 */

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

export async function syncEbayOrders(): Promise<{
  ok: boolean
  synced?: number
  error?: string
}> {
  // Verify the caller is authenticated
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Not authenticated' }

  // Get a valid (possibly auto-refreshed) eBay access token
  const accessToken = await getValidEbayAccessToken(user.id)
  if (!accessToken) {
    return {
      ok: false,
      error: 'eBay account not connected or session expired. Please reconnect.',
    }
  }

  // Fetch the last 90 days
  const dateFrom = new Date()
  dateFrom.setDate(dateFrom.getDate() - 90)

  let orders: EbayOrder[] = []
  let finances: EbayFinanceTransaction[] = []

  try {
    ;[orders, finances] = await Promise.all([
      fetchOrders(accessToken, dateFrom),
      fetchFinanceTransactions(accessToken, dateFrom),
    ])
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch eBay data',
    }
  }

  // Build orderId → net payout map from the Finances API (SALE transactions only)
  const netMap = new Map<string, number>()
  for (const t of finances) {
    if (t.orderId && t.transactionType === 'SALE' && t.amount?.value) {
      netMap.set(t.orderId, parseFloat(t.amount.value))
    }
  }

  type EbayInsert = Database['public']['Tables']['ebay_transactions']['Insert']

  // Map eBay API orders to ebay_transactions rows
  const rows: EbayInsert[] = orders.map((o) => {
    const isCanceled = o.cancelStatus?.cancelState === 'CANCEL_COMPLETE'
    const type: 'sale' | 'refund' = isCanceled ? 'refund' : 'sale'

    const total = parseFloat(o.pricingSummary?.total?.value ?? '0') || 0
    const net = netMap.get(o.orderId) ?? null

    const buyerName =
      o.buyer?.buyerRegistrationAddress?.fullName ?? o.buyer?.username ?? null

    const lineItems = (o.lineItems ?? []).map((li) => ({
      name: li.title ?? '',
      qty: li.quantity ?? 1,
      price: parseFloat(li.lineItemCost?.value ?? '0') || 0,
      ...(li.sku ? { sku: li.sku } : {}),
    }))

    const status = isCanceled
      ? 'Cancelled'
      : (o.orderFulfillmentStatus?.replace(/_/g, ' ') ?? '')

    return {
      user_id: user.id,
      order_number: o.orderId,
      date: o.creationDate,
      total,
      net,
      type,
      status,
      buyer: buyerName,
      shipping_address: formatShipAddress(o) || null,
      transactions_json: lineItems,
      corresponding_amazon_order: null,
    }
  })

  if (rows.length > 0) {
    // Upsert into ebay_transactions — update existing rows on conflict
    const db = getServiceClient()
    const { error } = await db
      .from('ebay_transactions')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(rows as any, { onConflict: 'user_id,order_number', ignoreDuplicates: false })

    if (error) {
      return { ok: false, error: error.message }
    }
  }

  await updateLastSynced(user.id)

  revalidatePath('/transactions')
  revalidatePath('/clusters')
  revalidatePath('/dashboard')

  return { ok: true, synced: rows.length }
}
