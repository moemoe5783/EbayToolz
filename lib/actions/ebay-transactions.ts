'use server'

/**
 * Server Actions for eBay Transactions.
 *
 * RLS automatically scopes all queries to the authenticated user —
 * no manual user_id filtering needed in application code.
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { EbayTransaction } from '@/lib/types/database'

// ─── Validation schema ────────────────────────────────────────────────────────

const lineItemSchema = z.object({
  name: z.string().min(1),
  qty: z.number().positive(),
  price: z.number().nonnegative(),
  sku: z.string().optional(),
})

const ebayTransactionSchema = z.object({
  date: z.string().datetime().optional().nullable(),
  order_number: z.string().min(1, 'Order number is required'),
  total: z.coerce.number().optional().nullable(),
  net: z.coerce.number().optional().nullable(),
  type: z.enum(['sale', 'refund']),
  status: z.string().optional().nullable(),
  buyer: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  transactions_json: z.array(lineItemSchema).default([]),
  corresponding_amazon_order: z.string().optional().nullable(),
})

export type EbayTransactionInput = z.infer<typeof ebayTransactionSchema>

export type ActionState = {
  error?: string
  success?: string
  data?: EbayTransaction
}

// ─── Fetch all eBay transactions ──────────────────────────────────────────────

export async function getEbayTransactions(options?: {
  limit?: number
  offset?: number
  type?: 'sale' | 'refund'
  dateFrom?: string
  dateTo?: string
}): Promise<{ data: EbayTransaction[]; count: number; error?: string }> {
  const supabase = await createClient()

  let query = supabase
    .from('ebay_transactions')
    .select('*', { count: 'exact' })
    .order('date', { ascending: false })

  if (options?.type) {
    query = query.eq('type', options.type)
  }
  if (options?.dateFrom) {
    query = query.gte('date', options.dateFrom)
  }
  if (options?.dateTo) {
    query = query.lte('date', options.dateTo)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  if (options?.offset) {
    query = query.range(
      options.offset,
      options.offset + (options.limit ?? 50) - 1
    )
  }

  const { data, error, count } = await query

  if (error) {
    return { data: [], count: 0, error: error.message }
  }

  return { data: data ?? [], count: count ?? 0 }
}

// ─── Fetch single eBay transaction ────────────────────────────────────────────

export async function getEbayTransaction(
  id: string
): Promise<{ data: EbayTransaction | null; error?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ebay_transactions')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data }
}

// ─── Create eBay transaction ──────────────────────────────────────────────────

export async function createEbayTransaction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = {
    date: formData.get('date') as string | null,
    order_number: formData.get('order_number') as string,
    total: formData.get('total'),
    net: formData.get('net'),
    type: formData.get('type') as string,
    status: formData.get('status') as string | null,
    buyer: formData.get('buyer') as string | null,
    shipping_address: formData.get('shipping_address') as string | null,
    transactions_json: JSON.parse(
      (formData.get('transactions_json') as string) || '[]'
    ),
    corresponding_amazon_order: formData.get(
      'corresponding_amazon_order'
    ) as string | null,
  }

  const parsed = ebayTransactionSchema.safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('ebay_transactions')
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: 'An eBay transaction with this order number already exists.' }
    }
    return { error: error.message }
  }

  revalidatePath('/transactions')
  revalidatePath('/clusters')
  revalidatePath('/dashboard')

  return { success: 'eBay transaction created successfully.', data }
}

// ─── Update eBay transaction ──────────────────────────────────────────────────

export async function updateEbayTransaction(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = {
    date: formData.get('date') as string | null,
    order_number: formData.get('order_number') as string,
    total: formData.get('total'),
    net: formData.get('net'),
    type: formData.get('type') as string,
    status: formData.get('status') as string | null,
    buyer: formData.get('buyer') as string | null,
    shipping_address: formData.get('shipping_address') as string | null,
    transactions_json: JSON.parse(
      (formData.get('transactions_json') as string) || '[]'
    ),
    corresponding_amazon_order: formData.get(
      'corresponding_amazon_order'
    ) as string | null,
  }

  const parsed = ebayTransactionSchema.safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ebay_transactions')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/transactions')
  revalidatePath('/clusters')
  revalidatePath('/dashboard')

  return { success: 'eBay transaction updated successfully.', data }
}

// ─── Delete eBay transaction ──────────────────────────────────────────────────

export async function deleteEbayTransaction(id: string): Promise<ActionState> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('ebay_transactions')
    .delete()
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/transactions')
  revalidatePath('/clusters')
  revalidatePath('/dashboard')

  return { success: 'eBay transaction deleted.' }
}

// ─── Get transactions for dashboard stats ────────────────────────────────────

export async function getEbayTransactionsForStats(dayRange = 30): Promise<{
  data: EbayTransaction[]
  error?: string
}> {
  const supabase = await createClient()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - dayRange)

  const { data, error } = await supabase
    .from('ebay_transactions')
    .select('*')
    .gte('date', cutoff.toISOString())
    .order('date', { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data ?? [] }
}
