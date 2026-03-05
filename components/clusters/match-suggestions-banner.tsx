'use client'

/**
 * MatchSuggestionsBanner
 *
 * Shows pending auto-match suggestions between unlinked Amazon and eBay orders.
 * Each card lets the user confirm the link or dismiss the suggestion.
 */
import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { Link2, X, Check, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/calculations'
import {
  confirmMatchSuggestion,
  dismissMatchSuggestion,
} from '@/lib/actions/match-suggestions'
import type { SuggestionWithDetails } from '@/lib/actions/match-suggestions'

interface Props {
  initialSuggestions: SuggestionWithDetails[]
}

export default function MatchSuggestionsBanner({ initialSuggestions }: Props) {
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [expanded, setExpanded] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [actioningId, setActioningId] = useState<string | null>(null)

  if (suggestions.length === 0) return null

  function handleConfirm(s: SuggestionWithDetails) {
    setActioningId(s.suggestion.id)
    startTransition(async () => {
      const res = await confirmMatchSuggestion(
        s.suggestion.id,
        s.suggestion.amazon_tx_id,
        s.suggestion.ebay_tx_id,
        s.amazon.order_number,
        s.ebay.order_number
      )
      if (!res.error) {
        setSuggestions((prev) => prev.filter((x) => x.suggestion.id !== s.suggestion.id))
      }
      setActioningId(null)
    })
  }

  function handleDismiss(s: SuggestionWithDetails) {
    setActioningId(s.suggestion.id)
    startTransition(async () => {
      const res = await dismissMatchSuggestion(s.suggestion.id)
      if (!res.error) {
        setSuggestions((prev) => prev.filter((x) => x.suggestion.id !== s.suggestion.id))
      }
      setActioningId(null)
    })
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-amber-100 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <AlertCircle size={16} className="text-amber-600 shrink-0" />
          <span className="text-sm font-semibold text-amber-800">
            {suggestions.length} possible Amazon ↔ eBay match
            {suggestions.length > 1 ? 'es' : ''} — please review
          </span>
        </div>
        {expanded ? (
          <ChevronDown size={16} className="text-amber-600" />
        ) : (
          <ChevronRight size={16} className="text-amber-600" />
        )}
      </button>

      {expanded && (
        <div className="divide-y divide-amber-200">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.suggestion.id}
              suggestion={s}
              actioning={actioningId === s.suggestion.id && isPending}
              onConfirm={() => handleConfirm(s)}
              onDismiss={() => handleDismiss(s)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SuggestionCard({
  suggestion: s,
  actioning,
  onConfirm,
  onDismiss,
}: {
  suggestion: SuggestionWithDetails
  actioning: boolean
  onConfirm: () => void
  onDismiss: () => void
}) {
  const { amazon, ebay, suggestion } = s
  const [detailsOpen, setDetailsOpen] = useState(false)

  const amazonItems = (amazon.items_json ?? []).map((i) => i.name).join(', ')
  const ebayItems = (ebay.transactions_json ?? []).map((i) => i.name).join(', ')

  return (
    <div className="px-5 py-4">
      {/* Top row: order numbers + actions */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="font-mono font-medium text-gray-800">{ebay.order_number}</span>
          <span className="text-gray-400">(eBay)</span>
          <Link2 size={14} className="text-amber-500 shrink-0" />
          <span className="font-mono font-medium text-gray-800">{amazon.order_number}</span>
          <span className="text-gray-400">(Amazon)</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              suggestion.confidence === 'high'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            {suggestion.confidence === 'high' ? 'Strong match' : 'Possible match'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onDismiss}
            disabled={actioning}
            title="Not a match — dismiss"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <X size={13} />
            Not a match
          </button>
          <button
            onClick={onConfirm}
            disabled={actioning}
            title="Yes, link these orders"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors"
          >
            <Check size={13} />
            Yes, link them
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
        {ebay.buyer && (
          <span>
            Buyer: <span className="text-gray-700 font-medium">{ebay.buyer}</span>
          </span>
        )}
        {ebay.date && (
          <span>
            eBay date:{' '}
            <span className="text-gray-700">{format(new Date(ebay.date), 'MMM d, yyyy')}</span>
          </span>
        )}
        {amazon.date && (
          <span>
            Amazon date:{' '}
            <span className="text-gray-700">{format(new Date(amazon.date), 'MMM d, yyyy')}</span>
          </span>
        )}
        {amazon.cost != null && (
          <span>
            Amazon cost:{' '}
            <span className="text-gray-700 font-medium">{formatCurrency(amazon.cost)}</span>
          </span>
        )}
        {ebay.net != null && (
          <span>
            eBay net:{' '}
            <span className="text-gray-700 font-medium">{formatCurrency(ebay.net)}</span>
          </span>
        )}
      </div>

      {/* Expandable details */}
      <button
        onClick={() => setDetailsOpen((v) => !v)}
        className="mt-2 text-xs text-amber-700 hover:text-amber-800 flex items-center gap-1"
      >
        {detailsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {detailsOpen ? 'Hide' : 'Show'} details
      </button>

      {detailsOpen && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-white rounded-lg border border-amber-100 p-3 space-y-1">
            <p className="font-semibold text-gray-600 uppercase tracking-wide text-[10px]">eBay</p>
            {ebay.shipping_address && (
              <p className="text-gray-600 whitespace-pre-line">{ebay.shipping_address}</p>
            )}
            {ebayItems && (
              <p className="text-gray-500">Items: <span className="text-gray-700">{ebayItems}</span></p>
            )}
          </div>
          <div className="bg-white rounded-lg border border-amber-100 p-3 space-y-1">
            <p className="font-semibold text-gray-600 uppercase tracking-wide text-[10px]">Amazon</p>
            {amazon.shipping_address && (
              <p className="text-gray-600 whitespace-pre-line">{amazon.shipping_address}</p>
            )}
            {amazonItems && (
              <p className="text-gray-500">Items: <span className="text-gray-700">{amazonItems}</span></p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
