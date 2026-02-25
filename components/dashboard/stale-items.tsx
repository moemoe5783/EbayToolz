/**
 * Stale items list — items with no sales in >90 days.
 */
import { AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import type { StaleItem } from '@/lib/types/database'

interface StaleItemsProps {
  items: StaleItem[]
}

export default function StaleItems({ items }: StaleItemsProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
        <AlertTriangle size={18} className="text-orange-500" />
        <h3 className="font-semibold text-gray-900">Stale Items</h3>
        <span className="ml-auto text-xs text-gray-400">No sales in 90+ days</span>
      </div>

      {items.length === 0 ? (
        <div className="px-6 py-8 text-center text-gray-400 text-sm">
          No stale items found. Keep selling!
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map((item) => (
            <div key={item.name} className="flex items-center gap-4 px-6 py-3">
              {/* Stale badge */}
              <div className="shrink-0">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    item.daysSinceLastSale > 180
                      ? 'bg-red-100 text-red-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}
                >
                  {item.daysSinceLastSale}d
                </span>
              </div>

              {/* Item info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate capitalize">
                  {item.name}
                </p>
                <p className="text-xs text-gray-400">
                  Last sold:{' '}
                  {format(new Date(item.lastSoldDate), 'MMM d, yyyy')}
                </p>
              </div>

              {/* Total sold */}
              <p className="text-xs text-gray-400 shrink-0">
                {item.totalSold} sold total
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
