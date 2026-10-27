import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'

export default function Admin() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [weeks, setWeeks] = useState<any[]>([])
  const [scorecards, setScorecards] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const load = async () => {
    const { data: w } = await supabase.from('weeks').select('*').order('week_no')
    setWeeks(w ?? [])
    const { data: sc } = await supabase.from('scorecards').select('*').order('created_at', { ascending: false }).limit(50)
    setScorecards(sc ?? [])
  }
  useEffect(() => { if (session) load() }, [session])

  const login = async () => {
    await supabase.auth.signInWithOtp({ email })
    alert('Magic link sent to ' + email)
  }
  const addWeek = async () => {
    const n = weeks.length ? Math.max(...weeks.map(w => w.week_no)) + 1 : 1
    // ensure season
    let { data: season } = await supabase.from('seasons').select('id').limit(1).maybeSingle()
    if (!season) { const { data: s } = await supabase.from('seasons').insert({ name: 'Season 1' }).select('id').single(); season = s }
    await supabase.from('weeks').insert({ season_id: season!.id, week_no: n })
    await supabase.from('mg_rounds').insert([
      { week_id: (await supabase.from('weeks').select('id').eq('season_id', season!.id).eq('week_no', n).single()).data!.id, type: 'aces' },
      { week_id: (await supabase.from('weeks').select('id').eq('season_id', season!.id).eq('week_no', n).single()).data!.id, type: 'duffleboard' },
      { week_id: (await supabase.from('weeks').select('id').eq('season_id', season!.id).eq('week_no', n).single()).data!.id, type: 'minigolf' },
    ])
    load()
  }
  const unlock = async (id: string) => {
    await supabase.from('scorecards').update({ status: 'submitted', locked_at: null, locked_by_team_id: null }).eq('id', id)
    load()
  }

  if (!session) {
    return (
      <main style={{ padding: 16 }}>
        <h1>Admin login</h1>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email" />
        <button onClick={login}>Send magic link</button>
      </main>
    )
  }
  return (
    <main style={{ padding: 16 }}>
      <h1>Admin</h1>
      <button onClick={addWeek}>Add next week</button>
      <h2>Weeks</h2>
      <ul>{weeks.map(w => <li key={w.id} style={{ display:'flex', gap:8, alignItems:'center' }}>Week {w.week_no} <QRCodeSVG value={`${window.location.origin}/upload/${w.week_no}/aces`} size={80} /> <QRCodeSVG value={`${window.location.origin}/upload/${w.week_no}/duffleboard`} size={80} /> <QRCodeSVG value={`${window.location.origin}/upload/${w.week_no}/minigolf`} size={80} /></li>)}</ul>
      <h2>Recent scorecards</h2>
      <ul>
        {scorecards.map(sc => (
          <li key={sc.id}>
            {sc.status} — {sc.id.slice(0,8)} {sc.status === 'locked' && <button onClick={() => unlock(sc.id)}>unlock</button>}
          </li>
        ))}
      </ul>
    </main>
  )
}