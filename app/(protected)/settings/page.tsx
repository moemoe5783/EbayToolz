import type { Metadata } from 'next'
import { getUserSettings } from '@/lib/actions/settings'
import { createClient } from '@/lib/supabase/server'
import { isEbayConnected, getEbayLastSynced } from '@/lib/ebay/tokens'
import SettingsForm from '@/components/settings/settings-form'
import EbaySettings from '@/components/settings/ebay-settings'

export const metadata: Metadata = {
  title: 'Settings — EbayToolz',
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: settings, error }, ebayConnected, ebayLastSynced] = await Promise.all([
    getUserSettings(),
    user ? isEbayConnected(user.id) : Promise.resolve(false),
    user ? getEbayLastSynced(user.id) : Promise.resolve(null),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">
          Configure your calculation preferences
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
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

        <EbaySettings isConnected={ebayConnected} lastSynced={ebayLastSynced} />
      </div>
    </div>
  )
}
