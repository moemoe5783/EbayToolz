/**
 * GET /api/ebay/disconnect
 *
 * Removes the user's stored eBay OAuth tokens, effectively disconnecting
 * their eBay account from EbayToolz.  Redirects back to /settings.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { disconnectEbay } from '@/lib/ebay/tokens'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${APP_URL}/login`)
  }

  await disconnectEbay(user.id)

  return NextResponse.redirect(`${APP_URL}/settings?ebay=disconnected`)
}
