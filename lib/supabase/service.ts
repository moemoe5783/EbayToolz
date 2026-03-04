/**
 * Supabase service-role client — server-side only.
 *
 * This client bypasses ALL Row Level Security (RLS) policies.
 * NEVER import this in client components or expose it to the browser.
 *
 * Use cases:
 *   - Reading/writing ebay_oauth_tokens (RLS enabled, no policies = anon/auth blocked)
 *   - Admin-level upserts that need to bypass per-user RLS
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

let _serviceClient: ReturnType<typeof createClient<Database>> | null = null

export function getServiceClient() {
  if (_serviceClient) return _serviceClient

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY env var is not set')
  }

  _serviceClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  return _serviceClient
}
