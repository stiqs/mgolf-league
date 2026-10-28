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
-- ---------------------------------------------------------------------------
-- Added after initial deploy (kept here so a fresh apply matches production).
-- ---------------------------------------------------------------------------

create table if not exists leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  owner_user_id uuid,
  created_at timestamptz default now()
);

create table if not exists league_members (
  league_id uuid references leagues(id) on delete cascade,
  user_id uuid,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz default now(),
  primary key (league_id, user_id)
);

create table if not exists admins (
  email text primary key,
  created_at timestamptz default now()
);

alter table seasons add column if not exists league_id uuid references leagues(id) on delete cascade;
alter table seasons add column if not exists number_of_weeks int;
alter table teams add column if not exists league_id uuid references leagues(id) on delete cascade;
alter table weeks add column if not exists theme text;

-- team names are unique per league, not globally
alter table teams drop constraint if exists teams_name_key;
create unique index if not exists teams_league_name_uidx on teams(league_id, name);

alter table leagues enable row level security;
alter table league_members enable row level security;
alter table admins enable row level security;

-- League scoping: helpers, owner backfill, scoped write policies
-- helper functions
create or replace function is_global_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where email = (auth.jwt() ->> 'email'))
$$;

create or replace function is_league_admin(p_league uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members m where m.league_id = p_league and m.user_id = auth.uid() and m.role in ('owner','admin'))
$$;

create or replace function league_of_week(p_week uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.league_id from weeks w join seasons s on s.id = w.season_id where w.id = p_week
$$;

create or replace function league_of_round(p_round uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.league_id from mg_rounds r join weeks w on w.id = r.week_id join seasons s on s.id = w.season_id where r.id = p_round
$$;

-- backfill owners into league_members
insert into league_members (league_id, user_id, role)
select id, owner_user_id, 'owner' from leagues where owner_user_id is not null
on conflict (league_id, user_id) do nothing;

-- drop permissive policies
drop policy if exists "anon all leagues" on leagues;
drop policy if exists "auth_all_leagues" on leagues;
drop policy if exists "anon all league_members" on league_members;
drop policy if exists "auth_all_league_members" on league_members;
drop policy if exists "anon all seasons" on seasons;
drop policy if exists "auth_all_seasons" on seasons;
drop policy if exists "anon all weeks" on weeks;
drop policy if exists "auth_all_weeks" on weeks;
drop policy if exists "anon all mg_rounds" on mg_rounds;
drop policy if exists "auth_all_mg_rounds" on mg_rounds;
drop policy if exists "anon all teams" on teams;
drop policy if exists "auth_all_teams" on teams;

-- leagues: public read, scoped writes
create policy leagues_select on leagues for select to anon, authenticated using (true);
create policy leagues_insert on leagues for insert to authenticated with check (is_global_admin() or owner_user_id = auth.uid());
create policy leagues_update on leagues for update to authenticated using (is_global_admin() or is_league_admin(id));
create policy leagues_delete on leagues for delete to authenticated using (is_global_admin() or owner_user_id = auth.uid());

-- league_members
create policy lm_select on league_members for select to anon, authenticated using (true);
create policy lm_insert on league_members for insert to authenticated with check (is_global_admin() or is_league_admin(league_id));
create policy lm_update on league_members for update to authenticated using (is_global_admin() or is_league_admin(league_id));
create policy lm_delete on league_members for delete to authenticated using (is_global_admin() or is_league_admin(league_id));

-- seasons
create policy seasons_select on seasons for select to anon, authenticated using (true);
create policy seasons_insert on seasons for insert to authenticated with check (is_global_admin() or is_league_admin(league_id));
create policy seasons_update on seasons for update to authenticated using (is_global_admin() or is_league_admin(league_id));
create policy seasons_delete on seasons for delete to authenticated using (is_global_admin() or is_league_admin(league_id));

-- weeks
create policy weeks_select on weeks for select to anon, authenticated using (true);
create policy weeks_insert on weeks for insert to authenticated with check (is_global_admin() or is_league_admin((select league_id from seasons where id = season_id)));
create policy weeks_update on weeks for update to authenticated using (is_global_admin() or is_league_admin((select league_id from seasons where id = season_id)));
create policy weeks_delete on weeks for delete to authenticated using (is_global_admin() or is_league_admin((select league_id from seasons where id = season_id)));

-- rounds
create policy rounds_select on mg_rounds for select to anon, authenticated using (true);
create policy rounds_insert on mg_rounds for insert to authenticated with check (is_global_admin() or is_league_admin(league_of_week(week_id)));
create policy rounds_update on mg_rounds for update to authenticated using (is_global_admin() or is_league_admin(league_of_week(week_id)));
create policy rounds_delete on mg_rounds for delete to authenticated using (is_global_admin() or is_league_admin(league_of_week(week_id)));

-- teams
create policy teams_select on teams for select to anon, authenticated using (true);
create policy teams_insert on teams for insert to authenticated with check (is_global_admin() or is_league_admin(league_id));
create policy teams_update on teams for update to authenticated using (is_global_admin() or is_league_admin(league_id));
create policy teams_delete on teams for delete to authenticated using (is_global_admin() or is_league_admin(league_id));

-- Allow a new owner to add their own membership row
drop policy if exists lm_insert on league_members;
create policy lm_insert on league_members for insert to authenticated with check (is_global_admin() or is_league_admin(league_id) or exists (select 1 from leagues l where l.id = league_id and l.owner_user_id = auth.uid()));

-- League admin management (email → user id, security definer)
create or replace function add_league_admin(p_league uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not (is_global_admin() or is_league_admin(p_league)) then
    raise exception 'not authorized';
  end if;
  select id into uid from auth.users where email = p_email;
  if uid is null then raise exception 'no user with that email'; end if;
  insert into league_members (league_id, user_id, role) values (p_league, uid, 'admin')
  on conflict (league_id, user_id) do update set role = 'admin';
end $$;

create or replace function remove_league_admin(p_league uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not (is_global_admin() or is_league_admin(p_league)) then
    raise exception 'not authorized';
  end if;
  select id into uid from auth.users where email = p_email;
  if uid is null then return; end if;
  delete from league_members where league_id = p_league and user_id = uid and role <> 'owner';
end $$;

create or replace function list_league_admins(p_league uuid) returns table(email text, role text)
language sql security definer set search_path = public as $$
  select u.email, m.role
  from league_members m
  join auth.users u on u.id = m.user_id
  where m.league_id = p_league and m.role in ('owner','admin')
  order by m.role, u.email
$$;

grant execute on function add_league_admin(uuid, text) to authenticated;
grant execute on function remove_league_admin(uuid, text) to authenticated;
grant execute on function list_league_admins(uuid) to authenticated;
