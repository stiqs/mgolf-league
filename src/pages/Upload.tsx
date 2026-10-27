import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { ensureRound } from '../lib/rounds'

type ParsedRow = { team: string; scores: (number | null)[]; confidence: number }

export default function Upload() {
  const { week, round } = useParams()
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
    ensureRound(Number(week), round!).then(r => setRoundId(r.roundId)).catch(e => setStatus(String(e)))
  }, [week, round])
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
    <main style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h1>Upload scorecard — week {week} / {round}</h1>
      <label>Submitter team:
        <select value={submitter} onChange={e => setSubmitter(e.target.value)}>
          <option value="">select...</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <div style={{ margin: '12px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={startCamera}>📷 Take Photo</button>
        <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
      </div>
      {cameraError && <p style={{ color: '#f87171' }}>{cameraError}</p>}
      {cameraOpen && (
        <div style={{ margin: '12px 0' }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ maxWidth: '100%', maxHeight: 300, background: '#000' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={capturePhoto}>Capture</button>
            <button onClick={stopCamera}>Cancel</button>
          </div>
        </div>
      )}
      {preview && (
        <div>
          <img src={preview} alt="preview" style={{ maxWidth: '100%', maxHeight: 300 }} />
          <div style={{ marginTop: 8 }}>
            <button onClick={rotate}>🔄 Rotate 90°</button>
          </div>
        </div>
      )}
      <div style={{ margin: '12px 0' }}>
        <button onClick={parse} disabled={!file || !submitter}>Parse card</button>
      </div>
      <p>{status}</p>
      {parsed && (
        <div style={{ overflowX: 'auto' }}>
          <table border={1} cellPadding={4}>
            <thead><tr><th>Team</th>{[1,2,3,4,5,6,7,8,9].map(h => <th key={h}>{h}</th>)}<th>TOTAL</th></tr></thead>
            <tbody>
              {parsed.map((r: ParsedRow, ri: number) => (
                <tr key={ri}>
                  <td>
                    <select value={r.team} onChange={e => updateTeam(ri, e.target.value)}>
                      {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                      <option value={r.team}>{r.team}</option>
                    </select>
                    <div style={{ fontSize: 11, color: r.confidence > 80 ? 'green' : 'orange' }}>conf {r.confidence}</div>
                  </td>
                  {r.scores.map((s: number | null, hi: number) => (
                    <td key={hi}>
                      <input style={{ width: 36 }} value={s ?? ''} onChange={e => updateCell(ri, hi, e.target.value)} />
                    </td>
                  ))}
                  <td style={{ fontWeight: 'bold' }}>{r.scores.reduce((a: number, b: number | null) => a + (b ?? 0), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ margin: '12px 0' }}>
            <button onClick={submit}>Submit corrected card</button>
          </div>
        </div>
      )}
      {verifyUrl && (
        <div style={{ margin: '12px 0' }}>
          <p>Verify URL (share with another team on this card):</p>
          <code style={{ wordBreak: 'break-all' }}>{verifyUrl}</code>
          <QRCodeSVG value={verifyUrl} size={180} />
        </div>
      )}
    </main>
  )
}