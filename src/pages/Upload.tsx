import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { ensureRound } from '../lib/rounds'
import Header from '../components/Header'

type ParsedRow = { team: string; scores: (number | null)[]; confidence: number }

export default function Upload() {
  const { weekId, round } = useParams()
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [submitter, setSubmitter] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null)
  const [scorecardId, setScorecardId] = useState<string | null>(null)
  const [verifyToken, setVerifyToken] = useState<string | null>(null)
  const [rotation, setRotation] = useState(0)

  // camera
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  useEffect(() => {
    supabase.from('teams').select('id,name').order('name').then(({ data }) => setTeams(data ?? []))
    ensureRound(weekId!, round!).then(r => setRoundId(r.roundId)).catch(e => setStatus(String(e)))
  }, [weekId, round])
  const onFile = (f: File) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); setFile(f); const r = new FileReader(); r.onload = () => setPreview(r.result as string); r.readAsDataURL(f); return }
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => {
        if (!blob) { setFile(f); const r = new FileReader(); r.onload = () => setPreview(r.result as string); r.readAsDataURL(f); return }
        const oriented = new File([blob], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
        setFile(oriented)
        const r = new FileReader()
        r.onload = () => setPreview(r.result as string)
        r.readAsDataURL(oriented)
      }, 'image/jpeg', 0.92)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setFile(f)
      const r = new FileReader()
      r.onload = () => setPreview(r.result as string)
      r.readAsDataURL(f)
    }
    img.src = url
  }
  const rotate = () => {
    if (!preview || !file) return
    const img = new Image()
    img.onload = () => {
      const r = (rotation + 90) % 360
      const canvas = document.createElement('canvas')
      const w = img.naturalWidth, h = img.naturalHeight
      if (r === 90 || r === 270) { canvas.width = h; canvas.height = w } else { canvas.width = w; canvas.height = h }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((r * Math.PI) / 180)
      ctx.drawImage(img, -w / 2, -h / 2)
      canvas.toBlob(blob => {
        if (!blob) return
        const f = new File([blob], file.name, { type: 'image/jpeg' })
        setFile(f)
        const rr = new FileReader()
        rr.onload = () => setPreview(rr.result as string)
        rr.readAsDataURL(f)
        setRotation(r)
      }, 'image/jpeg', 0.92)
    }
    img.src = preview
  }
  const startCamera = async () => {
    setCameraError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera not supported on this browser. Use Choose File.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setCameraOpen(true)
      // attach after render
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      }, 50)
    } catch (e) {
      setCameraError('Camera access denied or unavailable: ' + String(e))
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOpen(false)
  }

  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      if (!blob) return
      const f = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
      onFile(f)
      stopCamera()
    }, 'image/jpeg', 0.92)
  }

  const parse = async () => {
    if (!file || !preview || !roundId || !submitter) { setStatus('Pick team and photo first'); return }
    setStatus('Uploading...')
    const path = `${roundId}/${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from('scorecards').upload(path, file)
    if (upErr) { setStatus('Upload error: ' + upErr.message); return }
    setStatus('Creating card...')
    const { data: sc, error: scErr } = await supabase.from('scorecards').insert({
      round_id: roundId, image_path: path, submitter_team_id: submitter, status: 'pending'
    }).select('id,verify_token').single()
    if (scErr || !sc) { setStatus('DB error: ' + (scErr?.message ?? 'no row')); return }
    setScorecardId(sc.id); setVerifyToken(sc.verify_token)
    setStatus('Parsing with AI...')
    const { data: parsedData, error: fnErr } = await supabase.functions.invoke('parse-scorecard', { body: { image: preview, teams: teams.map(t => t.name) } })
    if (fnErr) { setStatus('Parse error: ' + fnErr.message); return }
    const parsedRes = parsedData as { teams: string[]; team_matches?: (string | null)[]; scores: (number | null)[][]; confidence?: number[] }
    const rows: ParsedRow[] = (parsedRes.teams).map((t, i) => ({
      team: parsedRes.team_matches?.[i] ?? t, scores: parsedRes.scores[i], confidence: parsedRes.confidence?.[i] ?? 50
    }))
    setParsed(rows)
    const entries: { scorecard_id: string; team_id: string | null; hole: number; strokes: number | null; confidence: number }[] = []
    rows.forEach(r => {
      const teamMatch = teams.find(t => t.name.toLowerCase() === r.team.toLowerCase())?.id ?? null
      r.scores.forEach((s, hi) => {
        entries.push({ scorecard_id: sc.id, team_id: teamMatch, hole: hi + 1, strokes: s, confidence: r.confidence })
      })
    })
    if (entries.length) await supabase.from('score_entries').insert(entries)
    setStatus('Parsed. Correct any cells, then submit.')
  }

  const updateCell = (ri: number, hi: number, val: string) => {
    setParsed(p => p ? p.map((r, i) => i === ri ? { ...r, scores: r.scores.map((s, j) => j === hi ? (val === '' ? null : Number(val)) : s) } : r) : p)
  }
  const updateTeam = (ri: number, name: string) => {
    setParsed(p => p ? p.map((r, i) => i === ri ? { ...r, team: name } : r) : p)
  }

  const submit = async () => {
    if (!parsed || !scorecardId) return
    setStatus('Saving corrections...')
    await supabase.from('score_entries').delete().eq('scorecard_id', scorecardId)
    const entries: { scorecard_id: string; team_id: string | null; hole: number; strokes: number | null; confidence: number; corrected: boolean }[] = []
    parsed.forEach(r => {
      const teamId = teams.find(t => t.name === r.team)?.id ?? null
      r.scores.forEach((s: number | null, hi: number) => {
        entries.push({ scorecard_id: scorecardId, team_id: teamId, hole: hi + 1, strokes: s, confidence: r.confidence, corrected: true })
    })
    })
    if (entries.length) await supabase.from('score_entries').insert(entries)
    await supabase.from('scorecards').update({ status: 'submitted', ocr_raw: parsed }).eq('id', scorecardId)
    setStatus('Submitted. Share the verify QR with another team on this card to lock.')
  }

  const verifyUrl = scorecardId && verifyToken ? `${window.location.origin}/verify/${scorecardId}?t=${verifyToken}` : null

  return (
    <main>
      <Header title={`Upload — ${round}`} back />

      <label>Submitter team</label>
      <select value={submitter} onChange={e => setSubmitter(e.target.value)}>
        <option value="">select...</option>
        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      <div className="stack-mobile" style={{ marginTop: 12 }}>
        <button onClick={startCamera} className="primary">📷 Take Photo</button>
        <label className="btn" style={{ margin: 0 }}>
          📁 Choose File
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      </div>
      {cameraError && <p style={{ color: 'var(--error)' }}>{cameraError}</p>}
      {cameraOpen && (
        <div className="card">
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxHeight: 320, background: '#000', borderRadius: 8 }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={capturePhoto} className="primary">Capture</button>
            <button onClick={stopCamera}>Cancel</button>
          </div>
        </div>
      )}
      {preview && (
        <div className="card">
          <img src={preview} alt="preview" className="preview-img" />
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={rotate}>🔄 Rotate 90°</button>
          </div>
        </div>
      )}
      <button onClick={parse} disabled={!file || !submitter} className="primary" style={{ width: '100%', marginTop: 12 }}>
        Parse card
      </button>
      {status && <p className="muted">{status}</p>}

      {parsed && (
        <div className="grid-scroll" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Team</th>{[1,2,3,4,5,6,7,8,9].map(h => <th key={h}>{h}</th>)}<th>Σ</th></tr></thead>
            <tbody>
              {parsed.map((r: ParsedRow, ri: number) => (
                <tr key={ri}>
                  <td>
                    <select value={r.team} onChange={e => updateTeam(ri, e.target.value)}>
                      {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                      <option value={r.team}>{r.team}</option>
                    </select>
                    <div className={r.confidence > 80 ? 'conf-high' : 'conf-low'}>conf {r.confidence}</div>
                  </td>
                  {r.scores.map((s: number | null, hi: number) => (
                    <td key={hi}>
                      <input value={s ?? ''} inputMode="numeric" onChange={e => updateCell(ri, hi, e.target.value)} />
                    </td>
                  ))}
                  <td style={{ fontWeight: 'bold' }}>{r.scores.reduce((a: number, b: number | null) => a + (b ?? 0), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {parsed && (
        <button onClick={submit} className="primary" style={{ width: '100%', marginTop: 12 }}>Submit corrected card</button>
      )}
      {verifyUrl && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>Share this with another team on the card so they can attest and lock it:</p>
          <QRCodeSVG value={verifyUrl} size={200} marginSize={4} />
          <div className="small muted" style={{ wordBreak: 'break-all', marginTop: 8 }}>{verifyUrl}</div>
        </div>
      )}
    </main>
  )
}