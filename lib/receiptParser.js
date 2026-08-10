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

const PRIJS_REGEX = /(\d{1,4}[.,]\d{2})\s*(?:€|eur)?\s*$/i;

export function parseKassabon(tekst) {
  const regels = (tekst || "")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

  const kandidaten = [];
  for (const regel of regels) {
    const laag = regel.toLowerCase();
    if (SKIP_KEYWORDS.some((k) => laag.includes(k))) continue;

    const match = regel.match(PRIJS_REGEX);
    if (!match) continue;

    const prijs = parseFloat(match[1].replace(",", "."));
    if (!prijs || prijs <= 0 || prijs > 500) continue; // sanity check tegen OCR-ruis

    const omschrijving = regel.slice(0, match.index).trim().replace(/[.\-x*]+$/, "").trim();
    if (!omschrijving || omschrijving.length < 2) continue;

    kandidaten.push({ omschrijving, bedrag: prijs });
  }
  return kandidaten;
}
