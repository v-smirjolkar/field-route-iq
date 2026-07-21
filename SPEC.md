# Feature Spec — Promotion & Pricing Engine (Order Capture)

> **This is the challenge.** The Order screen (`/orders/new`) currently builds a cart
> but applies **no promotions**. Your agent must implement the pricing engine described
> below and wire it into the Order screen. Scoring is done against a hidden test suite
> written strictly from this document — if the spec is ambiguous to you, it was
> ambiguous to everyone; the spec text is the single source of truth.

## 1. Deliverables

1. A pure function with this exact signature, exported from `src/pricing/engine.ts`:

   ```ts
   export function priceOrder(input: PriceOrderInput): PricedOrder
   ```

2. The Order screen (`src/pages/OrderPage.tsx`) must use `priceOrder` to display,
   for each cart line: gross, applied promotion name (or —), discount, net; and an
   order summary showing subtotal, order-level discount (with promotion name), and total.
3. Submitting the order appends it to the visit log (existing `saveOrder` helper in
   `src/state/orders.ts`) including the full `PricedOrder` breakdown.

## 2. Types

```ts
export interface CartLine { productId: string; qty: number }        // qty ≥ 1, integer

export interface PriceOrderInput {
  lines: CartLine[]
  accountId: string
  date: string                 // ISO date, e.g. "2026-07-20" — the pricing date
}

export interface PricedLine {
  productId: string
  qty: number
  unitPrice: number            // from catalog
  gross: number                // unitPrice * qty, rounded (§6)
  appliedPromoId: string | null
  discount: number             // ≥ 0, rounded (§6)
  net: number                  // gross - discount (never below 0)
}

export interface PricedOrder {
  lines: PricedLine[]
  orderLevel: { appliedPromoId: string | null; discount: number }
  subtotal: number             // sum of line nets
  total: number                // subtotal - orderLevel.discount, floored at 0
}
```

Catalog, accounts and promotions are loaded from `src/data/products.json`,
`src/data/accounts.json`, `src/data/promotions.json`. The engine must read them via
the existing typed loaders in `src/data/index.ts` (do not fetch).

## 3. Promotion types

Promotions live in `src/data/promotions.json`. Three `type` values exist:

### 3.1 `percent_off` (line-level)
```json
{ "type": "percent_off", "percent": 15, "scope": { "category": "beverages" } }
```
- `scope` has **either** `category` **or** `productIds` (array). The promo applies to a
  cart line if the line's product matches the scope.
- Line discount = `gross * percent / 100`, rounded per §6.

### 3.2 `bogo` (line-level)
```json
{ "type": "bogo", "productId": "p-cola-12", "buyQty": 2, "getQty": 1 }
```
- Applies only to lines whose `productId` matches.
- The deal **repeats**: for every complete group of `buyQty + getQty` units in the
  line, `getQty` units are free.
  - Example: buy 2 get 1, qty 7 → ⌊7 / 3⌋ = 2 groups → 2 free units.
- Line discount = `freeUnits * unitPrice`, rounded per §6.
- If `qty < buyQty + getQty`, the promo matches the line but yields **discount 0** —
  and a 0-discount promo is treated as **not applicable** for selection (§5).

### 3.3 `threshold` (order-level)
```json
{ "type": "threshold", "category": "snacks", "minSubtotal": 100, "amountOff": 12 }
```
- Evaluated **after** all line-level promos are applied.
- Qualifies when the sum of **line nets** (post line-discount) for products in
  `category` is **≥ `minSubtotal`** (inclusive).
- Order-level discount = `amountOff` (a fixed currency amount).

## 4. Validity & eligibility (all promotion types)

- Every promotion has `validFrom` and `validTo` (ISO dates). A promotion is active
  when `validFrom ≤ date ≤ validTo` — **both endpoints inclusive**. Compare dates as
  calendar dates; there is no time-of-day component.
- A promotion may have `eligibleSegments` (array of account segments, e.g.
  `["independent", "premium"]`). If present, the ordering account's `segment` must be
  in the list. If absent, all segments are eligible.
- Inactive or ineligible promotions are ignored entirely.

## 5. Stacking & selection rules

1. **At most one line-level promotion per cart line.** If several active, eligible
   line-level promotions apply to the same line, choose the one with the **largest
   discount** for that line ("best for customer").
2. **Tie-break** (equal discounts): earlier `validFrom` wins; if still tied, the
   promotion whose `id` sorts first lexicographically wins.
3. A promotion whose computed discount for a line is **0** is not applicable to that
   line (see BOGO partial groups, §3.2).
4. **At most one order-level promotion per order.** If several `threshold` promos
   qualify, choose the one with the largest `amountOff`; tie-break as in rule 2.
5. Line-level and order-level promotions **do stack** with each other (a line promo
   plus an order promo on the same order is normal).
6. The same promotion may be applied to multiple different lines if its scope matches
   them (a `percent_off` on a category can discount every line in that category).

## 6. Rounding & money

- All money values in the output are rounded to **2 decimal places, half-up**
  (e.g. `1.005 → 1.01`, `2.674999 → 2.67`).
- Round each line's `gross` and `discount` independently, then compute
  `net = gross - discount` (already-rounded operands; clamp at 0).
- `subtotal` = sum of rounded line nets. `total = subtotal - orderLevel.discount`,
  clamped at 0.

## 7. Edge cases the engine must handle

- Empty `lines` → valid result: no lines, subtotal 0, total 0, no promos applied.
- Unknown `productId` in a cart line → throw `Error("Unknown product: <id>")`.
- Unknown `accountId` → throw `Error("Unknown account: <id>")`.
- `qty` ≤ 0 or non-integer → throw `Error("Invalid qty for <productId>")`.
- A threshold promo may push `total` toward 0 but never negative.

## 8. UI acceptance (Order screen)

- Adding products to the cart recalculates pricing live (on every cart change).
- Each line shows the applied promotion **name** (not id) or "—".
- The summary block has `data-testid` hooks: `order-subtotal`, `order-discount`,
  `order-total` (text content = formatted number with 2 decimals, no currency symbol).
- The submit button (`data-testid="submit-order"`) is disabled when the cart is empty.

## 9. Scoring — hidden tests, judged at the end

**This repo ships with no tests.** Your agent builds `priceOrder` from this document and
must not write or run tests. At judging time a hidden suite — written strictly from this
spec, covering every rule and edge case above — is run against your `engine.ts` to score
correctness. This document is the entire surface: read it carefully.
