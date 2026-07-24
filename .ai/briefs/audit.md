Audit brief (distilled)

- Function: export function auditAccounts(asOf: string): AccountAudit[]
- Input: asOf must be YYYY-MM-DD else throw Error("Invalid date: <asOf>")
- Counted visits: visits with date ≤ asOf (inclusive); order most recent first (date desc, id desc)
- Weighted score: up to 3 most recent visits weights 3,2,1 → weighted mean; round half-up 2dp
- Trend: need ≥2 counted visits; compare latest (s1) vs previous (s2): up/down/flat
- daysSinceVisit: whole calendar days from latest visit to asOf; same day = 0
- overdue: true if daysSinceVisit is null or >14
- status: unvisited/null scores, critical <2.5, watch 2.5≤score<3.5, healthy ≥3.5 (use rounded weightedScore)
- Return one entry per account sorted by accountId ascending
