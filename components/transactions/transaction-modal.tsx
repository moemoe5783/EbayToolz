'use client'

/**
 * Modal for creating or editing eBay/Amazon transactions.
 * Switches between eBay/Amazon forms via a tab inside the modal.
 */
import { useState, useEffect, useActionState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createEbayTransaction,
  updateEbayTransaction,
} from '@/lib/actions/ebay-transactions'
import {
  createAmazonTransaction,
  updateAmazonTransaction,
} from '@/lib/actions/amazon-transactions'
import type { EbayTransaction, AmazonTransaction } from '@/lib/types/database'

type TabType = 'ebay' | 'amazon'

interface TransactionModalProps {
  defaultTab: TabType
  editTarget: EbayTransaction | AmazonTransaction | null
  onClose: () => void
}

function isEbayTx(tx: EbayTransaction | AmazonTransaction): tx is EbayTransaction {
  return 'buyer' in tx
}

export default function TransactionModal({
  defaultTab,
  editTarget,
  onClose,
}: TransactionModalProps) {
  const [tab, setTab] = useState<TabType>(
    editTarget
      ? isEbayTx(editTarget)
        ? 'ebay'
        : 'amazon'
      : defaultTab
  )

  // Determine which action to bind based on tab + edit mode
  const ebayAction = editTarget && isEbayTx(editTarget)
    ? updateEbayTransaction.bind(null, editTarget.id)
    : createEbayTransaction

  const amazonAction = editTarget && !isEbayTx(editTarget)
    ? updateAmazonTransaction.bind(null, editTarget.id)
    : createAmazonTransaction

  const [ebayState, ebayFormAction, ebayPending] = useActionState(ebayAction, {})
  const [amazonState, amazonFormAction, amazonPending] = useActionState(amazonAction, {})

  const isPending = ebayPending || amazonPending
  const state = tab === 'ebay' ? ebayState : amazonState

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

  // Format date for input[type=datetime-local]
  function toDateTimeLocal(dateStr: string | null | undefined) {
    if (!dateStr) return ''
    return new Date(dateStr).toISOString().slice(0, 16)
  }

  const ebayDefaults = editTarget && isEbayTx(editTarget) ? editTarget : null
  const amazonDefaults =
    editTarget && !isEbayTx(editTarget) ? editTarget : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {editTarget ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab switcher (only when creating new) */}
        {!editTarget && (
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mx-6 mt-4">
            <button
              type="button"
              onClick={() => setTab('ebay')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                tab === 'ebay'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              eBay
            </button>
            <button
              type="button"
              onClick={() => setTab('amazon')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                tab === 'amazon'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Amazon
            </button>
          </div>
        )}

        <div className="px-6 py-4">
          {/* Error from state */}
          {state.error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {state.error}
            </div>
          )}

          {/* eBay Form */}
          {tab === 'ebay' && (
            <form action={ebayFormAction} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Order Number *" name="order_number" required defaultValue={ebayDefaults?.order_number} />
                <Field label="Date" name="date" type="datetime-local" defaultValue={toDateTimeLocal(ebayDefaults?.date)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="Type *"
                  name="type"
                  options={['sale', 'refund']}
                  required
                  defaultValue={ebayDefaults?.type ?? 'sale'}
                />
                <Field label="Status" name="status" defaultValue={ebayDefaults?.status ?? ''} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Total ($)" name="total" type="number" step="0.01" defaultValue={ebayDefaults?.total?.toString()} />
                <Field label="Net ($)" name="net" type="number" step="0.01" defaultValue={ebayDefaults?.net?.toString()} />
              </div>
              <Field label="Buyer" name="buyer" defaultValue={ebayDefaults?.buyer ?? ''} />
              <Field label="Shipping Address" name="shipping_address" defaultValue={ebayDefaults?.shipping_address ?? ''} />
              <Field label="Corresponding Amazon Order #" name="corresponding_amazon_order" defaultValue={ebayDefaults?.corresponding_amazon_order ?? ''} />
              {/* Line items JSON — shown as textarea for power users */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Line Items (JSON)
                </label>
                <textarea
                  name="transactions_json"
                  rows={3}
                  defaultValue={JSON.stringify(ebayDefaults?.transactions_json ?? [], null, 2)}
                  placeholder='[{"name": "Widget", "qty": 2, "price": 19.99}]'
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              <SubmitButton pending={isPending} label={editTarget ? 'Save Changes' : 'Create eBay Transaction'} />
            </form>
          )}

          {/* Amazon Form */}
          {tab === 'amazon' && (
            <form action={amazonFormAction} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Order Number *" name="order_number" required defaultValue={amazonDefaults?.order_number} />
                <Field label="Date" name="date" type="datetime-local" defaultValue={toDateTimeLocal(amazonDefaults?.date)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="Type *"
                  name="type"
                  options={['complete', 'refund', 'cancel']}
                  required
                  defaultValue={amazonDefaults?.type ?? 'complete'}
                />
                <Field label="Status" name="status" defaultValue={amazonDefaults?.status ?? ''} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Total ($)" name="total" type="number" step="0.01" defaultValue={amazonDefaults?.total?.toString()} />
                <Field label="Cost ($)" name="cost" type="number" step="0.01" defaultValue={amazonDefaults?.cost?.toString()} />
              </div>
              <Field label="Shipping Address" name="shipping_address" defaultValue={amazonDefaults?.shipping_address ?? ''} />
              <Field label="Tracking URL" name="tracking_url" type="url" defaultValue={amazonDefaults?.tracking_url ?? ''} />
              <Field label="Corresponding eBay Order #" name="corresponding_ebay_order" defaultValue={amazonDefaults?.corresponding_ebay_order ?? ''} />

              <SubmitButton pending={isPending} label={editTarget ? 'Save Changes' : 'Create Amazon Transaction'} />
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Reusable field components ────────────────────────────────────────────────

interface FieldProps {
  label: string
  name: string
  type?: string
  step?: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
}

function Field({ label, name, type = 'text', step, required, defaultValue, placeholder }: FieldProps) {
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

interface SelectFieldProps {
  label: string
  name: string
  options: string[]
  required?: boolean
  defaultValue?: string
}

function SelectField({ label, name, options, required, defaultValue }: SelectFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt.charAt(0).toUpperCase() + opt.slice(1)}
          </option>
        ))}
      </select>
    </div>
  )
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="pt-2">
      <button
        type="submit"
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        {label}
      </button>
    </div>
  )
}
