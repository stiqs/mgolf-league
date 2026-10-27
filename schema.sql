create extension if not exists "uuid-ossp";

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  attestation_required int default 1,
  created_at timestamptz default now()
);

create table if not exists weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references seasons(id) on delete cascade,
  week_no int not null,
  game_date date,
  unique (season_id, week_no)
);

create table if not exists mg_rounds (
  id uuid primary key default gen_random_uuid(),
  week_id uuid references weeks(id) on delete cascade,
  type text not null check (type in ('aces','duffleboard','minigolf')),
  unique (week_id, type)
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists scorecards (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references mg_rounds(id) on delete cascade,
  image_path text,
  submitter_team_id uuid references teams(id),
  status text not null default 'pending' check (status in ('pending','submitted','locked','rejected')),
  ocr_raw jsonb,
  verify_token text unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz default now(),
  locked_at timestamptz,
  locked_by_team_id uuid references teams(id)
);

create table if not exists score_entries (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid references scorecards(id) on delete cascade,
  team_id uuid references teams(id),
  player_id uuid references players(id),
  hole int not null check (hole between 1 and 9),
  strokes int check (strokes between 0 and 8),
  confidence int,
  corrected boolean default false
);
create unique index if not exists score_entries_team_hole_uidx on score_entries(scorecard_id, team_id, hole) where player_id is null;
create unique index if not exists score_entries_player_hole_uidx on score_entries(scorecard_id, player_id, hole) where player_id is not null;

create table if not exists attestations (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid references scorecards(id) on delete cascade,
  team_id uuid references teams(id),
  created_at timestamptz default now(),
  unique (scorecard_id, team_id)
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid references scorecards(id) on delete cascade,
  action text not null,
  actor_team_id uuid references teams(id),
  device_id text,
  payload jsonb,
  created_at timestamptz default now()
);

insert into storage.buckets (id, name, public) values ('scorecards', 'scorecards', true) on conflict do nothing;

alter table teams enable row level security;
alter table seasons enable row level security;
alter table weeks enable row level security;
alter table mg_rounds enable row level security;
alter table players enable row level security;
alter table scorecards enable row level security;
alter table score_entries enable row level security;
alter table attestations enable row level security;
alter table audit_log enable row level security;

create policy "anon all teams" on teams for all to anon using (true) with check (true);
create policy "anon all seasons" on seasons for all to anon using (true) with check (true);
create policy "anon all weeks" on weeks for all to anon using (true) with check (true);
create policy "anon all mg_rounds" on mg_rounds for all to anon using (true) with check (true);
create policy "anon all players" on players for all to anon using (true) with check (true);
create policy "anon all scorecards" on scorecards for all to anon using (true) with check (true);
create policy "anon all score_entries" on score_entries for all to anon using (true) with check (true);
create policy "anon all attestations" on attestations for all to anon using (true) with check (true);
create policy "anon all audit_log" on audit_log for all to anon using (true) with check (true);

alter publication supabase_realtime add table scorecards;
alter publication supabase_realtime add table score_entries;
alter publication supabase_realtime add table attestations;
SQL
ssh root@supabase.muzoapps.com 'docker exec -i supabase-db psql -U postgres -d postgres' < /home/stiqs/git/mgolf-league/schema.sql 2>&1 | tail -15