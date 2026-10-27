import { supabase } from './supabase'

export async function ensureRound(weekNo: number, roundType: string) {
  // ensure a league
  let { data: league } = await supabase.from('leagues').select('id').limit(1).maybeSingle()
  if (!league) {
    const { data: l } = await supabase.from('leagues').insert({ name: 'Default League' }).select('id').single()
    league = l
  }
  // ensure a season for this league
  let { data: season } = await supabase.from('seasons').select('id').eq('league_id', league!.id).limit(1).maybeSingle()
  if (!season) {
    const { data: s } = await supabase.from('seasons').insert({ name: 'Season 1', league_id: league!.id }).select('id').single()
    season = s
  }
  // ensure week
  let { data: week } = await supabase.from('weeks').select('id').eq('season_id', season!.id).eq('week_no', weekNo).maybeSingle()
  if (!week) {
    const { data: w } = await supabase.from('weeks').insert({ season_id: season!.id, week_no: weekNo }).select('id').single()
    week = w
  }
  // ensure round
  let { data: round } = await supabase.from('mg_rounds').select('id').eq('week_id', week!.id).eq('type', roundType).maybeSingle()
  if (!round) {
    const { data: r } = await supabase.from('mg_rounds').insert({ week_id: week!.id, type: roundType }).select('id').single()
    round = r
  }
  return { seasonId: season!.id, weekId: week!.id, roundId: round!.id, leagueId: league!.id }
}