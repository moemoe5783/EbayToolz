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
      /\/dp\/[A-Z0-9]{10}/i.test(href) ||
      /\/gp\/product\/[A-Z0-9]{10}/i.test(href)
    ) {
      return 'product'
    }
    return 'other'
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

    // Date
    const pageText = document.body.innerText
    const dateM = pageText.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/
    )
    if (dateM) {
      try { result.date = new Date(dateM[0]).toISOString() } catch {}
    }

    // Total
    const totalM = pageText.match(
      /(?:Order Total|ORDER TOTAL|Grand Total|GRAND TOTAL)[:\s]*\$?([\d,]+\.?\d*)/i
    )
    if (totalM) {
      result.total = parseFloat(totalM[1].replace(/,/g, ''))
      result.cost = result.total
    }

    // Status
    for (const sel of [
      '.delivery-message',
      '[data-component="shipmentStatus"]',
      '.js-shipment-info-container .a-color-success',
      '.shipment-is-delivered .a-color-success',
      '.a-color-success',
    ]) {
      const el = document.querySelector(sel)
      if (el && el.textContent.trim()) {
        result.status = el.textContent.trim().replace(/\s+/g, ' ')
        if (/cancel/i.test(result.status)) result.type = 'cancel'
        else if (/refund/i.test(result.status)) result.type = 'refund'
        break
      }
    }

    // Shipping address
    for (const sel of [
      '.displayAddressDiv',
      '#shipToData',
      '[data-component="shippingAddress"]',
      '.ship-to-address',
      '.recipient',
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

    // Tracking URL
    for (const sel of [
      'a[href*="progress-tracker"]',
      'a[href*="package/ref"]',
      'a[href*="track-package"]',
    ]) {
      const el = document.querySelector(sel)
      if (el && el.href) { result.tracking_url = el.href; break }
    }

    return result
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
      showToast('Order updated', `Marked as canceled, cost reset to $0`, 'info', 5000)
    } else if (response.status === 'refund_saved') {
      showToast('Return saved', `Order ${orderData.order_number}`, 'success')
    } else if (response.status === 'ok') {
      showToast('Saved to EbayToolz', `Order ${orderData.order_number}`, 'success')
    } else {
      showToast('Save failed', response.error || 'Unknown error', 'error', 6000)
    }
  }

  // ── Message listener (popup still works as manual override) ───────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'SCRAPE_PAGE') return
    const pageType = getPageType()
    if (pageType === 'order')        sendResponse(scrapeOrderPage())
    else if (pageType === 'product') sendResponse(scrapeProductPage())
    else                             sendResponse({ page_type: 'other' })
    return true
  })

  // ── Auto-run on order pages ────────────────────────────────────────────────

  if (getPageType() === 'order') {
    // Wait a moment for dynamic content (Amazon renders some details via JS)
    setTimeout(() => {
      const data = scrapeOrderPage()
      autoSaveOrder(data)
    }, 1500)
  }
})()
