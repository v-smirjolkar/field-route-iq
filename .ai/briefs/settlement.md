Settlement brief (distilled)

- Function: export function settleRoute(input: SettleRouteInput): RouteSettlement
- Validation: routeId must exist; each order.accountId must be a route stop
- Use priceOrder({lines,accountId,date}) for each order; propagate any errors
- Aggregates (round half-up 2dp): grossTotal (sum of priced lines.gross), lineDiscountTotal (sum of line discounts), orderDiscountTotal (sum of orderLevel.discount), discountTotal = sum of those, netTotal = sum of order totals
- perCategory: sum of lines.net per product.category (order-level discounts NOT allocated). Omit absent categories. Keys sorted ascending
- promoUsage: count per appliedPromoId on lines and per orderLevel.appliedPromoId; omit zeros; keys sorted
- commission: marginal on netTotal: 0-200@2%, next 300@5%, remaining@8%; compute marginally then round at end
- stopsVisited: route stops that have ≥1 order in route stop order, first occurrence only
- stopsMissed: remaining stops in route stop order
