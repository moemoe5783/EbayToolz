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

// Fetch the existing DB row for an order (to check current type)
async function fetchOrderFromDB(token, orderNumber) {
  const userId = getUserIdFromJWT(token)
  const url =
    `${SUPABASE_URL}/rest/v1/amazon_transactions` +
    `?order_number=eq.${encodeURIComponent(orderNumber)}&user_id=eq.${userId}&select=type,cost,status&limit=1`
  try {
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) && data.length > 0 ? data[0] : null
  } catch {
    return null
  }
}

// ── Message handler ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'AUTO_SAVE') {
    handleAutoSave(message.data).then(sendResponse)
    return true
  }
  if (message.type === 'EBAY_AUTO_SAVE') {
    handleEbayAutoSave(message.data).then(sendResponse)
    return true
  }
  if (message.type === 'ORDERS_LIST_SCAN') {
    handleOrdersListScan(message.data).then(sendResponse)
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

  // ── Refund path ──────────────────────────────────────────────────────────
  // Refunds update the EXISTING order row (same order number) rather than
  // creating a separate record. The cost is set to the net out-of-pocket
  // amount after the refund: 0 for a full refund, or originalCost minus the
  // refund amount for a partial refund.
  if (currentType === 'refund') {
    if (await isAlreadySynced(orderNumber) && (await getStoredType(orderNumber)) === 'refund') {
      return { status: 'duplicate' }
    }

    // Fetch original cost so we can calculate net cost for partial refunds.
    const existing = await fetchOrderFromDB(token, orderNumber)
    const originalCost = existing?.cost ?? 0

    // refundAmount is the money returned to the customer.
    // If the content script captured an explicit refund figure use it;
    // otherwise assume a full refund (cost → 0).
    const refundAmount = orderData.total || orderData.cost || originalCost
    const netCost = Math.max(0, originalCost - refundAmount)

    if (existing) {
      // Update the existing row
      const { ok, data } = await patchTransaction(token, orderNumber, {
        type: 'refund',
        cost: netCost,
        status: orderData.status || existing.status || null,
      })
      if (ok) {
        await markSynced(orderNumber, 'refund')
        return { status: 'refund_saved', data }
      }
      return { status: 'error', error: data?.message || 'Failed to update order' }
    }

    // No existing row — insert it fresh as a refunded order.
    const refundPayload = {
      order_number: orderNumber,
      date: orderData.date || new Date().toISOString(),
      total: orderData.total || 0,
      cost: netCost,
      type: 'refund',
      status: orderData.status || null,
      shipping_address: orderData.shipping_address || null,
      tracking_url: orderData.tracking_url || null,
      used_amazon_visa: orderData.used_amazon_visa ?? false,
      items_json: orderData.items_json || [],
      corresponding_ebay_order: null,
    }
    const { ok, status, data } = await postTransaction(token, refundPayload)
    if (ok) {
      await markSynced(orderNumber, 'refund')
      return { status: 'refund_saved', data }
    }
    if (status === 409) {
      await markSynced(orderNumber, 'refund')
      return { status: 'duplicate' }
    }
    return { status: 'error', error: data?.error || 'Unknown error' }
  }

  // ── Already-synced path (cancel upgrade or skip) ─────────────────────────
  if (await isAlreadySynced(orderNumber)) {
    if (currentType === 'cancel' && (await getStoredType(orderNumber)) !== 'cancel') {
      const { ok, data } = await patchTransaction(token, orderNumber, {
        status: orderData.status || null,
        type: 'cancel',
        cost: 0,
      })
      if (ok) {
        await markSynced(orderNumber, 'cancel')
        return { status: 'updated', detail: 'Marked as canceled, cost reset to $0' }
      }
      return { status: 'error', error: data?.message || 'Failed to update order' }
    }
    return { status: 'duplicate' }
  }

  // ── New order path ────────────────────────────────────────────────────────
  const payload = {
    order_number: orderNumber,
    date: orderData.date || new Date().toISOString(),
    total: orderData.total || 0,
    cost: orderData.cost || 0,
    type: currentType,
    status: orderData.status || null,
    shipping_address: orderData.shipping_address || null,
    tracking_url: orderData.tracking_url || null,
    used_amazon_visa: orderData.used_amazon_visa ?? false,
    items_json: orderData.items_json || [],
    corresponding_ebay_order: null,
  }

  const { ok, status, data } = await postTransaction(token, payload)

  if (ok) {
    await markSynced(orderNumber, currentType)
    return { status: 'ok', data }
  }

  // 409 — server already has it
  if (status === 409) {
    await markSynced(orderNumber, currentType)
    return { status: 'duplicate' }
  }

  return { status: 'error', error: data?.error || 'Unknown error' }
}

// ── Orders list page — batch cancel scan ─────────────────────────────────
// Called when the user visits their Amazon orders list page.
// Finds any orders marked "Cancelled" and updates them in the DB.

async function handleOrdersListScan({ canceled = [] }) {
  const token = await getValidToken()
  if (!token) return { status: 'not_logged_in', updated: 0 }
  if (canceled.length === 0) return { status: 'ok', updated: 0 }

  let updated = 0

  for (const orderNumber of canceled) {
    // Skip if already stored as cancel
    const storedType = await getStoredType(orderNumber)
    if (storedType === 'cancel') continue

    // Check DB — the order may exist as 'complete' and need upgrading
    const existing = await fetchOrderFromDB(token, orderNumber)
    if (!existing) continue   // Not in our DB at all — can't update
    if (existing.type === 'cancel') {
      await markSynced(orderNumber, 'cancel')
      continue
    }

    const { ok } = await patchTransaction(token, orderNumber, {
      type: 'cancel',
      cost: 0,
      status: 'Cancelled',
    })

    if (ok) {
      await markSynced(orderNumber, 'cancel')
      updated++
    }
  }

  return { status: 'ok', updated }
}

// ── eBay order syncing ─────────────────────────────────────────────────────
// Mirrors the Amazon flow, posting directly to Supabase REST for ebay_transactions.

async function supabaseEbayRequest(token, method, path, body) {
  const url = `${SUPABASE_URL}/rest/v1/ebay_transactions${path}`
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

async function postEbayTransaction(token, payload) {
  const userId = getUserIdFromJWT(token)
  return supabaseEbayRequest(token, 'POST', '', { ...payload, user_id: userId })
}

// eBay orders use the same synced_orders cache with an 'ebay:' prefix
// so they never collide with Amazon order numbers.
const EBAY_PREFIX = 'ebay:'

async function isAlreadySyncedEbay(orderNumber) {
  return isAlreadySynced(EBAY_PREFIX + orderNumber)
}

async function markSyncedEbay(orderNumber, type = 'sale') {
  return markSynced(EBAY_PREFIX + orderNumber, type)
}

async function handleEbayAutoSave(orderData) {
  const token = await getValidToken()
  if (!token) return { status: 'not_logged_in' }

  const orderNumber = orderData.order_number
  if (!orderNumber) return { status: 'error', error: 'No order number found on page' }

  const currentType = orderData.type === 'refund' ? 'refund' : 'sale'

  if (await isAlreadySyncedEbay(orderNumber)) {
    return { status: 'duplicate' }
  }

  const payload = {
    order_number: orderNumber,
    date: orderData.date || new Date().toISOString(),
    total: orderData.total || 0,
    net: orderData.net || null,
    type: currentType,
    status: orderData.status || null,
    buyer: orderData.buyer || null,
    shipping_address: orderData.shipping_address || null,
    transactions_json: orderData.transactions_json || [],
    corresponding_amazon_order: null,
  }

  const { ok, status, data } = await postEbayTransaction(token, payload)

  if (ok) {
    await markSyncedEbay(orderNumber, currentType)
    return { status: 'ok', data }
  }

  if (status === 409) {
    await markSyncedEbay(orderNumber, currentType)
    return { status: 'duplicate' }
  }

  return { status: 'error', error: data?.error || 'Unknown error' }
}
