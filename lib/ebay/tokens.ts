/**
 * eBay OAuth token storage — server-side only.
 *
 * Tokens are AES-256-GCM encrypted before being stored.
 * All reads/writes use the service_role client, which bypasses RLS.
 * The ebay_oauth_tokens table has RLS enabled with NO policies,
 * so browser-level (anon/authenticated) Supabase clients cannot access it.
 */
import { getServiceClient } from '@/lib/supabase/service'
import { encrypt, decrypt } from '@/lib/ebay/crypto'
import { refreshAccessToken, type TokenResponse } from '@/lib/ebay/client'

interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  refreshTokenExpiresAt: Date | null
  scope: string | null
  ebayUserId: string | null
  lastSyncedAt: Date | null
}

export async function storeEbayTokens(
  userId: string,
  tokens: TokenResponse & { ebay_user_id?: string }
): Promise<void> {
  const db = getServiceClient()
  const now = Date.now()

  await db.from('ebay_oauth_tokens').upsert(
    {
      user_id: userId,
      access_token: encrypt(tokens.access_token),
      refresh_token: encrypt(tokens.refresh_token),
      expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
      refresh_token_expires_at: tokens.refresh_token_expires_in
        ? new Date(now + tokens.refresh_token_expires_in * 1000).toISOString()
        : null,
      scope: tokens.scope ?? null,
      ebay_user_id: tokens.ebay_user_id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
}

export async function getEbayTokens(userId: string): Promise<StoredTokens | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('ebay_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!data) return null

  return {
    accessToken: decrypt(data.access_token),
    refreshToken: decrypt(data.refresh_token),
    expiresAt: new Date(data.expires_at),
    refreshTokenExpiresAt: data.refresh_token_expires_at
      ? new Date(data.refresh_token_expires_at)
      : null,
    scope: data.scope,
    ebayUserId: data.ebay_user_id,
    lastSyncedAt: data.last_synced_at ? new Date(data.last_synced_at) : null,
  }
}

/**
 * Returns a valid access token for the user, automatically refreshing if needed.
 * Returns null if the user hasn't connected eBay or the refresh token has expired.
 */
export async function getValidEbayAccessToken(userId: string): Promise<string | null> {
  const tokens = await getEbayTokens(userId)
  if (!tokens) return null

  // Still valid with a 5-minute buffer
  if (tokens.expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return tokens.accessToken
  }

  // Check the refresh token hasn't also expired
  if (
    tokens.refreshTokenExpiresAt &&
    tokens.refreshTokenExpiresAt.getTime() < Date.now()
  ) {
    return null // User must reconnect
  }

  // Attempt refresh
  try {
    const refreshed = await refreshAccessToken(tokens.refreshToken)
    await storeEbayTokens(userId, refreshed)
    return refreshed.access_token
  } catch {
    return null
  }
}

export async function isEbayConnected(userId: string): Promise<boolean> {
  const db = getServiceClient()
  const { data } = await db
    .from('ebay_oauth_tokens')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

export async function getEbayLastSynced(userId: string): Promise<Date | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('ebay_oauth_tokens')
    .select('last_synced_at')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.last_synced_at ? new Date(data.last_synced_at) : null
}

export async function updateLastSynced(userId: string): Promise<void> {
  const db = getServiceClient()
  await db
    .from('ebay_oauth_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
}

export async function disconnectEbay(userId: string): Promise<void> {
  const db = getServiceClient()
  await db.from('ebay_oauth_tokens').delete().eq('user_id', userId)
}
