// De 4 soorten FV-regels, gedeeld tussen de FV-pagina (Details-lijst) en de
// Excel-export, zodat beide dezelfde labels gebruiken voor hetzelfde bron-veld.
export const SOORTEN = [
  { bron: "bestelling", label: "Bestellingen" },
  { bron: "kilometers", label: "Kilometers" },
  { bron: "streepjes_bot", label: "Streepjes" },
  { bron: "handmatig", label: "Handmatig" },
];

export function soortLabel(bron) {
  return SOORTEN.find((s) => s.bron === bron)?.label || bron;
}
