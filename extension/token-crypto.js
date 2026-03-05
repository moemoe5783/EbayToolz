// token-crypto.js — Secure token storage helpers
//
// access_token / expires_at / user_email  →  chrome.storage.session  (in-memory, never written to disk)
// refresh_token                           →  AES-GCM encrypted        in chrome.storage.local
//
// The AES-256-GCM key is generated once per extension install and stored in
// chrome.storage.local. It is never exported off-device. Even if a local copy
// of the profile directory is obtained, the refresh_token cannot be read
// without the key material also present in that same profile.

async function _getEncKey() {
  const { token_enc_key } = await chrome.storage.local.get('token_enc_key')
  if (token_enc_key) {
    const raw = Uint8Array.from(atob(token_enc_key), c => c.charCodeAt(0))
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const exported = await crypto.subtle.exportKey('raw', key)
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)))
  await chrome.storage.local.set({ token_enc_key: b64 })
  return key
}

async function encryptRefreshToken(plain) {
  const key = await _getEncKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain)
  )
  const combined = new Uint8Array(12 + enc.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(enc), 12)
  return btoa(String.fromCharCode(...combined))
}

async function decryptRefreshToken(b64) {
  if (!b64) return null
  try {
    const key = await _getEncKey()
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const dec = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: combined.slice(0, 12) },
      key,
      combined.slice(12)
    )
    return new TextDecoder().decode(dec)
  } catch {
    return null
  }
}

// Store a full token response from Supabase auth.
async function storeTokens({ access_token, refresh_token, expires_in, user_email }) {
  await chrome.storage.session.set({
    access_token,
    expires_at: Date.now() + expires_in * 1000,
    user_email: user_email ?? '',
  })
  const enc = await encryptRefreshToken(refresh_token)
  await chrome.storage.local.set({ enc_refresh_token: enc })
}

// Clear all auth state from both storage areas.
async function clearTokens() {
  await chrome.storage.session.remove(['access_token', 'expires_at', 'user_email'])
  await chrome.storage.local.remove('enc_refresh_token')
}
