// EbayToolz Amazon Scraper — Content Script
// Injected on Amazon pages. Listens for SCRAPE_PAGE messages from the popup.

// ─── Page type detection ───────────────────────────────────────────────────

function getPageType() {
  const href = window.location.href
  if (
    href.includes('/gp/your-account/order-details') ||
    href.includes('/gp/css/order-details') ||
    href.includes('/order-details') ||
    /[?&]orderI[Dd]=/.test(href)
  ) {
    return 'order'
  }
  if (
    /\/dp\/[A-Z0-9]{10}/i.test(href) ||
    /\/gp\/product\/[A-Z0-9]{10}/i.test(href)
  ) {
    return 'product'
  }
  return 'other'
}

// ─── Order page scraper ────────────────────────────────────────────────────

function scrapeOrderPage() {
  const url = new URL(window.location.href)
  const result = {
    page_type: 'order',
    order_number: '',
    date: new Date().toISOString(),
    total: 0,
    cost: 0,
    type: 'complete',
    status: '',
    shipping_address: '',
    tracking_url: '',
  }

  // Order number — URL param first, then text scan
  result.order_number =
    url.searchParams.get('orderID') ||
    url.searchParams.get('orderId') ||
    ''

  if (!result.order_number) {
    const m = document.body.innerText.match(/\b(\d{3}-\d{7}-\d{7})\b/)
    if (m) result.order_number = m[1]
  }

  // Date — scan for "Month DD, YYYY" pattern anywhere on the page
  const pageText = document.body.innerText
  const dateM = pageText.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/
  )
  if (dateM) {
    try {
      result.date = new Date(dateM[0]).toISOString()
    } catch {
      // keep default
    }
  }

  // Total — look for common label patterns
  const totalM = pageText.match(
    /(?:Order Total|ORDER TOTAL|Grand Total|GRAND TOTAL)[:\s]*\$?([\d,]+\.?\d*)/i
  )
  if (totalM) {
    result.total = parseFloat(totalM[1].replace(/,/g, ''))
    result.cost = result.total
  }

  // Status — try multiple selectors
  const statusSelectors = [
    '.delivery-message',
    '[data-component="shipmentStatus"]',
    '.js-shipment-info-container .a-color-success',
    '.shipment-is-delivered .a-color-success',
    '.a-color-success',
  ]
  for (const sel of statusSelectors) {
    const el = document.querySelector(sel)
    if (el && el.textContent.trim()) {
      result.status = el.textContent.trim().replace(/\s+/g, ' ')
      if (/cancel/i.test(result.status)) result.type = 'cancel'
      else if (/refund/i.test(result.status)) result.type = 'refund'
      break
    }
  }

  // Shipping address — try multiple selectors
  const addrSelectors = [
    '.displayAddressDiv',
    '#shipToData',
    '[data-component="shippingAddress"]',
    '.ship-to-address',
    '.recipient',
  ]
  for (const sel of addrSelectors) {
    const el = document.querySelector(sel)
    if (el && el.innerText.trim()) {
      result.shipping_address = el.innerText
        .trim()
        .replace(/\n{2,}/g, '\n')
        .replace(/\n/g, ', ')
      break
    }
  }

  // Tracking URL
  const trackSelectors = [
    'a[href*="progress-tracker"]',
    'a[href*="package/ref"]',
    'a[href*="track-package"]',
  ]
  for (const sel of trackSelectors) {
    const el = document.querySelector(sel)
    if (el && el.href) {
      result.tracking_url = el.href
      break
    }
  }

  return result
}

// ─── Product page scraper ──────────────────────────────────────────────────

function scrapeProductPage() {
  const url = new URL(window.location.href)
  const m = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)
  const asin = m ? m[1].toUpperCase() : ''

  const titleEl = document.querySelector('#productTitle, .product-title-word-break')
  const title = titleEl ? titleEl.textContent.trim() : ''

  let price = 0
  const priceEl = document.querySelector('.a-price .a-offscreen')
  if (priceEl) {
    const raw = priceEl.textContent.replace(/[^0-9.]/g, '')
    price = parseFloat(raw) || 0
  }

  return {
    page_type: 'product',
    asin,
    title,
    price,
    url: url.href,
  }
}

// ─── Message handler ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'SCRAPE_PAGE') return

  const pageType = getPageType()
  if (pageType === 'order') {
    sendResponse(scrapeOrderPage())
  } else if (pageType === 'product') {
    sendResponse(scrapeProductPage())
  } else {
    sendResponse({ page_type: 'other' })
  }

  return true
})
