import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Week = { id: string; week_no: number; theme: string | null; game_date: string | null; season_id: string }
type Season = { id: string; name: string; start_date: string | null; number_of_weeks: number | null; league_id: string | null }

function isCurrent(s: Season, today = new Date()): boolean {
  if (!s.start_date) return false
  const start = new Date(s.start_date + 'T00:00:00Z')
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + ((s.number_of_weeks ?? 1) * 7))
  return today >= start && today < end
}

export default function Home() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [weeks, setWeeks] = useState<Week[]>([])
  const [activeSeason, setActiveSeason] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('seasons').select('id,name,start_date,number_of_weeks,league_id').order('start_date'),
      supabase.from('weeks').select('id,week_no,theme,game_date,season_id').order('week_no'),
    ]).then(([s, w]) => {
      const ss = s.data ?? []
      setSeasons(ss)
      setWeeks(w.data ?? [])
      const current = ss.find(x => isCurrent(x))
      setActiveSeason(current?.id ?? ss[ss.length - 1]?.id ?? '')
      setLoading(false)
    })
  }, [])

  const seasonWeeks = useMemo(
    () => weeks.filter(w => w.season_id === activeSeason),
    [weeks, activeSeason],
  )
  const active = seasons.find(s => s.id === activeSeason)

  return (
    <main>
      <h1>mgolf league</h1>
      <p className="muted" style={{ maxWidth: 600 }}>
        Upload a photo of a scorecard after each round. Pick your team, parse with AI, fix misread cells, then submit. Share the verify QR with another team on the card to lock it.
      </p>

      {loading && <p>Loading...</p>}
      {!loading && seasons.length === 0 && <p>No seasons yet. Ask admin to create one.</p>}

      {seasons.length > 0 && (
        <div className="card">
          <label htmlFor="season">Season</label>
          <select id="season" value={activeSeason} onChange={e => setActiveSeason(e.target.value)}>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{isCurrent(s) ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <h2>{active ? active.name : 'Weeks'}</h2>
      {seasonWeeks.length === 0 && <p>No weeks in this season.</p>}
      {seasonWeeks.map(w => (
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

      <div style={{ marginTop: 24 }}>
        <Link to="/admin" className="muted">Admin</Link>
      </div>
    </main>
  )
}