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

// ── Duplicate / type tracking ─────────────────────────────────────────────
// synced_orders        — array of order numbers we've ever saved
// synced_orders_type   — { [orderNumber]: 'complete' | 'cancel' | 'refund' }

async function isAlreadySynced(orderNumber) {
  const { synced_orders = [] } = await chrome.storage.local.get(['synced_orders'])
  return synced_orders.includes(orderNumber)
}

async function getStoredType(orderNumber) {
  const { synced_orders_type = {} } = await chrome.storage.local.get(['synced_orders_type'])
  return synced_orders_type[orderNumber] || null
}

async function markSynced(orderNumber, type = 'complete') {
  const { synced_orders = [], synced_orders_type = {} } =
    await chrome.storage.local.get(['synced_orders', 'synced_orders_type'])
  if (!synced_orders.includes(orderNumber)) {
    synced_orders.push(orderNumber)
  }
  synced_orders_type[orderNumber] = type
  await chrome.storage.local.set({
    synced_orders: synced_orders.slice(-500),
    synced_orders_type,
  })
}

// ── Supabase REST API — no Next.js middleware involved ────────────────────

// Decode the `sub` claim from the JWT to get the Supabase user ID.
function getUserIdFromJWT(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64)).sub || null
  } catch {
    return null
  }
}

async function supabaseRequest(token, method, path, body) {
  const userId = getUserIdFromJWT(token)
  const url = `${SUPABASE_URL}/rest/v1/amazon_transactions${path.replace('{uid}', userId)}`
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    return { ok: false, status: res.status, data: { error: `Unexpected response (${res.status})` } }
  }
  const data = await res.json()
  return { ok: res.ok, status: res.status, data: Array.isArray(data) ? data[0] : data }
}

async function postTransaction(token, payload) {
  const userId = getUserIdFromJWT(token)
  return supabaseRequest(token, 'POST', '', { ...payload, user_id: userId })
}

async function patchTransaction(token, orderNumber, fields) {
  const userId = getUserIdFromJWT(token)
  const qs = `?order_number=eq.${encodeURIComponent(orderNumber)}&user_id=eq.${userId}`
  return supabaseRequest(token, 'PATCH', qs, fields)
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

  const currentType = orderData.type || 'complete'

  if (await isAlreadySynced(orderNumber)) {
    // If the order is now canceled but was saved as something else, update the DB row
    if (currentType === 'cancel' && (await getStoredType(orderNumber)) !== 'cancel') {
      const { ok, data } = await patchTransaction(token, orderNumber, {
        status: orderData.status || null,
        type: 'cancel',
        cost: 0,
      })
      if (ok) {
        await markSynced(orderNumber, 'cancel')
        return { status: 'updated' }
      }
      return { status: 'error', error: data?.message || 'Failed to update order' }
    }
    return { status: 'duplicate' }
  }

  const payload = {
    order_number: orderNumber,
    date: orderData.date || new Date().toISOString(),
    total: orderData.total || 0,
    cost: orderData.cost || 0,
    type: currentType,
    status: orderData.status || null,
    shipping_address: orderData.shipping_address || null,
    tracking_url: orderData.tracking_url || null,
    corresponding_ebay_order: null,
  }

  const { ok, status, data } = await postTransaction(token, payload)

  if (ok) {
    await markSynced(orderNumber, currentType)
    return { status: 'ok', data }
  }

  // Server already has it (409) — mark locally so we don't retry
  if (status === 409) {
    await markSynced(orderNumber, currentType)
    return { status: 'duplicate' }
  }

  return { status: 'error', error: data?.error || 'Unknown error' }
}
