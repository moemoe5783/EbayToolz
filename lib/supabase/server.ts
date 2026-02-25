/**
 * Server-side Supabase client using @supabase/ssr.
 *
 * Creates a client that reads/writes the session from HTTP cookies,
 * which is required for SSR and Server Actions in Next.js App Router.
 *
 * IMPORTANT: This client respects RLS policies — it runs queries
 * as the authenticated user, so no manual user_id filtering is needed.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Use in Server Components, Server Actions, and Route Handlers.
 * Automatically attaches the user's session cookie so RLS applies.
 *
 * Note: We intentionally omit the <Database> generic here. Hand-written
 * Database types are brittle against @supabase/supabase-js internal type
 * changes. Type safety is enforced at the action function boundaries instead
 * (explicit return types on every server action). Run
 * `npx supabase gen types typescript` to get a fully compatible generated type.
 */
export async function createClient() {
  const cookieStore = await cookies()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServerClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll is called from a Server Component (read-only cookies).
            // This is safe to ignore — the middleware will refresh the session.
          }
        },
      },
    }
  )
}
