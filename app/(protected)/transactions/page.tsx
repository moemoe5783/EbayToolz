import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getEbayTransactions } from '@/lib/actions/ebay-transactions'
import { getAmazonTransactions } from '@/lib/actions/amazon-transactions'
import { getBusinessExpenses } from '@/lib/actions/business-expenses'
import TransactionsTabs from '@/components/transactions/transactions-tabs'

export const metadata: Metadata = {
  title: 'Transactions — EbayToolz',
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="h-5 bg-gray-200 rounded w-32 animate-pulse" />
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-gray-50">
          {[1, 2, 3, 4, 5].map((j) => (
            <div key={j} className="h-4 bg-gray-100 rounded flex-1 animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  )
}

async function TransactionsContent() {
  const [ebayResult, amazonResult, expensesResult] = await Promise.all([
    getEbayTransactions({ limit: 100 }),
    getAmazonTransactions({ limit: 100 }),
    getBusinessExpenses({ limit: 100 }),
  ])

  return (
    <TransactionsTabs
      ebayTransactions={ebayResult.data}
      ebayCount={ebayResult.count}
      amazonTransactions={amazonResult.data}
      amazonCount={amazonResult.count}
      expenses={expensesResult.data}
      expenseCount={expensesResult.count}
    />
  )
}

export default function TransactionsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <p className="text-gray-500 mt-1">
          All eBay and Amazon transactions, plus business expenses
        </p>
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <TransactionsContent />
      </Suspense>
    </div>
  )
}
