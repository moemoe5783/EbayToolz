/**
 * Protected layout — wraps all authenticated pages with the
 * sidebar + top nav shell.
 *
 * Session check is handled by middleware, so this component
 * can safely assume the user is authenticated.
 */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/sidebar'
import Navbar from '@/components/layout/navbar'
import AutoSync from '@/components/layout/auto-sync'
import { getEbayLastSynced } from '@/lib/ebay/tokens'

const STALE_AFTER_MS = 30 * 60 * 1000 // 30 minutes

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Double-check auth (belt-and-suspenders alongside middleware)
  if (!user) {
    redirect('/login')
  }

  const lastSynced = await getEbayLastSynced(user.id)
  const shouldSync =
    !lastSynced || Date.now() - lastSynced.getTime() > STALE_AFTER_MS

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Auto-sync eBay on first load or if stale */}
      <AutoSync shouldSync={shouldSync} />

      {/* Sidebar */}
      <Sidebar userEmail={user.email ?? ''} />

      {/* Main content area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <Navbar userEmail={user.email ?? ''} />

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
