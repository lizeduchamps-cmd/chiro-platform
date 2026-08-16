// Gedeelde briefjes/muntjes-logica — gebruikt bij het tellen van een kassa
// (Evenementen) én bij het automatische coupure-voorstel (Wisselgeld).
export const BRIEFJES = [50, 20, 10, 5];
export const MUNTEN = [2, 1, 0.5, 0.2, 0.1];
const COUPURES_AFLOPEND = [...BRIEFJES, ...MUNTEN].slice().sort((a, b) => b - a);

// Met welk briefje/muntstuk betaalt een klant vermoedelijk? Niet enkel het
// kleinst passende (dan reken je alleen wisselgeld uit voor wie exact past
// betaalt) — we nemen aan dat kopers gelijk verdeeld spreiden over elk stuk
// vanaf de prijs tot en met €20. Het briefje van €50 tellen we niet mee: dat
// geeft niemand voor een drankje of zakje chips aan een chirokassa.
const AANNEMELIJKE_BETAALSTUKKEN = COUPURES_AFLOPEND.filter((c) => c <= 20).sort((a, b) => a - b);

export function samenstellingTotaal(samenstelling) {
  return Object.entries(samenstelling || {}).reduce((s, [denom, aantal]) => s + Number(denom) * Number(aantal || 0), 0);
}

// Verdeelt een bedrag gulzig in zo weinig mogelijk briefjes/muntjes.
export function verdeelInCoupures(bedrag) {
  let rest = Math.round(bedrag * 100);
  const resultaat = {};
  for (const c of COUPURES_AFLOPEND) {
    const cCent = Math.round(c * 100);
    const aantal = Math.floor(rest / cCent);
    if (aantal > 0) {
      resultaat[c] = aantal;
      rest -= aantal * cCent;
    }
  }
  return resultaat;
}

// Kern van het coupure-voorstel. Voor elke prijslijn simuleren we dat het
// verwachte aantal kopers gelijk verdeeld betaalt met elk aannemelijk
// briefje/muntstuk (zie hierboven), en berekenen we per betaalstuk apart
// hoeveel wisselgeld — en in welke coupures — dat vergt. Zo hou je ook
// rekening met wie met €10 of €20 betaalt, niet enkel met exact-passers.
// prijslijnen: [{ prijs, aantalVerwacht }]
export function berekenCoupureVoorstel(prijslijnen) {
  const tellingCent = {}; // denominatie -> aantal stuks (kan fractioneel zijn tot de eindronding)

  (prijslijnen || []).forEach(({ prijs, aantalVerwacht }) => {
    const p = Number(prijs) || 0;
    const aantal = Number(aantalVerwacht) || 0;
    if (p <= 0 || aantal <= 0) return;

    const betaalOpties = AANNEMELIJKE_BETAALSTUKKEN.filter((c) => c >= p - 0.001);
    if (betaalOpties.length === 0) return;
    const kopersPerOptie = aantal / betaalOpties.length;

    betaalOpties.forEach((betaalStuk) => {
      const wisselgeld = Math.round((betaalStuk - p) * 100) / 100;
      if (wisselgeld <= 0) return;
      const stukken = verdeelInCoupures(wisselgeld);
      Object.entries(stukken).forEach(([denom, stAantal]) => {
        tellingCent[denom] = (tellingCent[denom] || 0) + stAantal * kopersPerOptie;
      });
    });
  });

  // Elke coupure naar boven afronden: liever een muntje te veel klaarliggen
  // dan te weinig om iemand correct terug te betalen.
  const samenstelling = {};
  Object.entries(tellingCent).forEach(([denom, aantal]) => {
    samenstelling[denom] = Math.ceil(aantal - 1e-9);
  });

  return { samenstelling, totaalBedrag: Math.round(samenstellingTotaal(samenstelling) * 100) / 100 };
}
