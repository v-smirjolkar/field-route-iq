import { getProduct, getAccount, getPromotions } from '../data'

// Types (kept local to avoid coupling)
export interface CartLine { productId: string; qty: number }
export interface PriceOrderInput { lines: CartLine[]; accountId: string; date: string }
export interface PricedLine {
  productId: string
  qty: number
  unitPrice: number
  gross: number
  appliedPromoId: string | null
  discount: number
  net: number
}
export interface PricedOrder {
  lines: PricedLine[]
  orderLevel: { appliedPromoId: string | null; discount: number }
  subtotal: number
  total: number
}

// Half-up rounding to 2 decimals, defensive against float artifacts
function round2(v: number): number {
  // add a small epsilon then round half-up
  const adjusted = v + 1e-9
  const rounded = Math.round(adjusted * 100) / 100
  return Number(rounded.toFixed(2))
}

function isValidDateIso(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
}

export function priceOrder(input: PriceOrderInput): PricedOrder {
  const { lines, accountId, date } = input
  if (!isValidDateIso(date)) throw new Error(`Invalid date: ${date}`)

  const account = getAccount(accountId)
  if (!account) throw new Error(`Unknown account: ${accountId}`)

  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      lines: [],
      orderLevel: { appliedPromoId: null, discount: 0 },
      subtotal: 0,
      total: 0,
    }
  }

  // load active promotions (date inclusive) and filter by eligibleSegments
  const allPromos = getPromotions()
  const activePromos = allPromos.filter((p: any) => p.validFrom <= date && date <= p.validTo)
    .filter((p: any) => {
      if (!p.eligibleSegments || p.eligibleSegments.length === 0) return true
      return p.eligibleSegments.includes(account.segment)
    })

  const pricedLines: PricedLine[] = lines.map((line) => {
    const product = getProduct(line.productId)
    if (!product) throw new Error(`Unknown product: ${line.productId}`)
    if (!Number.isInteger(line.qty) || line.qty <= 0) throw new Error(`Invalid qty for ${line.productId}`)

    const unitPrice = product.unitPrice
    const gross = round2(unitPrice * line.qty)

    // find applicable line-level promos (percent_off, bogo)
    const candidates = activePromos.filter((p: any) => p.type === 'percent_off' || p.type === 'bogo')
      .filter((p: any) => {
        if (p.type === 'percent_off') {
          if (p.scope?.category) return p.scope.category === product.category
          return (p.scope?.productIds ?? []).includes(product.id)
        }
        if (p.type === 'bogo') {
          return p.productId === product.id
        }
        return false
      })

    // compute discount per candidate
    type Candidate = { promo: any; discount: number }
    const computed: Candidate[] = []
    for (const promo of candidates) {
      let discount = 0
      if (promo.type === 'percent_off') {
        discount = round2((gross * promo.percent) / 100)
      } else if (promo.type === 'bogo') {
        const groupSize = promo.buyQty + promo.getQty
        if (groupSize <= 0) {
          discount = 0
        } else {
          const freeUnits = Math.floor(line.qty / groupSize) * promo.getQty
          discount = round2(freeUnits * unitPrice)
        }
      }
      // promo yielding 0 discount is treated as not applicable
      if (discount > 0) computed.push({ promo, discount })
    }

    // select best by discount, tie-break: earlier validFrom, then id lexicographically
    let appliedPromoId: string | null = null
    let chosenDiscount = 0
    if (computed.length > 0) {
      computed.sort((a, b) => {
        if (b.discount !== a.discount) return b.discount - a.discount
        if (a.promo.validFrom !== b.promo.validFrom) return a.promo.validFrom < b.promo.validFrom ? -1 : 1
        return (a.promo.id || '').localeCompare(b.promo.id || '')
      })
      appliedPromoId = computed[0].promo.id
      chosenDiscount = computed[0].discount
    }

    const discount = round2(chosenDiscount)
    const net = round2(Math.max(0, gross - discount))

    return {
      productId: product.id,
      qty: line.qty,
      unitPrice,
      gross,
      appliedPromoId: appliedPromoId ?? null,
      discount,
      net,
    }
  })

  const subtotal = round2(pricedLines.reduce((s, l) => s + l.net, 0))

  // order-level threshold promos
  const thresholdPromos = activePromos.filter((p: any) => p.type === 'threshold')
  const qualifying: { promo: any; amountOff: number }[] = []
  for (const promo of thresholdPromos as any) {
    const categoryNet = pricedLines.reduce((sum, l) => {
      const prod = getProduct(l.productId)
      return prod && prod.category === promo.category ? sum + l.net : sum
    }, 0)
    if (categoryNet >= promo.minSubtotal) {
      qualifying.push({ promo, amountOff: promo.amountOff })
    }
  }

  let orderLevelAppliedId: string | null = null
  let orderDiscount = 0
  if (qualifying.length > 0) {
    qualifying.sort((a, b) => {
      if (b.amountOff !== a.amountOff) return b.amountOff - a.amountOff
      if (a.promo.validFrom !== b.promo.validFrom) return a.promo.validFrom < b.promo.validFrom ? -1 : 1
      return (a.promo.id || '').localeCompare(b.promo.id || '')
    })
    orderLevelAppliedId = qualifying[0].promo.id
    orderDiscount = round2(qualifying[0].amountOff)
  }

  const total = round2(Math.max(0, subtotal - orderDiscount))

  return {
    lines: pricedLines,
    orderLevel: { appliedPromoId: orderLevelAppliedId, discount: orderDiscount },
    subtotal,
    total,
  }
}
