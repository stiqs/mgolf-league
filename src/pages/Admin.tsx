import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'

const LEAGUE_TEAMS = ["Stroke Play","Putter Nonsense","The Dubs","Prestige worldwide","Putt Putt Phlop","Complete and Putter Madness","Par-Tini","Power Putt Girls","Bad boyz","Hoppy Gilmore","hala madrid","Arnold Pomeranians","Putt Stuff","The Royal Putters","Open for suggestions","Just here for Beer","Beginners Luck","Mai Tais and Mulligans","Ding & Dong","Hakuna Ma-Putta","What The Putt"]

function monthName(d: Date) {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default function Admin() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [leagues, setLeagues] = useState<any[]>([])
  const [activeLeague, setActiveLeague] = useState<string>('')
  const [seasons, setSeasons] = useState<any[]>([])
  const [activeSeason, setActiveSeason] = useState<string>('')
  const [weeks, setWeeks] = useState<any[]>([])
  const [scorecards, setScorecards] = useState<any[]>([])
  const [admins, setAdmins] = useState<any[]>([])
  const [newAdmin, setNewAdmin] = useState('')
  const [seasonStart, setSeasonStart] = useState('')
  const [seasonWeeks, setSeasonWeeks] = useState(8)

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
  const loadSeasons = async () => {
    if (!activeLeague) return
    const { data } = await supabase.from('seasons').select('*').eq('league_id', activeLeague).order('start_date')
    setSeasons(data ?? [])
    if (!activeSeason && data && data.length) setActiveSeason(data[data.length - 1].id)
  }
  const load = async () => {
    if (!activeSeason) { setWeeks([]); setScorecards([]); return }
    const { data: w } = await supabase.from('weeks').select('*').eq('season_id', activeSeason).order('week_no')
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
  useEffect(() => { if (session && isAdmin && activeLeague) loadSeasons() }, [session, isAdmin, activeLeague])
  useEffect(() => { if (session && isAdmin && activeSeason) load() }, [session, isAdmin, activeSeason])

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
    await supabase.from('teams').insert(LEAGUE_TEAMS.map((t, i) => ({ name: t, sort_order: i, league_id: league.id })))
    await loadLeagues()
    setActiveLeague(league.id)
  }
  const createSeason = async () => {
    if (!activeLeague) { alert('Create a league first'); return }
    if (!seasonStart) { alert('Pick a start date'); return }
    const start = new Date(seasonStart + 'T00:00:00Z')
    const name = monthName(start)
    const { data: season } = await supabase.from('seasons').insert({
      name, league_id: activeLeague, start_date: seasonStart, number_of_weeks: seasonWeeks
    }).select('id').single()
    if (!season) return
    const rows = Array.from({ length: seasonWeeks }, (_, i) => {
      const d = new Date(start)
      d.setUTCDate(d.getUTCDate() + i * 7)
      return { season_id: season.id, week_no: i + 1, game_date: d.toISOString().slice(0, 10), theme: '' }
    })
    await supabase.from('weeks').insert(rows)
    await loadSeasons()
    setActiveSeason(season.id)
  }
  const updateTheme = async (id: string, theme: string) => {
    setWeeks(ws => ws.map(w => w.id === id ? { ...w, theme } : w))
    await supabase.from('weeks').update({ theme }).eq('id', id)
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
      <main>
        <h1>Admin login</h1>
        <div className="stack" style={{ maxWidth: 360 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email" type="email" autoComplete="email" />
          <button onClick={login}>Send magic link</button>
          <button onClick={googleLogin} className="primary">Sign in with Google</button>
        </div>
      </main>
    )
  }
  if (isAdmin === null) {
    return <main><p>Checking permissions...</p></main>
  }
  if (!isAdmin) {
    return (
      <main>
        <h1>Not authorized</h1>
        <p>Your account ({session.user.email}) is not an admin.</p>
        <button onClick={signOut}>Sign out</button>
      </main>
    )
  }
  return (
    <main>
      <h1>Admin</h1>

      <div className="card">
        <label>League</label>
        <select value={activeLeague} onChange={e => { setActiveLeague(e.target.value); setActiveSeason('') }}>
          {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <div className="stack-mobile" style={{ marginTop: 12 }}>
          <button onClick={createLeague}>Create league</button>
          <button onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div className="card">
        <label>Season</label>
        <select value={activeSeason} onChange={e => setActiveSeason(e.target.value)}>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="stack-mobile" style={{ marginTop: 12 }}>
          <input type="date" value={seasonStart} onChange={e => setSeasonStart(e.target.value)} />
          <input type="number" min={1} max={52} value={seasonWeeks} onChange={e => setSeasonWeeks(Number(e.target.value))} placeholder="weeks" />
          <button onClick={createSeason} className="primary">Create season</button>
        </div>
      </div>

      <h2>Weeks</h2>
      {weeks.map(w => (
        <div key={w.id} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Week {w.week_no}</strong>
            {w.game_date && <span className="small muted">{w.game_date}</span>}
          </div>
          <input value={w.theme ?? ''} onChange={e => updateTheme(w.id, e.target.value)} placeholder="theme" style={{ marginTop: 8 }} />
          <div className="chips" style={{ marginTop: 12 }}>
            {['aces','duffleboard','minigolf'].map(r => (
              <div key={r} style={{ textAlign: 'center' }}>
                <QRCodeSVG value={`${window.location.origin}/upload/${w.id}/${r}`} size={80} />
                <div className="small">{r}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <h2>Recent scorecards</h2>
      <div className="card">
        {scorecards.map(sc => (
          <div key={sc.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--surface-2)' }}>
            <span className="small">{sc.status} — {sc.id.slice(0,8)}</span>
            {sc.status === 'locked' && <button onClick={() => unlock(sc.id)}>unlock</button>}
          </div>
        ))}
      </div>

      <h2>Admins</h2>
      <div className="card">
        {admins.map(a => <div key={a.email} className="small">{a.email}</div>)}
        <div className="stack-mobile" style={{ marginTop: 12 }}>
          <input value={newAdmin} onChange={e => setNewAdmin(e.target.value)} placeholder="email to add as admin" type="email" />
          <button onClick={addAdmin}>Add admin</button>
        </div>
      </div>
    </main>
  )
}