/**
 * GET /api/ebay/connect
 *
 * Starts the eBay OAuth 2.0 Authorization Code flow.
 * Generates a CSRF nonce stored in an HttpOnly cookie, then redirects
 * the user to eBay's OAuth consent page.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { buildAuthorizationUrl } from '@/lib/ebay/client'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${APP_URL}/login`)
  }

  // Embed userId in state so the callback can verify it.
  // The nonce half guards against CSRF.
  const nonce = randomBytes(16).toString('hex')
  const state = `${nonce}.${user.id}`

  const cookieStore = await cookies()
  cookieStore.set('ebay_oauth_nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return NextResponse.redirect(buildAuthorizationUrl(state))
}
