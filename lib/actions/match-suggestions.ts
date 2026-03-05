'use server'

/**
 * Auto-matching: link unmatched Amazon orders to eBay orders.
 *
 * Match logic (simple, two-signal):
 *   1. Order number cross-reference — instant auto-link (score 1.0)
 *   2. Recipient name match + ≥2 title words in common → auto-link (0.85)
 *      Either signal alone → suggestion (0.50)
 *
 * Zip code check acts as a hard veto: if both addresses have a zip and
 * they differ, the pair is skipped entirely.
 *
 * Thresholds:
 *   >= HIGH_THRESHOLD (0.75) → auto-link
 *   >= MED_THRESHOLD  (0.45) → suggestion
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  AmazonTransaction,
  EbayTransaction,
  MatchSuggestion,
} from '@/lib/types/database'

const HIGH_THRESHOLD = 0.75
const MED_THRESHOLD  = 0.45

// ── Text helpers ───────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function significantWords(text: string): string[] {
  return normalizeText(text).split(' ').filter((w) => w.length > 2)
}

/** Strip "Ship to," / "Shipping address:" label prefixes left by scrapers. */
function stripAddressLabel(addr: string): string {
  return addr.replace(/^(?:ship(?:ping)?\s+(?:to|address)[,:]?\s*)/i, '')
}

/**
 * Returns false if both addresses contain a zip code and they differ (hard veto).
 * Returns true otherwise (unknown or matching).
 */
function zipsCompatible(a: string, b: string): boolean {
  const zipRe = /\b(\d{5})(?:-\d{4})?\b/
  const za = a.match(zipRe)?.[1]
  const zb = b.match(zipRe)?.[1]
  return !(za && zb && za !== zb)
}

/**
 * Name match: at least one significant word from the recipient name
 * (first line of the shipping address) appears in the other address's first line.
 */
function nameMatch(addrA: string, addrB: string): boolean {
  const firstName = (addr: string) =>
    stripAddressLabel(addr).split(/[\n,]/)[0].trim()
  const na = significantWords(firstName(addrA))
  const nb = new Set(significantWords(firstName(addrB)))
  return na.length > 0 && na.some((w) => nb.has(w))
}

/**
 * Title match: at least 2 significant words shared between any Amazon item
 * name and any eBay item name.
 */
function titleMatch(
  amazonItems: Array<{ name: string; qty: number }>,
  ebayItems:   Array<{ name: string; qty: number; price: number; sku?: string }>
): boolean {
  for (const a of amazonItems) {
    const wordsA = significantWords(a.name)
    for (const e of ebayItems) {
      const wordsB = new Set(significantWords(e.name))
      const hits = wordsA.filter((w) => wordsB.has(w)).length
      if (hits >= 2) return true
    }
  }
  return false
}

/**
 * Check if the Amazon order number appears anywhere in the eBay order's text.
 */
function orderNumberCrossReference(
  amazon: AmazonTransaction,
  ebay: EbayTransaction
): boolean {
  const amzNum = amazon.order_number.replace(/-refund$/, '')
  const haystack = [
    ebay.status ?? '',
    ebay.buyer ?? '',
    ebay.shipping_address ?? '',
    ...(ebay.transactions_json ?? []).map((i) => i.name),
  ].join(' ')
  return haystack.includes(amzNum)
}

function computeMatchScore(
  amazon: AmazonTransaction,
  ebay: EbayTransaction
): number {
  if (orderNumberCrossReference(amazon, ebay)) return 1.0

  // Hard veto: zip codes both present and different → no match
  if (
    amazon.shipping_address && ebay.shipping_address &&
    !zipsCompatible(amazon.shipping_address, ebay.shipping_address)
  ) return 0

  const nm =
    amazon.shipping_address && ebay.shipping_address
      ? nameMatch(amazon.shipping_address, ebay.shipping_address)
      : false

  const tm =
    Array.isArray(amazon.items_json) && amazon.items_json.length > 0 &&
    Array.isArray(ebay.transactions_json) && ebay.transactions_json.length > 0
      ? titleMatch(amazon.items_json, ebay.transactions_json)
      : false

  if (nm && tm) return 0.85  // name + title → auto-link
  if (nm || tm) return 0.50  // one signal  → suggest
  return 0
}

// ── Main: generate suggestions + auto-links ───────────────────────────────

export async function generateMatchSuggestions(): Promise<{
  autoLinked: number
  suggested: number
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { autoLinked: 0, suggested: 0, error: 'Not authenticated' }

  // Include ALL unlinked Amazon orders — complete, refund, AND cancel.
  // A canceled Amazon order should still be linkable to a refunded eBay order.
  const { data: amazonTxs, error: aErr } = await supabase
    .from('amazon_transactions')
    .select('*')
    .is('corresponding_ebay_order', null)

  if (aErr) return { autoLinked: 0, suggested: 0, error: aErr.message }

  // Load all unlinked eBay orders
  const { data: ebayTxs, error: eErr } = await supabase
    .from('ebay_transactions')
    .select('*')
    .is('corresponding_amazon_order', null)

  if (eErr) return { autoLinked: 0, suggested: 0, error: eErr.message }

  if (!amazonTxs?.length || !ebayTxs?.length) {
    return { autoLinked: 0, suggested: 0 }
  }

  let autoLinked = 0
  let suggested = 0

  const linkedAmazonIds = new Set<string>()
  const linkedEbayIds   = new Set<string>()

  // Score all pairs and sort highest first so best matches claim their IDs first
  const candidates: Array<{ score: number; amazon: AmazonTransaction; ebay: EbayTransaction }> = []

  for (const amazon of amazonTxs) {
    for (const ebay of ebayTxs) {
      const score = computeMatchScore(amazon, ebay)
      if (score >= MED_THRESHOLD) {
        candidates.push({ score, amazon, ebay })
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  for (const { score, amazon, ebay } of candidates) {
    if (linkedAmazonIds.has(amazon.id) || linkedEbayIds.has(ebay.id)) continue

    if (score >= HIGH_THRESHOLD) {
      const [aRes, eRes] = await Promise.all([
        supabase
          .from('amazon_transactions')
          .update({ corresponding_ebay_order: ebay.order_number })
          .eq('id', amazon.id),
        supabase
          .from('ebay_transactions')
          .update({ corresponding_amazon_order: amazon.order_number })
          .eq('id', ebay.id),
      ])
      if (!aRes.error && !eRes.error) {
        linkedAmazonIds.add(amazon.id)
        linkedEbayIds.add(ebay.id)
        autoLinked++
      }
    } else {
      const { error } = await supabase.from('match_suggestions').upsert(
        {
          user_id: user.id,
          amazon_tx_id: amazon.id,
          ebay_tx_id: ebay.id,
          confidence: score >= 0.6 ? 'high' : 'medium',
          dismissed: false,
        },
        { onConflict: 'amazon_tx_id,ebay_tx_id', ignoreDuplicates: true }
      )
      if (!error) suggested++
    }
  }

  if (autoLinked > 0) {
    revalidatePath('/clusters')
    revalidatePath('/transactions')
  }

  return { autoLinked, suggested }
}


// ── Load pending suggestions ──────────────────────────────────────────────

export interface SuggestionWithDetails {
  suggestion: MatchSuggestion
  amazon: AmazonTransaction
  ebay: EbayTransaction
}

export async function getPendingSuggestions(): Promise<{
  data: SuggestionWithDetails[]
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('match_suggestions')
    .select(`
      *,
      amazon:amazon_tx_id ( * ),
      ebay:ebay_tx_id ( * )
    `)
    .eq('dismissed', false)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }

  type SuggestionRow = {
    id: string
    user_id: string
    amazon_tx_id: string
    ebay_tx_id: string
    confidence: 'medium' | 'high'
    dismissed: boolean
    created_at: string
    amazon: AmazonTransaction | null
    ebay: EbayTransaction | null
  }

  const results: SuggestionWithDetails[] = ((data ?? []) as SuggestionRow[])
    .filter((row): row is SuggestionRow & { amazon: AmazonTransaction; ebay: EbayTransaction } =>
      row.amazon !== null && row.ebay !== null
    )
    .map((row) => ({
      suggestion: {
        id: row.id,
        user_id: row.user_id,
        amazon_tx_id: row.amazon_tx_id,
        ebay_tx_id: row.ebay_tx_id,
        confidence: row.confidence,
        dismissed: row.dismissed,
        created_at: row.created_at,
      },
      amazon: row.amazon,
      ebay: row.ebay,
    }))

  return { data: results }
}

// ── Confirm suggestion → link the two orders ──────────────────────────────

export async function confirmMatchSuggestion(
  suggestionId: string,
  amazonTxId: string,
  ebayTxId: string,
  amazonOrderNumber: string,
  ebayOrderNumber: string
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const [aRes, eRes, sRes] = await Promise.all([
    supabase
      .from('amazon_transactions')
      .update({ corresponding_ebay_order: ebayOrderNumber })
      .eq('id', amazonTxId),
    supabase
      .from('ebay_transactions')
      .update({ corresponding_amazon_order: amazonOrderNumber })
      .eq('id', ebayTxId),
    supabase
      .from('match_suggestions')
      .delete()
      .eq('id', suggestionId),
  ])

  const err = aRes.error || eRes.error || sRes.error
  if (err) return { error: err.message }

  revalidatePath('/clusters')
  revalidatePath('/transactions')
  return {}
}

// ── Dismiss suggestion ────────────────────────────────────────────────────

export async function dismissMatchSuggestion(
  suggestionId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('match_suggestions')
    .update({ dismissed: true })
    .eq('id', suggestionId)

  if (error) return { error: error.message }

  revalidatePath('/clusters')
  return {}
}
