import { getRoutes, getProduct } from '../data'
import { priceOrder } from '../pricing/engine'

export interface SettleRouteInput {
  routeId: string
  date: string
  orders: Array<{ accountId: string; lines: { productId: string; qty: number }[] }>
}

export interface RouteSettlement {
  routeId: string
  date: string
  grossTotal: number
  lineDiscountTotal: number
  orderDiscountTotal: number
  discountTotal: number
  netTotal: number
  perCategory: Record<string, number>
  promoUsage: Record<string, number>
  commission: number
  stopsVisited: string[]
  stopsMissed: string[]
}

function round2(v: number): number {
  return Number((Math.round((v + 1e-9) * 100) / 100).toFixed(2))
}

export function settleRoute(input: SettleRouteInput): RouteSettlement {
  const { routeId, date, orders } = input
  const routes = getRoutes()
  const route = routes.find((r) => r.id === routeId)
  if (!route) throw new Error(`Unknown route: ${routeId}`)

  const stopIds = route.stops.map((s) => s.accountId)

  for (const ord of orders) {
    if (!stopIds.includes(ord.accountId)) throw new Error(`Account not on route: ${ord.accountId}`)
  }

  // price each order
  const pricedOrders = orders.map((o) => {
    const priced = priceOrder({ lines: o.lines as any, accountId: o.accountId, date })
    return { accountId: o.accountId, priced }
  })

  // aggregates
  const allLines = pricedOrders.flatMap((po) => po.priced.lines)
  const grossTotal = round2(allLines.reduce((s, l) => s + l.gross, 0))
  const lineDiscountTotal = round2(allLines.reduce((s, l) => s + l.discount, 0))
  const orderDiscountTotal = round2(pricedOrders.reduce((s, po) => s + po.priced.orderLevel.discount, 0))
  const discountTotal = round2(lineDiscountTotal + orderDiscountTotal)
  const netTotal = round2(pricedOrders.reduce((s, po) => s + po.priced.total, 0))

  // per-category nets
  const perCategoryMap: Record<string, number> = {}
  for (const l of allLines) {
    const prod = getProduct(l.productId)
    const cat = prod ? prod.category : 'unknown'
    perCategoryMap[cat] = (perCategoryMap[cat] || 0) + l.net
  }
  // round and remove zero/absent categories
  const perCategory: Record<string, number> = {}
  for (const k of Object.keys(perCategoryMap).sort()) {
    perCategory[k] = round2(perCategoryMap[k])
  }

  // promo usage
  const promoCounts: Record<string, number> = {}
  for (const l of allLines) {
    if (l.appliedPromoId) promoCounts[l.appliedPromoId] = (promoCounts[l.appliedPromoId] || 0) + 1
  }
  for (const po of pricedOrders) {
    const op = po.priced.orderLevel.appliedPromoId
    if (op) promoCounts[op] = (promoCounts[op] || 0) + 1
  }
  const promoUsage: Record<string, number> = {}
  Object.keys(promoCounts).sort().forEach((k) => { promoUsage[k] = promoCounts[k] })

  // commission (marginal tiers)
  let remaining = netTotal
  let commission = 0
  const tier = (amount: number, rate: number) => {
    const portion = Math.max(0, Math.min(remaining, amount))
    commission += portion * rate
    remaining = Math.max(0, remaining - portion)
  }
  tier(200.0, 0.02)
  tier(300.0, 0.05) // over 200 up to 500 -> next 300
  if (remaining > 0) commission += remaining * 0.08
  commission = round2(commission)

  // stops visited / missed
  const visitedSet = new Set(pricedOrders.map((p) => p.accountId))
  const stopsVisited: string[] = []
  const stopsMissed: string[] = []
  for (const s of route.stops) {
    if (visitedSet.has(s.accountId)) {
      if (!stopsVisited.includes(s.accountId)) stopsVisited.push(s.accountId)
    } else {
      stopsMissed.push(s.accountId)
    }
  }

  return {
    routeId,
    date,
    grossTotal,
    lineDiscountTotal,
    orderDiscountTotal,
    discountTotal,
    netTotal,
    perCategory,
    promoUsage,
    commission,
    stopsVisited,
    stopsMissed,
  }
}
