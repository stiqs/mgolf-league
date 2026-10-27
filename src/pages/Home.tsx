import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Week = { id: string; week_no: number; theme: string | null; game_date: string | null; season_id: string }
type Season = { id: string; name: string }

export default function Home() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [weeks, setWeeks] = useState<Week[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('seasons').select('id,name').order('start_date'),
      supabase.from('weeks').select('id,week_no,theme,game_date,season_id').order('week_no'),
    ]).then(([s, w]) => {
      setSeasons(s.data ?? [])
      setWeeks(w.data ?? [])
      setLoading(false)
    })
  }, [])

  return (
    <main>
      <h1>mgolf league</h1>
      <p className="muted" style={{ maxWidth: 600 }}>
        Upload a photo of a scorecard after each round. Pick your team, parse with AI, fix misread cells, then submit. Share the verify QR with another team on the card to lock it.
      </p>
      <p className="muted">Upload a scorecard for a round:</p>
      {loading && <p>Loading...</p>}
      {!loading && weeks.length === 0 && <p>No weeks yet. Ask admin to create a season.</p>}
      {seasons.map(s => {
        const sw = weeks.filter(w => w.season_id === s.id)
        if (!sw.length) return null
        return (
          <section key={s.id}>
            <h2>{s.name}</h2>
            {sw.map(w => (
              <div key={w.id} className="card">
                <h3>Week {w.week_no}{w.theme ? ` — ${w.theme}` : ''}</h3>
                {w.game_date && <div className="small muted" style={{ marginBottom: 8 }}>{w.game_date}</div>}
                <div className="chips">
                  {['aces', 'duffleboard', 'minigolf'].map(r => (
                    <Link key={r} to={`/upload/${w.id}/${r}`} className="chip">{r}</Link>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )
      })}
      <div style={{ marginTop: 24 }}>
        <Link to="/admin" className="muted">Admin</Link>
      </div>
    </main>
  )
}