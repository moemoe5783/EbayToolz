/**
 * Browser-side Supabase client using @supabase/ssr.
 *
 * Use in Client Components ('use client') for real-time subscriptions,
 * auth state listeners, or any client-side data fetching.
 *
 * The client automatically stores the session in cookies so it's
 * accessible server-side on subsequent requests.
 */
'use client'

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createBrowserClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
