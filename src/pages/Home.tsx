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

function currentWeekId(weeks: Week[]): string {
  const today = new Date().toISOString().slice(0, 10)
  const withDates = weeks.filter(w => w.game_date)
  const containing = withDates.find(w => w.game_date! <= today && today < addDays(w.game_date!, 7))
  if (containing) return containing.id
  const past = withDates.filter(w => w.game_date! <= today)
  return (past[past.length - 1] ?? weeks[0])?.id ?? ''
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function Home() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [weeks, setWeeks] = useState<Week[]>([])
  const [activeSeason, setActiveSeason] = useState<string>('')
  const [activeWeek, setActiveWeek] = useState<string>('')
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

  const seasonWeeks = useMemo(() => weeks.filter(w => w.season_id === activeSeason), [weeks, activeSeason])

  useEffect(() => {
    if (seasonWeeks.length && !seasonWeeks.some(w => w.id === activeWeek)) {
      setActiveWeek(currentWeekId(seasonWeeks))
    }
  }, [seasonWeeks])

  const week = seasonWeeks.find(w => w.id === activeWeek)
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
          <select id="season" value={activeSeason} onChange={e => { setActiveSeason(e.target.value); setActiveWeek('') }}>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{isCurrent(s) ? ' (current)' : ''}
              </option>
            ))}
          </select>

          {seasonWeeks.length > 0 && (
            <>
              <label htmlFor="week" style={{ marginTop: 12 }}>Week</label>
              <select id="week" value={activeWeek} onChange={e => setActiveWeek(e.target.value)}>
                {seasonWeeks.map(w => (
                  <option key={w.id} value={w.id}>
                    Week {w.week_no}{w.theme ? ` — ${w.theme}` : ''}{w.game_date ? ` (${w.game_date})` : ''}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      {active && <h2>{active.name}</h2>}
      {!loading && seasonWeeks.length === 0 && <p>No weeks in this season.</p>}
      {week && (
        <div className="card">
          <h3>Week {week.week_no}{week.theme ? ` — ${week.theme}` : ''}</h3>
          {week.game_date && <div className="small muted" style={{ marginBottom: 8 }}>{week.game_date}</div>}
          <div className="chips">
            {['aces', 'duffleboard', 'minigolf'].map(r => (
              <Link key={r} to={`/upload/${week.id}/${r}`} className="chip">{r}</Link>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <Link to="/admin" className="muted">Admin</Link>
      </div>
    </main>
  )
}