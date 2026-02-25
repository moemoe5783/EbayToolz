'use client'

/**
 * Settings form — toggles user preferences.
 * Uses useActionState for Server Action binding.
 */
import { useActionState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateUserSettings } from '@/lib/actions/settings'
import type { UserSettings } from '@/lib/types/database'

interface SettingsFormProps {
  initialSettings: UserSettings
}

export default function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState(updateUserSettings, {})

  useEffect(() => {
    if (state.success) toast.success(state.success)
    if (state.error) toast.error(state.error)
  }, [state.success, state.error])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Calculation Settings</h3>
        <p className="text-sm text-gray-500 mt-1">
          These settings affect how cluster profits are calculated.
        </p>
      </div>

      <form action={formAction} className="px-6 py-5 space-y-6">
        {/* Amazon 5% Adjustment */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <label
              htmlFor="apply_amazon_5pct_adjustment"
              className="text-sm font-medium text-gray-900 cursor-pointer"
            >
              Amazon 5% Cost Adjustment
            </label>
            <p className="text-sm text-gray-500 mt-0.5">
              When enabled, Amazon costs in cluster calculations are adjusted by
              5%: <span className="font-medium text-green-600">complete</span>{' '}
              orders +5%,{' '}
              <span className="font-medium text-red-600">refund/cancel</span>{' '}
              orders −5%. Raw transaction lists always show unadjusted values.
            </p>
          </div>

          {/* Toggle */}
          <div className="shrink-0 flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {initialSettings.apply_amazon_5pct_adjustment ? 'On' : 'Off'}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                id="apply_amazon_5pct_adjustment"
                name="apply_amazon_5pct_adjustment"
                type="checkbox"
                value="true"
                defaultChecked={initialSettings.apply_amazon_5pct_adjustment}
                className="sr-only peer"
                onChange={(e) => {
                  // Update the hidden input
                  const hidden = e.target
                    .closest('form')
                    ?.querySelector<HTMLInputElement>(
                      'input[name="apply_amazon_5pct_adjustment"][type="hidden"]'
                    )
                  if (hidden) hidden.value = e.target.checked ? 'true' : 'false'
                }}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600" />
            </label>
          </div>
        </div>

        {/* Hidden field for form value (checkbox only submits when checked) */}
        <input
          type="hidden"
          name="apply_amazon_5pct_adjustment"
          defaultValue={
            initialSettings.apply_amazon_5pct_adjustment ? 'true' : 'false'
          }
        />

        <div className="pt-2 border-t border-gray-100">
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isPending && <Loader2 size={16} className="animate-spin" />}
            Save Settings
          </button>
        </div>
      </form>

      {/* Last updated */}
      {initialSettings.updated_at && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Last updated:{' '}
            {new Date(initialSettings.updated_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      )}
    </div>
  )
}
