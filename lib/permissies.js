// Gedeelde platformrecht-checks — stond voorheen inline (of als lokale
// per-bestand helper) herhaald in tientallen API-routes. Eén plek zodat de
// regel maar op één plaats hoeft te veranderen.
export function isFinancieel(session) {
  return !!session && ["admin", "financieel_verantwoordelijke"].includes(session.user?.platformRecht);
}

export function isAdmin(session) {
  return !!session && session.user?.platformRecht === "admin";
}
