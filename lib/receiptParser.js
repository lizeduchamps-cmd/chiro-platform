// Zuivere regex/heuristiek — geen AI. Herkent per OCR-regel een omschrijving
// + prijs (kassabonnen zetten de prijs meestal als laatste getal op de regel,
// met komma of punt en 2 decimalen). Regels die duidelijk geen productregel
// zijn (totaal, btw, wisselgeld, ...) worden overgeslagen. De mens controleert
// en corrigeert het resultaat altijd voor het bevestigd wordt.
const SKIP_KEYWORDS = [
  "totaal", "total", "subtotaal", "sub-totaal", "bruto", "netto", "btw", "tva", "korting",
  "reductie", "wisselgeld", "terug te ontvangen", "change", "cash", "bancontact", "betaald",
  "betaling met", "contant", "kaart", "visa", "mastercard", "maestro", "bedankt", "dank u",
  "thank", "kassabon", "ticket nr", "sequence", "referentie", "datum", "openingsuren", "tel:",
  "www.", "http", "btw-nr", "ondernemingsnr", "order-datum", "order:", "telefonist",
  "bestelling type", "customer phone", "geprint op", "eet smakelijk",
];

// OCR verwart cijfers vaak met vergelijkbaar gevormde letters (O/0, I of l/1,
// S/5, B/8, Z/2) — vooral op vaal thermisch bonpapier. De prijs-match staat
// dat toe en normaliseert enkel binnen de gevonden prijs zelf, nooit in de
// omschrijving ernaast.
const OCR_CIJFER = "[0-9OoIlLSsBbZz]";
const PRIJS_REGEX = new RegExp(`${OCR_CIJFER}{1,4}[.,]${OCR_CIJFER}{2}`, "g");

function normaliseerPrijsTekst(tekst) {
  return tekst
    .replace(/[Oo]/g, "0")
    .replace(/[IlL]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8")
    .replace(/[Zz]/g, "2")
    .replace(",", ".");
}

function bevatPrijs(regel) {
  return [...regel.matchAll(PRIJS_REGEX)].length > 0;
}

// OCR zet product en prijs soms op twee aparte OCR-regels i.p.v. één (bv. bij
// een brede kolomafstand op de fysieke bon). Plak een 'naam zonder prijs'
// samen met de erop volgende 'prijs zonder naam' vóór de eigenlijke
// verwerking, anders mist zo'n gesplitste regel gewoon volledig.
function plakGesplitsteRegels(ruweRegels) {
  const resultaat = [];
  for (let i = 0; i < ruweRegels.length; i++) {
    const regel = ruweRegels[i];
    const volgende = ruweRegels[i + 1];
    const isNaamZonderPrijs = /[a-zA-Z]{2,}/.test(regel) && regel.length <= 40 && !bevatPrijs(regel);
    const isEnkelPrijs = volgende && /^[^a-zA-Z]*$/.test(volgende) && bevatPrijs(volgende);
    if (isNaamZonderPrijs && isEnkelPrijs) {
      resultaat.push(`${regel} ${volgende}`);
      i++; // volgende regel is al meegenomen
    } else {
      resultaat.push(regel);
    }
  }
  return resultaat;
}

export function parseKassabon(tekst) {
  const ruweRegels = (tekst || "")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  const regels = plakGesplitsteRegels(ruweRegels);

  const kandidaten = [];
  for (const regel of regels) {
    const laag = regel.toLowerCase();
    if (SKIP_KEYWORDS.some((k) => laag.includes(k))) continue;

    // De prijs staat zo goed als altijd als laatste getal op de regel (rechts
    // uitgelijnde kolom) — dus bij meerdere treffers de laatste gebruiken.
    const matches = [...regel.matchAll(PRIJS_REGEX)];
    if (matches.length === 0) continue;
    const laatsteMatch = matches[matches.length - 1];

    const prijs = parseFloat(normaliseerPrijsTekst(laatsteMatch[0]));
    if (!prijs || prijs <= 0 || prijs > 500) continue; // sanity check tegen OCR-ruis

    const omschrijving = regel
      .slice(0, laatsteMatch.index)
      .trim()
      .replace(/[.\-x*€$]+\s*$/, "") // rommel/valutateken net voor de prijs
      .trim()
      .replace(/^[\s*\-•]+/, "") // subitem-markering vooraan (bv. '-- mayonaise')
      .trim();
    if (!omschrijving || omschrijving.length < 2) continue;

    // Een leidend aantal (bv. '3 Pizza Margherita', '3x Pizza Margherita' of
    // '1 x mini friet') betekent dat de gevonden prijs het totaal is voor dat
    // aantal — bij 2 of meer splitst dat in aparte regels van 1 stuk elk
    // (prijs/aantal), zodat je per stuk nog kan aanpassen (bv. aan een andere
    // persoon toewijzen); bij 1 wordt gewoon de kale naam gebruikt.
    const aantalMatch = omschrijving.match(/^(\d{1,2})\s*[xX]?\s+(.+)$/);
    if (aantalMatch) {
      const aantal = parseInt(aantalMatch[1], 10);
      const naam = aantalMatch[2].trim();
      if (naam.length >= 2) {
        if (aantal >= 2 && aantal <= 50) {
          const prijsPerStuk = Math.round((prijs / aantal) * 100) / 100;
          for (let i = 0; i < aantal; i++) {
            // Laatste stuk krijgt de afrondingsrest, zodat de som exact klopt.
            const bedragVoorDit = i === aantal - 1 ? Math.round((prijs - prijsPerStuk * (aantal - 1)) * 100) / 100 : prijsPerStuk;
            kandidaten.push({ omschrijving: naam, bedrag: bedragVoorDit });
          }
          continue;
        }
        if (aantal === 1) {
          kandidaten.push({ omschrijving: naam, bedrag: Math.round(prijs * 100) / 100 });
          continue;
        }
      }
    }

    kandidaten.push({ omschrijving, bedrag: Math.round(prijs * 100) / 100 });
  }
  return kandidaten;
}

// Sommige afhaalbonnen (bv. Domino's) drukken de naam van de besteller af
// ('Klant: ALINE DEVEUX') — handig om automatisch de FV-persoon voor te
// stellen bij een bonnetje dat duidelijk voor één iemand persoonlijk was.
export function vindKlantNaam(tekst) {
  const match = /klant\s*:?\s*([a-zà-ÿ' -]{2,40})/i.exec(tekst || "");
  if (!match) return null;
  const naam = match[1].trim();
  return naam.length >= 2 ? naam : null;
}
