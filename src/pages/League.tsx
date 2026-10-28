import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

type Week = { id: string; week_no: number; theme: string | null; game_date: string | null; season_id: string }
type Season = { id: string; name: string; start_date: string | null; number_of_weeks: number | null }
type League = { id: string; name: string; slug: string }

const ROUNDS = [
  {
    key: 'aces',
    label: 'Aces',
    blurb: 'One shot per hole',
    icon: (
      <svg viewBox="0 0 64 64" width="36" height="36" aria-hidden="true">
        <defs>
          <radialGradient id="acesGrad" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#4ade80" />
            <stop offset="1" stopColor="#38bdf8" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="25" fill="none" stroke="#38bdf8" strokeWidth="3" opacity="0.9" />
        <circle cx="32" cy="32" r="16" fill="none" stroke="#4ade80" strokeWidth="3" opacity="0.9" />
        <circle cx="32" cy="32" r="7" fill="url(#acesGrad)" />
        <circle cx="29.5" cy="29.5" r="2" fill="#0b1220" opacity="0.35" />
      </svg>
    ),
  },
  {
    key: 'duffleboard',
    label: 'Duffleboard',
    blurb: 'Tabletop golf, one shot',
    icon: (
      <svg viewBox="0 0 64 64" width="36" height="36" aria-hidden="true">
        <defs>
          <linearGradient id="duffTable" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b4a63" />
            <stop offset="1" stopColor="#243247" />
          </linearGradient>
          <radialGradient id="duffBall" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#94a3b8" />
          </radialGradient>
        </defs>
        <rect x="5" y="28" width="54" height="26" rx="7" fill="url(#duffTable)" stroke="#38bdf8" strokeWidth="2.5" />
        <ellipse cx="46" cy="43" rx="7" ry="3.5" fill="#0b1220" />
        <circle cx="18" cy="43" r="7" fill="url(#duffBall)" />
        <line x1="45" y1="12" x2="54" y2="36" stroke="#4ade80" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="45" cy="12" r="4.5" fill="#4ade80" />
      </svg>
    ),
  },
  {
    key: 'minigolf',
    label: 'Mini-golf',
    blurb: '9 holes, stroke play',
    icon: (
      <svg viewBox="0 0 64 64" width="36" height="36" aria-hidden="true">
        <defs>
          <linearGradient id="mgFlag" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#4ade80" />
          </linearGradient>
          <radialGradient id="mgBall" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#94a3b8" />
          </radialGradient>
        </defs>
        <ellipse cx="34" cy="50" rx="19" ry="5" fill="#0b1220" />
        <rect x="23" y="9" width="4" height="41" rx="2" fill="#e2e8f0" />
        <path d="M27 11 L53 22 L27 33 Z" fill="url(#mgFlag)" />
        <circle cx="41" cy="48" r="5.5" fill="url(#mgBall)" />
      </svg>
    ),
  },
] as const

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

      <section className="league-hero">
        <span className="league-badge big">{(league?.name ?? '?').slice(0, 1).toUpperCase()}</span>
        <div>
          <h2 style={{ margin: 0 }}>{league?.name}</h2>
          <div className="small muted">/{league?.slug}</div>
          <div className="league-stats" style={{ marginTop: 8 }}>
            <span><strong>{teams.length}</strong> teams</span>
            <span><strong>{seasons.length}</strong> {seasons.length === 1 ? 'season' : 'seasons'}</span>
            {active && <span className="live-dot"><i />{active.name}</span>}
          </div>
        </div>
      </section>

      <p className="muted">
        Pick the round you just played, then select your team, photograph the scorecard, correct any cells the AI misread, and submit. Share the verify QR with another team on the same card to lock the scores.
      </p>

      {loading && <p>Loading...</p>}

      {seasons.length > 0 && (
        <div className="card">
          <div className="field">
            <label htmlFor="season">Season</label>
            <select id="season" value={activeSeason} onChange={e => { setActiveSeason(e.target.value); setActiveWeek('') }}>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{isCurrent(s) ? ' (current)' : ''}</option>)}
            </select>
          </div>
          {weeks.length > 0 && (
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="week">Week</label>
              <select id="week" value={activeWeek} onChange={e => setActiveWeek(e.target.value)}>
                {weeks.map(w => <option key={w.id} value={w.id}>Week {w.week_no}{w.theme ? ` — ${w.theme}` : ''}{w.game_date ? ` (${w.game_date})` : ''}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      {!loading && seasons.length === 0 && <p>No seasons yet.</p>}

      {week && (
        <>
          <h2>Week {week.week_no}{week.theme ? ` — ${week.theme}` : ''}</h2>
          {week.game_date && <p className="small muted" style={{ marginTop: -6 }}>{week.game_date}</p>}
          <div className="round-grid">
            {ROUNDS.map(r => (
              <Link key={r.key} to={`/upload/${week.id}/${r.key}`} className="round-card">
                <span className="round-icon">{r.icon}</span>
                <span className="round-name">{r.label}</span>
                <span className="small muted">{r.blurb}</span>
              </Link>
            ))}
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