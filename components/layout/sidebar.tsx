'use client'

/**
 * Responsive sidebar navigation.
 * Highlights the active route using usePathname().
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ArrowLeftRight,
  GitMerge,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Transactions',
    href: '/transactions',
    icon: ArrowLeftRight,
  },
  {
    label: 'Clusters',
    href: '/clusters',
    icon: GitMerge,
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
  },
]

interface SidebarProps {
  userEmail: string
}

export default function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-brand-600 text-white font-bold text-sm shrink-0">
          ET
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">EbayToolz</p>
          <p className="text-xs text-gray-400">Dropshipping Manager</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon
                size={18}
                className={cn(
                  isActive ? 'text-brand-600' : 'text-gray-400'
                )}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User info at bottom */}
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">
              {userEmail}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
