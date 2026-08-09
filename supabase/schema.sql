-- Chiro Hoepertingen Financiënplatform — databaseschema (Supabase/Postgres)
-- Voer dit uit via Supabase Dashboard > SQL Editor > New query

-- ============ GEBRUIKERS & ROLLEN ============

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  discord_id text unique not null,        -- stabiele Discord user-ID, primaire koppeling
  discord_username text,                   -- huidige Discord-gebruikersnaam (kan wijzigen, enkel voor weergave)
  naam text not null,
  email text,
  iban text,                               -- eigen rekeningnummer, voor terugbetalingen (bv. kilometers)
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
  ('Ledenweekend', true),
  ('Leidingsweekend', true),
  ('Lidgeld', true),
  ('Papierslag', true),
  ('Payconiq/SumUp', true),
  ('Sinterklaas', true),
  ('Subsidie', true),
  ('Taartenslag', true),
  ('Trooper', true),
  ('Uniformen', true),
  ('Vlaams Weekend', true),
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

insert into categorisatie_regels (veld, bevat_tekst, categorie_id, prioriteit)
select 'vrije_mededeling', regel.tekst, cat.id, regel.volgorde
from (values
  ('stripe', 'Trooper', 1), ('trooper', 'Trooper', 2), ('anatolia', 'Financieel Verslag', 3),
  ('proxy hoepertingen', '4-uurtje', 4), ('proxy', '4-uurtje', 5),
  ('financieelverslag', 'Financieel Verslag', 6), ('financieel verslag', 'Financieel Verslag', 7),
  ('financieel', 'Financieel Verslag', 8), ('fin verslag', 'Financieel Verslag', 9),
  ('fin', 'Financieel Verslag', 10), ('fv', 'Financieel Verslag', 11),
  ('leidingsweekend', 'Leidingsweekend', 12), ('leidingweekend', 'Leidingsweekend', 13),
  ('vlaams weekend', 'Vlaams Weekend', 14), ('vlaamsweekend', 'Vlaams Weekend', 15),
  ('ledenweekend', 'Ledenweekend', 16), ('lazarus', 'Fuif', 17), ('fuif', 'Fuif', 18),
  ('kerstfeestje', 'Kerstfeestje', 19), ('kerst', 'Kerstfeestje', 20),
  ('sinterklaas', 'Sinterklaas', 21), ('sint', 'Sinterklaas', 22),
  ('4-uurtje', '4-uurtje', 23), ('viertje', '4-uurtje', 24),
  ('sumup', 'Payconiq/SumUp', 25), ('payconiq', 'Payconiq/SumUp', 26),
  ('papierslag', 'Papierslag', 27), ('papier', 'Papierslag', 28),
  ('ons heem', 'Huur', 29), ('huur', 'Huur', 30),
  ('taart', 'Taartenslag', 31), ('lidgeld', 'Lidgeld', 32),
  ('colruyt', 'Winkellijst', 33), ('delhaize', 'Winkellijst', 34),
  ('lidl', 'Winkellijst', 35), ('bier', 'Bier', 36)
) as regel(tekst, catnaam, volgorde)
join categorieen cat on cat.naam = regel.catnaam
where not exists (
  select 1
  from categorisatie_regels cr
  where cr.veld = 'vrije_mededeling'
    and lower(cr.bevat_tekst) = lower(regel.tekst)
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

-- ============ BESTELLINGEN (bv. frituur, pizza na de Chiro) ============
-- Eén rekening/bestelling wordt per product/persoon opgesplitst, en kan
-- daarna in één keer verdeeld worden over ieders Financieel Verslag.

create table if not exists bestellingen (
  id uuid primary key default gen_random_uuid(),
  titel text not null,                      -- bv. 'Frituur 16/05'
  datum date default current_date,
  verdeeld_naar_fv_maand_id uuid references fv_maanden(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists bestelling_regels (
  id uuid primary key default gen_random_uuid(),
  bestelling_id uuid references bestellingen(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  product text not null,
  aantal numeric(10,2) not null default 1,
  prijs_per_stuk numeric(10,2) not null,
  created_at timestamptz default now()
);

-- ============ EVENEMENTEN (Fase 3: Kassasysteem per Evenement) ============
-- Kassabeheer + kosten/inkomsten-logboek per evenement (fuif, taartenslag, ...),
-- met budget per hoofdcategorie en een automatisch berekende winst/verliesbalans.

create table if not exists evenementen (
  id uuid primary key default gen_random_uuid(),
  naam text not null,                        -- bv. 'Fuif 2026'
  datum date,
  status text not null default 'gepland' check (status in ('gepland', 'lopend', 'afgerond')),
  created_at timestamptz default now()
);

create table if not exists evenement_kassas (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  naam text not null,                        -- bv. 'Kassa inkom', 'Toog', 'SumUp'
  type text not null default 'cash' check (type in ('cash', 'digitaal')),
  wisselgeld_start numeric(10,2) default 0,  -- enkel relevant bij type 'cash'
  inhoud_einde numeric(10,2),                -- cash: geteld bedrag na afloop; digitaal: totaalbedrag
  created_at timestamptz default now()
);

-- De 6 universele hoofdcategorieën uit het budgetteringsmodel; hergebruikt
-- als check-constraint op zowel budgetten als transacties.
create table if not exists evenement_budgetten (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  hoofdcategorie text not null check (hoofdcategorie in (
    'Infrastructuur & Materiaal', 'Drank & Food', 'Programmatie & Entertainment',
    'Marketing & Promo', 'Veiligheid & Logistiek', 'Organisatie & Medewerkers'
  )),
  budget_toegewezen numeric(10,2),
  created_at timestamptz default now(),
  unique(evenement_id, hoofdcategorie)
);

-- Externe relaties (leveranciers, sponsors, overheid). Interne leiding die
-- voorschiet wordt niet hier gedupliceerd — die koppelen we rechtstreeks aan
-- de bestaande users-tabel (die heeft al naam + iban, zie fv_regels-flow).
create table if not exists partijen (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  rol text not null check (rol in ('Leverancier', 'Medewerker/Organisator', 'Sponsor', 'Overheid/Subsidie')),
  iban text,
  contact text,
  created_at timestamptz default now()
);

create table if not exists evenement_transacties (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  transactie_code text,                       -- bv. 'TRX-1001', automatisch gegenereerd
  datum date not null,
  omschrijving text not null,
  type_geldstroom text not null check (type_geldstroom in ('inkomst', 'uitgave')),
  type_kostenpost text check (type_kostenpost in ('kost', 'investering') or type_kostenpost is null),
  hoofdcategorie text check (hoofdcategorie in (
    'Infrastructuur & Materiaal', 'Drank & Food', 'Programmatie & Entertainment',
    'Marketing & Promo', 'Veiligheid & Logistiek', 'Organisatie & Medewerkers'
  ) or hoofdcategorie is null),
  subcategorie text,
  bedrag_excl_btw numeric(10,2) not null,
  btw_tarief numeric(4,2) not null default 0 check (btw_tarief in (0, 6, 12, 21)),
  bedrag_totaal numeric(10,2) not null,
  betaalmethode text check (betaalmethode in ('Overschrijving', 'Cash', 'Bancontact/Kaart', 'Factuur op termijn') or betaalmethode is null),
  status text not null default 'Gepland' check (status in ('Gepland', 'Te vergoeden', 'Betaald', 'Afgerond')),
  partij_id uuid references partijen(id) on delete set null,        -- externe leverancier/sponsor/overheid
  medewerker_user_id uuid references users(id) on delete set null,  -- interne leiding die voorschoot
  bewijsstuk_url text,                        -- link naar foto/scan van bonnetje of factuur
  created_at timestamptz default now()
);

create index if not exists idx_evenement_transacties_evenement on evenement_transacties(evenement_id);

-- ============ ROW LEVEL SECURITY ============
-- Ingeschakeld zodat enkel de backend (via service_role key) mag schrijven;
-- gedetailleerde policies per rol voegen we toe zodra de rolmapping compleet is.

alter table users enable row level security;
alter table transacties enable row level security;
alter table fv_regels enable row level security;
alter table fv_status enable row level security;
