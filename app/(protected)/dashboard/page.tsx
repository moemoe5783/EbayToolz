import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { getDashboardStats } from '@/lib/actions/dashboard'
import { createClient } from '@/lib/supabase/server'
import { isEbayConnected } from '@/lib/ebay/tokens'
import StatsCards from '@/components/dashboard/stats-cards'
import TopItems from '@/components/dashboard/top-items'
import StaleItems from '@/components/dashboard/stale-items'

export const metadata: Metadata = {
  title: 'Dashboard — EbayToolz',
}

// Loading skeleton for stats cards
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
          <div className="h-8 bg-gray-200 rounded w-32" />
        </div>
      ))}
    </div>
  )
}

async function DashboardContent() {
  const { data: stats, error } = await getDashboardStats()

  if (error || !stats) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700">
        <p className="font-medium">Failed to load dashboard</p>
        <p className="text-sm mt-1 text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <>
      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <TopItems items={stats.topItems} />
        <StaleItems items={stats.staleItems} />
      </div>
    </>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const ebayConnected = user ? await isEbayConnected(user.id) : false

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Overview of your eBay operations
        </p>
      </div>

      {!ebayConnected && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-amber-800">eBay account not connected</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Connect your eBay account to start syncing orders automatically.
            </p>
          </div>
          <Link
            href="/settings"
            className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
          >
            Connect eBay
          </Link>
        </div>
      )}

      <Suspense fallback={<StatsSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  )
}
