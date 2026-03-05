/**
 * Dashboard stats summary cards.
 */
import { TrendingUp, ShoppingCart, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/calculations'
import type { DashboardStats } from '@/lib/types/database'

interface StatsCardsProps {
  stats: DashboardStats
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label: 'Net Profit (30 days)',
      value: formatCurrency(stats.netProfitLast30Days),
      icon: TrendingUp,
      color:
        stats.netProfitLast30Days >= 0
          ? 'text-green-600 bg-green-50'
          : 'text-red-600 bg-red-50',
      valueColor:
        stats.netProfitLast30Days >= 0 ? 'text-green-700' : 'text-red-700',
    },
    {
      label: 'Total Sales (30 days)',
      value: formatCurrency(stats.totalSalesLast30Days),
      icon: DollarSign,
      color: 'text-brand-600 bg-brand-50',
      valueColor: 'text-brand-700',
    },
    {
      label: 'Orders (30 days)',
      value: stats.totalOrdersLast30Days.toString(),
      icon: ShoppingCart,
      color: 'text-purple-600 bg-purple-50',
      valueColor: 'text-purple-700',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-6">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100"
          >
            <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2">
              <p className="text-xs sm:text-sm font-medium text-gray-500 leading-tight">{card.label}</p>
              <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${card.color}`}>
                <Icon size={15} className="sm:hidden" />
                <Icon size={18} className="hidden sm:block" />
              </div>
            </div>
            <p className={`text-xl sm:text-2xl font-bold ${card.valueColor}`}>
              {card.value}
            </p>
          </div>
        )
      })}
    </div>
  )
}
