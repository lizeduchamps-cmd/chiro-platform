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
  type text not null default 'Leiding' check (type in ('Hoofdleiding', 'Leiding', 'Logistiek', 'Aspi')),
  groep text check (groep in ('Sloebers', 'Speelclub', 'Rakwi', 'Tito', 'Keti', 'Aspi') or groep is null),
  -- Platformrecht wordt handmatig toegekend door een admin via het beheerscherm
  -- (niet automatisch uit Discord-rollen gehaald — zie README).
  platform_recht text not null default 'lid' check (platform_recht in ('admin', 'financieel_verantwoordelijke', 'lid')),
  -- Streepjes & online drank (zie /streepjes)
  fysieke_streepjes numeric(10,2) not null default 0,   -- handmatig ingevoerd, in aantal streepjes
  online_streepjes_bedrag numeric(10,2) not null default 0,  -- laatst geüploade bedrag uit de Discord-bot-CSV
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Vervangt de vroegere users.verantwoordelijkheden text[] — een echte tabel
-- zodat een verantwoordelijkheid een naam, een hoofdverantwoordelijke én
-- medeverantwoordelijken kan hebben (een tag in een array kon dat niet).
-- session.user.verantwoordelijkheden blijft voor de rest van de app gewoon
-- een array van namen (zie lib/auth.js), dus evenementMatchTag() e.d. hoeven
-- niet aangepast te worden.
create table if not exists verantwoordelijkheden (
  id uuid primary key default gen_random_uuid(),
  naam text unique not null,
  created_at timestamptz default now()
);

create table if not exists user_verantwoordelijkheden (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  verantwoordelijkheid_id uuid references verantwoordelijkheden(id) on delete cascade,
  is_hoofdverantwoordelijke boolean not null default false,
  created_at timestamptz default now(),
  unique(user_id, verantwoordelijkheid_id)
);

create index if not exists idx_user_verant_user on user_verantwoordelijkheden(user_id);
create index if not exists idx_user_verant_verant on user_verantwoordelijkheden(verantwoordelijkheid_id);

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

-- Evenementen wordt hier al aangemaakt (i.p.v. verderop bij de rest van Fase 3)
-- omdat transacties.evenement_id er verderop naar verwijst.
create table if not exists evenementen (
  id uuid primary key default gen_random_uuid(),
  werkjaar_id uuid references werkjaren(id) on delete set null,
  naam text not null,                        -- bv. 'Fuif 2026'
  datum date,
  status text not null default 'gepland' check (status in ('gepland', 'lopend', 'afgerond')),
  -- Optionele modules — elk evenement/uitstap deelt hetzelfde basis-kosten-
  -- overzicht, deze vinkjes tonen er per evenement extra onderdelen bovenop
  -- (bv. Kamp krijgt groepsbudgetten + rekening scannen, Lazarus-achtige
  -- fuiven krijgen ticketverkoop + sponsoring).
  heeft_ticketverkoop boolean not null default false,
  heeft_sponsoring boolean not null default false,
  heeft_groepsbudgetten boolean not null default false,
  heeft_rekening_scan boolean not null default false,
  created_at timestamptz default now()
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
  ('Chiromis', true),
  ('Drank leiding', true),
  ('Financieel Verslag', true),
  ('Fuif', true),
  ('Huur', true),
  ('Kamp', true),
  ('Kerstfeestje', true),
  ('Ledenactiviteit', true),
  ('Ledenweekend', true),
  ('Leidingsactiviteit', true),
  ('Leidingsweekend', true),
  ('Lidgeld', true),
  ('Papierslag', true),
  ('Pasen', true),
  ('Payconiq/SumUp', true),
  ('Sinterklaas', true),
  ('Startdag & Receptie', true),
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
  -- Hoe zeker de automatische categorisering was bij het importeren (null =
  -- handmatig ingevoerd/gekozen, dus geen inschatting nodig).
  categorie_zekerheid text check (categorie_zekerheid in ('zeker', 'waarschijnlijk', 'onzeker') or categorie_zekerheid is null),
  interne_bestemming_rekening text check (interne_bestemming_rekening in ('zicht', 'spaar') or interne_bestemming_rekening is null),
  bron text default 'handmatig' check (bron in ('handmatig', 'kbc_csv')),
  -- Koppeling met Evenementen: als deze bank-transactie hoort bij een
  -- evenement (bv. de SumUp-uitbetaling van de fuif), tag je 'm hier — in
  -- plaats van het bedrag nog eens apart in te geven bij het evenement.
  -- Zo blijft elke euro maar op één plek de "waarheid".
  evenement_id uuid references evenementen(id) on delete set null,
  -- Vingerafdruk voor duplicaatdetectie bij CSV-import (rekening+datum+bedrag+
  -- tegenpartij+mededeling) — voorkomt dat dezelfde CSV twee keer opladen
  -- dezelfde transacties dubbel aanmaakt.
  import_fingerprint text,
  created_at timestamptz default now()
);

create index if not exists idx_transacties_werkjaar on transacties(werkjaar_id, datum);
create index if not exists idx_transacties_evenement on transacties(evenement_id);
create index if not exists idx_transacties_fingerprint on transacties(werkjaar_id, import_fingerprint);

-- Importhistoriek: één rij per keer dat iemand een KBC CSV bevestigt.
create table if not exists csv_imports (
  id uuid primary key default gen_random_uuid(),
  werkjaar_id uuid references werkjaren(id) on delete cascade,
  bestandsnaam text,
  geimporteerd_door uuid references users(id) on delete set null,
  aantal_in_bestand int not null default 0,
  aantal_nieuw int not null default 0,
  aantal_duplicaten int not null default 0,
  created_at timestamptz default now()
);

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

-- Gestructureerde kilometerregistratie i.p.v. vrije tekst-parsing — elke rij
-- maakt automatisch de bijhorende fv_regel aan (bron='kilometers') en
-- verwijdert die ook weer mee als je de kilometer-rij zelf verwijdert. Het
-- tarief wordt hier bevroren op het moment van registratie, zodat een latere
-- tariefwijziging oude regels niet met terugwerkende kracht verandert.
create table if not exists kilometers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  fv_maand_id uuid references fv_maanden(id) on delete cascade,
  datum date not null default current_date,
  km numeric(10,2) not null,
  activiteit text,
  tarief numeric(6,3) not null,
  bedrag numeric(10,2) not null,
  fv_regel_id uuid references fv_regels(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists idx_kilometers_user on kilometers(user_id);
create index if not exists idx_kilometers_fv_maand on kilometers(fv_maand_id);

-- ============ BESTELLINGEN (bv. frituur, pizza na de Chiro) ============
-- Eén rekening/bestelling wordt per product/persoon opgesplitst, en kan
-- daarna in één keer verdeeld worden over ieders Financieel Verslag.

create table if not exists bestellingen (
  id uuid primary key default gen_random_uuid(),
  titel text not null,                      -- bv. 'Frituur 16/05'
  datum date default current_date,
  -- Optioneel: waar besteld (bv. 'Frituur Op Den Hoek', 'Anatolia'). Prijs-
  -- suggesties bij het invullen van regels worden hierop gescoped, want
  -- 'frietjes' of 'kebap' kosten niet overal hetzelfde.
  winkel text,
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
-- (De evenementen-tabel zelf staat hierboven, bij WERKJAREN & REKENINGEN.)

create table if not exists evenement_kassas (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  naam text not null,                        -- bv. 'Kassa inkom', 'Toog', 'SumUp'
  type text not null default 'cash' check (type in ('cash', 'digitaal')),
  wisselgeld_start numeric(10,2) default 0,  -- enkel relevant bij type 'cash'
  inhoud_einde numeric(10,2),                -- cash: geteld bedrag na afloop; digitaal: totaalbedrag
  -- Optionele samenstelling in briefjes/muntjes, bv. {"5": 10, "10": 7, "20": 3}
  -- (denominatie in € als key, aantal als value) — het totaal hierboven wordt
  -- er automatisch uit herberekend zodra dit ingevuld is; blijft leeg bij een
  -- gewoon ingetypt totaalbedrag.
  wisselgeld_start_samenstelling jsonb,
  inhoud_einde_samenstelling jsonb,
  -- Optioneel: wat de leiding zelf verwacht op basis van verkochte
  -- drank/tickets/... Vergeleken met de omzet hieronder om een kassa-tekort
  -- (of -overschot) op te sporen. Leeg = geen vergelijking, geen waarschuwing.
  verwacht_bedrag numeric(10,2),
  created_at timestamptz default now()
);

-- Hoofdcategorieën zijn per evenement aanpasbaar (niet elk evenement heeft
-- dezelfde kostenposten) — elk nieuw evenement start met de 6 universele
-- standaardcategorieën, en je kan er tijdens het ingeven van transacties
-- meteen zelf bij maken.
create table if not exists evenement_categorieen (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  naam text not null,
  created_at timestamptz default now(),
  unique(evenement_id, naam)
);

create table if not exists evenement_budgetten (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  hoofdcategorie text not null,               -- naam uit evenement_categorieen van hetzelfde evenement
  budget_toegewezen numeric(10,2),
  created_at timestamptz default now(),
  unique(evenement_id, hoofdcategorie)
);

create table if not exists evenement_transacties (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  transactie_code text,                       -- bv. 'TRX-1001', automatisch gegenereerd
  datum date not null,
  omschrijving text not null,
  type_geldstroom text not null check (type_geldstroom in ('inkomst', 'uitgave')),
  type_kostenpost text check (type_kostenpost in ('kost', 'investering') or type_kostenpost is null),
  hoofdcategorie text,                        -- naam uit evenement_categorieen van hetzelfde evenement
  waar text,                                  -- waar gekocht/besteld, bv. 'Colruyt', 'Anatolia'
  hoeveelheid numeric(10,2),                  -- optioneel, bv. aantal chocolade eieren
  bedrag_excl_btw numeric(10,2) not null,
  btw_tarief numeric(4,2) not null default 0 check (btw_tarief in (0, 6, 12, 21)),
  bedrag_totaal numeric(10,2) not null,
  betaalmethode text check (betaalmethode in ('Overschrijving', 'Cash', 'Bancontact/Kaart', 'Factuur op termijn') or betaalmethode is null),
  status text not null default 'Gepland' check (status in ('Gepland', 'Te vergoeden', 'Betaald', 'Afgerond')),
  medewerker_user_id uuid references users(id) on delete set null,  -- interne leiding die voorschoot
  bewijsstuk_url text,                        -- link naar foto/scan van bonnetje of factuur
  created_at timestamptz default now()
);

create index if not exists idx_evenement_transacties_evenement on evenement_transacties(evenement_id);

-- Optionele module 'ticketverkoop' (zie evenementen.heeft_ticketverkoop) —
-- ticket-omzet telt automatisch mee in de winst/verliesbalans van het evenement.
create table if not exists evenement_tickets (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  naam text not null,                          -- bv. 'Vroegboek', 'Aan de deur'
  prijs numeric(10,2) not null,
  aantal_verkocht integer not null default 0,
  created_at timestamptz default now()
);

-- Optionele module 'sponsoring' (zie evenementen.heeft_sponsoring) — telt
-- automatisch mee als inkomst in de winst/verliesbalans van het evenement.
create table if not exists evenement_sponsors (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  naam text not null,
  bedrag numeric(10,2) not null,
  opmerking text,
  created_at timestamptz default now()
);

-- ============ FASE 4: KAMPBUDGETTEN, WISSELGELD & KALENDER ============

-- Tarieven zijn gedeeld over de afdelingen (jong = Sloebers/Speelclub/Rakwi,
-- oud = Tito/Keti/Aspi krijgen ook dropping/weekend + een vast bedrag voor
-- de weekendplaats zelf) — één rij per werkjaar, niet per afdeling.
-- Kamp is een evenement (evenementen.heeft_groepsbudgetten = true) — deze en
-- de volgende 2 tabellen hangen daarom aan evenement_id, niet rechtstreeks
-- aan werkjaar_id. lib/kampEvenement.js zoekt (of maakt) dat ene Kamp-
-- evenement per werkjaar op.
create table if not exists kamp_tarieven (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  winkelen_jong numeric(10,2) not null default 0,      -- €/lid, Sloebers/Speelclub/Rakwi
  winkelen_oud numeric(10,2) not null default 0,        -- €/lid, Tito/Keti/Aspi
  dropping_per_lid numeric(10,2) not null default 0,    -- €/lid, enkel Tito/Keti/Aspi
  weekend_per_lid numeric(10,2) not null default 0,     -- €/lid, enkel Tito/Keti/Aspi
  weekendplaats_vast numeric(10,2) not null default 50, -- vast bedrag per groep (niet per lid), enkel Tito/Keti/Aspi
  created_at timestamptz default now(),
  unique(evenement_id)
);

-- Eén rij per afdeling per Kamp-evenement. Enkel het aantal leden wordt hier
-- ingevuld — de tarieven komen uit kamp_tarieven en de uitgaven uit
-- kamp_transacties (waar hoofdcategorie = deze afdeling), zodat je
-- kampkosten maar op één plek moet ingeven en het automatisch meetelt.
create table if not exists groepsbudgetten (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  afdeling text not null check (afdeling in ('Sloebers', 'Speelclub', 'Rakwi', 'Tito', 'Keti', 'Aspi')),
  aantal_leden integer not null default 0,
  created_at timestamptz default now(),
  unique(evenement_id, afdeling)
);

create table if not exists wisselgeld_aanvragen (
  id uuid primary key default gen_random_uuid(),
  werkjaar_id uuid references werkjaren(id) on delete cascade,
  aanvraag_code text,                          -- bv. 'WS-1001', automatisch gegenereerd
  afdeling text not null,
  aanvrager_user_id uuid references users(id) on delete set null,
  datum_nodig date not null,
  bedrag_gevraagd numeric(10,2) not null,
  samenstelling_cash text,                     -- vrije tekst, bv. '10x€5, 5x€10'
  doel_activiteit text,
  status text not null default 'Aangevraagd' check (status in ('Aangevraagd', 'Goedgekeurd', 'Klaargezet', 'Opgehaald')),
  created_at timestamptz default now()
);

create index if not exists idx_wisselgeld_werkjaar on wisselgeld_aanvragen(werkjaar_id);

-- Enkel voor handmatige/jaarlijkse actiepunten (bv. "Waarborg kampplaats
-- storten"). FV-betaaldeadlines en wisselgeld-aanvragen komen NIET hier in
-- te staan als aparte rij — die worden live samengevoegd door /api/kalender
-- vanuit fv_maanden.betaaldeadline en wisselgeld_aanvragen zelf, zodat de
-- kalender altijd de volledige (ook afgelopen) geschiedenis toont en nooit
-- uit sync kan raken met een gewijzigde datum of status elders.
create table if not exists kalender_items (
  id uuid primary key default gen_random_uuid(),
  werkjaar_id uuid references werkjaren(id) on delete cascade,
  titel text not null,
  type text not null check (type in ('Jaarlijks Actiepunt', 'Voorschot Deadline', 'Factuur Vervaldatum')),
  datum_deadline date not null,
  toegewezen_aan text,                          -- rol of naam, bv. 'Financieel verantwoordelijke'
  is_voltooid boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_kalender_werkjaar on kalender_items(werkjaar_id, datum_deadline);

-- ============ KAMPKOSTEN ============
-- Eén doorlopend kosten-/inkomstenlogboek voor het kamp per werkjaar (geen
-- aparte "kamp"-entiteit nodig zoals bij evenementen — er is er maar één per
-- jaar). Structuur bewust gelijkaardig aan evenement_transacties, maar
-- losstaand van Kampbudgetten: dat blijft budget-vs-uitgegeven per afdeling
-- voor winkelen/dropping/weekend, dit is de vrije kostenpost-lijst voor al
-- de rest (tenten, kampplaats, kampgeld-inkomsten, busvervoer, ...).
create table if not exists kamp_categorieen (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  naam text not null,
  created_at timestamptz default now(),
  unique(evenement_id, naam)
);

create table if not exists kamp_transacties (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid references evenementen(id) on delete cascade,
  transactie_code text,                         -- bv. 'KAMP-1001', automatisch gegenereerd
  datum date not null,
  omschrijving text not null,
  type_geldstroom text not null check (type_geldstroom in ('inkomst', 'uitgave')),
  hoofdcategorie text,                          -- naam uit kamp_categorieen van hetzelfde Kamp-evenement
  bedrag numeric(10,2) not null,
  status text not null default 'Gepland' check (status in ('Gepland', 'Te vergoeden', 'Betaald', 'Afgerond')),
  medewerker_user_id uuid references users(id) on delete set null,  -- interne leiding die voorschoot
  bewijsstuk_url text,
  created_at timestamptz default now()
);

create index if not exists idx_kamp_transacties_evenement on kamp_transacties(evenement_id);

-- ============ DOCUMENTEN (bonnetjes/facturen) ============
-- Bestand zelf staat in de Supabase Storage-bucket 'documenten' (bestand_pad
-- is het pad daarin) — hier enkel de metadata. Een document splits je op in
-- bon_regels; zodra de som van de regels het totaalbedrag dekt kan je
-- "verwerken" klikken, wat elke regel automatisch als transactie aanmaakt op
-- zijn bestemming (kamp_transacties, evenement_transacties of fv_regels).
create table if not exists documenten (
  id uuid primary key default gen_random_uuid(),
  werkjaar_id uuid references werkjaren(id) on delete cascade,
  titel text not null,
  bestand_pad text not null,
  bestand_type text,
  totaalbedrag numeric(10,2) not null,
  gekoppeld_aan text check (gekoppeld_aan in ('kamp', 'evenement', 'fv') or gekoppeld_aan is null),
  evenement_id uuid references evenementen(id) on delete set null,
  status text not null default 'Nog te verwerken' check (status in ('Nog te verwerken', 'Verwerkt')),
  geupload_door_user_id uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_documenten_werkjaar on documenten(werkjaar_id);

create table if not exists bon_regels (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documenten(id) on delete cascade,
  omschrijving text not null,
  bedrag numeric(10,2) not null,
  bestemming text not null check (bestemming in ('kamp', 'evenement', 'fv')),
  kamp_hoofdcategorie text,                    -- ingevuld als bestemming = 'kamp'
  evenement_id uuid references evenementen(id) on delete set null,  -- ingevuld als bestemming = 'evenement'
  evenement_hoofdcategorie text,
  fv_user_id uuid references users(id) on delete set null,          -- ingevuld als bestemming = 'fv'
  fv_maand_id uuid references fv_maanden(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_bon_regels_document on bon_regels(document_id);

-- ============ ROW LEVEL SECURITY ============
-- Deze app gebruikt geen Supabase Auth (login loopt via NextAuth/Discord, zie
-- lib/auth.js) — er is dus geen auth.uid() beschikbaar om policies op te
-- baseren, en alle databasetoegang loopt uitsluitend server-side via
-- supabaseAdmin (service_role key, die RLS altijd omzeilt). De publieke
-- anon-key-client (createBrowserSupabaseClient in lib/supabase.js) wordt
-- nergens aangeroepen. Concreet betekent dit: RLS aan + geen policies =
-- volledig afgesloten voor de anon/authenticated-rol, enkel de backend kan
-- erbij — precies wat we willen. Mocht er ooit rechtstreekse client-side
-- Supabase-toegang nodig zijn (bv. realtime), dan is een echte
-- auth-integratie nodig vóór policies hier zinvol worden.
alter table users enable row level security;
alter table verantwoordelijkheden enable row level security;
alter table user_verantwoordelijkheden enable row level security;
alter table instellingen enable row level security;
alter table werkjaren enable row level security;
alter table rekeningen enable row level security;
alter table evenementen enable row level security;
alter table categorieen enable row level security;
alter table categorisatie_regels enable row level security;
alter table transacties enable row level security;
alter table csv_imports enable row level security;
alter table fv_maanden enable row level security;
alter table fv_regels enable row level security;
alter table fv_status enable row level security;
alter table bestellingen enable row level security;
alter table bestelling_regels enable row level security;
alter table evenement_kassas enable row level security;
alter table evenement_categorieen enable row level security;
alter table evenement_budgetten enable row level security;
alter table evenement_transacties enable row level security;
alter table evenement_tickets enable row level security;
alter table evenement_sponsors enable row level security;
alter table kamp_tarieven enable row level security;
alter table groepsbudgetten enable row level security;
alter table wisselgeld_aanvragen enable row level security;
alter table kalender_items enable row level security;
alter table kamp_categorieen enable row level security;
alter table kamp_transacties enable row level security;
alter table documenten enable row level security;
alter table bon_regels enable row level security;
alter table kilometers enable row level security;

-- ============ STORAGE ============
-- Private bucket voor documenten (bonnetjes/facturen) — enkel toegankelijk
-- via de service_role key (supabaseAdmin), net als de databasetabellen. De
-- backend genereert telkens een tijdelijke signed URL om een bestand te
-- tonen; er is geen publieke/permanente link.
insert into storage.buckets (id, name, public)
values ('documenten', 'documenten', false)
on conflict (id) do nothing;
