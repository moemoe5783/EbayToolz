'use client'

/**
 * Business expenses data table with sorting, delete, and edit actions.
 * Desktop: TanStack Table. Mobile: card list.
 */
import { useMemo, useTransition, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { format } from 'date-fns'
import { ArrowUpDown, Pencil, Trash2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { deleteBusinessExpense } from '@/lib/actions/business-expenses'
import { formatCurrency } from '@/lib/utils/calculations'
import type { BusinessExpense } from '@/lib/types/database'

const columnHelper = createColumnHelper<BusinessExpense>()

const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
  amazon_order:  { label: 'Amazon Order',  className: 'bg-orange-100 text-orange-700' },
  software:      { label: 'Software',      className: 'bg-blue-100 text-blue-700' },
  subscription:  { label: 'Subscription',  className: 'bg-purple-100 text-purple-700' },
  supplies:      { label: 'Supplies',      className: 'bg-teal-100 text-teal-700' },
  shipping:      { label: 'Shipping',      className: 'bg-sky-100 text-sky-700' },
  advertising:   { label: 'Advertising',   className: 'bg-pink-100 text-pink-700' },
  other:         { label: 'Other',         className: 'bg-gray-100 text-gray-600' },
}

function CategoryBadge({ category }: { category: string }) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.other
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  )
}

interface ExpensesTableProps {
  expenses: BusinessExpense[]
  onEdit: (expense: BusinessExpense) => void
}

export default function ExpensesTable({ expenses, onEdit }: ExpensesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleDelete(id: string) {
    if (!confirm('Delete this expense? This cannot be undone.')) return
    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteBusinessExpense(id)
      setDeletingId(null)
      if (result.error) toast.error(result.error)
      else toast.success('Expense deleted.')
    })
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor('date', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Date <ArrowUpDown size={12} />
          </button>
        ),
        cell: (info) =>
          info.getValue() ? format(new Date(info.getValue()), 'MMM d, yyyy') : '—',
      }),
      columnHelper.accessor('description', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Description
          </span>
        ),
        cell: (info) => (
          <span className="text-sm text-gray-900">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('category', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Category
          </span>
        ),
        cell: (info) => <CategoryBadge category={info.getValue()} />,
      }),
      columnHelper.accessor('amount', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Amount <ArrowUpDown size={12} />
          </button>
        ),
        cell: (info) => (
          <span className="text-red-600 font-medium">
            −{formatCurrency(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('notes', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Notes
          </span>
        ),
        cell: (info) => (
          <span className="text-sm text-gray-500 truncate max-w-[200px] block">
            {info.getValue() ?? '—'}
          </span>
        ),
      }),
      columnHelper.accessor('amazon_order_number', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Amazon Order
          </span>
        ),
        cell: (info) => (
          <span className="font-mono text-xs text-gray-500">
            {info.getValue() ?? '—'}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Actions
          </span>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(row.original)}
              className="p-1 text-gray-400 hover:text-brand-600 transition-colors"
              title="Edit"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => handleDelete(row.original.id)}
              disabled={deletingId === row.original.id}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletingId]
  )

  const table = useReactTable({
    data: expenses,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0)

  if (expenses.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <Receipt size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No business expenses yet</p>
        <p className="text-gray-400 text-sm mt-1">
          Add expenses manually or mark an Amazon order as a business expense.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* ── Mobile card list ─────────────────────────────────────────── */}
      <ul className="md:hidden divide-y divide-gray-100">
        {expenses.map((expense) => (
          <li key={expense.id} className="px-4 py-3.5">
            {/* Row 1: description + date */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-gray-900 leading-tight">
                {expense.description}
              </span>
              <span className="text-xs text-gray-400 shrink-0 pt-0.5">
                {expense.date ? format(new Date(expense.date), 'MMM d, yyyy') : '—'}
              </span>
            </div>

            {/* Row 2: category + amount */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <CategoryBadge category={expense.category} />
              <span className="text-sm font-semibold text-red-600">
                −{formatCurrency(expense.amount)}
              </span>
            </div>

            {/* Row 3: notes / amazon order + actions */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-gray-400 min-w-0 truncate">
                {expense.amazon_order_number ? (
                  <span className="font-mono">{expense.amazon_order_number}</span>
                ) : expense.notes ? (
                  <span>{expense.notes}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onEdit(expense)}
                  className="p-1.5 text-gray-400 hover:text-brand-600 transition-colors"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(expense.id)}
                  disabled={deletingId === expense.id}
                  className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* ── Desktop table ────────────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="text-left px-4 py-3 whitespace-nowrap">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-50">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</span>
        <span className="font-medium text-red-500">Total: −{formatCurrency(totalAmount)}</span>
      </div>
    </div>
  )
}
