-- Esquema inicial para persistir perfiles y partidas consultadas.
-- Ejecutar en el SQL Editor de Supabase.

create table if not exists public.players (
  puuid text primary key,
  game_name text not null,
  tag_line text not null,
  region text not null,
  summoner_level integer,
  profile_icon_id integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  match_id text primary key,
  region text not null,
  queue_id integer not null,
  game_creation timestamptz,
  game_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.player_matches (
  puuid text not null references public.players(puuid) on delete cascade,
  match_id text not null references public.matches(match_id) on delete cascade,
  champion_id integer,
  champion_name text,
  champion_image text,
  win boolean not null,
  team_id integer,
  played_at timestamptz,
  primary key (puuid, match_id)
);

create index if not exists player_matches_puuid_played_at_idx
  on public.player_matches (puuid, played_at desc);

create index if not exists player_matches_match_id_idx
  on public.player_matches (match_id);

-- El backend usara la service role key; el frontend nunca debe conectarse
-- directamente con esta base de datos.
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.player_matches enable row level security;

-- Tablas compartidas. El backend usa la service role key; no se expone al navegador.
create table if not exists public.shared_tables (
  code text primary key check (code ~ '^[A-Z2-9]{8}$'),
  tables jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.shared_tables enable row level security;
