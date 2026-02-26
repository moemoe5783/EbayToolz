'use server'

/**
 * Server Actions for Business Expenses.
 *
 * RLS automatically scopes all queries to the authenticated user.
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { BusinessExpense, ExpenseCategory } from '@/lib/types/database'

// ─── Validation schema ────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  'amazon_order',
  'software',
  'subscription',
  'supplies',
  'shipping',
  'advertising',
  'other',
] as const

const businessExpenseSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  description: z.string().min(1, 'Description is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  category: z.enum(EXPENSE_CATEGORIES),
  notes: z.string().optional().nullable(),
  amazon_order_number: z.string().optional().nullable(),
})

export type ExpenseActionState = {
  error?: string
  success?: string
  data?: BusinessExpense
}

// ─── Fetch expenses (paginated) ───────────────────────────────────────────────

export async function getBusinessExpenses(options?: {
  limit?: number
  offset?: number
  category?: ExpenseCategory
  dateFrom?: string
  dateTo?: string
}): Promise<{ data: BusinessExpense[]; count: number; error?: string }> {
  const supabase = await createClient()

  let query = supabase
    .from('business_expenses')
    .select('*', { count: 'exact' })
    .order('date', { ascending: false })

  if (options?.category) query = query.eq('category', options.category)
  if (options?.dateFrom) query = query.gte('date', options.dateFrom)
  if (options?.dateTo) query = query.lte('date', options.dateTo)
  if (options?.limit) query = query.limit(options.limit)
  if (options?.offset) {
    query = query.range(
      options.offset,
      options.offset + (options.limit ?? 50) - 1
    )
  }

  const { data, error, count } = await query

  if (error) return { data: [], count: 0, error: error.message }
  return { data: (data as BusinessExpense[]) ?? [], count: count ?? 0 }
}

// ─── Sum of expenses within the last N days (for dashboard) ──────────────────

export async function getExpensesTotalForDays(days: number): Promise<number> {
  const supabase = await createClient()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const { data, error } = await supabase
    .from('business_expenses')
    .select('amount')
    .gte('date', cutoff.toISOString())

  if (error || !data) return 0
  return data.reduce((sum, e) => sum + ((e as { amount: number }).amount ?? 0), 0)
}

// ─── Sum of all expenses (for clusters page) ─────────────────────────────────

export async function getAllExpensesTotal(): Promise<number> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('business_expenses')
    .select('amount')

  if (error || !data) return 0
  return data.reduce((sum, e) => sum + ((e as { amount: number }).amount ?? 0), 0)
}

// ─── Create expense ───────────────────────────────────────────────────────────

export async function createBusinessExpense(
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const rawData = {
    date: formData.get('date') as string,
    description: formData.get('description') as string,
    amount: formData.get('amount'),
    category: formData.get('category') as string,
    notes: (formData.get('notes') as string) || null,
    amazon_order_number:
      (formData.get('amazon_order_number') as string) || null,
  }

  const parsed = businessExpenseSchema.safeParse(rawData)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('business_expenses')
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/transactions')
  revalidatePath('/clusters')
  revalidatePath('/dashboard')

  return { success: 'Expense added successfully.', data: data as BusinessExpense }
}

// ─── Update expense ───────────────────────────────────────────────────────────

export async function updateBusinessExpense(
  id: string,
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const rawData = {
    date: formData.get('date') as string,
    description: formData.get('description') as string,
    amount: formData.get('amount'),
    category: formData.get('category') as string,
    notes: (formData.get('notes') as string) || null,
    amazon_order_number:
      (formData.get('amazon_order_number') as string) || null,
  }

  const parsed = businessExpenseSchema.safeParse(rawData)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('business_expenses')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/transactions')
  revalidatePath('/clusters')
  revalidatePath('/dashboard')

  return { success: 'Expense updated successfully.', data: data as BusinessExpense }
}

// ─── Delete expense ───────────────────────────────────────────────────────────

export async function deleteBusinessExpense(
  id: string
): Promise<ExpenseActionState> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('business_expenses')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/transactions')
  revalidatePath('/clusters')
  revalidatePath('/dashboard')

  return { success: 'Expense deleted.' }
}
