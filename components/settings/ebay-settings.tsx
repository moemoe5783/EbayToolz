'use client'

import { useState, useTransition } from 'react'
import { Loader2, CheckCircle, AlertCircle, RefreshCw, Unlink, Link } from 'lucide-react'
import { syncEbayOrders } from '@/lib/actions/ebay-sync'

interface EbaySettingsProps {
  isConnected: boolean
  lastSynced: Date | null
}

export default function EbaySettings({ isConnected, lastSynced }: EbaySettingsProps) {
  const [isPending, startTransition] = useTransition()
  const [syncResult, setSyncResult] = useState<{
    ok: boolean
    synced?: number
    error?: string
  } | null>(null)

  function handleSync() {
    setSyncResult(null)
    startTransition(async () => {
      const result = await syncEbayOrders()
      setSyncResult(result)
    })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">eBay Account</h3>
        <p className="text-sm text-gray-500 mt-1">
          Connect your eBay seller account to sync orders automatically via the
          eBay API.
        </p>
      </div>

      <div className="px-6 py-5">
        {isConnected ? (
          <div className="space-y-4">
            {/* Connected status */}
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle size={16} className="shrink-0" />
              <span className="font-medium">Connected to eBay</span>
            </div>

            {lastSynced && (
              <p className="text-sm text-gray-500">
                Last synced:{' '}
                {lastSynced.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}

            {/* Sync result feedback */}
            {syncResult && (
              <div
                className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                  syncResult.ok
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                {syncResult.ok ? (
                  <CheckCircle size={15} className="shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                )}
                <span>
                  {syncResult.ok
                    ? `Synced ${syncResult.synced} order${syncResult.synced === 1 ? '' : 's'} from the last 90 days.`
                    : syncResult.error}
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSync}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <RefreshCw size={15} />
                )}
                {isPending ? 'Syncing…' : 'Sync Now'}
              </button>

              <a
                href="/api/ebay/disconnect"
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-lg transition-colors"
              >
                <Unlink size={14} />
                Disconnect
              </a>
            </div>

            <p className="text-xs text-gray-400">
              Sync pulls the last 90 days of eBay orders. Orders already in
              EbayToolz are updated with the latest data.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Link your eBay account to import orders automatically — no manual
              entry needed. Your eBay credentials are never stored; only an
              encrypted OAuth token is kept server-side.
            </p>

            <a
              href="/api/ebay/connect"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Link size={15} />
              Connect eBay Account
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
