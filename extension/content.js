// EbayToolz Amazon Scraper — Content Script
// Auto-detects Amazon order pages, scrapes data, and sends it to EbayToolz
// without any manual interaction. Shows a small toast on the page with the result.

;(function () {
  'use strict'

  // ── Page type ─────────────────────────────────────────────────────────────

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
      href.includes('/gp/your-account/order-history') ||
      href.includes('/your-orders/orders') ||
      href.includes('/order-history')
    ) {
      return 'orders_list'
    }
    if (
      /\/dp\/[A-Z0-9]{10}/i.test(href) ||
      /\/gp\/product\/[A-Z0-9]{10}/i.test(href)
    ) {
      return 'product'
    }
    return 'other'
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function parsePrice(text) {
    const m = text.replace(/,/g, '').match(/[\d]+\.?\d*/)
    return m ? parseFloat(m[0]) : 0
  }

  // ── Scraping ──────────────────────────────────────────────────────────────

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
      used_amazon_visa: false,
      items_json: [],
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

    const pageText = document.body.innerText

    // Date
    const dateM = pageText.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/
    )
    if (dateM) {
      try { result.date = new Date(dateM[0]).toISOString() } catch {}
    }

    // Status — check several known selectors
    for (const sel of [
      '.delivery-message',
      '[data-component="shipmentStatus"]',
      '.js-shipment-info-container .a-color-success',
      '.shipment-is-delivered .a-color-success',
      '.a-color-success',
      '[class*="shipment-status"]',
      '.order-status',
    ]) {
      const el = document.querySelector(sel)
      if (el && el.textContent.trim()) {
        result.status = el.textContent.trim().replace(/\s+/g, ' ')
        if (/cancel/i.test(result.status)) result.type = 'cancel'
        else if (/refund/i.test(result.status)) result.type = 'refund'
        break
      }
    }

    // Also scan page-level text for refund/cancel if no status element found
    if (result.type === 'complete') {
      if (/your\s+order\s+(has\s+been\s+)?cancel/i.test(pageText)) {
        result.type = 'cancel'
      } else if (/refund\s+(of|has\s+been)/i.test(pageText)) {
        result.type = 'refund'
      }
    }

    // Total — for refunds, try to capture the refund amount first
    if (result.type === 'refund') {
      // Look for explicit refund amount patterns
      const refundPatterns = [
        /(?:Refund Total|Refund Amount|Total Refund)[:\s]*\$?([\d,]+\.?\d*)/i,
        /A refund of \$?([\d,]+\.?\d*)/i,
        /refund of \$?([\d,]+\.?\d*) (?:was|has been)/i,
        /\$?([\d,]+\.?\d*) (?:refund|was refunded)/i,
      ]
      for (const re of refundPatterns) {
        const m = pageText.match(re)
        if (m) {
          result.total = parseFloat(m[1].replace(/,/g, ''))
          result.cost = result.total
          break
        }
      }
    }

    // Fallback / normal order total
    if (result.total === 0) {
      const totalM = pageText.match(
        /(?:Order Total|ORDER TOTAL|Grand Total|GRAND TOTAL)[:\s]*\$?([\d,]+\.?\d*)/i
      )
      if (totalM) {
        result.total = parseFloat(totalM[1].replace(/,/g, ''))
        result.cost = result.total
      }
    }

    // Shipping address
    for (const sel of [
      '.displayAddressDiv',
      '#shipToData',
      '[data-component="shippingAddress"]',
      '.ship-to-address',
      '.recipient',
      '[class*="ship-to"]',
      '[class*="shipping-address"]',
    ]) {
      const el = document.querySelector(sel)
      if (el && el.innerText.trim()) {
        result.shipping_address = el.innerText
          .trim()
          .replace(/\n{2,}/g, '\n')
          .replace(/\n/g, ', ')
        break
      }
    }

    // Tracking URL — must look like a real tracking URL, never a cancel link
    function isTrackingHref(href) {
      if (!href || /cancel/i.test(href)) return false
      return (
        /progress.tracker/i.test(href) ||
        /\/gp\/css\/shiptrack/i.test(href) ||
        /track.package/i.test(href) ||
        /package\/ref=/i.test(href) ||
        /tracking\.ups\.com/i.test(href) ||
        /tools\.usps\.com/i.test(href) ||
        /fedex\.com\/tracking/i.test(href) ||
        /dhl\.com\/track/i.test(href) ||
        /ontrac\.com\/track/i.test(href) ||
        /lasership\.com\/track/i.test(href) ||
        /epiqsciences\.com\/track/i.test(href) ||
        /amazon\.com\/.*track/i.test(href)
      )
    }

    const trackingSelectors = [
      'a[href*="progress-tracker"]',
      'a[href*="/gp/css/shiptrack"]',
      'a[href*="track-package"]',
      'a[href*="tracking.ups.com"]',
      'a[href*="tools.usps.com"]',
      'a[href*="fedex.com/tracking"]',
      'a[href*="dhl.com/track"]',
      'a[href*="ontrac.com/track"]',
      'a[href*="lasership.com/track"]',
      '[data-action="track-package"] a',
      '.track-package-button a',
      'a.track-package-button',
      'a[data-testid*="track"]',
    ]
    for (const sel of trackingSelectors) {
      const el = document.querySelector(sel)
      if (el && isTrackingHref(el.href)) { result.tracking_url = el.href; break }
    }

    // Text-based fallback — find any visible "Track package" link, validate href
    if (!result.tracking_url) {
      const anchors = document.querySelectorAll('a[href]')
      for (const a of anchors) {
        const text = a.textContent.trim()
        if (
          /^track\s*(package|shipment|order)?$/i.test(text) &&
          isTrackingHref(a.href)
        ) {
          result.tracking_url = a.href
          break
        }
      }
    }

    // Amazon Visa / Prime Visa detection (payment method section)
    const paymentSelectors = [
      '#paymentMethod',
      '[data-component="paymentMethod"]',
      '.payment-info',
      '[class*="payment"]',
      '.pmts-account-payment-information',
    ]
    let paymentText = ''
    for (const sel of paymentSelectors) {
      const el = document.querySelector(sel)
      if (el && el.textContent.trim()) {
        paymentText = el.textContent
        break
      }
    }
    // Also do a broad page scan in the vicinity of "Payment" header
    if (!paymentText) paymentText = pageText
    result.used_amazon_visa = /amazon\s*(prime\s*)?(?:rewards\s*)?visa|prime\s*visa/i.test(paymentText)

    // Item scraping — collect product names/quantities from the order
    const itemMap = new Map() // name → qty

    // Strategy 1: product title links inside shipment blocks
    const productLinks = document.querySelectorAll(
      '.a-col-left a[href*="/dp/"], ' +
      '.item-view-left-col-inner a[href*="/dp/"], ' +
      '[class*="item"] a[href*="/dp/"]'
    )
    for (const a of productLinks) {
      const name = a.textContent.trim().replace(/\s+/g, ' ')
      if (name.length > 3) {
        // Look for quantity near this element
        let qty = 1
        const parent = a.closest('[class*="item"], .a-row, li')
        if (parent) {
          const qtyEl = parent.querySelector('[class*="qty"], [class*="quantity"]')
          if (qtyEl) qty = parseInt(qtyEl.textContent.replace(/[^\d]/g, '')) || 1
        }
        itemMap.set(name, (itemMap.get(name) || 0) + qty)
      }
    }

    // Strategy 2: Bold item titles (a-size-base-plus used heavily on order pages)
    if (itemMap.size === 0) {
      const titleEls = document.querySelectorAll(
        '.a-size-base-plus.a-color-base, ' +
        '.a-size-medium.a-color-base.a-text-bold, ' +
        '.yohtmlc-item-title'
      )
      for (const el of titleEls) {
        const name = el.textContent.trim().replace(/\s+/g, ' ')
        if (name.length > 5 && !itemMap.has(name)) {
          itemMap.set(name, 1)
        }
      }
    }

    result.items_json = [...itemMap.entries()].map(([name, qty]) => ({ name, qty }))

    return result
  }

  // ── Orders list page — detect canceled orders ─────────────────────────────
  // Amazon's orders page renders dynamically and uses inconsistent class names.
  // The most reliable approach: read the full visible text (innerText), locate
  // every order number, then check a window of ~600 chars around it for
  // "Cancelled"/"Canceled".  This works regardless of DOM structure.

  function scrapeOrdersListPage() {
    const pageText = document.body.innerText || ''
    if (!pageText) return []

    const canceledOrders = []
    const seen = new Set()
    const orderNumRe = /(\d{3}-\d{7}-\d{7})/g

    let match
    while ((match = orderNumRe.exec(pageText)) !== null) {
      const orderNum = match[1]
      if (seen.has(orderNum)) continue
      seen.add(orderNum)

      // Check text within 300 chars before and 600 chars after the order number.
      // "Cancelled" typically appears in the delivery status line which is
      // rendered close to (but not necessarily inside the same element as)
      // the order number.
      const start = Math.max(0, match.index - 300)
      const end   = Math.min(pageText.length, match.index + 600)
      const window = pageText.slice(start, end)

      if (/cancell?ed/i.test(window)) {
        canceledOrders.push(orderNum)
      }
    }

    return canceledOrders
  }

  function scrapeProductPage() {
    const url = new URL(window.location.href)
    const m = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)
    const titleEl = document.querySelector('#productTitle, .product-title-word-break')
    let price = 0
    const priceEl = document.querySelector('.a-price .a-offscreen')
    if (priceEl) price = parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) || 0

    return {
      page_type: 'product',
      asin: m ? m[1].toUpperCase() : '',
      title: titleEl ? titleEl.textContent.trim() : '',
      price,
      url: url.href,
    }
  }

  // ── Toast UI ──────────────────────────────────────────────────────────────

  function injectToastStyles() {
    if (document.getElementById('ebt-styles')) return
    const s = document.createElement('style')
    s.id = 'ebt-styles'
    s.textContent = `
      #ebt-toast {
        position: fixed;
        top: 8px;
        right: 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 11px 16px;
        border-radius: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        font-weight: 500;
        color: #fff;
        z-index: 2147483647;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        max-width: 320px;
        line-height: 1.4;
        animation: ebt-in 0.2s cubic-bezier(0.34,1.4,0.64,1);
        transition: opacity 0.25s, transform 0.25s;
      }
      #ebt-toast.ebt-out {
        opacity: 0;
        transform: translateY(-6px);
      }
      #ebt-toast.ebt-success { background: #15803d; border: 1px solid #16a34a; }
      #ebt-toast.ebt-error   { background: #991b1b; border: 1px solid #dc2626; }
      #ebt-toast.ebt-info    { background: #1e3a8a; border: 1px solid #2563eb; }
      #ebt-toast .ebt-icon   { font-size: 16px; flex-shrink: 0; }
      #ebt-toast .ebt-body   { display: flex; flex-direction: column; gap: 1px; }
      #ebt-toast .ebt-title  { font-weight: 600; }
      #ebt-toast .ebt-sub    { font-size: 11px; opacity: 0.85; }
      @keyframes ebt-in {
        from { opacity: 0; transform: translateY(-10px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
    `
    document.head.appendChild(s)
  }

  function showToast(title, subtitle, type = 'success', duration = 4000) {
    injectToastStyles()
    const existing = document.getElementById('ebt-toast')
    if (existing) existing.remove()

    const icons = { success: '✓', error: '✕', info: '↑' }
    const toast = document.createElement('div')
    toast.id = 'ebt-toast'
    toast.className = `ebt-${type}`
    toast.innerHTML = `
      <span class="ebt-icon">${icons[type] || '●'}</span>
      <span class="ebt-body">
        <span class="ebt-title">${title}</span>
        ${subtitle ? `<span class="ebt-sub">${subtitle}</span>` : ''}
      </span>
    `
    document.body.appendChild(toast)

    setTimeout(() => {
      toast.classList.add('ebt-out')
      setTimeout(() => toast.remove(), 350)
    }, duration)
  }

  // ── Auto-send ─────────────────────────────────────────────────────────────

  async function autoSaveOrder(orderData) {
    if (!orderData.order_number) {
      showToast('EbayToolz', 'Could not read order number.', 'error')
      return
    }

    showToast('EbayToolz', `Saving order ${orderData.order_number}…`, 'info', 60000)

    const response = await chrome.runtime.sendMessage({
      type: 'AUTO_SAVE',
      data: orderData,
    })

    if (response.status === 'not_logged_in') {
      showToast('EbayToolz', 'Sign in via the extension popup first.', 'info', 6000)
    } else if (response.status === 'duplicate') {
      showToast('Already saved', `Order ${orderData.order_number}`, 'info', 4000)
    } else if (response.status === 'updated') {
      showToast('Order updated', response.detail || 'Changes saved', 'info', 5000)
    } else if (response.status === 'refund_saved') {
      const amt = orderData.total ? ` ($${orderData.total.toFixed(2)})` : ''
      showToast('Return saved', `Order ${orderData.order_number}${amt}`, 'success')
    } else if (response.status === 'ok') {
      const visa = orderData.used_amazon_visa ? ' · Visa 5%' : ''
      showToast('Saved to EbayToolz', `Order ${orderData.order_number}${visa}`, 'success')
    } else {
      showToast('Save failed', response.error || 'Unknown error', 'error', 6000)
    }
  }

  async function autoScanOrdersList(canceledOrders) {
    if (canceledOrders.length === 0) return

    const response = await chrome.runtime.sendMessage({
      type: 'ORDERS_LIST_SCAN',
      data: { canceled: canceledOrders },
    })

    if (response && response.updated > 0) {
      showToast(
        'EbayToolz',
        `${response.updated} canceled order${response.updated > 1 ? 's' : ''} updated`,
        'info',
        5000
      )
    }
  }

  // ── Message listener (popup still works as manual override) ───────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'SCRAPE_PAGE') return
    const pageType = getPageType()
    if (pageType === 'order')            sendResponse(scrapeOrderPage())
    else if (pageType === 'orders_list') sendResponse({ page_type: 'orders_list', canceled: scrapeOrdersListPage() })
    else if (pageType === 'product')     sendResponse(scrapeProductPage())
    else                                 sendResponse({ page_type: 'other' })
    return true
  })

  // ── Auto-run ──────────────────────────────────────────────────────────────

  const pageType = getPageType()

  if (pageType === 'order') {
    // Wait for dynamic content (Amazon renders some details via JS)
    setTimeout(() => {
      const data = scrapeOrderPage()
      autoSaveOrder(data)
    }, 1500)
  }

  if (pageType === 'orders_list') {
    // Scan for canceled orders — give Amazon's React page extra time to render
    setTimeout(() => {
      const canceled = scrapeOrdersListPage()
      autoScanOrdersList(canceled)
    }, 4000)
  }
})()
