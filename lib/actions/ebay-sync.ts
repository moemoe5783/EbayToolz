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

type SyncResult = { ok: boolean; synced?: number; error?: string }

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

  // net = gross sale amount minus eBay's total fees
  const netMap = new Map<string, number>()
  for (const t of finances) {
    if (t.orderId && t.transactionType === 'SALE' && t.amount?.value) {
      const gross = parseFloat(t.amount.value)
      const fees = parseFloat(t.totalFeeAmount?.value ?? '0') || 0
      netMap.set(t.orderId, gross - fees)
    }
  }

  type EbayInsert = Database['public']['Tables']['ebay_transactions']['Insert']

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
      corresponding_amazon_order: null,
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

  return { ok: true, synced: rows.length }
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
