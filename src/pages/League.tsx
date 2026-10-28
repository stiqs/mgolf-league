import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

type Week = { id: string; week_no: number; theme: string | null; game_date: string | null; season_id: string }
type Season = { id: string; name: string; start_date: string | null; number_of_weeks: number | null }
type League = { id: string; name: string; slug: string }

function isCurrent(s: Season, today = new Date()): boolean {
  if (!s.start_date) return false
  const start = new Date(s.start_date + 'T00:00:00Z')
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + ((s.number_of_weeks ?? 1) * 7))
  return today >= start && today < end
}
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function currentWeekId(weeks: Week[]): string {
  const today = new Date().toISOString().slice(0, 10)
  const withDates = weeks.filter(w => w.game_date)
  const containing = withDates.find(w => w.game_date! <= today && today < addDays(w.game_date!, 7))
  if (containing) return containing.id
  const past = withDates.filter(w => w.game_date! <= today)
  return (past[past.length - 1] ?? weeks[0])?.id ?? ''
}

export default function League() {
  const { slug } = useParams()
  const [league, setLeague] = useState<League | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [weeks, setWeeks] = useState<Week[]>([])
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [activeSeason, setActiveSeason] = useState('')
  const [activeWeek, setActiveWeek] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: l } = await supabase.from('leagues').select('id,name,slug').eq('slug', slug!).maybeSingle()
      if (!l) { setNotFound(true); setLoading(false); return }
      setLeague(l)
      const { data: s } = await supabase.from('seasons').select('id,name,start_date,number_of_weeks').eq('league_id', l.id).order('start_date')
      const ss = s ?? []
      setSeasons(ss)
      const current = ss.find(x => isCurrent(x))
      setActiveSeason(current?.id ?? ss[ss.length - 1]?.id ?? '')
      const { data: t } = await supabase.from('teams').select('id,name').eq('league_id', l.id).order('name')
      setTeams(t ?? [])
      setLoading(false)
    })()
  }, [slug])

  useEffect(() => {
    if (!activeSeason) { setWeeks([]); return }
    supabase.from('weeks').select('id,week_no,theme,game_date,season_id').eq('season_id', activeSeason).order('week_no')
      .then(({ data }) => {
        const ws = data ?? []
        setWeeks(ws)
        setActiveWeek(currentWeekId(ws))
      })
  }, [activeSeason])

  const week = weeks.find(w => w.id === activeWeek)
  const active = seasons.find(s => s.id === activeSeason)

  if (notFound) return <main><Header title="Not found" back /><p>No league with that name.</p></main>

  return (
    <main>
      <Header title={league?.name ?? 'League'} back />
      <p className="muted">
        Upload a photo of a scorecard after each round. Pick your team, parse with AI, fix misread cells, then submit. Share the verify QR with another team on the card to lock it.
      </p>
      {loading && <p>Loading...</p>}

      {seasons.length > 0 && (
        <div className="card">
          <label htmlFor="season">Season</label>
          <select id="season" value={activeSeason} onChange={e => { setActiveSeason(e.target.value); setActiveWeek('') }}>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{isCurrent(s) ? ' (current)' : ''}</option>)}
          </select>
          {weeks.length > 0 && (
            <>
              <label htmlFor="week" style={{ marginTop: 12 }}>Week</label>
              <select id="week" value={activeWeek} onChange={e => setActiveWeek(e.target.value)}>
                {weeks.map(w => <option key={w.id} value={w.id}>Week {w.week_no}{w.theme ? ` — ${w.theme}` : ''}{w.game_date ? ` (${w.game_date})` : ''}</option>)}
              </select>
            </>
          )}
        </div>
      )}
      {!loading && seasons.length === 0 && <p>No seasons yet.</p>}

      {week && active && (
        <>
          <h2>{active.name}</h2>
          <div className="card">
            <h3>Week {week.week_no}{week.theme ? ` — ${week.theme}` : ''}</h3>
            {week.game_date && <div className="small muted" style={{ marginBottom: 8 }}>{week.game_date}</div>}
            <div className="chips">
              {['aces', 'duffleboard', 'minigolf'].map(r => (
                <Link key={r} to={`/upload/${week.id}/${r}`} className="chip">{r}</Link>
              ))}
            </div>
          </div>
        </>
      )}

      {teams.length > 0 && (
        <>
          <h2>Teams</h2>
          <div className="card">
            <div className="chips">
              {teams.map(t => <span key={t.id} className="chip" style={{ background: 'var(--surface-2)' }}>{t.name}</span>)}
            </div>
          </div>
        </>
      )}
    </main>
  )
}