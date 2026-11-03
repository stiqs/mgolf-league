import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

type Row = { team: string; aces: number | null; duffleboard: number | null; minigolf: number | null; total: number }

export default function Tally() {
  const { weekId } = useParams()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data: week } = await supabase.from('weeks').select('id,week_no,theme,game_date,season_id').eq('id', weekId!).single()
      if (!week) { setErr('Week not found'); setLoading(false); return }
      const { data: rounds } = await supabase.from('mg_rounds').select('id,type').eq('week_id', week.id)
      const roundByType: Record<string, string> = {}
      for (const r of rounds ?? []) roundByType[r.type] = r.id

      const bestByRound: Record<string, Map<string, { cardId: string; created_at: string; status: string }>> = {}
      for (const type of ['aces', 'duffleboard', 'minigolf']) {
        const rid = roundByType[type]
        if (!rid) continue
        const { data: scs } = await supabase.from('scorecards').select('id,status,created_at').eq('round_id', rid).order('created_at', { ascending: false })
        const m = new Map<string, { cardId: string; created_at: string; status: string }>()
        for (const sc of scs ?? []) {
          const { data: entries } = await supabase.from('score_entries').select('team_id').eq('scorecard_id', sc.id)
          const teams = new Set((entries ?? []).map(e => e.team_id).filter(Boolean) as string[])
          for (const tid of teams) {
            const prev = m.get(tid)
            const prefer = sc.status === 'locked' && prev?.status !== 'locked'
            if (!prev || prefer) m.set(tid, { cardId: sc.id, created_at: sc.created_at, status: sc.status })
          }
        }
        bestByRound[type] = m
      }

      const teamIds = new Set<string>()
      for (const m of Object.values(bestByRound)) for (const tid of m.keys()) teamIds.add(tid)
      const { data: teamRows } = await supabase.from('teams').select('id,name').in('id', [...teamIds])
      const nameById = new Map((teamRows ?? []).map(t => [t.id, t.name]))

      const result: Row[] = []
      for (const tid of teamIds) {
        const vals: Record<string, number | null> = { aces: null, duffleboard: null, minigolf: null }
        for (const type of ['aces', 'duffleboard', 'minigolf']) {
          const info = bestByRound[type]?.get(tid)
          if (!info) continue
          const { data: entries } = await supabase.from('score_entries').select('hole,strokes').eq('scorecard_id', info.cardId).eq('team_id', tid)
          const strokes = (entries ?? []).map(e => e.strokes ?? 0)
          vals[type] = strokes.length ? strokes.reduce((a, b) => a + b, 0) : null
        }
        const total = (vals.aces ?? 0) + (vals.duffleboard ?? 0) + (vals.minigolf ?? 0)
        result.push({ team: nameById.get(tid) ?? tid.slice(0, 8), aces: vals.aces, duffleboard: vals.duffleboard, minigolf: vals.minigolf, total })
      }
      result.sort((a, b) => a.total - b.total)
      setRows(result)
      setLoading(false)
    })()
  }, [weekId])

  if (loading) return <main><p>Loading…</p></main>
  if (err) return <main><Header title="Tally" back /><p>{err}</p></main>

  return (
    <main>
      <Header title="Weekly tally" back />
      {rows.length === 0 && <p className="muted">No submitted cards yet.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <div key={r.team} className="card" style={{ padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, wordBreak: 'break-word' }}>{r.team}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, textAlign: 'center', fontSize: 12 }}>
              <div><div className="muted small">Aces</div><div>{r.aces ?? '—'}</div></div>
              <div><div className="muted small">Duffle</div><div>{r.duffleboard ?? '—'}</div></div>
              <div><div className="muted small">Mini</div><div>{r.minigolf ?? '—'}</div></div>
              <div><div className="muted small">Total</div><div style={{ fontWeight: 600 }}>{r.total}</div></div>
            </div>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>Per team: one card per round (locked preferred, else newest). Unmatched entries excluded.</p>
    </main>
  )
}