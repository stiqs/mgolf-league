import { supabase } from './supabase'

// For a set of round ids, pick the single best scorecard per (round, team).
// "Best" = locked preferred, then newest created_at. Only submitted/locked cards
// are eligible, so pending/abandoned uploads never win.
// Returns a Map keyed `${roundId}:${teamId}` -> chosen scorecard id.
export async function bestCardsForRounds(roundIds: string[]): Promise<Map<string, string>> {
  const best = new Map<string, { cardId: string; status: string; created_at: string }>()
  if (!roundIds.length) return new Map()
  const { data: scorecards } = await supabase
    .from('scorecards').select('id,status,created_at,round_id').in('round_id', roundIds)
  // group entries by card to know which teams each card covers
  const entriesByCard = new Map<string, Set<string>>()
  const cards = scorecards ?? []
  await Promise.all(cards.map(async sc => {
    const { data: entries } = await supabase.from('score_entries').select('team_id').eq('scorecard_id', sc.id)
    entriesByCard.set(sc.id, new Set((entries ?? []).map(e => e.team_id).filter(Boolean) as string[]))
  }))
  for (const sc of cards) {
    if (sc.status !== 'submitted' && sc.status !== 'locked') continue
    const teams = entriesByCard.get(sc.id) ?? new Set()
    for (const tid of teams) {
      const key = `${sc.round_id}:${tid}`
      const prev = best.get(key)
      const prefer = sc.status === 'locked' && prev?.status !== 'locked'
      const newerSameStatus = prev && prev.status === sc.status && sc.created_at > prev.created_at
      if (!prev || prefer || newerSameStatus) {
        best.set(key, { cardId: sc.id, status: sc.status, created_at: sc.created_at })
      }
    }
  }
  return new Map([...best].map(([k, v]) => [k, v.cardId]))
}