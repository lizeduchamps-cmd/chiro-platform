# Takenlijst financiënplatform — volgorde voor de programmeur

Elke taak: wat er moet gebeuren, en of dat een **schema**-wijziging (database), een **route**
(nieuwe/aangepaste API-route), en/of **UI** (scherm) vraagt. Werk fase per fase af en test
telkens voor je verdergaat — niet alles tegelijk oppikken.

## Fase 0 — Opruimen (vandaag, quasi gratis)

| # | Taak | Schema | Route | UI |
|---|------|--------|-------|-----|
| 1 | `users.type` mag geen `'Aspi'` meer zijn (dat hoort bij `groep`, niet `type`) — check-constraint aanpassen naar enkel `Hoofdleiding`/`Leiding`/`Logistiek` | ✅ (constraint) | — | — |
| 2 | `.env.example` toevoegen aan de repo — README verwijst ernaar maar het bestand ontbreekt | — | — | — |
| 3 | README bijwerken naar de echte status (KBC-import, saldoberekening en FV-basis zijn al af, in tegenstelling tot wat er nu staat) | — | — | — |

## Fase 1 — Fundament (goedkoop nu, duur later)

| # | Taak | Schema | Route | UI |
|---|------|--------|-------|-----|
| 4 | Verantwoordelijkheden omzetten van `text[]` naar een echte tabel `verantwoordelijkheden` (naam, hoofdverantwoordelijke, medeverantwoordelijken) + koppeltabel `user_verantwoordelijkheden`. Nodig zodra verantwoordelijkheden geen evenement-achtige naam hebben om tegen te matchen (Ledenadministratie, Winkel, Materiaal) | ✅ | ✅ (CRUD) | ✅ (uitbreiding `/beheer/gebruikers`) |
| 5 | RLS-policies per bestaande tabel toevoegen (nu enkel service-role, geen policies) — goedkoper nu terwijl er nog weinig tabellen zijn dan later in één keer inhalen | ✅ (policies) | — | — |

## Fase 2 — Financiën afwerken

| # | Taak | Schema | Route | UI |
|---|------|--------|-------|-----|
| 6 | Documentenmodule: bonnetjes/facturen uploaden (foto/PDF), koppelen aan kamp of evenement, status "nog te verwerken" | ✅ (tabel `documenten`) | ✅ | ✅ (nieuw scherm) |
| 7 | Bonnetjes opsplitsen: één bon → meerdere regels (product, bedrag, categorie/afdeling/persoon), som moet gelijk zijn aan het totaalbedrag; regels stromen automatisch door naar kampkosten/evenementkosten en, als "voor een persoon", naar FV | ✅ (tabel `bon_regels`) | ✅ | ✅ |
| 8 | Kilometerregistratie als eigen tabel (persoon, datum, aantal km, activiteit, tarief) i.p.v. tekst-parsing via `smartPaste.js` — berekent bedrag automatisch en voedt FV | ✅ (tabel `kilometers`) | ✅ | ✅ (vervangt huidig invulveld op FV/bestellingen) |
| 9 | Leefweekmodule: wie eet wanneer mee, kosten delen door aantal eters, resultaat naar FV — zelfde patroon als `bestellingen`, hergebruik die logica | ✅ (tabellen `leefweek_momenten`, `leefweek_deelnames`) | ✅ | ✅ |
| 10 | Kassa-tekort-detectie: verwacht bedrag (op basis van geregistreerde verkopen) vs. werkelijk geteld eindbedrag, met waarschuwing bij afwijking | mogelijk (veld `verwacht_bedrag`) | ✅ (uitbreiding `evenementen/overzicht`) | ✅ (waarschuwing tonen) |
| 11 | Budget-kleurdrempels 🟢 (<80%) 🟠 (80–100%) 🔴 (>100%) op kamp- en evenementbudgetten — bestaande data, enkel weergave | — | — | ✅ |
| 12 | Eén terugbetalingsoverzicht dat FV, evenementen én kampkosten samenvoegt (nu enkel per evenement beschikbaar) | — | ✅ (nieuwe aggregatie-route) | ✅ |

## Fase 3 — Automatisering (pas na fase 2, stabiel getest)

| # | Taak | Schema | Route | UI |
|---|------|--------|-------|-----|
| 13 | OCR op bonnetjes: foto → AI-voorstel van regels (product, prijs, categorie) in `bon_regels`, mens bevestigt altijd | — | ✅ (AI-call) | ✅ (voorstel/bevestig-scherm) |
| 14 | Categorisatie laten "leren" uit bevestigde correcties (bv. Colruyt + kamp → meestal Keuken) | evt. (frequentie-veld) | ✅ | ✅ |
| 15 | FV-betalingen automatisch herkennen bij KBC-import (bedrag + naam matcht een openstaand FV) → voorstel "FV augustus Lize — betaald", mens bevestigt | — | ✅ (uitbreiding bulk-import) | ✅ |
| 16 | Centrale takenlijst ("Mijn taken"), kan automatisch ontstaan vanuit andere modules | ✅ (tabel `taken`) | ✅ | ✅ |
| 17 | Automatische meldingen (FV-deadline, budget bijna op, wisselgeld aangevraagd, ...) | evt. (afgeleid van taken) | ✅ | ✅ |

## Fase 4 — Totaalplatform (aparte, latere opdracht — niet starten voor fase 2 en 3 in gebruik zijn)

18. Ledenadministratie (leden, inschrijvingen, betalingen, aanwezigheden)
19. Winkel (voorraad, aan-/verkopen)
20. Materiaal (locatie, uitleen, verantwoordelijke)
21. Transport (chauffeurs, km, vergoeding — hergebruikt tabel `kilometers` uit fase 2)
22. Activiteitenplanning (kamp, fuif, papierslag, Vlaams Weekend, leefweek, weekends in één systeem)
23. Communicatie (meldingen ook via e-mail/Discord, niet enkel in-platform)
24. Dashboard hoofdleiding (financiën + taken + budgetten + planning in één overzicht)

---

**Expliciet geschrapt:** het samenvoegen van kasboek, evenementkosten en kampkosten tot
één centrale transactietabel. Dat probleem (hetzelfde bedrag dubbel boeken) is al opgelost
via de bestaande koppeling `transacties.evenement_id` — één tabel zou nu net een werkende,
bewust gescheiden structuur vervangen door een tabel vol nullable kolommen, zonder dat het
een reëel probleem oplost.
