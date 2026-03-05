'use server'

/**
 * Server Actions for Amazon Transactions.
 *
 * RLS automatically scopes all queries to the authenticated user.
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AmazonTransaction } from '@/lib/types/database'

// ─── Validation schema ────────────────────────────────────────────────────────

const amazonTransactionSchema = z.object({
  date: z.string().datetime().optional().nullable(),
  order_number: z.string().min(1, 'Order number is required'),
  total: z.coerce.number().optional().nullable(),
  cost: z.coerce.number().optional().nullable(),
  type: z.enum(['complete', 'refund', 'cancel']),
  status: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  tracking_url: z.string().url().optional().nullable().or(z.literal('')),
  used_amazon_visa: z.boolean().optional().default(false),
  items_json: z.array(z.object({ name: z.string(), qty: z.number() })).optional().default([]),
  corresponding_ebay_order: z.string().optional().nullable(),
})

export type AmazonTransactionInput = z.infer<typeof amazonTransactionSchema>

export type ActionState = {
  error?: string
  success?: string
  data?: AmazonTransaction
}

// ─── Fetch all Amazon transactions ───────────────────────────────────────────

export async function getAmazonTransactions(options?: {
  limit?: number
  offset?: number
  type?: 'complete' | 'refund' | 'cancel'
  dateFrom?: string
  dateTo?: string
}): Promise<{ data: AmazonTransaction[]; count: number; error?: string }> {
  const supabase = await createClient()

  let query = supabase
    .from('amazon_transactions')
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

// ─── Fetch single Amazon transaction ─────────────────────────────────────────

export async function getAmazonTransaction(
  id: string
): Promise<{ data: AmazonTransaction | null; error?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('amazon_transactions')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data }
}

// ─── Create Amazon transaction ────────────────────────────────────────────────

export async function createAmazonTransaction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = {
    date: formData.get('date') as string | null,
    order_number: formData.get('order_number') as string,
    total: formData.get('total'),
    cost: formData.get('cost'),
    type: formData.get('type') as string,
    status: formData.get('status') as string | null,
    shipping_address: formData.get('shipping_address') as string | null,
    tracking_url: (formData.get('tracking_url') as string | null) || null,
    used_amazon_visa: formData.get('used_amazon_visa') === 'true',
    items_json: JSON.parse((formData.get('items_json') as string) || '[]'),
    corresponding_ebay_order: formData.get(
      'corresponding_ebay_order'
    ) as string | null,
  }

  const parsed = amazonTransactionSchema.safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  // Normalize empty tracking_url to null
  const insertData = {
    ...parsed.data,
    user_id: user.id,
    tracking_url: parsed.data.tracking_url || null,
  }

  const { data, error } = await supabase
    .from('amazon_transactions')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        error: 'An Amazon transaction with this order number already exists.',
      }
    }
    return { error: error.message }
  }

  revalidatePath('/transactions')
  revalidatePath('/clusters')
  revalidatePath('/dashboard')

  return { success: 'Amazon transaction created successfully.', data }
}

// ─── Update Amazon transaction ────────────────────────────────────────────────

export async function updateAmazonTransaction(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = {
    date: formData.get('date') as string | null,
    order_number: formData.get('order_number') as string,
    total: formData.get('total'),
    cost: formData.get('cost'),
    type: formData.get('type') as string,
    status: formData.get('status') as string | null,
    shipping_address: formData.get('shipping_address') as string | null,
    tracking_url: (formData.get('tracking_url') as string | null) || null,
    used_amazon_visa: formData.get('used_amazon_visa') === 'true',
    items_json: JSON.parse((formData.get('items_json') as string) || '[]'),
    corresponding_ebay_order: formData.get(
      'corresponding_ebay_order'
    ) as string | null,
  }

  const parsed = amazonTransactionSchema.safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('amazon_transactions')
    .update({ ...parsed.data, tracking_url: parsed.data.tracking_url || null })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/transactions')
  revalidatePath('/clusters')
  revalidatePath('/dashboard')

  return { success: 'Amazon transaction updated successfully.', data }
}

// ─── Delete Amazon transaction ────────────────────────────────────────────────

export async function deleteAmazonTransaction(
  id: string
): Promise<ActionState> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('amazon_transactions')
    .delete()
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/transactions')
  revalidatePath('/clusters')
  revalidatePath('/dashboard')

  return { success: 'Amazon transaction deleted.' }
}

// ─── Get Amazon transactions for clusters ────────────────────────────────────

export async function getAllAmazonTransactions(): Promise<{
  data: AmazonTransaction[]
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('amazon_transactions')
    .select('*')
    .order('date', { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data ?? [] }
}
