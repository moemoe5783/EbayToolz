'use client'

/**
 * eBay transactions data table with sorting, delete, and edit actions.
 * Desktop: TanStack Table. Mobile: card list.
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
import { ArrowUpDown, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { deleteEbayTransaction } from '@/lib/actions/ebay-transactions'
import { formatCurrency } from '@/lib/utils/calculations'
import type { EbayTransaction } from '@/lib/types/database'

const columnHelper = createColumnHelper<EbayTransaction>()

// ─── Status badge ─────────────────────────────────────────────────────────────

function getStatusMeta(status: string | null, type: 'sale' | 'refund') {
  if (!status)
    return {
      label: type === 'refund' ? 'Refund' : 'Unknown',
      className: 'bg-gray-100 text-gray-500',
    }

  const s = status.toUpperCase()

  if (s.includes('CANCEL'))
    return { label: 'Cancelled', className: 'bg-red-100 text-red-700' }
  if (s.includes('RETURN'))
    return { label: 'Returned', className: 'bg-orange-100 text-orange-700' }
  if (s.includes('PARTIAL'))
    return { label: 'Partial Refund', className: 'bg-amber-100 text-amber-700' }
  if (s.includes('REFUND') || type === 'refund')
    return { label: 'Refunded', className: 'bg-amber-100 text-amber-700' }
  if (s.includes('DISPUT'))
    return { label: 'Disputed', className: 'bg-red-100 text-red-700' }
  if (
    s.includes('FULFILL') ||
    s.includes('COMPLET') ||
    s.includes('DELIVER') ||
    s.includes('SHIPPED')
  )
    return { label: 'Fulfilled', className: 'bg-green-100 text-green-700' }
  if (s.includes('ACTIVE') || s.includes('PAID') || s.includes('PROCESS'))
    return { label: 'Active', className: 'bg-blue-100 text-blue-700' }

  // Unknown value — show it capitalised but styled neutrally
  return {
    label: status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
    className: 'bg-gray-100 text-gray-600',
  }
}

function EbayStatusBadge({
  status,
  type,
}: {
  status: string | null
  type: 'sale' | 'refund'
}) {
  const { label, className } = getStatusMeta(status, type)
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EbayTransactionsTableProps {
  transactions: EbayTransaction[]
  onEdit: (tx: EbayTransaction) => void
}

export default function EbayTransactionsTable({
  transactions,
  onEdit,
}: EbayTransactionsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleDelete(id: string) {
    if (!confirm('Delete this eBay transaction? This cannot be undone.')) return
    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteEbayTransaction(id)
      setDeletingId(null)
      if (result.error) toast.error(result.error)
      else toast.success('Transaction deleted.')
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
          info.getValue() ? format(new Date(info.getValue()!), 'MMM d, yyyy') : '—',
      }),
      columnHelper.accessor('order_number', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Order #
          </span>
        ),
        cell: (info) => (
          <span className="font-mono text-xs text-gray-700">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('status', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Status
          </span>
        ),
        cell: (info) => (
          <EbayStatusBadge status={info.getValue()} type={info.row.original.type} />
        ),
      }),
      columnHelper.accessor('total', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Total <ArrowUpDown size={12} />
          </button>
        ),
        cell: (info) =>
          info.getValue() != null ? formatCurrency(info.getValue()!) : '—',
      }),
      columnHelper.accessor('net', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Net <ArrowUpDown size={12} />
          </button>
        ),
        cell: (info) =>
          info.getValue() != null ? (
            <span className={info.getValue()! >= 0 ? 'text-green-600' : 'text-red-600'}>
              {formatCurrency(info.getValue()!)}
            </span>
          ) : (
            '—'
          ),
      }),
      columnHelper.accessor('buyer', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Buyer
          </span>
        ),
        cell: (info) => (
          <span className="text-sm text-gray-600">{info.getValue() ?? '—'}</span>
        ),
      }),
      columnHelper.accessor('corresponding_amazon_order', {
        header: () => (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Amazon Order
          </span>
        ),
        cell: (info) => (
          <span className="font-mono text-xs text-gray-500">{info.getValue() ?? '—'}</span>
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
        <ExternalLink size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No eBay transactions yet</p>
        <p className="text-gray-400 text-sm mt-1">
          Add your first eBay sale or refund using the button above.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* ── Mobile card list ─────────────────────────────────────────── */}
      <ul className="md:hidden divide-y divide-gray-100">
        {transactions.map((tx) => (
          <li key={tx.id} className="px-4 py-3.5">
            {/* Row 1: order + date */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-mono text-xs text-gray-500 truncate">{tx.order_number}</span>
              <span className="text-xs text-gray-400 shrink-0">
                {tx.date ? format(new Date(tx.date), 'MMM d, yyyy') : '—'}
              </span>
            </div>

            {/* Row 2: status + net */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <EbayStatusBadge status={tx.status} type={tx.type} />
              <span
                className={`text-sm font-semibold ${
                  tx.net != null && tx.net < 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {tx.net != null ? formatCurrency(tx.net) : tx.total != null ? formatCurrency(tx.total) : '—'}
              </span>
            </div>

            {/* Row 3: buyer + amazon link + actions */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-xs text-gray-400 min-w-0">
                {tx.buyer && <span className="truncate">{tx.buyer}</span>}
                {tx.corresponding_amazon_order && (
                  <span className="font-mono truncate">{tx.corresponding_amazon_order}</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onEdit(tx)}
                  className="p-1.5 text-gray-400 hover:text-brand-600 transition-colors"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(tx.id)}
                  disabled={deletingId === tx.id}
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

      <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
        {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
