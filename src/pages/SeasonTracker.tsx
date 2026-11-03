import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

type Recorded = Record<string, Set<string>> // week_id -> team_ids present

export default function SeasonTracker() {
  const { seasonId } = useParams()
  const [season, setSeason] = useState<any>(null)
  const [weeks, setWeeks] = useState<any[]>([])
  const [allWeeks, setAllWeeks] = useState<number>(0)
  const [rows, setRows] = useState<{ team: string; recorded: number; total: number; missing: number[]; strokes: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data: s } = await supabase.from('seasons').select('*').eq('id', seasonId!).single()
      if (cancelled) return
      setSeason(s)
      if (!s) { setErr('Season not found'); setLoading(false); return }

      const today = new Date().toISOString().slice(0, 10)
      const { data: ws } = await supabase.from('weeks')
        .select('id,week_no,game_date')
        .eq('season_id', seasonId)
        .lte('game_date', today)
        .order('week_no')
      if (cancelled) return
      setWeeks(ws ?? [])
      setAllWeeks((s.number_of_weeks ?? ws?.length ?? 0))

      const weekIds = (ws ?? []).map(w => w.id)
      const recorded: Recorded = {}
      const strokesByTeam: Record<string, number> = {}
      if (weekIds.length) {
        const { data: rounds } = await supabase.from('mg_rounds').select('id,week_id').in('week_id', weekIds)
        const roundIds = (rounds ?? []).map(r => r.id)
        const { data: scorecards } = await supabase.from('scorecards').select('id,status,created_at,round_id').in('round_id', roundIds)
        // pick one card per (round, team): locked preferred, else newest
        const best = new Map<string, { cardId: string; status: string; created_at: string }>()
        for (const sc of scorecards ?? []) {
          const { data: entries } = await supabase.from('score_entries').select('team_id').eq('scorecard_id', sc.id)
          const teams = new Set((entries ?? []).map(e => e.team_id).filter(Boolean) as string[])
          for (const tid of teams) {
            const key = `${sc.round_id}:${tid}`
            const prev = best.get(key)
            const prefer = sc.status === 'locked' && prev?.status !== 'locked'
            if (!prev || prefer || (prev.status === sc.status && sc.created_at > prev.created_at)) {
              best.set(key, { cardId: sc.id, status: sc.status, created_at: sc.created_at })
            }
          }
        }
        // now sum strokes per team across chosen cards, only submitted/locked
        const chosenCardIds = new Set([...best.values()].map(v => v.cardId))
        const { data: chosenCards } = await supabase.from('scorecards').select('id,status').in('id', [...chosenCardIds])
        const statusById = new Map((chosenCards ?? []).map(c => [c.id, c.status]))
        for (const [key, info] of best) {
          const st = statusById.get(info.cardId)
          if (st !== 'submitted' && st !== 'locked') continue
          const tid = key.split(':')[1]
          const { data: entries } = await supabase.from('score_entries').select('hole,strokes').eq('scorecard_id', info.cardId).eq('team_id', tid)
          const strokes = (entries ?? []).reduce((a, e) => a + (e.strokes ?? 0), 0)
          strokesByTeam[tid] = (strokesByTeam[tid] ?? 0) + strokes
        }
        // recorded weeks per team
        const teamWeeks = new Map<string, Set<string>>()
        for (const [key] of best) {
          const [roundId, tid] = key.split(':')
          const weekId = rounds?.find(r => r.id === roundId)?.week_id
          if (!weekId) continue
          const info = best.get(key)!
          const st = statusById.get(info.cardId)
          if (st !== 'submitted' && st !== 'locked') continue
          if (!teamWeeks.has(tid)) teamWeeks.set(tid, new Set())
          teamWeeks.get(tid)!.add(weekId)
        }
        for (const [tid, wset] of teamWeeks) {
          for (const wid of wset) {
            if (!recorded[wid]) recorded[wid] = new Set()
            recorded[wid].add(tid)
          }
        }
      }

      const { data: teams } = await supabase.from('teams').select('id,name').eq('league_id', s.league_id).order('name')
      if (cancelled) return
      const total = (ws ?? []).length
      const result: { team: string; recorded: number; total: number; missing: number[]; strokes: number }[] = []
      for (const t of teams ?? []) {
        const rec = new Set<string>()
        for (const w of (ws ?? [])) if (recorded[w.id]?.has(t.id)) rec.add(w.id)
        const missing = (ws ?? []).filter(w => !rec.has(w.id)).map(w => w.week_no)
        result.push({ team: t.name, recorded: rec.size, total, missing, strokes: strokesByTeam[t.id] ?? 0 })
      }
      result.sort((a, b) => b.recorded - a.recorded || a.team.localeCompare(b.team))
      setRows(result)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [seasonId])

  if (loading) return <main><p>Loading…</p></main>
  if (err) return <main><Header title="Season tracker" back /><p>{err}</p></main>
  if (!season) return <main><Header title="Season tracker" back /><p className="muted">Season not found.</p></main>

  return (
    <main>
      <Header title={`Season tracker — ${season.name}`} back />
      <p className="small muted">
        {weeks.length} of {allWeeks} weeks played · {season.start_date ? new Date(season.start_date + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC' }) : ''}
      </p>
      {weeks.length === 0 && <p className="muted">No played weeks yet.</p>}
      {weeks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => (
            <div key={r.team} className="card" style={{ padding: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.team}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, fontSize: 12, textAlign: 'center' }}>
                <div><div className="muted small">Recorded</div><div style={{ fontWeight: 600 }}>{r.recorded}/{r.total}</div></div>
                <div><div className="muted small">Missing</div><div style={{ fontWeight: 600 }}>{r.missing.length}</div></div>
                <div><div className="muted small">Strokes</div><div style={{ fontWeight: 600 }}>{r.strokes}</div></div>
                <div><div className="muted small">Avg</div><div style={{ fontWeight: 600 }}>{r.recorded ? (r.strokes / r.recorded).toFixed(1) : '—'}</div></div>
              </div>
              {r.missing.length ? (
                <div className="row" style={{ marginTop: 6, gap: 6, flexWrap: 'wrap' }}>
                  {r.missing.map(w => (
                    <span key={w} className="small muted" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px' }}>W{w}</span>
                  ))}
                </div>
              ) : (
                <div className="small muted" style={{ marginTop: 6 }}>All played weeks recorded</div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}