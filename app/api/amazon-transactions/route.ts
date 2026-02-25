import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// ─── CORS headers for browser extension requests ───────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// ─── Validation ────────────────────────────────────────────────────────────

const schema = z.object({
  order_number: z.string().min(1, 'Order number is required'),
  date: z.string().datetime().optional().nullable(),
  total: z.coerce.number().optional().nullable(),
  cost: z.coerce.number().optional().nullable(),
  type: z.enum(['complete', 'refund', 'cancel']),
  status: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  tracking_url: z.string().url().optional().nullable().or(z.literal('')),
  corresponding_ebay_order: z.string().optional().nullable(),
})

// ─── POST /api/amazon-transactions ────────────────────────────────────────
// Called by the browser extension with a Supabase Bearer token.

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')

  if (!token) {
    return NextResponse.json(
      { error: 'Missing Authorization header' },
      { status: 401, headers: CORS }
    )
  }

  // Validate the token by resolving the user
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const {
    data: { user },
    error: authError,
  } = await adminClient.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401, headers: CORS }
    )
  }

  // Parse and validate request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS }
    )
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 422, headers: CORS }
    )
  }

  // Use a client scoped to the user's JWT so RLS applies
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data, error } = await userClient
    .from('amazon_transactions')
    .insert({
      ...parsed.data,
      user_id: user.id,
      tracking_url: parsed.data.tracking_url || null,
      corresponding_ebay_order: parsed.data.corresponding_ebay_order || null,
    })
    .select()
    .single()

  if (error) {
    const isDuplicate = error.code === '23505'
    return NextResponse.json(
      {
        error: isDuplicate
          ? 'An Amazon transaction with this order number already exists.'
          : error.message,
      },
      { status: isDuplicate ? 409 : 500, headers: CORS }
    )
  }

  return NextResponse.json(data, { status: 201, headers: CORS })
}
