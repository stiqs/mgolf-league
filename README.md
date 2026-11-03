# Par-Tee Tracker

Crowd-sourced mini-golf league scorecard PWA. Hosted at `mini-golf.muzoapps.com`.

## Stack
- Vite + React + TypeScript PWA
- Supabase (self-hosted on `supabase.muzoapps.com`): Postgres, Auth (Google OAuth + magic link), Storage `scorecards`, Edge function `parse-scorecard`
- Image parsing via OpenRouter `google/gemini-3.1-pro-preview` (`OPENROUTER_MODEL` in `/opt/supabase/docker/.env`)

## Environment
Create `.env.local`:
```
VITE_SUPABASE_URL=https://supabase.muzoapps.com
VITE_SUPABASE_ANON_KEY=<anon key>
```

## Database
Apply `schema.sql` then `seed_teams.sql` (or assign teams per league in Admin). Edge function `parse-scorecard` lives at `/opt/supabase/docker/volumes/functions/parse-scorecard/index.ts`; restart `supabase-edge-functions` after edits.

## Using the app
- Pick a league on Home, then a season/week and round.
- Upload a photo of the paper scorecard; AI parses rows; correct cells, submit.
- Share the verify QR with another team on the same card to lock scores.
- `/tally/:weekId` shows per-team section + total scores.
- `/cards/:weekId/:round` browses submitted cards.

## Routes
- `/` — league directory + hero
- `/l/:slug` — league landing (weeks, rounds, weekly tally link)
- `/upload/:weekId/:round` — upload + AI-parse a scorecard (`aces` | `duffleboard` | `minigolf`)
- `/cards/:weekId/:round` — view submitted scorecards for a round
- `/tally/:weekId` — weekly tally (per-section + total, dedup by locked/newest)
- `/verify/:id` — cross-team attestation + lock
- `/admin` — league/season/week/team/admin management (global admin or league owner/admin)

## Roles
- Global admin: `admins` table
- League admin: `league_members` (`owner`/`admin`/`member`)
- `canManage` = global admin OR league owner/admin

## Dev
```
npm install
npm run dev        # http://localhost:5173, /api proxied
npm run build      # tsc -b && vite build
```

## Deploy
```
npm run build
tar czf - -C dist . | ssh -i ~/.ssh/mini-golf-deploy deploy@2.25.249.238
```
Service worker uses `navigateFallback: null` + NetworkFirst navigations so fresh deploys load on first visit.

## Schema
`schema.sql` is the source of truth (synced with live DB). RLS: reads public on leagues/seasons/weeks/mg_rounds/teams; writes scoped via `is_global_admin()`/`is_league_admin()`; scorecards/score_entries/attestations anon-writable for crowd-sourcing.

## Rounds
- Aces: one shot per hole
- Duffleboard: tabletop golf, one shot
- Mini-golf: 9 holes stroke play