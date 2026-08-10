// Gedeelde parsing-helpers voor "slim plakken": lijstjes van de vorm
// "Naam: iets" per regel, zoals gebruikt bij bestellingen (producten) en
// FV-kilometers. Puur functioneel, geen DB/React — herbruikbaar op beide
// pagina's.

// Zet geplakte tekst om in {naam, rest} per regel. Regels zonder ":" (bv. een
// kopregel als "* kilometers ledenweekend") worden genegeerd.
export function parseNaamRegels(tekst) {
  return (tekst || "")
    .split("\n")
    .map((line) => line.replace(/^[\s*\-•]+/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return null;
      const naam = line.slice(0, idx).trim();
      const rest = line.slice(idx + 1).trim();
      if (!naam || !rest) return null;
      return { naam, rest };
    })
    .filter(Boolean);
}

// Zoekt de gebruiker wiens naam het best overeenkomt met een geplakte naam
// (die vaak een roepnaam of afkorting is, bv. "Sam v" voor "Sam Vermeulen").
export function vindGebruiker(gebruikers, naam) {
  const zoek = naam.trim().toLowerCase();
  if (!zoek) return null;
  return (
    gebruikers.find((g) => g.naam.toLowerCase() === zoek) ||
    gebruikers.find((g) => g.naam.toLowerCase().startsWith(zoek)) ||
    gebruikers.find((g) => zoek.startsWith(g.naam.toLowerCase())) ||
    null
  );
}

// Splitst "mini friet met tomaten ketchup en boulet" of "friet, curryworst,
// cola" in afzonderlijke producten — op de woorden "met"/"en", een komma, of
// een combinatie ("friet, curryworst en cola").
export function splitProducten(rest) {
  return rest
    .split(/\s*,\s*|\s+(?:met|en)\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Haalt het eerste aantal kilometer uit tekst als "250km" of "250 km".
export function haalKmEruit(rest) {
  const match = /(\d+(?:[.,]\d+)?)\s*km/i.exec(rest || "");
  if (!match) return null;
  return parseFloat(match[1].replace(",", "."));
}
