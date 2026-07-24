Pricing brief (distilled)

- Function: export function priceOrder(input: PriceOrderInput): PricedOrder
- Data access: use getProduct, getAccount, getPromotions from src/data/index.ts only
- Date: ISO YYYY-MM-DD; compare inclusive (validFrom ≤ date ≤ validTo)
- Line promos: percent_off (scope.category or scope.productIds) and bogo (productId,buyQty,getQty)
  - BOGO repeats by groups: freeUnits = floor(qty / (buy+get)) * getQty
  - Promo with computed discount 0 is NOT applicable
  - At most one line-level promo per line: choose largest discount; tie-break by earlier validFrom, then id lexicographic
- Order promos: threshold (category,minSubtotal,amountOff)
  - Evaluate after line-level nets; choose single best amountOff; tie-break identical rules
- Rounding: half-up to 2 decimals for gross, discount, net, subtotal, total; guard against float artifacts
- Errors: throw exact messages per SPEC (Unknown product/account, Invalid qty, Invalid date)
- Keep changes minimal and deterministic
