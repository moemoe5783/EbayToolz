'use client'

import { useEffect, useRef } from 'react'
import { syncEbayOrders } from '@/lib/actions/ebay-sync'
import { toast } from 'sonner'

/**
 * Invisible component that auto-syncs eBay orders on page load if the last
 * sync was more than 30 minutes ago (or has never run).
 * Rendered server-side with shouldSync already computed to avoid an extra
 * client-side round-trip.
 */
export default function AutoSync({ shouldSync }: { shouldSync: boolean }) {
  const hasFired = useRef(false)

  useEffect(() => {
    if (!shouldSync || hasFired.current) return
    hasFired.current = true

    syncEbayOrders()
      .then((result) => {
        if (result.ok && (result.synced ?? 0) > 0) {
          toast.success(`eBay synced — ${result.synced} orders updated`)
        }
        // Silent on 0 new orders or warnings for auto-sync
      })
      .catch(() => {
        // Auto-sync failures are silent; user can manually sync
      })
  }, [shouldSync])

  return null
}
