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

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
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
