import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

type Recorded = Record<string, Set<string>> // week_id -> team_ids present

export default function SeasonTracker() {
  const { seasonId } = useParams()
  const [season, setSeason] = useState<any>(null)
  const [weeks, setWeeks] = useState<any[]>([])
  const [rows, setRows] = useState<{ team: string; recorded: number; total: number; missing: number[] }[]>([])
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

      const recorded: Recorded = {}
      const weekIds = (ws ?? []).map(w => w.id)
      if (weekIds.length) {
        const { data: rounds } = await supabase.from('mg_rounds').select('id,week_id').in('week_id', weekIds)
        const roundIds = (rounds ?? []).map(r => r.id)
        const { data: entries } = await supabase.from('score_entries')
          .select('team_id, scorecards!inner(status,round_id)')
          .not('team_id', 'is', null)
          .in('scorecards.round_id', roundIds)
        if (cancelled) return
        for (const e of entries ?? []) {
          const sc = (e as any).scorecards
          if (!sc || (sc.status !== 'submitted' && sc.status !== 'locked')) continue
          const wid = sc.round_id && rounds?.find(r => r.id === sc.round_id)?.week_id
          if (!wid) continue
          if (!recorded[wid]) recorded[wid] = new Set()
          recorded[wid].add(e.team_id)
        }
      }

      const { data: teams } = await supabase.from('teams').select('id,name').eq('league_id', s.league_id).order('name')
      if (cancelled) return
      const total = (ws ?? []).length
      const result: { team: string; recorded: number; total: number; missing: number[] }[] = []
      for (const t of teams ?? []) {
        const rec = new Set<string>()
        for (const w of (ws ?? [])) if (recorded[w.id]?.has(t.id)) rec.add(w.id)
        const missing = (ws ?? []).filter(w => !rec.has(w.id)).map(w => w.week_no)
        result.push({ team: t.name, recorded: rec.size, total, missing })
      }
      result.sort((a, b) => b.recorded - a.recorded || a.team.localeCompare(b.team))
      setRows(result)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [seasonId])

  if (loading) return <main><p>Loading…</p></main>
  if (err) return <main><Header title="Season tracker" back /><p>{err}</p></main>
  if (!season || !weeks.length) return <main><Header title="Season tracker" back /><p className="muted">No weeks yet.</p></main>

  return (
    <main>
      <Header title={`Season tracker — ${season.name}`} back />
      <p className="small muted">{weeks.length} weeks · {season.start_date ? new Date(season.start_date).toLocaleDateString() : ''}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <div key={r.team} className="card" style={{ padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.team}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <div><div className="muted small">Recorded</div><div style={{ fontWeight: 600 }}>{r.recorded} / {r.total}</div></div>
              <div><div className="muted small">Missing</div><div style={{ fontWeight: 600 }}>{r.missing.length}</div></div>
            </div>
            {r.missing.length ? (
              <div className="row" style={{ marginTop: 6, gap: 6, flexWrap: 'wrap' }}>
                {r.missing.map(w => (
                  <span key={w} className="small muted" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px' }}>W{w}</span>
                ))}
              </div>
            ) : (
              <div className="small muted" style={{ marginTop: 6 }}>All weeks recorded</div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}