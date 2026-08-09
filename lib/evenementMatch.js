// Puur en zonder imports zodat dit zowel server- als client-side bruikbaar is
// (bv. in API routes én in "use client"-pagina's, zonder de service-role key
// per ongeluk mee te bundelen naar de browser).
function normaliseer(tekst) {
  return (tekst || "")
    .toLowerCase()
    .replace(/^(de|het)\s+/, "")
    .trim();
}

// Heeft iemand met deze verantwoordelijkheden-tags (bv. "Taartenslag", "De fuif")
// een tag die overeenkomt met de naam van dit evenement (bv. "Taartenslag 2026")?
export function evenementMatchTag(verantwoordelijkheden, evenementNaam) {
  const naam = normaliseer(evenementNaam);
  if (!naam) return false;
  return (verantwoordelijkheden || []).some((tag) => {
    const t = normaliseer(tag);
    return t.length > 2 && (naam.includes(t) || t.includes(naam));
  });
}
