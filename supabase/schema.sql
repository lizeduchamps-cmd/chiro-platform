-- Chiro Hoepertingen Financiënplatform — databaseschema (Supabase/Postgres)
-- Voer dit uit via Supabase Dashboard > SQL Editor > New query

-- ============ GEBRUIKERS & ROLLEN ============

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  discord_id text unique not null,        -- stabiele Discord user-ID, primaire koppeling
  discord_username text,                   -- huidige Discord-gebruikersnaam (kan wijzigen, enkel voor weergave)
  naam text not null,
  email text,
  type text not null default 'Leiding' check (type in ('Hoofdleiding', 'Leiding', 'Logistiek')),
  groep text check (groep in ('Sloebers', 'Speelclub', 'Rakwi', 'Tito', 'Keti', 'Aspi') or groep is null),
  verantwoordelijkheden text[] default '{}',
  -- Platformrecht wordt handmatig toegekend door een admin via het beheerscherm
  -- (niet automatisch uit Discord-rollen gehaald — zie README).
  platform_recht text not null default 'lid' check (platform_recht in ('admin', 'financieel_verantwoordelijke', 'lid')),
  -- Streepjes & online drank (zie /streepjes)
  fysieke_streepjes numeric(10,2) not null default 0,   -- handmatig ingevoerd, in aantal streepjes
  online_streepjes_bedrag numeric(10,2) not null default 0,  -- laatst geüploade bedrag uit de Discord-bot-CSV
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============ INSTELLINGEN ============
-- Generieke key/waarde-tabel voor platforminstellingen (bv. prijs per streepje).

create table if not exists instellingen (
  key text primary key,
  waarde text,
  updated_at timestamptz default now()
);

-- ============ WERKJAREN & REKENINGEN ============

create table if not exists werkjaren (
  id uuid primary key default gen_random_uuid(),
  naam text unique not null,               -- bv. '2025-2026'
  actief boolean default false,
  created_at timestamptz default now()
);

create table if not exists rekeningen (
  id uuid primary key default gen_random_uuid(),
  werkjaar_id uuid references werkjaren(id) on delete cascade,
  type text not null check (type in ('zicht', 'spaar')),
  startsaldo numeric(10,2) not null default 0,
  created_at timestamptz default now(),
  unique(werkjaar_id, type)
);

-- ============ CATEGORIEËN ============

create table if not exists categorieen (
  id uuid primary key default gen_random_uuid(),
  naam text unique not null,
  is_standaard boolean default false,      -- true voor de vooraf ingestelde lijst, false voor zelf toegevoegde
  created_at timestamptz default now()
);

insert into categorieen (naam, is_standaard) values
  ('4-uurtje', true),
  ('Bier', true),
  ('Drank leiding', true),
  ('Financieel Verslag', true),
  ('Fuif', true),
  ('Huur', true),
  ('Kamp', true),
  ('Kerstfeestje', true),
  ('Ledenactiviteit', true),
  ('Lidgeld', true),
  ('Papierslag', true),
  ('Payconiq/SumUp', true),
  ('Sinterklaas', true),
  ('Subsidie', true),
  ('Taartenslag', true),
  ('Uniformen', true),
  ('Wifi', true),
  ('Winkellijst', true),
  ('Onduidelijk/Nog in te vullen', true)
on conflict (naam) do nothing;

create table if not exists categorisatie_regels (
  id uuid primary key default gen_random_uuid(),
  veld text not null check (veld in ('omschrijving', 'tegenpartij', 'vrije_mededeling')),
  bevat_tekst text not null,
  categorie_id uuid references categorieen(id) on delete cascade,
  prioriteit int default 100,               -- lager = eerder toegepast
  created_at timestamptz default now()
);

-- ============ TRANSACTIES (KASBOEK) ============

create table if not exists transacties (
  id uuid primary key default gen_random_uuid(),
  werkjaar_id uuid references werkjaren(id) on delete cascade,
  rekening_type text not null check (rekening_type in ('zicht', 'spaar')),
  datum date not null,
  soort text not null check (soort in ('inkomst', 'uitgave', 'interne_transactie')),
  tegenpartij text,
  iban_tegenpartij text,
  vrije_mededeling text,
  omschrijving text,
  bedrag numeric(10,2) not null,           -- altijd positief; 'soort' bepaalt de richting
  categorie_id uuid references categorieen(id),
  categorie_handmatig_aangepast boolean default false,  -- override: nooit terug automatisch overschrijven
  interne_bestemming_rekening text check (interne_bestemming_rekening in ('zicht', 'spaar') or interne_bestemming_rekening is null),
  bron text default 'handmatig' check (bron in ('handmatig', 'kbc_csv')),
  created_at timestamptz default now()
);

create index if not exists idx_transacties_werkjaar on transacties(werkjaar_id, datum);

-- ============ FINANCIEEL VERSLAG (FV) PER PERSOON ============

create table if not exists fv_maanden (
  id uuid primary key default gen_random_uuid(),
  werkjaar_id uuid references werkjaren(id) on delete cascade,
  maand text not null,                      -- bv. '2026-05'
  dieselprijs numeric(4,2),
  km_tarief_leiding numeric(4,2),
  km_tarief_logistiek numeric(4,2),
  betaaldeadline date,
  created_at timestamptz default now(),
  unique(werkjaar_id, maand)
);

create table if not exists fv_regels (
  id uuid primary key default gen_random_uuid(),
  fv_maand_id uuid references fv_maanden(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  omschrijving text not null,               -- bv. 'Streepjes', 'Frituur 16/05', 'Kilometers'
  bedrag numeric(10,2) not null,            -- positief = te betalen, negatief = terug te krijgen
  opmerking text,
  bron text default 'handmatig',            -- 'streepjes_bot', 'bestelling', 'kilometers', 'handmatig'
  created_at timestamptz default now()
);

create table if not exists fv_status (
  id uuid primary key default gen_random_uuid(),
  fv_maand_id uuid references fv_maanden(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  status text default 'openstaand' check (status in ('openstaand', 'betaald')),
  betaald_op timestamptz,
  unique(fv_maand_id, user_id)
);

-- ============ ROW LEVEL SECURITY ============
-- Ingeschakeld zodat enkel de backend (via service_role key) mag schrijven;
-- gedetailleerde policies per rol voegen we toe zodra de rolmapping compleet is.

alter table users enable row level security;
alter table transacties enable row level security;
alter table fv_regels enable row level security;
alter table fv_status enable row level security;
