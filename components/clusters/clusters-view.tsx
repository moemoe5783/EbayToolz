'use client'

/**
 * Order Clusters view — shows eBay orders paired with their Amazon fulfillment.
 * Displays net profit per cluster, with optional 5% adjustment details.
 */
import { useState } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/calculations'
import type { OrderCluster } from '@/lib/types/database'
import MatchSuggestionsBanner from '@/components/clusters/match-suggestions-banner'
import type { SuggestionWithDetails } from '@/lib/actions/match-suggestions'

interface ClustersViewProps {
  clusters: OrderCluster[]
  applyAdjustment: boolean
  totalExpenses: number
  suggestions: SuggestionWithDetails[]
}

export default function ClustersView({
  clusters,
  applyAdjustment,
  totalExpenses,
  suggestions,
}: ClustersViewProps) {
  const [showCalcDetails, setShowCalcDetails] = useState(false)

  const clusterProfit = clusters.reduce((sum, c) => sum + c.netProfit, 0)
  const totalProfit = clusterProfit - totalExpenses
  const totalEbayNet = clusters.reduce((sum, c) => sum + c.ebayNet, 0)
  const totalAmazonCost = clusters.reduce(
    (sum, c) => sum + c.amazonCostAdjusted,
    0
  )

  if (clusters.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <p className="text-gray-500 font-medium">No clusters to display</p>
        <p className="text-gray-400 text-sm mt-1">
          Add eBay transactions and link them to Amazon orders via the
          &quot;corresponding_amazon_order&quot; field.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                Total eBay Net
              </p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">
                {formatCurrency(totalEbayNet)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                Total Amazon Cost{' '}
                {applyAdjustment && (
                  <span className="text-amber-600">(Visa 5% applied)</span>
                )}
              </p>
              <p className="text-xl font-bold text-red-600 mt-0.5">
                −{formatCurrency(totalAmazonCost)}
              </p>
            </div>
            {totalExpenses > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                  Business Expenses
                </p>
                <p className="text-xl font-bold text-red-600 mt-0.5">
                  −{formatCurrency(totalExpenses)}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                Net Profit
              </p>
              <p
                className={`text-xl font-bold mt-0.5 ${
                  totalProfit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {formatCurrency(totalProfit)}
              </p>
            </div>
          </div>

          {/* Toggle calc details */}
          <button
            onClick={() => setShowCalcDetails((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700"
          >
            <Info size={16} />
            {showCalcDetails ? 'Hide' : 'Show'} calculation details
          </button>
        </div>

        {applyAdjustment && (
          <p className="text-xs text-amber-600 mt-3 bg-amber-50 rounded-lg px-3 py-2">
            Amazon Visa 5% cashback tracking is enabled. The discount is applied
            only to orders where the Amazon Visa card was detected at purchase.
            Toggle in Settings.
          </p>
        )}
      </div>

      {/* Pending match suggestions */}
      {suggestions.length > 0 && (
        <MatchSuggestionsBanner initialSuggestions={suggestions} />
      )}

      {/* Cluster cards */}
      {clusters.map((cluster) => (
        <ClusterCard
          key={cluster.ebay.id}
          cluster={cluster}
          showCalcDetails={showCalcDetails}
        />
      ))}
    </div>
  )
}

function ebayOrderUrl(orderId: string) {
  return `https://www.ebay.com/sh/ord/details?orderid=${encodeURIComponent(orderId)}`
}

function amazonOrderUrl(orderId: string) {
  return `https://www.amazon.com/gp/your-account/order-details?orderID=${encodeURIComponent(orderId)}`
}

function ClusterCard({
  cluster,
  showCalcDetails,
}: {
  cluster: OrderCluster
  showCalcDetails: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const { ebay, amazon, ebayNet, amazonCostRaw, amazonCostAdjusted, netProfit } =
    cluster

  const firstItem = Array.isArray(ebay.transactions_json) ? ebay.transactions_json[0] : null
  const extraCount = Array.isArray(ebay.transactions_json) ? ebay.transactions_json.length - 1 : 0
  const itemTitle = firstItem?.name ?? 'Unknown item'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <button className="text-gray-400 shrink-0">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          {/* Item title */}
          <p className="font-medium text-gray-900 truncate">
            {itemTitle}
            {extraCount > 0 && (
              <span className="text-gray-400 text-sm font-normal ml-1">
                +{extraCount} more
              </span>
            )}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap">
            {/* Type badge */}
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                ebay.type === 'sale'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              eBay {ebay.type}
            </span>

            {/* eBay order link */}
            <a
              href={ebayOrderUrl(ebay.order_number)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-mono text-brand-600 hover:underline"
            >
              {ebay.order_number} ↗
            </a>

            {/* Amazon order links */}
            {amazon.length === 0 ? (
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                No Amazon match
              </span>
            ) : (
              amazon.map((amz) => (
                <a
                  key={amz.id}
                  href={amazonOrderUrl(amz.order_number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-mono text-orange-600 hover:underline"
                >
                  {amz.order_number} ↗
                </a>
              ))
            )}

            {/* Buyer */}
            {ebay.buyer && (
              <span className="text-xs text-gray-500">{ebay.buyer}</span>
            )}

            {/* Date */}
            {ebay.date && (
              <span className="text-xs text-gray-400">
                {format(new Date(ebay.date), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        </div>

        {/* Profit summary */}
        <div className="text-right shrink-0">
          <p
            className={`text-lg font-bold ${
              netProfit >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {formatCurrency(netProfit)}
          </p>
          <p className="text-xs text-gray-400">net profit</p>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* eBay side */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                eBay Order
              </h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-500 shrink-0">Order #</span>
                  <a
                    href={ebayOrderUrl(ebay.order_number)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-brand-600 hover:underline text-right"
                  >
                    {ebay.order_number} ↗
                  </a>
                </div>
                <Row
                  label="Date"
                  value={
                    ebay.date
                      ? format(new Date(ebay.date), 'MMM d, yyyy')
                      : '—'
                  }
                />
                <Row label="Buyer" value={ebay.buyer ?? '—'} />
                <Row
                  label="Total"
                  value={ebay.total != null ? formatCurrency(ebay.total) : '—'}
                />
                <Row
                  label="Net (after fees)"
                  value={formatCurrency(ebayNet)}
                  highlight={ebayNet >= 0 ? 'green' : 'red'}
                />
                {ebay.buyer && <Row label="Status" value={ebay.status ?? '—'} />}
              </div>

              {/* Line items */}
              {Array.isArray(ebay.transactions_json) &&
                ebay.transactions_json.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Line Items
                    </p>
                    <div className="bg-white rounded-lg border border-gray-100 divide-y divide-gray-50">
                      {ebay.transactions_json.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-3 py-2 text-xs"
                        >
                          <span className="text-gray-700 capitalize">
                            {item.name}
                          </span>
                          <span className="text-gray-500">
                            {item.qty}x {formatCurrency(item.price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* Amazon side */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Amazon Order{amazon.length > 1 ? 's' : ''}
              </h4>

              {amazon.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No matched Amazon order. Link via &quot;Corresponding Amazon
                  Order&quot; field.
                </p>
              ) : (
                <div className="space-y-3">
                  {amazon.map((amz) => (
                    <div
                      key={amz.id}
                      className="bg-white rounded-lg border border-gray-100 p-3 space-y-1.5 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-gray-500 shrink-0">Order #</span>
                        <a
                          href={amazonOrderUrl(amz.order_number)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-orange-600 hover:underline text-right"
                        >
                          {amz.order_number} ↗
                        </a>
                      </div>
                      <Row label="Type" value={amz.type} />
                      {amz.used_amazon_visa && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Payment</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                            Amazon Visa (5% cashback)
                          </span>
                        </div>
                      )}
                      <Row
                        label="Cost (raw)"
                        value={
                          amz.cost != null ? formatCurrency(amz.cost) : '—'
                        }
                      />
                      {showCalcDetails && cluster.adjustmentApplied && amz.used_amazon_visa && (
                        <Row
                          label="Cost (after 5% cashback)"
                          value={formatCurrency((amz.cost ?? 0) * 0.95)}
                          highlight="amber"
                        />
                      )}
                      {amz.tracking_url && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Tracking</span>
                          <a
                            href={amz.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 hover:text-brand-700 text-xs"
                          >
                            View tracking
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Calc summary */}
              {showCalcDetails && amazon.length > 0 && (
                <div className="mt-3 bg-amber-50 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-medium text-amber-800">
                    Calculation breakdown
                  </p>
                  <Row
                    label="eBay net"
                    value={formatCurrency(ebayNet)}
                    small
                  />
                  <Row
                    label="Amazon cost (raw)"
                    value={`−${formatCurrency(amazonCostRaw)}`}
                    small
                  />
                  {cluster.adjustmentApplied && (
                    <Row
                      label="Amazon cost (adjusted)"
                      value={`−${formatCurrency(amazonCostAdjusted)}`}
                      small
                      highlight="amber"
                    />
                  )}
                  <div className="border-t border-amber-200 pt-1 mt-1">
                    <Row
                      label="Net profit"
                      value={formatCurrency(netProfit)}
                      highlight={netProfit >= 0 ? 'green' : 'red'}
                      small
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  mono = false,
  highlight,
  small = false,
}: {
  label: string
  value: string
  mono?: boolean
  highlight?: 'green' | 'red' | 'amber'
  small?: boolean
}) {
  const valueClass = highlight === 'green'
    ? 'font-semibold text-green-600'
    : highlight === 'red'
    ? 'font-semibold text-red-600'
    : highlight === 'amber'
    ? 'font-semibold text-amber-700'
    : 'text-gray-700'

  return (
    <div className={`flex items-center justify-between gap-2 ${small ? 'text-xs' : 'text-sm'}`}>
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} ${valueClass} text-right`}>
        {value}
      </span>
    </div>
  )
}
