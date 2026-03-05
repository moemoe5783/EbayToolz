'use client'

/**
 * Amazon transactions data table with sorting, delete, and edit actions.
 */
import { useMemo, useTransition } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { format } from 'date-fns'
import { ArrowUpDown, Pencil, Trash2, ShoppingBag, ExternalLink, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { deleteAmazonTransaction } from '@/lib/actions/amazon-transactions'
import { formatCurrency } from '@/lib/utils/calculations'
import type { AmazonTransaction } from '@/lib/types/database'

const columnHelper = createColumnHelper<AmazonTransaction>()

interface AmazonTransactionsTableProps {
  transactions: AmazonTransaction[]
  onEdit: (tx: AmazonTransaction) => void
  onMarkAsExpense: (tx: AmazonTransaction) => void
}

export default function AmazonTransactionsTable({
  transactions,
  onEdit,
  onMarkAsExpense,
}: AmazonTransactionsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleDelete(id: string) {
    if (!confirm('Delete this Amazon transaction? This cannot be undone.'))
      return

    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteAmazonTransaction(id)
      setDeletingId(null)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Transaction deleted.')
      }
    })
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor('date', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700"
            onClick={() =>
              column.toggleSorting(column.getIsSorted() === 'asc')
            }
          >
            Date <ArrowUpDown size={12} />
          </button>
        ),
        cell: (info) =>
          info.getValue()
            ? format(new Date(info.getValue()!), 'MMM d, yyyy')
            : '—',
      }),
      columnHelper.accessor('order_number', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Order #
          </span>
        ),
        cell: (info) => (
          <span className="font-mono text-xs text-gray-700">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('type', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Type
          </span>
        ),
        cell: (info) => {
          const type = info.getValue()
          return (
            <span
              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                type === 'complete'
                  ? 'bg-green-100 text-green-700'
                  : type === 'refund'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {type}
            </span>
          )
        },
      }),
      columnHelper.accessor('total', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700"
            onClick={() =>
              column.toggleSorting(column.getIsSorted() === 'asc')
            }
          >
            Total <ArrowUpDown size={12} />
          </button>
        ),
        cell: (info) =>
          info.getValue() != null ? formatCurrency(info.getValue()!) : '—',
      }),
      columnHelper.accessor('cost', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700"
            onClick={() =>
              column.toggleSorting(column.getIsSorted() === 'asc')
            }
          >
            Cost <ArrowUpDown size={12} />
          </button>
        ),
        cell: (info) =>
          info.getValue() != null ? (
            <span className="text-red-600">
              {formatCurrency(info.getValue()!)}
            </span>
          ) : (
            '—'
          ),
      }),
      columnHelper.accessor('status', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Status
          </span>
        ),
        cell: (info) => (
          <span
            className="text-sm text-gray-500 block truncate max-w-[200px]"
            title={info.getValue() ?? undefined}
          >
            {info.getValue() ?? '—'}
          </span>
        ),
      }),
      columnHelper.accessor('tracking_url', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Tracking
          </span>
        ),
        cell: (info) =>
          info.getValue() ? (
            <a
              href={info.getValue()!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-brand-600 hover:text-brand-700 text-xs"
            >
              View <ExternalLink size={11} />
            </a>
          ) : (
            <span className="text-gray-400 text-xs">—</span>
          ),
      }),
      columnHelper.accessor('corresponding_ebay_order', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            eBay Order
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
              onClick={() => onMarkAsExpense(row.original)}
              className="p-1 text-gray-400 hover:text-orange-500 transition-colors"
              title="Mark as business expense"
            >
              <Receipt size={14} />
            </button>
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
    data: transactions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <ShoppingBag size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No Amazon transactions yet</p>
        <p className="text-gray-400 text-sm mt-1">
          Add your first Amazon purchase using the button above.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left px-4 py-3 whitespace-nowrap"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
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
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
        {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
