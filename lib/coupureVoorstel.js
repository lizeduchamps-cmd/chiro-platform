// Gedeelde briefjes/muntjes-logica — gebruikt bij het tellen van een kassa
// (Evenementen) en bij Wisselgeld-aanvragen. Coupures worden altijd manueel
// ingevuld (op basis van ervaring), er zit geen berekening/voorspelling
// achter — dat bleek in de praktijk onbetrouwbaar.
export const BRIEFJES = [50, 20, 10, 5];
export const MUNTEN = [2, 1, 0.5, 0.2, 0.1];

export function samenstellingTotaal(samenstelling) {
  return Object.entries(samenstelling || {}).reduce((s, [denom, aantal]) => s + Number(denom) * Number(aantal || 0), 0);
}
