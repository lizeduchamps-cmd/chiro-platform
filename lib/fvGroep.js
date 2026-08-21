// FV-groepering op basis van type (niet groep!): groep is enkel de afdeling
// die iemand leidt (bv. een Leiding-lid dat de Aspi's leidt heeft groep='Aspi'
// maar hoort wel degelijk bij "Leiding"). Enkel wie zelf type='Aspi' is,
// hoort in de Aspi-groep. Gedeeld tussen de FV-pagina en de Excel-export,
// zodat iemand nooit in een ander tabblad/groep terechtkomt dan op het scherm.
export const GROEP_VOLGORDE = ["Leiding", "Logistiek", "Aspi"];

export function fvGroep(user) {
  if (user.type === "Aspi") return "Aspi";
  if (user.type === "Logistiek") return "Logistiek";
  return "Leiding";
}
