/**
 * Top selling items table for the dashboard.
 */
import { Trophy } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/calculations'
import type { TopItem } from '@/lib/types/database'

interface TopItemsProps {
  items: TopItem[]
}

export default function TopItems({ items }: TopItemsProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
        <Trophy size={18} className="text-amber-500" />
        <h3 className="font-semibold text-gray-900">Top Selling Items</h3>
        <span className="ml-auto text-xs text-gray-400">All time</span>
      </div>

      {items.length === 0 ? (
        <div className="px-6 py-8 text-center text-gray-400 text-sm">
          No item data yet. Add transactions with line items to see top sellers.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map((item, index) => (
            <div key={item.name} className="flex items-center gap-4 px-6 py-3">
              {/* Rank */}
              <span
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0
                    ? 'bg-amber-100 text-amber-700'
                    : index === 1
                    ? 'bg-gray-100 text-gray-600'
                    : index === 2
                    ? 'bg-orange-100 text-orange-600'
                    : 'bg-gray-50 text-gray-400'
                }`}
              >
                {index + 1}
              </span>

              {/* Item name */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate capitalize">
                  {item.name}
                </p>
                <p className="text-xs text-gray-400">
                  {item.totalQty} units · {item.orderCount} orders
                </p>
              </div>

              {/* Revenue */}
              <p className="text-sm font-semibold text-gray-900 shrink-0">
                {formatCurrency(item.totalRevenue)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
