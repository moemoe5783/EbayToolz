/**
 * eBay API client — server-side only.
 *
 * Handles OAuth token exchange/refresh plus Fulfillment and Finances API calls.
 * Never import this in client components or the browser extension.
 *
 * Required environment variables:
 *   EBAY_CLIENT_ID       — from eBay developer portal
 *   EBAY_CLIENT_SECRET   — server-only, never prefix with NEXT_PUBLIC_
 *   EBAY_RUNAME          — the RuName eBay assigns when you register your redirect URL
 *                          (NOT the URL itself — find it in developer portal → User Tokens)
 *   EBAY_ENVIRONMENT     — "PRODUCTION" or "SANDBOX" (defaults to PRODUCTION)
 */

const isProduction = process.env.EBAY_ENVIRONMENT !== 'SANDBOX'
const API_BASE = isProduction ? 'https://api.ebay.com' : 'https://api.sandbox.ebay.com'
// The Sell Finances API is hosted on apiz.ebay.com (note the 'z'), a separate gateway
const APIZ_BASE = isProduction ? 'https://apiz.ebay.com' : 'https://apiz.sandbox.ebay.com'
const AUTH_BASE = isProduction ? 'https://auth.ebay.com' : 'https://auth.sandbox.ebay.com'

function clientId() {
  if (!process.env.EBAY_CLIENT_ID) throw new Error('EBAY_CLIENT_ID env var is not set')
  return process.env.EBAY_CLIENT_ID
}
function clientSecret() {
  if (!process.env.EBAY_CLIENT_SECRET) throw new Error('EBAY_CLIENT_SECRET env var is not set')
  return process.env.EBAY_CLIENT_SECRET
}
function ruName() {
  if (!process.env.EBAY_RUNAME) throw new Error('EBAY_RUNAME env var is not set')
  return process.env.EBAY_RUNAME
}

export const SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
].join(' ')

// ─── OAuth ────────────────────────────────────────────────────────────────────

export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: ruName(),
    response_type: 'code',
    scope: SCOPES,
    state,
  })
  return `${AUTH_BASE}/oauth2/authorize?${params.toString()}`
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  refresh_token_expires_in: number
  scope: string
  token_type: string
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')}`
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: ruName(),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`eBay token exchange failed (${res.status}): ${text}`)
  }
  return res.json()
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`eBay token refresh failed (${res.status}): ${text}`)
  }
  return res.json()
}

// ─── Fulfillment API — orders ─────────────────────────────────────────────────

export interface EbayOrder {
  orderId: string
  creationDate: string
  orderFulfillmentStatus: string
  pricingSummary?: { total?: { value?: string } }
  buyer?: {
    username?: string
    buyerRegistrationAddress?: { fullName?: string }
  }
  fulfillmentStartInstructions?: Array<{
    shippingStep?: {
      shipTo?: {
        fullName?: string
        contactAddress?: {
          addressLine1?: string
          addressLine2?: string
          city?: string
          stateOrProvince?: string
          postalCode?: string
          countryCode?: string
        }
      }
    }
  }>
  lineItems?: Array<{
    title?: string
    quantity?: number
    lineItemCost?: { value?: string }
    sku?: string
  }>
  cancelStatus?: { cancelState?: string }
}

export async function fetchOrders(
  accessToken: string,
  dateFrom: Date
): Promise<EbayOrder[]> {
  const orders: EbayOrder[] = []
  let offset = 0
  const limit = 50

  while (true) {
    const params = new URLSearchParams({
      filter: `creationdate:[${toEbayDate(dateFrom)}..${toEbayDate(new Date())}]`,
      limit: String(limit),
      offset: String(offset),
    })
    const res = await fetch(`${API_BASE}/sell/fulfillment/v1/order?${params}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`eBay Fulfillment API failed (${res.status}): ${text}`)
    }
    const data = await res.json()
    const batch: EbayOrder[] = data.orders ?? []
    orders.push(...batch)
    if (batch.length < limit || orders.length >= (data.total ?? 0)) break
    offset += limit
  }

  return orders
}

// ─── Finances API — payout transactions ──────────────────────────────────────

export interface EbayFinanceTransaction {
  orderId?: string
  transactionType?: string // SALE, REFUND, CREDIT, DISPUTE, etc.
  amount?: { value?: string; currency?: string }
  totalFeeAmount?: { value?: string; currency?: string }
  transactionDate?: string
}

export async function fetchFinanceTransactions(
  accessToken: string,
  dateFrom: Date
): Promise<EbayFinanceTransaction[]> {
  const txns: EbayFinanceTransaction[] = []
  let offset = 0
  const limit = 50

  while (true) {
    const params = new URLSearchParams({
      filter: `transactionDate:[${toEbayDate(dateFrom)}..${toEbayDate(new Date())}],transactionType:[SALE|REFUND]`,
      limit: String(limit),
      offset: String(offset),
    })
    const res = await fetch(`${APIZ_BASE}/sell/finances/v1/transaction?${params}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`eBay Finance API failed (${res.status}): ${text}`)
    }
    const data = await res.json()
    const batch: EbayFinanceTransaction[] = data.transactions ?? []
    txns.push(...batch)
    if (batch.length < limit || txns.length >= (data.total ?? 0)) break
    offset += limit
  }

  return txns
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Date as eBay API date string (ISO 8601 without milliseconds) */
function toEbayDate(d: Date): string {
  return d.toISOString().replace(/\.\d+Z$/, 'Z')
}

/** Build a single-line shipping address string from an eBay order */
export function formatShipAddress(order: EbayOrder): string {
  const addr = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo
  if (!addr) return ''
  const { fullName, contactAddress: c } = addr
  return [
    fullName,
    c?.addressLine1,
    c?.addressLine2,
    c?.city,
    c?.stateOrProvince,
    c?.postalCode,
    c?.countryCode,
  ]
    .filter(Boolean)
    .join(', ')
}
