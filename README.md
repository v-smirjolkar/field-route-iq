# Field Route IQ

A field-sales companion app for delivery reps: daily routes, account
profiles, promotions, a visit log, and on-site order capture. Built with
React + TypeScript + Vite, designed for tablet use in-store.

## Running

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and produce a production build
```

## App tour

- **Dashboard** (`/`) — today's route and quick stats.
- **Routes** (`/routes`) — delivery routes and their ordered stops.
- **Accounts** (`/accounts`) — customer stores, with segment, region, and
  visit history.
- **Promotions** (`/promotions`) — current trade promotions and eligibility.
- **Visits** (`/visits`) — visit log, including submitted orders.
- **New Order** (`/orders/new`) — order capture for an account.

Static data lives in `src/data/*.json` and is read through the typed loaders
in `src/data/index.ts`. Submitted orders persist to `localStorage`
(`src/state/orders.ts`).

## Status: pricing is intentionally missing

The order screen currently totals the cart at list price — **no promotions
are applied**. The promotion & pricing engine described in [`SPEC.md`](SPEC.md)
is deliberately unimplemented (`src/pricing/engine.ts` does not exist yet).
Your job is to get an AI agent to build it. **This repo ships with no pricing
tests** — a hidden suite scores your work at the end. See [`RULES.md`](RULES.md)
for the format and how to submit.

Everything else — routing, data loaders, order persistence — is complete:

```bash
npm run build    # passes
```
