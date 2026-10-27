import '@supabase/functions-js/edge-runtime.d.ts'

const MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'google/gemini-2.5-flash'
const TIMEOUT_MS = 45_000

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function prompt(teamList: string[]): string {
  const teamsHint = teamList.length ? `\nKnown league team names (match each row to one of these if possible, otherwise return the raw handwritten name):\n${teamList.join(', ')}` : ''
  return `This is a photo of a mini-golf scorecard from Flatstick Pub. It has a grid:
- Columns: HOLE 1..9, then TOTAL. PAR row is 3 for each hole (total 27).
- Rows: one per team/player. The team name or initials is written in the LEFTMOST column of the grid (the row label), NOT in the title text at the top of the card. Read EVERY row that has a label in that leftmost column — do not skip any, even if the name is abbreviated or is initials.

The single handwritten word in the top-left corner of the card indicates the type of round (e.g. "Aces", "Duffleboard", "Golf"). Read only that one word, not the title text elsewhere.

Read the card and return ONLY a JSON object:
{
  "round_label": "<the single top-left handwritten word, exactly as written>",
  "teams": ["<raw handwritten name as written>", ...],
  "team_matches": ["<matched league team name or null>", ...],
  "scores": [[<strokes or null>, ... 9 values], ...],
  "confidence": [<0-100 per row>, ...],
  "notes": "<short observations>"
}
Rules:
- One array entry per team row, in top-to-bottom order.
- strokes is an integer 0..8, or null if blank/unreadable.
- Use the name exactly as handwritten (do not correct).
- Count the rows carefully: if there are 3 team rows, return 3 entries. Never drop a row.
${teamsHint}`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return json(503, { error: 'reader not configured' })

  const body = await req.json().catch(() => null)
  const image = typeof body?.image === 'string' ? body.image : ''
  if (!image.startsWith('data:image/')) {
    return json(422, { error: 'image must be a data URL' })
  }
  const teamList: string[] = Array.isArray(body?.teams) ? body.teams.filter((x: unknown) => typeof x === 'string') : []

  const openrouter = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2_000,
      temperature: 0,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: image } },
        { type: 'text', text: prompt(teamList) },
      ] }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => (e instanceof Error ? e : null))

  if (!openrouter || !(openrouter instanceof Response)) {
    return json(504, { error: 'reader timed out' })
  }
  if (!openrouter.ok) {
    const detail = await openrouter.text().catch(() => '')
    return json(502, { error: `reader refused (${openrouter.status})`, detail: detail.slice(0, 200) })
  }
  const completion = await openrouter.json().catch(() => null)
  const text: string | undefined = completion?.choices?.[0]?.message?.content
  if (typeof text !== 'string') return json(502, { error: 'no reading' })

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  let parsed: unknown
  try { parsed = JSON.parse(cleaned) } catch {
    return json(502, { error: 'unreadable answer', raw: cleaned.slice(0, 500) })
  }
  return json(200, { ...parsed as object, reader: MODEL })
})