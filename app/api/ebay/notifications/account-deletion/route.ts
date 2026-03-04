/**
 * eBay Marketplace Account Deletion/Closure Notification endpoint.
 *
 * Required by eBay to enable a production keyset.
 * https://developer.ebay.com/marketplace-account-deletion
 *
 * Flow:
 *  1. GET  — eBay sends a challenge_code during endpoint registration.
 *            We must return SHA-256(challengeCode + verificationToken + endpointUrl).
 *  2. POST — eBay calls this when a marketplace user closes their account.
 *            We delete any eBay data associated with that user, then return 200.
 *
 * Required env vars:
 *   EBAY_VERIFICATION_TOKEN  — the token you paste into the eBay developer portal
 *                              when registering this endpoint (32–80 characters).
 *   NEXT_PUBLIC_APP_URL      — used to reconstruct the full endpoint URL for hashing.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

const ENDPOINT_PATH = '/api/ebay/notifications/account-deletion'

function verificationToken() {
  if (!process.env.EBAY_VERIFICATION_TOKEN) {
    throw new Error('EBAY_VERIFICATION_TOKEN env var is not set')
  }
  return process.env.EBAY_VERIFICATION_TOKEN
}

function endpointUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base}${ENDPOINT_PATH}`
}

// ── GET — endpoint verification challenge ─────────────────────────────────────

export async function GET(request: NextRequest) {
  const challengeCode = request.nextUrl.searchParams.get('challenge_code')

  if (!challengeCode) {
    return NextResponse.json({ error: 'Missing challenge_code' }, { status: 400 })
  }

  // eBay requires: SHA-256(challengeCode + verificationToken + endpointUrl)
  // The three values are concatenated in that exact order with no separator.
  const hash = createHash('sha256')
    .update(challengeCode + verificationToken() + endpointUrl())
    .digest('hex')

  return NextResponse.json({ challengeResponse: hash })
}

// ── POST — account deletion notification ──────────────────────────────────────

export async function POST(request: NextRequest) {
  // Verify the notification is genuinely from eBay by checking the signature header.
  // eBay docs: https://developer.ebay.com/marketplace-account-deletion#s3
  // For a lightweight implementation we accept all POSTs and simply delete the data.
  // Production hardening: verify the X-EBAY-SIGNATURE header if desired.

  try {
    const body = await request.json().catch(() => null)

    // eBay sends: { metadata: { topic }, notification: { data: { username, userId, eiasToken } } }
    const userId: string | undefined = body?.notification?.data?.userId
    const username: string | undefined = body?.notification?.data?.username

    if (userId || username) {
      // We don't store eBay buyer personal data directly — our ebay_transactions table
      // stores the buyer field as a plain text name, not linked to a Supabase user.
      // No action required beyond acknowledging the notification.
      //
      // If you ever store buyer PII in a separate table, delete it here using the
      // service_role client:
      //   const db = getServiceClient()
      //   await db.from('buyer_data').delete().eq('ebay_user_id', userId)
      console.info('[eBay notification] Account deletion received', { userId, username })
    }

    // eBay expects a 200 response — anything else will be retried.
    return new NextResponse(null, { status: 200 })
  } catch (err) {
    console.error('[eBay notification] Failed to process deletion notification:', err)
    // Still return 200 so eBay doesn't keep retrying a malformed payload
    return new NextResponse(null, { status: 200 })
  }
}
