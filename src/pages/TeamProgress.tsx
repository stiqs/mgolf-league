import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { bestCardsForRounds } from '../lib/bestCards'
import Header from '../components/Header'

export default function TeamProgress() {
  const { teamId, seasonId } = useParams()
  const [team, setTeam] = useState<any>(null)
  const [season, setSeason] = useState<any>(null)
  const [rows, setRows] = useState<{ week: number; date: string | null; aces: number | null; duffle: number | null; mini: number | null; total: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('teams').select('id,name').eq('id', teamId!).single(),
        supabase.from('seasons').select('*').eq('id', seasonId!).single(),
      ])
      if (cancelled) return
      setTeam(t); setSeason(s)
      if (!t || !s) { setErr('Not found'); setLoading(false); return }
      const { data: ws } = await supabase.from('weeks').select('id,week_no,game_date').eq('season_id', seasonId).order('week_no')
      if (cancelled) return
      const today = new Date().toISOString().slice(0, 10)
      const played = (ws ?? []).filter(w => (w.game_date ?? '') <= today)
      const weekIds = played.map(w => w.id)
      const roundIds: string[] = []
      const weekByRound = new Map<string, string>()
      if (weekIds.length) {
        const { data: rounds } = await supabase.from('mg_rounds').select('id,week_id,type').in('week_id', weekIds)
        for (const r of rounds ?? []) { roundIds.push(r.id); weekByRound.set(r.id, r.week_id) }
      }
      const best = await bestCardsForRounds(roundIds)
      const chosen = [...new Set(best.values())]
      const entriesByCard = new Map<string, { team_id: string; hole: number; strokes: number | null }[]>()
      if (chosen.length) {
        const { data: es } = await supabase.from('score_entries').select('scorecard_id,team_id,hole,strokes').in('scorecard_id', chosen)
        for (const e of es ?? []) {
          if (!entriesByCard.has(e.scorecard_id)) entriesByCard.set(e.scorecard_id, [])
          entriesByCard.get(e.scorecard_id)!.push(e)
        }
      }
      // best card per round for this team
      const cardByRound = new Map<string, string>()
      for (const [key, cid] of best) {
        const [rid, tid] = key.split(':')
        if (tid === teamId) cardByRound.set(rid, cid)
      }
      const result: { week: number; date: string | null; aces: number | null; duffle: number | null; mini: number | null; total: number }[] = []
      for (const w of played) {
        const rids = roundIds.filter(rid => weekByRound.get(rid) === w.id)
        const roundTypeById = new Map<string, string>()
        // need type mapping
        const { data: rds } = await supabase.from('mg_rounds').select('id,type').in('id', rids)
        for (const r of rds ?? []) roundTypeById.set(r.id, r.type)
        const vals: Record<string, number | null> = { aces: null, duffleboard: null, minigolf: null }
        for (const rid of rids) {
          const cid = cardByRound.get(rid)
          if (!cid) continue
          const es = (entriesByCard.get(cid) ?? []).filter(e => e.team_id === teamId)
          const strokes = es.map(e => e.strokes ?? 0)
          const type = roundTypeById.get(rid)
          if (type) vals[type] = strokes.length ? strokes.reduce((a, b) => a + b, 0) : null
        }
        const total = (vals.aces ?? 0) + (vals.duffleboard ?? 0) + (vals.minigolf ?? 0)
        result.push({ week: w.week_no, date: w.game_date, aces: vals.aces, duffle: vals.duffleboard, mini: vals.minigolf, total })
      }
      if (cancelled) return
      setRows(result)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [teamId, seasonId])

  if (loading) return <main><p>Loading…</p></main>
  if (err) return <main><Header title="Team progress" back /><p>{err}</p></main>

  return (
    <main>
      <Header title={team?.name ?? 'Team'} back />
      {season && <p className="small muted">{season.name}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <div key={r.week} className="card" style={{ padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>Week {r.week}</span>
              <span className="small muted">{r.date}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, textAlign: 'center', fontSize: 12 }}>
              <div><div className="muted small">Aces</div><div>{r.aces ?? '—'}</div></div>
              <div><div className="muted small">Duffle</div><div>{r.duffle ?? '—'}</div></div>
              <div><div className="muted small">Mini</div><div>{r.mini ?? '—'}</div></div>
              <div><div className="muted small">Total</div><div style={{ fontWeight: 600 }}>{r.total}</div></div>
            </div>
          </div>
        ))}
      </div>
      {rows.length === 0 && <p className="muted">No played weeks yet.</p>}
    </main>
  )
}