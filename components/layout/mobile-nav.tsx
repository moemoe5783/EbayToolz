'use client'

/**
 * Fixed bottom navigation bar — visible only on mobile (md:hidden).
 * Provides quick access to all main sections of the app.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  ArrowLeftRight,
  GitMerge,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
  { label: 'Clusters', href: '/clusters', icon: GitMerge },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export default function MobileNav() {
  const pathname = usePathname()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => { setPendingHref(null) }, [pathname])

  const activePath = pendingHref ?? pathname

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-pb">
      <div className="flex items-stretch">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activePath.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setPendingHref(item.href)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-1 transition-colors min-h-[56px]',
                isActive
                  ? 'text-brand-600'
                  : 'text-gray-400 active:text-gray-600'
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span
                className={cn(
                  'text-[10px] font-medium leading-none',
                  isActive ? 'text-brand-600' : 'text-gray-400'
                )}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-600 rounded-b-full" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
