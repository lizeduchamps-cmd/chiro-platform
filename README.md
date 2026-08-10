# Chiro Hoepertingen — Financiënplatform

Financiënplatform voor Chiro Hoepertingen: gebruikers/rollen (via Discord OAuth2),
kasboek, Financieel Verslag, evenementen en kampbeheer, met een echte database
(Supabase).

## Wat staat er al

- Echte Discord-login (OAuth2) via NextAuth. Elke gebruiker krijgt een
  platformrecht (`admin` / `financieel_verantwoordelijke` / `lid`), standaard
  `lid` — een admin kent dit handmatig toe via `/beheer/gebruikers`, los van
  iemands Discord-rol
- **Kasboek**: transacties (zicht-/spaarrekening, interne overschrijvingen),
  saldoberekening per rekening, categorieën met automatische
  categorisatieregels, KBC Touch CSV-import met duplicaatdetectie en
  importhistoriek
- **Financieel Verslag (FV)**: maandelijkse afrekening per persoon
  (streepjes/online drank, kilometervergoeding, bestellingen, handmatige
  regels), gegroepeerd per type (Leiding/Logistiek/Aspi), met "slim plakken"
  om lijstjes (kilometers, bestellingen) in bulk te verwerken
  (`lib/smartPaste.js`)
- **Bestellingen**: een rekening (frituur, pizza, ...) per persoon opsplitsen
  en in bulk verdelen over ieders FV
- **Evenementen**: kassabeheer (incl. briefjes/muntjes-teller), budget per
  hoofdcategorie, kosten-/inkomstenlogboek met klik-om-te-bewerken
  transacties, koppeling met kasboektransacties om dubbel boeken te vermijden
- **Kamp**: Kampdashboard, Kampbudgetten (gedeelde tarieven winkelen/
  dropping/weekend per leeftijdsgroep), Kampkosten (kosten/inkomsten per
  afdeling, telt automatisch mee tegen het kampbudget), Wisselgeld-aanvragen
  met statusflow, een volledige Kalender die FV-deadlines, wisselgeld en
  evenementen automatisch toont
- Jaaroverzicht met aandachtspunten-dashboard (wat vraagt actie, over alle
  modules heen) en een grafiek per maand
- Toasts/undo/bevestigingsmodals i.p.v. browser alert()/confirm(), skeleton-
  loaders, mobielvriendelijke layout

## Wat nog moet gebeuren

Zie [`TAKENLIJST-FINANCIEN.md`](./TAKENLIJST-FINANCIEN.md) voor de actuele,
gefaseerde takenlijst (opruimwerk, RLS-policies, documentenmodule,
kilometers als eigen tabel, automatisering, ...).

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
