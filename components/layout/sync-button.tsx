'use client'

import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { syncEbayOrders } from '@/lib/actions/ebay-sync'
import { toast } from 'sonner'

export default function SyncButton() {
  const [isPending, startTransition] = useTransition()

  function handleSync() {
    startTransition(async () => {
      const result = await syncEbayOrders()
      if (result.ok) {
        toast.success(`Synced ${result.synced} eBay orders`)
        if (result.warning) toast.warning(result.warning)
      } else {
        toast.error(result.error ?? 'Sync failed')
      }
    })
  }

  return (
    <button
      onClick={handleSync}
      disabled={isPending}
      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors disabled:opacity-50"
    >
      <RefreshCw size={15} className={isPending ? 'animate-spin' : ''} />
      {isPending ? 'Syncing…' : 'Sync eBay'}
    </button>
  )
}
