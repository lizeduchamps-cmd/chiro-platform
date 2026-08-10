// Vaste volgorde en indeling van de afdelingen voor alles kamp-gerelateerd —
// bewust niet alfabetisch, maar de volgorde waarin de Chiro ze zelf noemt.
// Keuken/Algemeen krijgen nooit een eigen kampbudget (dat loopt via
// Kampkosten als algemene kostenpost, niet per afdeling).
export const AFDELINGEN_VOLGORDE = ["Sloebers", "Speelclub", "Rakwi", "Tito", "Keti", "Aspi"];

// Winkelbudget is hetzelfde tarief voor alle jongste 3, en een ander (hoger)
// tarief voor de oudste 3 — die krijgen daarnaast ook dropping/weekend.
export const AFDELINGEN_JONG = ["Sloebers", "Speelclub", "Rakwi"];
export const AFDELINGEN_OUD = ["Tito", "Keti", "Aspi"];

export function sorteerOpAfdeling(lijst, afdelingVeld = "afdeling") {
  return [...lijst].sort((a, b) => AFDELINGEN_VOLGORDE.indexOf(a[afdelingVeld]) - AFDELINGEN_VOLGORDE.indexOf(b[afdelingVeld]));
}
