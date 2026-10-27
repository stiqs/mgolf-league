import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Verify() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const token = sp.get('t')
  const [card, setCard] = useState<any>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [verifier, setVerifier] = useState<string>('')
  const [msg, setMsg] = useState<string>('')

  useEffect(() => {
    supabase.from('teams').select('id,name').order('name').then(({ data }) => setTeams(data ?? []))
    supabase.from('scorecards').select('*').eq('id', id!).single().then(({ data }) => setCard(data))
    supabase.from('score_entries').select('*').eq('scorecard_id', id!).then(({ data }) => setEntries(data ?? []))
  }, [id])

  const attest = async () => {
    if (!verifier || !card) return
    if (verifier === card.submitter_team_id) { setMsg('Verifier must be a different team than submitter'); return }
    const onCard = entries.some(e => e.team_id === verifier)
    if (!onCard) { setMsg('Verifier team must be on this card'); return }
    const { error } = await supabase.from('attestations').insert({ scorecard_id: id, team_id: verifier })
    if (error) { setMsg('Error: ' + error.message); return }
    // check count
    const { data: atts } = await supabase.from('attestations').select('team_id').eq('scorecard_id', id!)
    const required = 1
    if ((atts?.length ?? 0) >= required) {
      await supabase.from('scorecards').update({ status: 'locked', locked_at: new Date().toISOString(), locked_by_team_id: verifier }).eq('id', id!)
      setMsg('Card locked. Thank you!')
    } else {
      setMsg('Attestation recorded. Need more verifiers.')
    }
    // refresh
    const { data: c } = await supabase.from('scorecards').select('*').eq('id', id!).single()
    setCard(c)
  }

  if (!card) return <main style={{ padding: 16 }}>Loading...</main>
  const img = card.image_path ? supabase.storage.from('scorecards').getPublicUrl(card.image_path).data.publicUrl : null

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h1>Verify scorecard</h1>
      <p>Status: {card.status}</p>
      {img && <img src={img} alt="card" style={{ maxWidth: '100%', maxHeight: 400 }} />}
      <h3>Parsed scores</h3>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Team</th>{[1,2,3,4,5,6,7,8,9].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {teams.filter(t => entries.some(e => e.team_id === t.id)).map(t => (
            <tr key={t.id}>
              <td>{t.name}</td>
              {[1,2,3,4,5,6,7,8,9].map(h => {
                const e = entries.find(x => x.team_id === t.id && x.hole === h)
                return <td key={h}>{e?.strokes ?? ''}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {card.status !== 'locked' && (
        <div style={{ margin: '12px 0' }}>
          <label>Your team (verifier):
            <select value={verifier} onChange={e => setVerifier(e.target.value)}>
              <option value="">select...</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button onClick={attest} style={{ marginLeft: 8 }}>I verify this card is authentic</button>
          <p>{msg}</p>
        </div>
      )}
      {token && <p style={{ fontSize: 11, color: '#666' }}>token: {token}</p>}
    </main>
  )
}