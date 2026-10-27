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
    <main style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h1>mgolf league</h1>
      <p style={{ color: '#94a3b8', maxWidth: 600 }}>
        Upload a photo of a scorecard after each round. Pick your team, parse the card with AI, fix any misread cells, then submit. Share the verify QR with another team on the card so they can attest and lock it. Locked cards feed the season standings.
      </p>
      <p>Upload a scorecard for a round:</p>
      {loading && <p>Loading...</p>}
      {!loading && weeks.length === 0 && <p>No weeks yet. Ask admin to create a season.</p>}
      {seasons.map(s => {
        const sw = weeks.filter(w => w.season_id === s.id)
        if (!sw.length) return null
        return (
          <section key={s.id} style={{ marginBottom: 24 }}>
            <h2>{s.name}</h2>
            {sw.map(w => (
              <div key={w.id} style={{ margin: '12px 0', padding: 12, background: '#1e293b', borderRadius: 8 }}>
                <h3 style={{ margin: '0 0 4px' }}>Week {w.week_no}{w.theme ? ` — ${w.theme}` : ''}</h3>
                {w.game_date && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{w.game_date}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['aces', 'duffleboard', 'minigolf'].map(r => (
                    <Link key={r} to={`/upload/${w.id}/${r}`} style={{ padding: '8px 12px', background: '#334155', borderRadius: 6, color: '#e2e8f0', textDecoration: 'none' }}>
                      {r}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )
      })}
      <div style={{ marginTop: 24 }}>
        <Link to="/admin" style={{ color: '#94a3b8' }}>Admin</Link>
      </div>
    </main>
  )
}