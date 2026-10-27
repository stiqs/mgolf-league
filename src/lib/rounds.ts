import { supabase } from './supabase'

/** Resolve an existing week id + round type to a round row, creating the round if missing. */
export async function ensureRound(weekId: string, roundType: string) {
  const { data: week, error: weekErr } = await supabase.from('weeks').select('id,season_id').eq('id', weekId).single()
  if (weekErr || !week) throw new Error('week not found')

  let { data: round } = await supabase.from('mg_rounds').select('id').eq('week_id', week.id).eq('type', roundType).maybeSingle()
  if (!round) {
    const { data: r } = await supabase.from('mg_rounds').insert({ week_id: week.id, type: roundType }).select('id').single()
    round = r
  }
  const { data: season } = await supabase.from('seasons').select('league_id').eq('id', week.season_id).maybeSingle()
  return { seasonId: week.season_id, weekId: week.id, roundId: round!.id, leagueId: season?.league_id ?? null }
}