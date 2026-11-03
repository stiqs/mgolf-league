import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

type CardEntry = { team_id: string | null; team_name: string; total: number }
type Card = { id: string; status: string; image_path: string | null; created_at: string; entries: CardEntry[] }

export default function Cards() {
  const { weekId, round } = useParams()
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data: roundRow } = await supabase.from('mg_rounds').select('id').eq('week_id', weekId!).eq('type', round!).maybeSingle()
      if (!roundRow) { setErr('Round not set up yet'); setLoading(false); return }
      const { data: scs } = await supabase.from('scorecards').select('id,status,image_path,created_at').eq('round_id', roundRow.id).order('created_at', { ascending: false })
      const list: Card[] = []
      for (const sc of scs ?? []) {
        const { data: entries } = await supabase.from('score_entries').select('team_id,hole,strokes,teams(name)').eq('scorecard_id', sc.id)
        const byTeam = new Map<string, { name: string; holes: number[] }>()
        for (const e of entries ?? []) {
          const key = e.team_id ?? '__unmatched__'
          if (!byTeam.has(key)) byTeam.set(key, { name: e.team_id ? ((e as any).teams?.name ?? 'Unknown') : 'Unmatched', holes: [] })
          byTeam.get(key)!.holes[e.hole - 1] = e.strokes ?? 0
        }
        list.push({
          id: sc.id, status: sc.status, image_path: sc.image_path, created_at: sc.created_at,
          entries: [...byTeam.entries()].map(([tid, t]) => ({ team_id: tid === '__unmatched__' ? null : tid, team_name: t.name, total: t.holes.reduce((a, b) => a + (b || 0), 0) }))
        })
      }
      setCards(list)
      setLoading(false)
    })()
  }, [weekId, round])

  if (loading) return <main><p>Loading…</p></main>
  if (err) return <main><Header title="Cards" back /><p>{err}</p></main>

  return (
    <main>
      <Header title={`${round} — submitted cards`} back />
      {cards.length === 0 && <p className="muted">No scorecards submitted for this round yet.</p>}
      {cards.map(c => {
        const img = c.image_path ? supabase.storage.from('scorecards').getPublicUrl(c.image_path).data.publicUrl : null
        return (
          <div key={c.id} className="card" style={{ marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small muted">{new Date(c.created_at).toLocaleString()} · {c.status}</span>
              <Link to={`/verify/${c.id}`} className="small">verify →</Link>
            </div>
            {img && <img src={img} alt="card" className="preview-img" style={{ marginTop: 8 }} />}
            <table style={{ width: '100%', marginTop: 8, fontSize: 13 }}>
              <thead><tr><th style={{ textAlign: 'left' }}>Team</th><th>Total</th></tr></thead>
              <tbody>
                {c.entries.map((e, i) => (
                  <tr key={i}><td>{e.team_name}</td><td style={{ textAlign: 'center' }}>{e.total}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </main>
  )
}