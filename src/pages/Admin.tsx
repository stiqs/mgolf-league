import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

const LEAGUE_TEAMS = ["Stroke Play","Putter Nonsense","The Dubs","Prestige worldwide","Putt Putt Phlop","Complete and Putter Madness","Par-Tini","Power Putt Girls","Bad boyz","Hoppy Gilmore","hala madrid","Arnold Pomeranians","Putt Stuff","The Royal Putters","Open for suggestions","Just here for Beer","Beginners Luck","Mai Tais and Mulligans","Ding & Dong","Hakuna Ma-Putta","What The Putt"]

function monthName(d: Date) {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function isCurrent(s: { start_date: string | null; number_of_weeks: number | null }, today = new Date()): boolean {
  if (!s.start_date) return false
  const start = new Date(s.start_date + 'T00:00:00Z')
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + ((s.number_of_weeks ?? 1) * 7))
  return today >= start && today < end
}

export default function Admin() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [canManage, setCanManage] = useState<boolean | null>(null)
  const [leagues, setLeagues] = useState<any[]>([])
  const [activeLeague, setActiveLeague] = useState<string>('')
  const [seasons, setSeasons] = useState<any[]>([])
  const [activeSeason, setActiveSeason] = useState<string>('')
  const [activeWeek, setActiveWeek] = useState<string>('')
  const [weeks, setWeeks] = useState<any[]>([])
  const [scorecards, setScorecards] = useState<any[]>([])
  const [admins, setAdmins] = useState<any[]>([])
  const [leagueAdmins, setLeagueAdmins] = useState<{ email: string; role: string }[]>([])
  const [adminEmail, setAdminEmail] = useState('')
  const [newAdmin, setNewAdmin] = useState('')
  const [seasonStart, setSeasonStart] = useState('')
  const [seasonWeeks, setSeasonWeeks] = useState(8)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setIsAdmin(null); setCanManage(null); return }
    ;(async () => {
      const { data: adminRow } = await supabase.from('admins').select('email').eq('email', session.user.email).maybeSingle()
      let global = !!adminRow
      if (!global) {
        const { count, error } = await supabase.from('admins').select('email', { count: 'exact', head: true })
        if (!error && (count ?? 0) === 0) {
          const { error: ie } = await supabase.from('admins').insert({ email: session.user.email })
          global = !ie
        }
      }
      setIsAdmin(global)
      const { data: mem } = await supabase.from('league_members')
        .select('role').eq('user_id', session.user.id).in('role', ['owner', 'admin'])
      setCanManage(global || (mem?.length ?? 0) > 0)
    })()
  }, [session])

  const loadLeagues = async () => {
    const { data } = await supabase.from('leagues').select('*').order('created_at')
    let visible = data ?? []
    if (session && !isAdmin) {
      const { data: mem } = await supabase.from('league_members')
        .select('league_id,role').eq('user_id', session.user.id).in('role', ['owner', 'admin'])
      const ids = new Set((mem ?? []).map(m => m.league_id))
      visible = visible.filter(l => ids.has(l.id))
    }
    setLeagues(visible)
    if (!activeLeague && visible.length) setActiveLeague(visible[0].id)
  }
  const loadSeasons = async () => {
    if (!activeLeague) return
    const { data } = await supabase.from('seasons').select('*').eq('league_id', activeLeague).order('start_date')
    const ss = data ?? []
    setSeasons(ss)
    if (!activeSeason && ss.length) {
      const current = ss.find(s => isCurrent(s))
      const latest = ss.filter(s => s.start_date).sort((a, b) => (a.start_date! < b.start_date! ? 1 : -1))[0]
      setActiveSeason((current ?? latest ?? ss[ss.length - 1]).id)
    }
  }
  const load = async () => {
    if (!activeSeason) { setWeeks([]); setScorecards([]); return }
    const { data: w } = await supabase.from('weeks').select('*').eq('season_id', activeSeason).order('week_no')
    const ws = w ?? []
    setWeeks(ws)
    setActiveWeek(prev => ws.some(x => x.id === prev) ? prev : (ws[0]?.id ?? ''))
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
  const loadLeagueAdmins = async () => {
    if (!activeLeague) { setLeagueAdmins([]); return }
    const { data } = await supabase.rpc('list_league_admins', { p_league: activeLeague })
    setLeagueAdmins((data as { email: string; role: string }[]) ?? [])
  }
  useEffect(() => { if (session && canManage) { loadLeagues(); loadAdmins() } }, [session, canManage])
  useEffect(() => { if (session && canManage && activeLeague) loadLeagueAdmins() }, [session, canManage, activeLeague])
  useEffect(() => { if (session && canManage && activeLeague) loadSeasons() }, [session, canManage, activeLeague])
  useEffect(() => { if (session && canManage && activeSeason) load() }, [session, canManage, activeSeason])

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
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'league'
    let slug = base
    for (let i = 0; i < 50; i++) {
      const { data: exists } = await supabase.from('leagues').select('id').eq('slug', slug).maybeSingle()
      if (!exists) break
      slug = `${base}-${i + 2}`
    }
    const { data: league, error: leagueErr } = await supabase.from('leagues').insert({ name, slug, owner_user_id: session.user.id }).select('id').single()
    if (leagueErr || !league) { alert('Could not create league: ' + (leagueErr?.message ?? 'unknown error')); return }
    await supabase.from('league_members').insert({ league_id: league.id, user_id: session.user.id, role: 'owner' })
    const { error: teamsErr } = await supabase.from('teams').insert(LEAGUE_TEAMS.map((t, i) => ({ name: t, sort_order: i, league_id: league.id })))
    if (teamsErr) alert('League created, but teams failed to seed: ' + teamsErr.message)
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
    const { data: createdWeeks } = await supabase.from('weeks').insert(rows).select('id')
    if (createdWeeks?.length) {
      const rounds = createdWeeks.flatMap(w => ['aces', 'duffleboard', 'minigolf'].map(type => ({ week_id: w.id, type })))
      const { error: roundsErr } = await supabase.from('mg_rounds').insert(rounds)
      if (roundsErr) alert('Season created, but rounds failed to seed: ' + roundsErr.message)
    }
    await loadSeasons()
    setActiveSeason(season.id)
  }
  const addWeek = async () => {
    if (!activeSeason) { alert('Select or create a season first'); return }
    const season = seasons.find(s => s.id === activeSeason)
    const { data: ws } = await supabase.from('weeks').select('week_no').eq('season_id', activeSeason)
    const n = (ws && ws.length) ? Math.max(...ws.map(w => w.week_no)) + 1 : 1
    let game_date: string | null = null
    if (season?.start_date) {
      const d = new Date(season.start_date + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + (n - 1) * 7)
      game_date = d.toISOString().slice(0, 10)
    }
    const { data: wk } = await supabase.from('weeks').insert({ season_id: activeSeason, week_no: n, game_date, theme: '' }).select('id').single()
    if (wk) {
      await supabase.from('mg_rounds').insert([
        { week_id: wk.id, type: 'aces' },
        { week_id: wk.id, type: 'duffleboard' },
        { week_id: wk.id, type: 'minigolf' },
      ])
      setActiveWeek(wk.id)
    }
    load()
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
  const addLeagueAdmin = async () => {
    if (!activeLeague || !adminEmail) return
    const { error } = await supabase.rpc('add_league_admin', { p_league: activeLeague, p_email: adminEmail })
    if (error) { alert(error.message); return }
    setAdminEmail('')
    loadLeagueAdmins()
  }
  const removeLeagueAdmin = async (email: string) => {
    if (!activeLeague) return
    const { error } = await supabase.rpc('remove_league_admin', { p_league: activeLeague, p_email: email })
    if (error) { alert(error.message); return }
    loadLeagueAdmins()
  }
  const signOut = async () => { await supabase.auth.signOut() }

  if (!session) {
    return (
      <main>
        <Header title="Admin login" back />
        <div className="stack" style={{ maxWidth: 360 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email" type="email" autoComplete="email" />
          <button onClick={login}>Send magic link</button>
          <button onClick={googleLogin} className="primary">Sign in with Google</button>
        </div>
      </main>
    )
  }
  if (canManage === null) {
    return <main><p>Checking permissions...</p></main>
  }
  if (!canManage) {
    return (
      <main>
        <Header title="Not authorized" back />
        <p>Your account ({session.user.email}) is not an admin of any league.</p>
        <button onClick={signOut}>Sign out</button>
      </main>
    )
  }
  return (
    <main>
      <Header title="Admin" back />

      <div className="card">
        <label>League</label>
        <select value={activeLeague} onChange={e => { setActiveLeague(e.target.value); setActiveSeason('') }}>
          {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <div className="stack-mobile" style={{ marginTop: 12 }}>
          <button onClick={createLeague}>Create league</button>
          <button onClick={signOut}>Sign out</button>
        </div>
        {(() => {
          const l = leagues.find(x => x.id === activeLeague)
          if (!l?.slug) return null
          const url = `${window.location.origin}/l/${l.slug}`
          return (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <div className="small muted" style={{ marginBottom: 8 }}>Share this league</div>
              <QRCodeSVG value={url} size={140} marginSize={4} />
              <div className="small muted" style={{ wordBreak: 'break-all', marginTop: 8 }}>{url}</div>
            </div>
          )
        })()}
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

      <h2>League admins</h2>
      <div className="card">
        {leagueAdmins.length === 0 && <div className="small muted">No admins yet.</div>}
        {leagueAdmins.map(a => (
          <div key={a.email} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
            <span className="small">{a.email} <span className="muted">({a.role})</span></span>
            {a.role !== 'owner' && <button onClick={() => removeLeagueAdmin(a.email)}>remove</button>}
          </div>
        ))}
        <div className="stack-mobile" style={{ marginTop: 12 }}>
          <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="email to add as league admin" type="email" />
          <button onClick={addLeagueAdmin}>Add league admin</button>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>The person must have signed up already.</p>
      </div>

      <h2>Weeks</h2>
      <div className="card">
        <label htmlFor="week">Week</label>
        <select id="week" value={activeWeek} onChange={e => setActiveWeek(e.target.value)}>
          {weeks.length === 0 && <option value="">No weeks yet</option>}
          {weeks.map(w => (
            <option key={w.id} value={w.id}>Week {w.week_no}{w.theme ? ` — ${w.theme}` : ''}{w.game_date ? ` (${w.game_date})` : ''}</option>
          ))}
        </select>
        <button onClick={addWeek} style={{ marginTop: 12 }}>Add week</button>
      </div>

      {(() => {
        const w = weeks.find(x => x.id === activeWeek)
        if (!w) return null
        return (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Week {w.week_no}</strong>
              {w.game_date && <span className="small muted">{w.game_date}</span>}
            </div>
            <input value={w.theme ?? ''} onChange={e => updateTheme(w.id, e.target.value)} placeholder="theme" style={{ marginTop: 8 }} />
            <div className="chips" style={{ marginTop: 12 }}>
              {['aces','duffleboard','minigolf'].map(r => (
                <div key={r} style={{ textAlign: 'center' }}>
                  <QRCodeSVG value={`${window.location.origin}/upload/${w.id}/${r}`} size={80} marginSize={4} />
                  <div className="small">{r}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      <h2>Recent scorecards</h2>
      <div className="card">
        {scorecards.map(sc => (
          <div key={sc.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--surface-2)' }}>
            <span className="small">{sc.status} — {sc.id.slice(0,8)}</span>
            {sc.status === 'locked' && <button onClick={() => unlock(sc.id)}>unlock</button>}
          </div>
        ))}
      </div>

      {isAdmin && (
        <>
          <h2>Admins</h2>
          <div className="card">
            {admins.map(a => <div key={a.email} className="small">{a.email}</div>)}
            <div className="stack-mobile" style={{ marginTop: 12 }}>
              <input value={newAdmin} onChange={e => setNewAdmin(e.target.value)} placeholder="email to add as admin" type="email" />
              <button onClick={addAdmin}>Add admin</button>
            </div>
          </div>
        </>
      )}
    </main>
  )
}