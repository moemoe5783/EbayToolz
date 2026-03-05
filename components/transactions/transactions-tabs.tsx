'use client'

/**
 * Tab switcher between eBay, Amazon, and Expenses transaction tables.
 * Also hosts the modal triggers for adding/editing transactions and expenses.
 */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import EbayTransactionsTable from './ebay-table'
import AmazonTransactionsTable from './amazon-table'
import ExpensesTable from './expenses-table'
import TransactionModal from './transaction-modal'
import ExpenseModal, { type ExpensePrefill } from './expense-modal'
import type {
  EbayTransaction,
  AmazonTransaction,
  BusinessExpense,
} from '@/lib/types/database'

type TabType = 'ebay' | 'amazon' | 'expenses'

interface TransactionsTabsProps {
  ebayTransactions: EbayTransaction[]
  ebayCount: number
  amazonTransactions: AmazonTransaction[]
  amazonCount: number
  expenses: BusinessExpense[]
  expenseCount: number
}

export default function TransactionsTabs({
  ebayTransactions,
  ebayCount,
  amazonTransactions,
  amazonCount,
  expenses,
  expenseCount,
}: TransactionsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ebay')

  // Transaction modal (eBay / Amazon)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<
    EbayTransaction | AmazonTransaction | null
  >(null)

  // Expense modal
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [expenseEditTarget, setExpenseEditTarget] =
    useState<BusinessExpense | null>(null)
  const [expensePrefill, setExpensePrefill] = useState<ExpensePrefill | null>(
    null
  )

  // ─── Transaction modal helpers ──────────────────────────────────────────────

  function openCreateModal() {
    setEditTarget(null)
    setModalOpen(true)
  }

  function openEditModal(tx: EbayTransaction | AmazonTransaction) {
    setEditTarget(tx)
    setModalOpen(true)
  }

  // ─── Expense modal helpers ──────────────────────────────────────────────────

  function openAddExpenseModal() {
    setExpenseEditTarget(null)
    setExpensePrefill(null)
    setExpenseModalOpen(true)
  }

  function openEditExpenseModal(expense: BusinessExpense) {
    setExpenseEditTarget(expense)
    setExpensePrefill(null)
    setExpenseModalOpen(true)
  }

  function markAmazonAsExpense(tx: AmazonTransaction) {
    setExpenseEditTarget(null)
    setExpensePrefill({
      date: tx.date,
      description: `Amazon Order ${tx.order_number}`,
      amount: tx.cost ?? undefined,
      category: 'amazon_order',
      amazon_order_number: tx.order_number,
    })
    setExpenseModalOpen(true)
  }

  // ─── Add button label / handler depends on active tab ─────────────────────

  const isExpenseTab = activeTab === 'expenses'

  return (
    <div>
      {/* Header row — stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-full sm:w-auto">
          <Tab
            label="eBay"
            count={ebayCount}
            active={activeTab === 'ebay'}
            onClick={() => setActiveTab('ebay')}
          />
          <Tab
            label="Amazon"
            count={amazonCount}
            active={activeTab === 'amazon'}
            onClick={() => setActiveTab('amazon')}
          />
          <Tab
            label="Expenses"
            count={expenseCount}
            active={activeTab === 'expenses'}
            onClick={() => setActiveTab('expenses')}
          />
        </div>

        {/* Add button */}
        <button
          onClick={isExpenseTab ? openAddExpenseModal : openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors w-full sm:w-auto"
        >
          <Plus size={16} />
          {isExpenseTab ? 'Add Expense' : 'Add Transaction'}
        </button>
      </div>

      {/* Table */}
      {activeTab === 'ebay' && (
        <EbayTransactionsTable
          transactions={ebayTransactions}
          onEdit={openEditModal}
        />
      )}
      {activeTab === 'amazon' && (
        <AmazonTransactionsTable
          transactions={amazonTransactions}
          onEdit={openEditModal}
          onMarkAsExpense={markAmazonAsExpense}
        />
      )}
      {activeTab === 'expenses' && (
        <ExpensesTable expenses={expenses} onEdit={openEditExpenseModal} />
      )}

      {/* Transaction add/edit modal */}
      {modalOpen && (
        <TransactionModal
          defaultTab={activeTab === 'expenses' ? 'amazon' : activeTab}
          editTarget={editTarget}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* Expense add/edit modal */}
      {expenseModalOpen && (
        <ExpenseModal
          editTarget={expenseEditTarget}
          prefill={expensePrefill}
          onClose={() => setExpenseModalOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Tab button ────────────────────────────────────────────────────────────────

function Tab({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-all ${
        active
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
      <span className="ml-1.5 text-xs text-gray-400">({count})</span>
    </button>
  )
}
