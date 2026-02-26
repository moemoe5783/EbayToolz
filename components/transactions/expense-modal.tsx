'use client'

/**
 * Modal for creating or editing a business expense.
 * Accepts an optional prefill for creating from an Amazon order.
 */
import { useEffect, useActionState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createBusinessExpense,
  updateBusinessExpense,
} from '@/lib/actions/business-expenses'
import type { BusinessExpense, ExpenseCategory } from '@/lib/types/database'

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: 'amazon_order',  label: 'Amazon Order' },
  { value: 'software',     label: 'Software' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'supplies',     label: 'Supplies' },
  { value: 'shipping',     label: 'Shipping' },
  { value: 'advertising',  label: 'Advertising' },
  { value: 'other',        label: 'Other' },
]

export interface ExpensePrefill {
  date?: string | null
  description?: string
  amount?: number
  category?: ExpenseCategory
  amazon_order_number?: string
}

interface ExpenseModalProps {
  editTarget: BusinessExpense | null
  prefill?: ExpensePrefill | null
  onClose: () => void
}

export default function ExpenseModal({
  editTarget,
  prefill,
  onClose,
}: ExpenseModalProps) {
  const action = editTarget
    ? updateBusinessExpense.bind(null, editTarget.id)
    : createBusinessExpense

  const [state, formAction, isPending] = useActionState(action, {})

  useEffect(() => {
    if (state.success) {
      toast.success(state.success)
      onClose()
    }
  }, [state.success, onClose])

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  function toDateInput(dateStr: string | null | undefined): string {
    if (!dateStr) return new Date().toISOString().slice(0, 10)
    try {
      return new Date(dateStr).toISOString().slice(0, 10)
    } catch {
      return new Date().toISOString().slice(0, 10)
    }
  }

  const defaultDate = toDateInput(editTarget?.date ?? prefill?.date)
  const defaultDescription = editTarget?.description ?? prefill?.description ?? ''
  const defaultAmount =
    editTarget != null
      ? editTarget.amount.toString()
      : prefill?.amount != null
      ? prefill.amount.toString()
      : ''
  const defaultCategory: ExpenseCategory =
    editTarget?.category ?? prefill?.category ?? 'other'
  const defaultNotes = editTarget?.notes ?? ''
  const defaultAmazonOrderNumber =
    editTarget?.amazon_order_number ?? prefill?.amazon_order_number ?? ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {editTarget ? 'Edit Expense' : 'Add Business Expense'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4">
          {state.error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {state.error}
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Date *"
                name="date"
                type="date"
                required
                defaultValue={defaultDate}
              />
              <Field
                label="Amount ($) *"
                name="amount"
                type="number"
                step="0.01"
                required
                defaultValue={defaultAmount}
                placeholder="0.00"
              />
            </div>

            <Field
              label="Description *"
              name="description"
              required
              defaultValue={defaultDescription}
              placeholder="e.g. Packaging supplies, Shipping labels..."
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
              <select
                name="category"
                required
                defaultValue={defaultCategory}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                name="notes"
                rows={2}
                defaultValue={defaultNotes}
                placeholder="Optional notes..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <Field
              label="Amazon Order # (optional)"
              name="amazon_order_number"
              defaultValue={defaultAmazonOrderNumber}
              placeholder="Link to Amazon order if applicable"
            />

            <div className="pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isPending && <Loader2 size={16} className="animate-spin" />}
                {editTarget ? 'Save Changes' : 'Add Expense'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── Reusable field ────────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  name: string
  type?: string
  step?: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
}

function Field({
  label,
  name,
  type = 'text',
  step,
  required,
  defaultValue,
  placeholder,
}: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors"
      />
    </div>
  )
}
