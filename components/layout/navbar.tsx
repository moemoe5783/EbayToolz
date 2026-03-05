'use client'

/**
 * Top navigation bar.
 * Shows the current page title, user avatar, and sign-out button.
 */
import { useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { signOut } from '@/lib/actions/auth'
import { toast } from 'sonner'

const routeLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Transactions',
  '/clusters': 'Clusters',
  '/settings': 'Settings',
}

interface NavbarProps {
  userEmail: string
}

export default function Navbar({ userEmail }: NavbarProps) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const pageTitle =
    Object.entries(routeLabels).find(([route]) =>
      pathname.startsWith(route)
    )?.[1] ?? 'EbayToolz'

  function handleSignOut() {
    startTransition(async () => {
      try {
        await signOut()
      } catch {
        toast.error('Failed to sign out. Please try again.')
      }
    })
  }

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shrink-0">
      {/* Page title (desktop) */}
      <h2 className="text-lg font-semibold text-gray-900 hidden md:block">
        {pageTitle}
      </h2>

      {/* Mobile: brand name */}
      <div className="md:hidden flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand-600 text-white flex items-center justify-center text-xs font-bold">
          ET
        </div>
        <span className="font-semibold text-gray-900">EbayToolz</span>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 hidden sm:block">{userEmail}</span>

        <button
          onClick={handleSignOut}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          title="Sign out"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  )
}
