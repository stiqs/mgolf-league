import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

type LeagueRow = { id: string; name: string; slug: string }
type SeasonRow = { league_id: string; name: string; start_date: string | null; number_of_weeks: number | null }

function isCurrent(s: SeasonRow, today = new Date()): boolean {
  if (!s.start_date) return false
  const start = new Date(s.start_date + 'T00:00:00Z')
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + ((s.number_of_weeks ?? 1) * 7))
  return today >= start && today < end
}

export default function Home() {
  const [leagues, setLeagues] = useState<LeagueRow[]>([])
  const [seasons, setSeasons] = useState<SeasonRow[]>([])
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('leagues').select('id,name,slug').order('created_at'),
      supabase.from('seasons').select('league_id,name,start_date,number_of_weeks'),
      supabase.from('teams').select('league_id'),
    ]).then(([l, s, t]) => {
      setLeagues(l.data ?? [])
      setSeasons(s.data ?? [])
      const counts: Record<string, number> = {}
      for (const row of t.data ?? []) if (row.league_id) counts[row.league_id] = (counts[row.league_id] ?? 0) + 1
      setTeamCounts(counts)
      setLoading(false)
    })
  }, [])

  return (
    <main>
      <Header />

      <section className="hero">
        <div className="hero-mark">
          <img src="/logo.svg" alt="" width={64} height={64} />
        </div>
        <h2 className="hero-title">Crowd-sourced mini-golf league scores</h2>
        <p className="hero-sub">
          Three rounds a week — aces, duffleboard, mini-golf. Photograph the card, the AI reads it, a second team attests to lock it.
        </p>
        <div className="chips" style={{ justifyContent: 'center' }}>
          <span className="pill">📷 Photograph</span>
          <span className="pill">🤖 Parse</span>
          <span className="pill">✅ Attest</span>
        </div>
      </section>

      <h2>Leagues</h2>
      {loading && <p>Loading...</p>}
      {!loading && leagues.length === 0 && <p>No leagues yet. Ask an admin to create one.</p>}

      <div className="league-list">
        {leagues.map((l, i) => {
          const ls = seasons.filter(s => s.league_id === l.id)
          const current = ls.find(s => isCurrent(s))
          const teams = teamCounts[l.id] ?? 0
          return (
            <Link key={l.id} to={`/l/${l.slug}`} className="league-card" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="league-card-body">
                <div className="league-card-top">
                  <span className="league-badge">{l.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <h3>{l.name}</h3>
                    <div className="small muted">/{l.slug}</div>
                  </div>
                </div>
                <div className="league-stats">
                  <span><strong>{teams}</strong> teams</span>
                  <span><strong>{ls.length}</strong> {ls.length === 1 ? 'season' : 'seasons'}</span>
                  {current && <span className="live-dot"><i />{current.name}</span>}
                </div>
              </div>
              <span className="chev">›</span>
            </Link>
          )
        })}
      </div>

      <div style={{ marginTop: 24 }}>
        <Link to="/admin" className="muted">Admin</Link>
      </div>
    </main>
  )
}