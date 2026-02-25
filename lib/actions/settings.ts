'use server'

/**
 * Server Actions for User Settings.
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { UserSettings } from '@/lib/types/database'

// ─── Validation schemas ───────────────────────────────────────────────────────

const settingsSchema = z.object({
  apply_amazon_5pct_adjustment: z.coerce.boolean(),
})

export type SettingsState = {
  error?: string
  success?: string
  data?: UserSettings
}

// ─── Fetch settings ───────────────────────────────────────────────────────────

export async function getUserSettings(): Promise<{
  data: UserSettings | null
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { data: null, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) {
    // If no row exists yet, return defaults (the DB trigger should have created it)
    if (error.code === 'PGRST116') {
      return {
        data: {
          user_id: user.id,
          apply_amazon_5pct_adjustment: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }
    }
    return { data: null, error: error.message }
  }

  return { data }
}

// ─── Upsert settings ──────────────────────────────────────────────────────────

export async function updateUserSettings(
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const rawData = {
    apply_amazon_5pct_adjustment:
      formData.get('apply_amazon_5pct_adjustment') === 'true',
  }

  const parsed = settingsSchema.safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: user.id,
      ...parsed.data,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/clusters')

  return { success: 'Settings saved.', data }
}
