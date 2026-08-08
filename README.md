# Chiro Hoepertingen — Financiënplatform

Fase 1: gebruikers/rollen (via Discord OAuth2) + kasboek, met een echte database (Supabase).

## Wat staat er al

- Echte Discord-login (OAuth2) via NextAuth — geen nep-login meer
- Discord-rollen worden opgehaald en vertaald naar een platformrecht (`admin` /
  `financieel_verantwoordelijke` / `lid`) via de `discord_role_mapping`-tabel
- Databaseschema (`supabase/schema.sql`) met users, werkjaren, rekeningen,
  categorieën, transacties (incl. interne transacties), fv per persoon
- Elke inlogger wordt automatisch aangemaakt/bijgewerkt in de `users`-tabel,
  gekoppeld aan hun Discord ID (niet hun gebruikersnaam)

## Wat nog moet gebeuren voor dit 100% "af" is

- Rol-ID's invullen in `discord_role_mapping` zodra je die van de servereigenaar hebt
- Kasboek-, fv- en rollenbeheer-schermen (UI) bovenop dit fundament bouwen
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

## Rol-ID's koppelen

Zodra je de rol-ID's van de servereigenaar hebt, voeg je ze toe via de
Supabase Table Editor in `discord_role_mapping`, bijvoorbeeld:

| discord_role_id | discord_role_naam | platform_recht |
|---|---|---|
| 111111111111111111 | Hoofdleiding | admin |
| 222222222222222222 | Financiën | financieel_verantwoordelijke |

Iedereen zonder gekoppelde rol krijgt automatisch `lid` (kan enkel eigen fv zien).
