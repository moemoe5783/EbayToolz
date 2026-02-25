import type { Metadata } from 'next'
import { getUserSettings } from '@/lib/actions/settings'
import SettingsForm from '@/components/settings/settings-form'

export const metadata: Metadata = {
  title: 'Settings — EbayToolz',
}

export default async function SettingsPage() {
  const { data: settings, error } = await getUserSettings()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">
          Configure your dropshipping calculation preferences
        </p>
      </div>

      <div className="max-w-2xl">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            Failed to load settings: {error}
          </div>
        )}

        <SettingsForm
          initialSettings={
            settings ?? {
              user_id: '',
              apply_amazon_5pct_adjustment: true,
              created_at: '',
              updated_at: '',
            }
          }
        />
      </div>
    </div>
  )
}
