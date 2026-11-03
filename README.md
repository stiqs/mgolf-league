# Par-Tee Tracker

Crowd-sourced mini-golf league scorecard PWA. Hosted at `mini-golf.muzoapps.com`.

## Stack
- Vite + React + TypeScript PWA
- Supabase (self-hosted on `supabase.muzoapps.com`): Postgres, Auth (Google OAuth + magic link), Storage `scorecards`, Edge function `parse-scorecard`
- Image parsing via OpenRouter `google/gemini-3.1-pro-preview` (`OPENROUTER_MODEL` in `/opt/supabase/docker/.env`)

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