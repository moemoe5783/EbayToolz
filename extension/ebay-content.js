// EbayToolz eBay Scraper — Content Script
// Auto-detects eBay Seller Hub order pages, scrapes order data, and sends
// it to EbayToolz without any manual interaction.

;(function () {
  'use strict'

  // ── Page type ──────────────────────────────────────────────────────────────

  function getPageType() {
    const href = window.location.href
    if (
      /\/mesh\/ord\/details/i.test(href) ||
      /\/sh\/ord\/details/i.test(href) ||
      /[?&]orderid=/i.test(href) ||
      /[?&]orderID=/i.test(href)
    ) {
      return 'order'
    }
    return 'other'
  }

  // ── Scraping ───────────────────────────────────────────────────────────────

  function scrapeOrderPage() {
    const url = new URL(window.location.href)
    const result = {
      page_type: 'order',
      order_number: '',
      date: new Date().toISOString(),
      total: 0,
      net: 0,
      type: 'sale',
      status: '',
      buyer: '',
      shipping_address: '',
      transactions_json: [],
    }

    // ── Order number ─────────────────────────────────────────────────────────
    // Seller Hub puts it in the URL param; fall back to text scan.
    result.order_number =
      url.searchParams.get('orderid') ||
      url.searchParams.get('orderId') ||
      url.searchParams.get('orderID') ||
      ''

    if (!result.order_number) {
      // eBay order IDs look like 14-07659-97001 (digits separated by dashes)
      const m = document.body.innerText.match(/\b(\d{2,3}-\d{4,6}-\d{4,6})\b/)
      if (m) result.order_number = m[1]
    }

    const pageText = document.body.innerText

    // ── Date ─────────────────────────────────────────────────────────────────
    const dateM = pageText.match(
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/i
    )
    if (dateM) {
      try {
        result.date = new Date(dateM[0]).toISOString()
      } catch {}
    }

    // ── Total (what buyer paid) ───────────────────────────────────────────────
    const totalPatterns = [
      /order\s+total[:\s]+\$?([\d,]+\.?\d*)/i,
      /grand\s+total[:\s]+\$?([\d,]+\.?\d*)/i,
      /item\(s\)\s+subtotal[:\s]+\$?([\d,]+\.?\d*)/i,
    ]
    for (const pat of totalPatterns) {
      const m = pageText.match(pat)
      if (m) {
        result.total = parseFloat(m[1].replace(/,/g, ''))
        break
      }
    }

    // ── Net / payout (seller earnings after eBay fees) ───────────────────────
    const payoutPatterns = [
      /your\s+payout[:\s]+\$?([\d,]+\.?\d*)/i,
      /seller\s+payout[:\s]+\$?([\d,]+\.?\d*)/i,
      /(?:^|\s)payout[:\s]+\$?([\d,]+\.?\d*)/im,
      /you\s+earned[:\s]+\$?([\d,]+\.?\d*)/i,
      /net\s+amount[:\s]+\$?([\d,]+\.?\d*)/i,
      /total\s+payout[:\s]+\$?([\d,]+\.?\d*)/i,
    ]
    for (const pat of payoutPatterns) {
      const m = pageText.match(pat)
      if (m) {
        result.net = parseFloat(m[1].replace(/,/g, ''))
        break
      }
    }

    // ── Status ────────────────────────────────────────────────────────────────
    const statusMap = [
      ['cancelled', 'refund'],
      ['canceled', 'refund'],
      ['refunded', 'refund'],
      ['return', 'refund'],
      ['delivered', 'sale'],
      ['shipped', 'sale'],
      ['in transit', 'sale'],
      ['awaiting shipment', 'sale'],
      ['payment pending', 'sale'],
      ['paid', 'sale'],
    ]
    const lowerText = pageText.toLowerCase()
    for (const [kw, type] of statusMap) {
      if (lowerText.includes(kw)) {
        result.status = kw.charAt(0).toUpperCase() + kw.slice(1)
        result.type = type
        break
      }
    }

    // ── Buyer name ────────────────────────────────────────────────────────────
    const buyerSelectors = [
      '[data-test-id="buyer-info"] .bold-text',
      '[data-test-id="buyer-info"] [class*="name"]',
      '.buyer-info [class*="name"]',
      '[class*="buyerName"]',
      '[class*="buyer-name"]',
    ]
    for (const sel of buyerSelectors) {
      const el = document.querySelector(sel)
      if (el?.textContent?.trim()) {
        result.buyer = el.textContent.trim()
        break
      }
    }
    // Text fallback: "Buyer: <name>"
    if (!result.buyer) {
      const bm = pageText.match(/Buyer(?:\s+ID)?:\s*([^\n]+)/)
      if (bm) result.buyer = bm[1].trim()
    }

    // ── Shipping address ──────────────────────────────────────────────────────
    const addrSelectors = [
      '[data-test-id="ship-to-address"]',
      '[data-test-id="shipping-address"]',
      '[class*="shippingAddress"]',
      '[class*="shipTo"]',
      '.ship-to-details',
      '.shipping-address',
    ]
    for (const sel of addrSelectors) {
      const el = document.querySelector(sel)
      if (el?.innerText?.trim()) {
        result.shipping_address = el.innerText
          .trim()
          .replace(/\n{2,}/g, '\n')
          .replace(/\n/g, ', ')
        break
      }
    }

    // ── Line items (transactions_json) ────────────────────────────────────────
    // Try to find product title elements on the page
    const itemSelectors = [
      '[data-test-id="item-title"]',
      '[class*="itemTitle"]',
      '[class*="item-title"]',
      '.item-title',
      '.order-item-name',
    ]
    const seenItems = new Set()
    for (const sel of itemSelectors) {
      const els = document.querySelectorAll(sel)
      if (els.length === 0) continue
      els.forEach((el) => {
        const name = el.textContent.trim()
        if (!name || seenItems.has(name)) return
        seenItems.add(name)

        // Try to find price adjacent to this item element
        let price = 0
        const priceEl =
          el.closest('[class*="item"], [class*="Item"]')?.querySelector(
            '[class*="price"], [class*="Price"], [class*="amount"], [class*="Amount"]'
          ) ||
          el.parentElement?.querySelector(
            '[class*="price"], [class*="Price"]'
          )
        if (priceEl) {
          price = parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) || 0
        }

        result.transactions_json.push({ name, qty: 1, price })
      })
      if (result.transactions_json.length > 0) break
    }

    return result
  }

  // ── Toast UI ───────────────────────────────────────────────────────────────

  function injectToastStyles() {
    if (document.getElementById('ebt-ebay-styles')) return
    const s = document.createElement('style')
    s.id = 'ebt-ebay-styles'
    s.textContent = `
      #ebt-ebay-toast {
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
        animation: ebt-ebay-in 0.2s cubic-bezier(0.34,1.4,0.64,1);
        transition: opacity 0.25s, transform 0.25s;
      }
      #ebt-ebay-toast.ebt-out { opacity: 0; transform: translateY(-6px); }
      #ebt-ebay-toast.ebt-success { background: #15803d; border: 1px solid #16a34a; }
      #ebt-ebay-toast.ebt-error   { background: #991b1b; border: 1px solid #dc2626; }
      #ebt-ebay-toast.ebt-info    { background: #1e3a8a; border: 1px solid #2563eb; }
      #ebt-ebay-toast .ebt-body   { display: flex; flex-direction: column; gap: 1px; }
      #ebt-ebay-toast .ebt-title  { font-weight: 600; }
      #ebt-ebay-toast .ebt-sub    { font-size: 11px; opacity: 0.85; }
      @keyframes ebt-ebay-in {
        from { opacity: 0; transform: translateY(-10px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
    `
    document.head.appendChild(s)
  }

  function showToast(title, subtitle, type = 'success', duration = 4000) {
    injectToastStyles()
    const existing = document.getElementById('ebt-ebay-toast')
    if (existing) existing.remove()

    const icons = { success: '✓', error: '✕', info: '↑' }
    const toast = document.createElement('div')
    toast.id = 'ebt-ebay-toast'
    toast.className = `ebt-${type}`
    toast.innerHTML = `
      <span style="font-size:16px;flex-shrink:0">${icons[type] || '●'}</span>
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

  // ── Auto-send ──────────────────────────────────────────────────────────────

  async function autoSaveOrder(orderData) {
    if (!orderData.order_number) {
      showToast('EbayToolz', 'Could not read eBay order number.', 'error')
      return
    }

    showToast('EbayToolz', `Saving eBay order ${orderData.order_number}…`, 'info', 60000)

    const response = await chrome.runtime.sendMessage({
      type: 'EBAY_AUTO_SAVE',
      data: orderData,
    })

    if (response.status === 'not_logged_in') {
      showToast('EbayToolz', 'Sign in via the extension popup first.', 'info', 6000)
    } else if (response.status === 'duplicate') {
      showToast('Already saved', `eBay ${orderData.order_number}`, 'info', 4000)
    } else if (response.status === 'ok') {
      showToast('Saved to EbayToolz', `eBay ${orderData.order_number}`, 'success')
    } else {
      showToast('Save failed', response.error || 'Unknown error', 'error', 6000)
    }
  }

  // ── Message listener (popup can trigger manual scrape) ─────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'SCRAPE_EBAY_PAGE') return
    const pageType = getPageType()
    if (pageType === 'order') sendResponse(scrapeOrderPage())
    else sendResponse({ page_type: 'other' })
    return true
  })

  // ── Auto-run on order pages ────────────────────────────────────────────────
  // Wait 2s — eBay Seller Hub renders key data via React after DOMContentLoaded.

  if (getPageType() === 'order') {
    setTimeout(() => {
      const data = scrapeOrderPage()
      autoSaveOrder(data)
    }, 2000)
  }
})()
