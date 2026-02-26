// EbayToolz Amazon Scraper — Popup Script
// config.js is loaded first via <script src="config.js"> in popup.html.
// SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL, API_URL are therefore available.

// ─── Helpers ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id)

function showState(name) {
  const ids = ['loading', 'login', 'not-amazon', 'order', 'product', 'ebay-order', 'success']
  ids.forEach((id) => {
    const el = $(`state-${id}`)
    if (el) el.classList.toggle('hidden', id !== name)
  })
}

function showError(elId, msg) {
  const el = $(elId)
  if (!el) return
  el.textContent = msg
  el.classList.remove('hidden')
}

function hideError(elId) {
  const el = $(elId)
  if (el) el.classList.add('hidden')
}

function setLoading(btn, loading, label = 'Save to EbayToolz') {
  btn.disabled = loading
  btn.textContent = loading ? 'Saving…' : label
}

// ─── Auth helpers ──────────────────────────────────────────────────────────

async function getValidToken() {
  const stored = await chrome.storage.local.get(['access_token', 'expires_at'])
  if (!stored.access_token) return null

  // Refresh if within 5 minutes of expiry
  if (stored.expires_at && Date.now() > stored.expires_at - 5 * 60 * 1000) {
    const result = await chrome.runtime.sendMessage({ type: 'REFRESH_TOKEN' })
    if (!result?.success) {
      await chrome.storage.local.clear()
      return null
    }
    return result.access_token
  }

  return stored.access_token
}

async function signIn(email, password) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    }
  )

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || 'Sign-in failed')
  }

  await chrome.storage.local.set({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    user_email: data.user?.email ?? email,
  })

  return data
}

async function signOut() {
  const token = await getValidToken()
  if (token) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    }).catch(() => {})
  }
  await chrome.storage.local.clear()
  showState('login')
}

// ─── Scraping ──────────────────────────────────────────────────────────────

async function scrapeCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url?.match(/amazon\.(com|co\.uk|ca)/)) return null

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PAGE' })
    return response
  } catch {
    // Content script not yet injected (extension just installed, or page loaded before install)
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    return await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PAGE' })
  }
}

// ─── UI population ─────────────────────────────────────────────────────────

function isoToDateInput(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function populateOrderForm(data) {
  $('order_number').value = data.order_number || ''
  $('date').value = isoToDateInput(data.date)
  $('total').value = data.total > 0 ? data.total.toFixed(2) : ''
  $('cost').value = data.cost > 0 ? data.cost.toFixed(2) : ''
  $('type').value = data.type || 'complete'
  $('status').value = data.status || ''
  $('shipping_address').value = data.shipping_address || ''
  $('tracking_url').value = data.tracking_url || ''
  $('ebay_order').value = ''
}

function populateProductInfo(data) {
  $('product-asin').textContent = data.asin || '—'
  $('product-title').textContent = data.title || '—'
  $('product-price').textContent = data.price > 0 ? `$${data.price.toFixed(2)}` : '—'
}

// ─── Supabase REST helper ──────────────────────────────────────────────────

function getUserIdFromJWT(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64)).sub || null
  } catch {
    return null
  }
}

// ─── Save transaction ──────────────────────────────────────────────────────

async function saveTransaction(token) {
  const trackingVal = $('tracking_url').value.trim()
  const ebayVal = $('ebay_order').value.trim()
  const dateVal = $('date').value
  const orderNumber = $('order_number').value.trim()

  if (!orderNumber) throw new Error('Order number is required.')

  const payload = {
    user_id: getUserIdFromJWT(token),
    order_number: orderNumber,
    date: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
    total: parseFloat($('total').value) || 0,
    cost: parseFloat($('cost').value) || 0,
    type: $('type').value,
    status: $('status').value.trim() || null,
    shipping_address: $('shipping_address').value.trim() || null,
    tracking_url: trackingVal || null,
    corresponding_ebay_order: ebayVal || null,
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/amazon_transactions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  if (!res.ok) {
    const isDupe = res.status === 409 || data?.code === '23505'
    throw new Error(isDupe ? 'This order number already exists.' : (data?.message || 'Failed to save transaction.'))
  }

  return Array.isArray(data) ? data[0] : data
}

// ─── Sign-out wiring ───────────────────────────────────────────────────────

function wireSignOutButtons() {
  ;['na', 'order', 'product', 'ebay'].forEach((suffix) => {
    const btn = $(`signout-btn-${suffix}`)
    if (btn) btn.addEventListener('click', signOut)
  })
}

function setUserEmail(email) {
  ;['na', 'order', 'product', 'ebay'].forEach((suffix) => {
    const el = $(`user-email-${suffix}`)
    if (el) el.textContent = email
  })
}

// ─── eBay helpers ──────────────────────────────────────────────────────────

async function scrapeEbayCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url?.match(/ebay\.(com|co\.uk|com\.au|ca|de)/)) return null

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_EBAY_PAGE' })
    return response
  } catch {
    // Content script not yet injected — inject and retry
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['ebay-content.js'] })
    return await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_EBAY_PAGE' })
  }
}

function populateEbayOrderForm(data) {
  $('ebay-order-number').value = data.order_number || ''
  $('ebay-date').value = isoToDateInput(data.date)
  $('ebay-total').value = data.total > 0 ? data.total.toFixed(2) : ''
  $('ebay-net').value = data.net > 0 ? data.net.toFixed(2) : ''
  $('ebay-type').value = data.type || 'sale'
  $('ebay-status').value = data.status || ''
  $('ebay-buyer').value = data.buyer || ''
  $('ebay-shipping').value = data.shipping_address || ''
  $('ebay-amazon-order').value = ''
}

async function saveEbayTransaction(token) {
  const orderNumber = $('ebay-order-number').value.trim()
  if (!orderNumber) throw new Error('Order number is required.')

  const dateVal = $('ebay-date').value
  const netVal = parseFloat($('ebay-net').value)

  const payload = {
    user_id: getUserIdFromJWT(token),
    order_number: orderNumber,
    date: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
    total: parseFloat($('ebay-total').value) || 0,
    net: isNaN(netVal) || netVal === 0 ? null : netVal,
    type: $('ebay-type').value,
    status: $('ebay-status').value.trim() || null,
    buyer: $('ebay-buyer').value.trim() || null,
    shipping_address: $('ebay-shipping').value.trim() || null,
    corresponding_amazon_order: $('ebay-amazon-order').value.trim() || null,
    transactions_json: [],
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/ebay_transactions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  if (!res.ok) {
    const isDupe = res.status === 409 || data?.code === '23505'
    throw new Error(isDupe ? 'This order number already exists.' : (data?.message || 'Failed to save transaction.'))
  }

  return Array.isArray(data) ? data[0] : data
}

// ─── Boot ──────────────────────────────────────────────────────────────────

async function boot() {
  showState('loading')
  wireSignOutButtons()

  // Set up "Open EbayToolz" links
  $('open-app-link').href = APP_URL
  $('view-link').href = `${APP_URL}/transactions`

  // Copy ASIN button
  $('copy-asin-btn').addEventListener('click', () => {
    const asin = $('product-asin').textContent
    if (asin && asin !== '—') navigator.clipboard.writeText(asin)
  })

  // Back button (success → order form or eBay form depending on what was saved)
  $('back-btn').addEventListener('click', () => {
    const lastPlatform = window._lastSavedPlatform || 'amazon'
    showState(lastPlatform === 'ebay' ? 'ebay-order' : 'order')
  })

  // Login form
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    hideError('login-error')
    const btn = $('login-btn')
    btn.disabled = true
    btn.textContent = 'Signing in…'

    try {
      await signIn($('email').value.trim(), $('password').value)
      await loadMain()
    } catch (err) {
      showError('login-error', err.message)
    } finally {
      btn.disabled = false
      btn.textContent = 'Sign In'
    }
  })

  // Amazon order save form
  $('order-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    hideError('order-error')
    const btn = $('save-btn')
    setLoading(btn, true)

    try {
      const token = await getValidToken()
      if (!token) { signOut(); return }
      await saveTransaction(token)
      window._lastSavedPlatform = 'amazon'
      $('success-msg').textContent = 'Your Amazon order has been added to EbayToolz.'
      showState('success')
    } catch (err) {
      showError('order-error', err.message)
    } finally {
      setLoading(btn, false)
    }
  })

  // eBay order save form
  $('ebay-order-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    hideError('ebay-order-error')
    const btn = $('ebay-save-btn')
    setLoading(btn, true, 'Save to EbayToolz')

    try {
      const token = await getValidToken()
      if (!token) { signOut(); return }
      await saveEbayTransaction(token)
      window._lastSavedPlatform = 'ebay'
      $('success-msg').textContent = 'Your eBay order has been added to EbayToolz.'
      showState('success')
    } catch (err) {
      showError('ebay-order-error', err.message)
    } finally {
      setLoading(btn, false)
    }
  })

  // Check auth
  const token = await getValidToken()
  if (!token) {
    showState('login')
    return
  }

  await loadMain()
}

async function loadMain() {
  showState('loading')

  const stored = await chrome.storage.local.get(['user_email'])
  setUserEmail(stored.user_email || '')

  // Try Amazon first
  let scraped = null
  try {
    scraped = await scrapeCurrentTab()
  } catch {
    scraped = null
  }

  if (scraped && scraped.page_type === 'order') {
    populateOrderForm(scraped)
    showState('order')
    return
  }
  if (scraped && scraped.page_type === 'product') {
    populateProductInfo(scraped)
    showState('product')
    return
  }

  // Try eBay
  let ebayScraped = null
  try {
    ebayScraped = await scrapeEbayCurrentTab()
  } catch {
    ebayScraped = null
  }

  if (ebayScraped && ebayScraped.page_type === 'order') {
    populateEbayOrderForm(ebayScraped)
    showState('ebay-order')
    return
  }

  showState('not-amazon')
}

document.addEventListener('DOMContentLoaded', boot)
