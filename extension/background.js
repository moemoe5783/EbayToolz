// EbayToolz Amazon Scraper — Background Service Worker
// Handles token refresh and the AUTO_SAVE flow so the content script
// doesn't need to know about credentials or the API URL.

importScripts('config.js')

// ── Token management ──────────────────────────────────────────────────────

async function getValidToken() {
  const { access_token, expires_at, refresh_token } =
    await chrome.storage.local.get(['access_token', 'expires_at', 'refresh_token'])

  if (!access_token) return null

  // Refresh if within 5 minutes of expiry
  if (expires_at && Date.now() > expires_at - 5 * 60 * 1000) {
    if (!refresh_token) return null
    const refreshed = await doRefresh(refresh_token)
    return refreshed ? refreshed.access_token : null
  }

  return access_token
}

async function doRefresh(refresh_token) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token }),
      }
    )
    if (!res.ok) {
      await chrome.storage.local.clear()
      return null
    }
    const data = await res.json()
    await chrome.storage.local.set({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      user_email: data.user?.email ?? '',
    })
    return data
  } catch {
    return null
  }
}

// ── Duplicate tracking ────────────────────────────────────────────────────

async function isAlreadySynced(orderNumber) {
  const { synced_orders = [] } = await chrome.storage.local.get(['synced_orders'])
  return synced_orders.includes(orderNumber)
}

async function markSynced(orderNumber) {
  const { synced_orders = [] } = await chrome.storage.local.get(['synced_orders'])
  if (!synced_orders.includes(orderNumber)) {
    synced_orders.push(orderNumber)
    // Keep the last 500 order numbers to avoid unbounded growth
    const trimmed = synced_orders.slice(-500)
    await chrome.storage.local.set({ synced_orders: trimmed })
  }
}

// ── API call ──────────────────────────────────────────────────────────────

async function postTransaction(token, payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    // The server returned HTML (e.g. a redirect to /login) — surface a clear error
    return {
      ok: false,
      status: res.status,
      data: { error: `Server returned HTML (${res.status}) instead of JSON. Try reloading the extension or check the API URL in config.js.` },
    }
  }

  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

// ── Message handler ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'AUTO_SAVE') {
    handleAutoSave(message.data).then(sendResponse)
    return true
  }
  if (message.type === 'REFRESH_TOKEN') {
    chrome.storage.local.get(['refresh_token']).then(({ refresh_token }) => {
      if (!refresh_token) { sendResponse({ success: false }); return }
      doRefresh(refresh_token).then((data) =>
        sendResponse(data ? { success: true, access_token: data.access_token } : { success: false })
      )
    })
    return true
  }
})

async function handleAutoSave(orderData) {
  const token = await getValidToken()
  if (!token) return { status: 'not_logged_in' }

  const orderNumber = orderData.order_number
  if (!orderNumber) return { status: 'error', error: 'No order number found on page' }

  // Skip duplicates silently-ish (toast will show "Already saved")
  if (await isAlreadySynced(orderNumber)) {
    return { status: 'duplicate' }
  }

  const payload = {
    order_number: orderNumber,
    date: orderData.date || new Date().toISOString(),
    total: orderData.total || 0,
    cost: orderData.cost || 0,
    type: orderData.type || 'complete',
    status: orderData.status || null,
    shipping_address: orderData.shipping_address || null,
    tracking_url: orderData.tracking_url || null,
    corresponding_ebay_order: null,
  }

  const { ok, status, data } = await postTransaction(token, payload)

  if (ok) {
    await markSynced(orderNumber)
    return { status: 'ok', data }
  }

  // Server already has it (409) — mark locally so we don't retry
  if (status === 409) {
    await markSynced(orderNumber)
    return { status: 'duplicate' }
  }

  return { status: 'error', error: data?.error || 'Unknown error' }
}
