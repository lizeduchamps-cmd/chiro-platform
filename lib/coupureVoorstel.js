// Gedeelde briefjes/muntjes-logica — gebruikt bij het tellen van een kassa
// (Evenementen) én bij het automatische coupure-voorstel (Wisselgeld).
export const BRIEFJES = [50, 20, 10, 5];
export const MUNTEN = [2, 1, 0.5, 0.2, 0.1];
const COUPURES_OPLOPEND = [...MUNTEN, ...BRIEFJES].slice().sort((a, b) => a - b);
const COUPURES_AFLOPEND = COUPURES_OPLOPEND.slice().reverse();

export function samenstellingTotaal(samenstelling) {
  return Object.entries(samenstelling || {}).reduce((s, [denom, aantal]) => s + Number(denom) * Number(aantal || 0), 0);
}

// Welk stuk zal een klant vermoedelijk geven voor deze prijs? Aangenomen wordt
// het kleinste briefje/muntstuk dat volstaat (het optimistische/minimale
// scenario — een verkoper die met grotere biljetten betaald wordt heeft
// sowieso meer wisselgeld nodig dan dit voorstel, vandaar "aanpasbaar").
function betaalStuk(prijs) {
  return COUPURES_OPLOPEND.find((c) => c >= prijs - 0.001) || COUPURES_AFLOPEND[0];
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

// Kern van het coupure-voorstel: voor elke doorgegeven verkoopprijs × het
// verwachte aantal verkopen, hoeveel wisselgeld moet er klaarliggen — en in
// welke coupures? prijslijnen: [{ prijs, aantalVerwacht }]
export function berekenCoupureVoorstel(prijslijnen) {
  let totaalWisselgeld = 0;
  (prijslijnen || []).forEach(({ prijs, aantalVerwacht }) => {
    const p = Number(prijs) || 0;
    const aantal = Number(aantalVerwacht) || 0;
    if (p <= 0 || aantal <= 0) return;
    const wisselgeldPerStuk = Math.max(0, betaalStuk(p) - p);
    totaalWisselgeld += wisselgeldPerStuk * aantal;
  });
  const samenstelling = verdeelInCoupures(totaalWisselgeld);
  return { samenstelling, totaalBedrag: Math.round(totaalWisselgeld * 100) / 100 };
}
