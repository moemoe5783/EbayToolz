'use client'

/**
 * Tab switcher between eBay and Amazon transaction tables.
 * Also hosts the "Add Transaction" modal trigger.
 */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import EbayTransactionsTable from './ebay-table'
import AmazonTransactionsTable from './amazon-table'
import TransactionModal from './transaction-modal'
import type {
  EbayTransaction,
  AmazonTransaction,
} from '@/lib/types/database'

interface TransactionsTabsProps {
  ebayTransactions: EbayTransaction[]
  ebayCount: number
  amazonTransactions: AmazonTransaction[]
  amazonCount: number
}

export default function TransactionsTabs({
  ebayTransactions,
  ebayCount,
  amazonTransactions,
  amazonCount,
}: TransactionsTabsProps) {
  const [activeTab, setActiveTab] = useState<'ebay' | 'amazon'>('ebay')
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<
    EbayTransaction | AmazonTransaction | null
  >(null)

  function openCreateModal() {
    setEditTarget(null)
    setModalOpen(true)
  }

  function openEditModal(tx: EbayTransaction | AmazonTransaction) {
    setEditTarget(tx)
    setModalOpen(true)
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setActiveTab('ebay')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'ebay'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            eBay
            <span className="ml-2 text-xs text-gray-400">({ebayCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('amazon')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'amazon'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Amazon
            <span className="ml-2 text-xs text-gray-400">({amazonCount})</span>
          </button>
        </div>

        {/* Add button */}
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Transaction
        </button>
      </div>

      {/* Table */}
      {activeTab === 'ebay' ? (
        <EbayTransactionsTable
          transactions={ebayTransactions}
          onEdit={openEditModal}
        />
      ) : (
        <AmazonTransactionsTable
          transactions={amazonTransactions}
          onEdit={openEditModal}
        />
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <TransactionModal
          defaultTab={activeTab}
          editTarget={editTarget}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
