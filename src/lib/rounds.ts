import { supabase } from './supabase'

/**
 * Resolve an existing week + round type to its round row.
 * Rounds are seeded when a season or week is created, so this never inserts:
 * anon uploads have no write access to mg_rounds.
 */
export async function ensureRound(weekId: string, roundType: string) {
  const { data: week, error: weekErr } = await supabase.from('weeks').select('id,season_id').eq('id', weekId).single()
  if (weekErr || !week) throw new Error('week not found')

  const { data: round, error: roundErr } = await supabase
    .from('mg_rounds').select('id').eq('week_id', week.id).eq('type', roundType).maybeSingle()
  if (roundErr) throw new Error(roundErr.message)
  if (!round) throw new Error('this round has not been set up yet — ask an admin')

  const { data: season } = await supabase.from('seasons').select('league_id').eq('id', week.season_id).maybeSingle()
  return { seasonId: week.season_id, weekId: week.id, roundId: round.id, leagueId: season?.league_id ?? null }
}