import { getAccounts, getVisits } from '../data'

export interface AccountAudit {
  accountId: string
  weightedScore: number | null
  trend: 'up' | 'down' | 'flat' | null
  daysSinceVisit: number | null
  overdue: boolean
  status: 'healthy' | 'watch' | 'critical' | 'unvisited'
}

function round2(v: number): number {
  return Number((Math.round((v + 1e-9) * 100) / 100).toFixed(2))
}

function isValidDateIso(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
}

export function auditAccounts(asOf: string): AccountAudit[] {
  if (!isValidDateIso(asOf)) throw new Error(`Invalid date: ${asOf}`)

  const accounts = getAccounts()
  const visits = getVisits()

  function daysBetween(a: string, b: string): number {
    const da = new Date(a + 'T00:00:00Z')
    const db = new Date(b + 'T00:00:00Z')
    const diffMs = db.getTime() - da.getTime()
    return Math.floor(diffMs / (1000 * 60 * 60 * 24))
  }

  const results: AccountAudit[] = accounts.map((acct) => {
    const counted = visits.filter((v) => v.accountId === acct.id && v.date <= asOf)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1 // date desc
        return a.id < b.id ? 1 : -1 // id desc
      })

    if (counted.length === 0) {
      return {
        accountId: acct.id,
        weightedScore: null,
        trend: null,
        daysSinceVisit: null,
        overdue: true,
        status: 'unvisited',
      }
    }

    const top = counted.slice(0, 3)
    const weights = [3, 2, 1]
    const usedWeights = weights.slice(0, top.length)
    const weightedSum = top.reduce((s, v, i) => s + usedWeights[i] * v.shelfScore, 0)
    const divisor = usedWeights.reduce((s, w) => s + w, 0)
    const raw = weightedSum / divisor
    const weightedScore = round2(raw)

    // trend requires at least 2 counted visits
    let trend: AccountAudit['trend'] = null
    if (counted.length >= 2) {
      const s1 = round2(counted[0].shelfScore)
      const s2 = round2(counted[1].shelfScore)
      if (s1 > s2) trend = 'up'
      else if (s1 < s2) trend = 'down'
      else trend = 'flat'
    }

    const daysSinceVisit = daysBetween(counted[0].date, asOf)
    const overdue = daysSinceVisit === null || daysSinceVisit > 14

    // status decided on rounded weightedScore
    let status: AccountAudit['status'] = 'healthy'
    if (weightedScore === null) status = 'unvisited'
    else if (weightedScore < 2.5) status = 'critical'
    else if (weightedScore >= 2.5 && weightedScore < 3.5) status = 'watch'
    else status = 'healthy'

    return {
      accountId: acct.id,
      weightedScore,
      trend,
      daysSinceVisit,
      overdue,
      status,
    }
  })

  results.sort((a, b) => a.accountId.localeCompare(b.accountId))
  return results
}
