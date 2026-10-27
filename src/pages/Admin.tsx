import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'

const LEAGUE_TEAMS = ["Stroke Play","Putter Nonsense","The Dubs","Prestige worldwide","Putt Putt Phlop","Complete and Putter Madness","Par-Tini","Power Putt Girls","Bad boyz","Hoppy Gilmore","hala madrid","Arnold Pomeranians","Putt Stuff","The Royal Putters","Open for suggestions","Just here for Beer","Beginners Luck","Mai Tais and Mulligans","Ding & Dong","Hakuna Ma-Putta","What The Putt"]

export default function Admin() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [leagues, setLeagues] = useState<any[]>([])
  const [activeLeague, setActiveLeague] = useState<string>('')
  const [weeks, setWeeks] = useState<any[]>([])
  const [scorecards, setScorecards] = useState<any[]>([])
  const [admins, setAdmins] = useState<any[]>([])
  const [newAdmin, setNewAdmin] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setIsAdmin(null); return }
    supabase.from('admins').select('email').eq('email', session.user.email).maybeSingle().then(({ data }) => {
      if (data) { setIsAdmin(true); return }
      supabase.from('admins').select('email', { count: 'exact', head: true }).then(({ count, error }) => {
        if (error) { setIsAdmin(false); return }
        if ((count ?? 0) === 0) {
          supabase.from('admins').insert({ email: session.user.email }).then(({ error: ie }) => {
            if (ie) { setIsAdmin(false) } else { setIsAdmin(true) }
          })
        } else {
          setIsAdmin(false)
        }
      })
    })
  }, [session])

  const loadLeagues = async () => {
    const { data } = await supabase.from('leagues').select('*').order('created_at')
    setLeagues(data ?? [])
    if (!activeLeague && data && data.length) setActiveLeague(data[0].id)
  }
  const load = async () => {
    if (!activeLeague) return
    const { data: seasons } = await supabase.from('seasons').select('id').eq('league_id', activeLeague)
    const seasonIds = (seasons ?? []).map(s => s.id)
    if (seasonIds.length === 0) { setWeeks([]); setScorecards([]); return }
    const { data: w } = await supabase.from('weeks').select('*').in('season_id', seasonIds).order('week_no')
    setWeeks(w ?? [])
    const weekIds = (w ?? []).map(x => x.id)
    if (weekIds.length === 0) { setScorecards([]); return }
    const { data: rounds } = await supabase.from('mg_rounds').select('id').in('week_id', weekIds)
    const roundIds = (rounds ?? []).map(r => r.id)
    if (roundIds.length === 0) { setScorecards([]); return }
    const { data: sc } = await supabase.from('scorecards').select('*').in('round_id', roundIds).order('created_at', { ascending: false }).limit(50)
    setScorecards(sc ?? [])
  }
  const loadAdmins = async () => {
    const { data } = await supabase.from('admins').select('email').order('email')
    setAdmins(data ?? [])
  }
  useEffect(() => { if (session && isAdmin) { loadLeagues(); loadAdmins() } }, [session, isAdmin])
  useEffect(() => { if (session && isAdmin && activeLeague) load() }, [session, isAdmin, activeLeague])

  const login = async () => {
    await supabase.auth.signInWithOtp({ email })
    alert('Magic link sent to ' + email)
  }
  const googleLogin = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/admin' } })
  }
  const createLeague = async () => {
    const name = prompt('League name?')
    if (!name) return
    const { data: league } = await supabase.from('leagues').insert({ name, owner_user_id: session.user.id }).select('id').single()
    if (!league) return
    await supabase.from('seasons').insert({ name: name + ' Season 1', league_id: league.id }).select('id').single()
    await supabase.from('teams').insert(LEAGUE_TEAMS.map((t, i) => ({ name: t, sort_order: i, league_id: league.id })))
    await loadLeagues()
    setActiveLeague(league.id)
  }
  const addWeek = async () => {
    if (!activeLeague) { alert('Create a league first'); return }
    const { data: season } = await supabase.from('seasons').select('id').eq('league_id', activeLeague).limit(1).maybeSingle()
    let s = season
    if (!s) {
      const { data: ns } = await supabase.from('seasons').insert({ name: 'Season 1', league_id: activeLeague }).select('id').single()
      s = ns
    }
    const { data: ws } = await supabase.from('weeks').select('week_no').eq('season_id', s!.id)
    const n = (ws && ws.length) ? Math.max(...ws.map(w => w.week_no)) + 1 : 1
    await supabase.from('weeks').insert({ season_id: s!.id, week_no: n })
    const { data: wk } = await supabase.from('weeks').select('id').eq('season_id', s!.id).eq('week_no', n).single()
    await supabase.from('mg_rounds').insert([
      { week_id: wk!.id, type: 'aces' },
      { week_id: wk!.id, type: 'duffleboard' },
      { week_id: wk!.id, type: 'minigolf' },
    ])
    load()
  }
  const unlock = async (id: string) => {
    await supabase.from('scorecards').update({ status: 'submitted', locked_at: null, locked_by_team_id: null }).eq('id', id)
    load()
  }
  const addAdmin = async () => {
    if (!newAdmin) return
    await supabase.from('admins').insert({ email: newAdmin })
    setNewAdmin('')
    loadAdmins()
  }
  const signOut = async () => { await supabase.auth.signOut() }

  if (!session) {
    return (
      <main style={{ padding: 16 }}>
        <h1>Admin login</h1>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email" />
        <button onClick={login}>Send magic link</button>
        <button onClick={googleLogin} style={{ marginLeft: 8 }}>Sign in with Google</button>
      </main>
    )
  }
  if (isAdmin === null) {
    return <main style={{ padding: 16 }}>Checking permissions...</main>
  }
  if (!isAdmin) {
    return (
      <main style={{ padding: 16 }}>
        <h1>Not authorized</h1>
        <p>Your account ({session.user.email}) is not an admin.</p>
        <button onClick={signOut}>Sign out</button>
      </main>
    )
  }
  return (
    <main style={{ padding: 16 }}>
      <h1>Admin</h1>
      <div style={{ marginBottom: 12 }}>
        <label>League: </label>
        <select value={activeLeague} onChange={e => setActiveLeague(e.target.value)}>
          {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button onClick={createLeague} style={{ marginLeft: 8 }}>Create league</button>
        <button onClick={addWeek} style={{ marginLeft: 8 }}>Add week</button>
        <button onClick={signOut} style={{ marginLeft: 8 }}>Sign out</button>
      </div>
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
      <h2>Admins</h2>
      <ul>{admins.map(a => <li key={a.email}>{a.email}</li>)}</ul>
      <div style={{ marginTop: 8 }}>
        <input value={newAdmin} onChange={e => setNewAdmin(e.target.value)} placeholder="email to add as admin" />
        <button onClick={addAdmin} style={{ marginLeft: 8 }}>Add admin</button>
      </div>
    </main>
  )
}