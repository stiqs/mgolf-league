import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [weeks, setWeeks] = useState<{ id: string; week_no: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('weeks').select('id,week_no').order('week_no').then(({ data }) => {
      setWeeks(data ?? [])
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
      {!loading && weeks.length === 0 && <p>No weeks yet. Ask admin to create one.</p>}
      {weeks.map(w => (
        <div key={w.id} style={{ margin: '12px 0', padding: 12, background: '#1e293b', borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 8px' }}>Week {w.week_no}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['aces', 'duffleboard', 'minigolf'].map(r => (
              <Link key={r} to={`/upload/${w.week_no}/${r}`} style={{ padding: '8px 12px', background: '#334155', borderRadius: 6, color: '#e2e8f0', textDecoration: 'none' }}>
                {r}
              </Link>
            ))}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 24 }}>
        <Link to="/admin" style={{ color: '#94a3b8' }}>Admin</Link>
      </div>
    </main>
  )
}