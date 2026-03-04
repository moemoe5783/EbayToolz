'use client'

import { useState, useTransition, useEffect } from 'react'
import { Loader2, CheckCircle, AlertCircle, RefreshCw, Unlink, Link, History } from 'lucide-react'
import { toast } from 'sonner'
import { syncEbayOrders } from '@/lib/actions/ebay-sync'

interface EbaySettingsProps {
  isConnected: boolean
  lastSynced: Date | null
  ebayStatus?: 'connected' | 'error'
  ebayErrorReason?: string
}

export default function EbaySettings({ isConnected, lastSynced, ebayStatus, ebayErrorReason }: EbaySettingsProps) {
  const [isPending, startTransition] = useTransition()
  const [syncResult, setSyncResult] = useState<{
    ok: boolean
    synced?: number
    error?: string
    warning?: string
  } | null>(null)

  useEffect(() => {
    if (ebayStatus === 'connected') toast.success('eBay account connected successfully.')
    if (ebayStatus === 'error') toast.error(`eBay connection failed${ebayErrorReason ? `: ${ebayErrorReason.replace(/_/g, ' ')}` : '.'} Please try again.`)
  }, [ebayStatus, ebayErrorReason])

  const [isHistoricalPending, startHistoricalTransition] = useTransition()
  const [historicalDate, setHistoricalDate] = useState('')
  const todayStr = typeof window !== 'undefined' ? new Date().toISOString().split('T')[0] : undefined
  const [historicalResult, setHistoricalResult] = useState<{
    ok: boolean
    synced?: number
    error?: string
    warning?: string
  } | null>(null)

  function handleSync() {
    setSyncResult(null)
    startTransition(async () => {
      const result = await syncEbayOrders()
      setSyncResult(result)
    })
  }

  function handleHistoricalSync() {
    if (!historicalDate) return
    setHistoricalResult(null)
    startHistoricalTransition(async () => {
      const result = await syncEbayOrders({ dateFrom: historicalDate })
      setHistoricalResult(result)
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
              <div className="space-y-2">
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
                {syncResult.ok && syncResult.warning && (
                  <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-yellow-50 border border-yellow-200 text-yellow-800">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span>
                      {syncResult.warning}
                      {syncResult.warning.includes('401') || syncResult.warning.includes('403') ? (
                        <> &mdash; your token may be missing the Finance scope.{' '}
                          <a href="/api/ebay/connect" className="underline font-medium">Re-connect eBay</a> to fix.
                        </>
                      ) : null}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSync}
                disabled={isPending || isHistoricalPending}
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

            {/* Historical import */}
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <History size={14} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Import Past Orders</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Pull orders from a specific date forward — useful for a first-time setup with existing history.
              </p>

              {historicalResult && (
                <div className="space-y-2 mb-3">
                  <div
                    className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                      historicalResult.ok
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-700'
                    }`}
                  >
                    {historicalResult.ok ? (
                      <CheckCircle size={15} className="shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    )}
                    <span>
                      {historicalResult.ok
                        ? `Imported ${historicalResult.synced} order${historicalResult.synced === 1 ? '' : 's'} since ${historicalDate}.`
                        : historicalResult.error}
                    </span>
                  </div>
                  {historicalResult.ok && historicalResult.warning && (
                    <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-yellow-50 border border-yellow-200 text-yellow-800">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />
                      <span>
                        {historicalResult.warning}
                        {historicalResult.warning.includes('401') || historicalResult.warning.includes('403') ? (
                          <> &mdash; your token may be missing the Finance scope.{' '}
                            <a href="/api/ebay/connect" className="underline font-medium">Re-connect eBay</a> to fix.
                          </>
                        ) : null}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={historicalDate}
                  onChange={(e) => setHistoricalDate(e.target.value)}
                  max={todayStr}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
                <button
                  onClick={handleHistoricalSync}
                  disabled={!historicalDate || isPending || isHistoricalPending}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {isHistoricalPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <History size={15} />
                  )}
                  {isHistoricalPending ? 'Importing…' : 'Import'}
                </button>
              </div>
            </div>
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
