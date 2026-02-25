// EbayToolz Amazon Scraper — Background Service Worker
// Handles Supabase token refresh on behalf of the popup.

importScripts('config.js')

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'REFRESH_TOKEN') {
    refreshToken().then(sendResponse)
    return true // keep channel open for async response
  }
})

async function refreshToken() {
  const { refresh_token } = await chrome.storage.local.get(['refresh_token'])
  if (!refresh_token) return { success: false }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token }),
      }
    )

    if (!res.ok) {
      await chrome.storage.local.clear()
      return { success: false }
    }

    const data = await res.json()
    await chrome.storage.local.set({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      user_email: data.user?.email ?? '',
    })

    return { success: true, access_token: data.access_token }
  } catch {
    return { success: false }
  }
}
