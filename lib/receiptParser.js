// Zuivere regex/heuristiek — geen AI. Herkent per OCR-regel een omschrijving
// + prijs (kassabonnen zetten de prijs meestal als laatste getal op de regel,
// met komma of punt en 2 decimalen). Regels die duidelijk geen productregel
// zijn (totaal, btw, wisselgeld, ...) worden overgeslagen. De mens controleert
// en corrigeert het resultaat altijd voor het bevestigd wordt.
const SKIP_KEYWORDS = [
  "totaal", "total", "subtotaal", "sub-totaal", "btw", "tva", "korting", "reductie",
  "wisselgeld", "terug te ontvangen", "change", "cash", "bancontact", "betaald",
  "contant", "kaart", "visa", "mastercard", "maestro", "bedankt", "dank u", "thank",
  "kassabon", "ticket nr", "klant", "datum", "openingsuren", "tel:", "www.", "http",
  "btw-nr", "ondernemingsnr",
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

export function parseKassabon(tekst) {
  const regels = (tekst || "")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

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

    const omschrijving = regel.slice(0, laatsteMatch.index).trim().replace(/[.\-x*]+$/, "").trim();
    if (!omschrijving || omschrijving.length < 2) continue;

    // Een leidend aantal (bv. '3 Pizza Margherita' of '3x Pizza Margherita')
    // betekent dat de gevonden prijs het totaal is voor dat aantal — splits
    // dan in aparte regels van 1 stuk elk, zodat je per stuk nog kan
    // aanpassen (bv. aan een andere persoon toewijzen), i.p.v. één dure regel.
    const aantalMatch = omschrijving.match(/^(\d{1,2})\s*[xX]?\s+(.+)$/);
    if (aantalMatch) {
      const aantal = parseInt(aantalMatch[1], 10);
      const naam = aantalMatch[2].trim();
      if (aantal >= 2 && aantal <= 50 && naam.length >= 2) {
        const prijsPerStuk = Math.round((prijs / aantal) * 100) / 100;
        for (let i = 0; i < aantal; i++) {
          // Laatste stuk krijgt de afrondingsrest, zodat de som exact klopt.
          const bedragVoorDit = i === aantal - 1 ? Math.round((prijs - prijsPerStuk * (aantal - 1)) * 100) / 100 : prijsPerStuk;
          kandidaten.push({ omschrijving: naam, bedrag: bedragVoorDit });
        }
        continue;
      }
    }

    kandidaten.push({ omschrijving, bedrag: Math.round(prijs * 100) / 100 });
  }
  return kandidaten;
}
