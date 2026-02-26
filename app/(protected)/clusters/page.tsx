import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getEbayTransactions } from '@/lib/actions/ebay-transactions'
import { getAllAmazonTransactions } from '@/lib/actions/amazon-transactions'
import { getUserSettings } from '@/lib/actions/settings'
import { getAllExpensesTotal } from '@/lib/actions/business-expenses'
import { buildClusters } from '@/lib/utils/calculations'
import ClustersView from '@/components/clusters/clusters-view'

export const metadata: Metadata = {
  title: 'Order Clusters — EbayToolz',
}

function ClustersSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse"
        >
          <div className="h-5 bg-gray-200 rounded w-48 mb-4" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-4 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

async function ClustersContent() {
  const [ebayResult, amazonResult, settingsResult, totalExpenses] =
    await Promise.all([
      getEbayTransactions({}),
      getAllAmazonTransactions(),
      getUserSettings(),
      getAllExpensesTotal(),
    ])

  const applyAdjustment =
    settingsResult.data?.apply_amazon_5pct_adjustment ?? true

  const clusters = buildClusters(
    ebayResult.data,
    amazonResult.data,
    applyAdjustment
  )

  return (
    <ClustersView
      clusters={clusters}
      applyAdjustment={applyAdjustment}
      totalExpenses={totalExpenses}
    />
  )
}

export default function ClustersPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Order Clusters</h1>
        <p className="text-gray-500 mt-1">
          eBay orders matched with their Amazon fulfillment costs, with optional
          5% adjustment applied
        </p>
      </div>

      <Suspense fallback={<ClustersSkeleton />}>
        <ClustersContent />
      </Suspense>
    </div>
  )
}
