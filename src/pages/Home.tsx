import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

type LeagueRow = { id: string; name: string; slug: string }

export default function Home() {
  const [leagues, setLeagues] = useState<LeagueRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('leagues').select('id,name,slug').order('created_at').then(({ data }) => {
      setLeagues(data ?? [])
      setLoading(false)
    })
  }, [])

  return (
    <main>
      <Header />
      <p className="muted" style={{ maxWidth: 600 }}>
        Upload a photo of a scorecard after each round. Pick your team, parse with AI, fix misread cells, then submit. Share the verify QR with another team on the card to lock it.
      </p>

      <h2>Leagues</h2>
      {loading && <p>Loading...</p>}
      {!loading && leagues.length === 0 && <p>No leagues yet. Ask an admin to create one.</p>}
      {leagues.map(l => (
        <Link key={l.id} to={`/l/${l.slug}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{ margin: 0 }}>{l.name}</h3>
          <div className="small muted">/{l.slug}</div>
        </Link>
      ))}

      <div style={{ marginTop: 24 }}>
        <Link to="/admin" className="muted">Admin</Link>
      </div>
    </main>
  )
}