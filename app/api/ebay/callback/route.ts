/**
 * GET /api/ebay/callback
 *
 * eBay OAuth callback handler.
 * - Verifies the CSRF nonce from the HttpOnly cookie
 * - Exchanges the authorization code for tokens server-side
 * - Stores tokens encrypted in the DB (service_role only table)
 * - Redirects to /settings with a status query param
 */
import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode } from '@/lib/ebay/client'
import { storeEbayTokens } from '@/lib/ebay/tokens'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function redirect(path: string) {
  return NextResponse.redirect(`${APP_URL}${path}`)
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  // User denied the eBay consent screen
  if (errorParam) {
    return redirect(`/settings?ebay=error&reason=${encodeURIComponent(errorParam)}`)
  }

  if (!code || !state) {
    return redirect('/settings?ebay=error&reason=missing_params')
  }

  // Verify CSRF nonce
  const cookieStore = await cookies()
  const savedNonce = cookieStore.get('ebay_oauth_nonce')?.value
  const dotIndex = state.indexOf('.')
  if (dotIndex === -1) return redirect('/settings?ebay=error&reason=invalid_state')

  const nonce = state.slice(0, dotIndex)
  const userId = state.slice(dotIndex + 1)

  if (!savedNonce || savedNonce !== nonce || !userId) {
    return redirect('/settings?ebay=error&reason=invalid_state')
  }

  // Verify the currently authenticated user matches the userId in the state param
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.id !== userId) {
    return redirect('/settings?ebay=error&reason=user_mismatch')
  }

  // Exchange the authorization code for tokens (all server-side)
  try {
    const tokens = await exchangeCode(code)
    await storeEbayTokens(userId, tokens)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[eBay OAuth] Token exchange error:', msg)
    return redirect(`/settings?ebay=error&reason=${encodeURIComponent(msg)}`)
  }

  // Clean up the nonce cookie
  cookieStore.delete('ebay_oauth_nonce')

  return redirect('/settings?ebay=connected')
}
