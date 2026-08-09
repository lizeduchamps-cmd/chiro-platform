# Chiro Hoepertingen — Financiënplatform

Fase 1: gebruikers/rollen (via Discord OAuth2) + kasboek, met een echte database (Supabase).

## Wat staat er al

- Echte Discord-login (OAuth2) via NextAuth — geen nep-login meer
- Elke gebruiker krijgt een platformrecht (`admin` / `financieel_verantwoordelijke` /
  `lid`), standaard `lid`. Een admin kent dit handmatig toe via het beheerscherm
  (`/beheer/gebruikers`) — dit staat los van iemands Discord-rol, zodat een
  wijziging in Discord nooit per ongeluk iemands platformrechten verandert
- Databaseschema (`supabase/schema.sql`) met users, werkjaren, rekeningen,
  categorieën, transacties (incl. interne transacties), fv per persoon
- Elke inlogger wordt automatisch aangemaakt/bijgewerkt in de `users`-tabel,
  gekoppeld aan hun Discord ID (niet hun gebruikersnaam)

## Wat nog moet gebeuren voor dit 100% "af" is

- Eerste admin handmatig aanduiden in Supabase (zie hieronder) — daarna kan die
  persoon verder iedereen via het beheerscherm rechten geven
- Kasboek-, fv- en rollenbeheer-schermen (UI) verder afwerken
- Saldo-per-transactie-berekening en dynamische jaarvergelijking
- KBC CSV-import aankoppelen op de nieuwe database (nu nog los)

## Lokaal opstarten

1. `npm install`
2. Kopieer `.env.example` naar `.env.local` en vul de ontbrekende velden in
   (Discord Client Secret, NextAuth Secret, Supabase Service Role Key — dit
   zijn de geheime waarden die je zelf hebt opgehaald, nooit in de chat delen)
3. Voer `supabase/schema.sql` uit in je Supabase-project (Dashboard → SQL Editor)
4. `npm run dev` → open http://localhost:3000

## Deployen naar Vercel

1. Zet dit project in een (privé) GitHub-repository
2. Ga naar vercel.com → "Add New Project" → kies die repository
3. Bij "Environment Variables": voeg dezelfde variabelen toe als in `.env.example`,
   met de echte geheime waarden. `NEXTAUTH_URL` wordt dan je Vercel-URL.
4. Ga terug naar de Discord Developer Portal → OAuth2 → voeg
   `https://jouw-project.vercel.app/api/auth/callback/discord` toe als Redirect
5. Deploy

## Eerste admin instellen

Iedereen die inlogt krijgt standaard `lid` als platformrecht. Om de eerste
admin aan te duiden (waarna die persoon verder alle rechten via het
beheerscherm kan toekennen), log je eenmalig in met Discord en werk je
daarna in de Supabase Table Editor je eigen rij in `users` bij:
zet `platform_recht` op `admin`.
