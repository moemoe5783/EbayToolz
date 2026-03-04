/**
 * GET /api/cron/sync-ebay
 *
 * Vercel Cron job — runs hourly to sync the last 90 days of eBay orders
 * for every user who has connected their eBay account.
 *
 * Secured via the CRON_SECRET env var, which Vercel automatically injects
 * as an Authorization: Bearer header on every cron invocation.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { syncEbayOrdersForUser } from '@/lib/actions/ebay-sync'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()
  const { data: tokens, error } = await db
    .from('ebay_oauth_tokens')
    .select('user_id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const userIds = (tokens ?? []).map((t) => (t as { user_id: string }).user_id)

  let totalSynced = 0
  const errors: string[] = []

  for (const userId of userIds) {
    const result = await syncEbayOrdersForUser(userId)
    if (result.ok) {
      totalSynced += result.synced ?? 0
    } else {
      errors.push(`${userId}: ${result.error}`)
    }
  }

  return NextResponse.json({
    users: userIds.length,
    synced: totalSynced,
    ...(errors.length ? { errors } : {}),
  })
}
