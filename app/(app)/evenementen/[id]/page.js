"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { evenementMatchTag } from "@/lib/evenementMatch";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonStatRow, SkeletonCard } from "@/components/Skeleton";
import { budgetKleurEmoji } from "@/lib/budgetKleur";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const BETAALMETHODES = ["Overschrijving", "Cash", "Bancontact/Kaart", "Factuur op termijn"];
const STATUSSEN = ["Gepland", "Te vergoeden", "Betaald", "Afgerond"];
const STATUS_LABEL = { gepland: "Gepland", lopend: "Lopend", afgerond: "Afgerond" };
const BRIEFJES = [50, 20, 10, 5];
const MUNTEN = [2, 1, 0.5, 0.2, 0.1];

function samenstellingTotaal(samenstelling) {
  return Object.entries(samenstelling || {}).reduce((s, [denom, aantal]) => s + Number(denom) * Number(aantal || 0), 0);
}

const LEGE_TRANSACTIE = {
  datum: new Date().toISOString().slice(0, 10),
  omschrijving: "",
  typeGeldstroom: "uitgave",
  typeKostenpost: "kost",
  hoofdcategorie: "",
  waar: "",
  hoeveelheid: "",
  bedrag: "",
};

// Zet een transactie-rij uit de API om naar het formaat van het bewerkformulier.
function naarBewerkVeld(t) {
  return {
    datum: t.datum || "",
    omschrijving: t.omschrijving || "",
    typeGeldstroom: t.type_geldstroom || "uitgave",
    typeKostenpost: t.type_kostenpost || "kost",
    hoofdcategorie: t.hoofdcategorie || "",
    waar: t.waar || "",
    hoeveelheid: t.hoeveelheid ?? "",
    bedrag: t.bedrag_totaal ?? "",
    betaalmethode: t.betaalmethode || "",
    status: t.status || "Gepland",
    medewerkerUserId: t.medewerker_user_id || "",
    bewijsstukUrl: t.bewijsstuk_url || "",
  };
}

export default function EvenementDetail({ params }) {
  const { id } = params;
  const { data: session } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [overzicht, setOverzicht] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gebruikers, setGebruikers] = useState([]);
  const [nieuweKassa, setNieuweKassa] = useState({ naam: "", type: "cash", wisselgeldStart: "" });
  const [nieuweTransactie, setNieuweTransactie] = useState(LEGE_TRANSACTIE);
  const [toonTransactieForm, setToonTransactieForm] = useState(false);
  const [bewerkId, setBewerkId] = useState(null);
  const [bewerkVeld, setBewerkVeld] = useState(null);
  const [tellerOpen, setTellerOpen] = useState(null);
  const [tellerAantallen, setTellerAantallen] = useState({});

  const laden = () => fetch(`/api/evenementen/overzicht?evenementId=${id}`).then((r) => r.json()).then((d) => { setOverzicht(d); setLoading(false); });

  useEffect(() => {
    laden();
    fetch("/api/gebruikers/lijst").then((r) => r.json()).then((d) => setGebruikers(d.users || []));
  }, [id]);

  if (loading || !overzicht) {
    return (
      <div style={{ padding: 32, maxWidth: 1100 }}>
        <SkeletonStatRow count={3} />
        <SkeletonCard lines={3} />
      </div>
    );
  }
  if (overzicht.error) return <p className="amount-neg" style={{ padding: 32 }}>{overzicht.error}</p>;

  // Admin/financieel_verantwoordelijke mogen altijd; daarnaast wie een
  // verantwoordelijkheid-tag heeft die overeenkomt met de naam van dit
  // evenement (bv. "Taartenslag" bij evenement "Taartenslag 2026").
  const magBewerken =
    ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht) ||
    evenementMatchTag(session?.user?.verantwoordelijkheden, overzicht.evenement.naam);

  const statusWijzigen = async (status) => {
    await fetch("/api/evenementen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    laden();
  };

  const kassaToevoegen = async () => {
    if (!nieuweKassa.naam.trim()) return toast.error("Vul een naam in voor de kassa.");
    const res = await fetch("/api/evenementen/kassas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId: id, ...nieuweKassa }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweKassa({ naam: "", type: "cash", wisselgeldStart: "" });
    laden();
    toast.success("Kassa toegevoegd");
  };

  const kassaBijwerken = async (kassaId, veld, waarde) => {
    await fetch("/api/evenementen/kassas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: kassaId, [veld]: waarde === "" ? "" : Number(waarde) }),
    });
    laden();
  };

  const tellerOpenen = (kassa, veld) => {
    if (tellerOpen?.kassaId === kassa.id && tellerOpen?.veld === veld) { setTellerOpen(null); return; }
    const bestaande = veld === "wisselgeldStart" ? kassa.wisselgeld_start_samenstelling : kassa.inhoud_einde_samenstelling;
    setTellerAantallen(bestaande || {});
    setTellerOpen({ kassaId: kassa.id, veld });
  };

  const tellerToepassen = async () => {
    const totaal = Math.round(samenstellingTotaal(tellerAantallen) * 100) / 100;
    const samenstellingVeld = tellerOpen.veld === "wisselgeldStart" ? "wisselgeldStartSamenstelling" : "inhoudEindeSamenstelling";
    await fetch("/api/evenementen/kassas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tellerOpen.kassaId, [tellerOpen.veld]: totaal, [samenstellingVeld]: tellerAantallen }),
    });
    setTellerOpen(null);
    laden();
    toast.success("Kassa-inhoud bijgewerkt");
  };

  const kassaVerwijderen = async (kassaId) => {
    const ok = await confirm({ title: "Kassa verwijderen", message: "Deze kassa verwijderen?", danger: true, bevestigLabel: "Verwijderen" });
    if (!ok) return;
    await fetch(`/api/evenementen/kassas?id=${kassaId}`, { method: "DELETE" });
    laden();
    toast.success("Kassa verwijderd");
  };

  const budgetBijwerken = async (hoofdcategorie, budgetToegewezen) => {
    await fetch("/api/evenementen/budgetten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId: id, hoofdcategorie, budgetToegewezen: budgetToegewezen === "" ? "" : Number(budgetToegewezen) }),
    });
    laden();
  };

  const transactieToevoegen = async () => {
    const t = nieuweTransactie;
    if (!t.datum || !t.omschrijving || !t.bedrag) return toast.error("Vul minstens datum, omschrijving en bedrag in.");
    const res = await fetch("/api/evenementen/transacties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evenementId: id,
        datum: t.datum,
        omschrijving: t.omschrijving,
        typeGeldstroom: t.typeGeldstroom,
        typeKostenpost: t.typeKostenpost,
        hoofdcategorie: t.hoofdcategorie || null,
        waar: t.waar || null,
        hoeveelheid: t.hoeveelheid || null,
        bedrag: t.bedrag,
      }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweTransactie(LEGE_TRANSACTIE);
    laden();
    toast.success("Transactie toegevoegd");
  };

  // Optimistisch: de rij verdwijnt meteen; de balans/budgetten herberekenen
  // pas na de undo-periode (via laden()), dat is de enige stap die écht een
  // volledige serverherberekening nodig heeft.
  const transactieVerwijderen = (t) => {
    if (bewerkId === t.id) { setBewerkId(null); setBewerkVeld(null); }
    setOverzicht((prev) => ({ ...prev, transacties: prev.transacties.filter((x) => x.id !== t.id) }));
    toast.undoable({
      message: "Transactie verwijderd",
      onUndo: laden,
      onCommit: async () => {
        await fetch(`/api/evenementen/transacties?id=${t.id}`, { method: "DELETE" });
        laden();
      },
    });
  };

  const rijOpenen = (t) => {
    if (!magBewerken) return;
    if (bewerkId === t.id) { setBewerkId(null); setBewerkVeld(null); return; }
    setBewerkId(t.id);
    setBewerkVeld(naarBewerkVeld(t));
  };

  const bewerkOpslaan = async () => {
    const v = bewerkVeld;
    if (!v.datum || !v.omschrijving || !v.bedrag) return toast.error("Vul minstens datum, omschrijving en bedrag in.");
    const res = await fetch("/api/evenementen/transacties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: bewerkId,
        datum: v.datum,
        omschrijving: v.omschrijving,
        typeGeldstroom: v.typeGeldstroom,
        typeKostenpost: v.typeGeldstroom === "uitgave" ? v.typeKostenpost : null,
        hoofdcategorie: v.hoofdcategorie || null,
        waar: v.waar || null,
        hoeveelheid: v.hoeveelheid === "" ? null : v.hoeveelheid,
        bedrag: v.bedrag,
        betaalmethode: v.betaalmethode || null,
        status: v.status,
        medewerkerUserId: v.medewerkerUserId || null,
        bewijsstukUrl: v.bewijsstukUrl || null,
      }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setBewerkId(null);
    setBewerkVeld(null);
    laden();
    toast.success("Transactie bijgewerkt");
  };

  const categorieToevoegen = async (zetIn) => {
    const naam = prompt("Naam van de nieuwe categorie:");
    if (!naam?.trim()) return;
    const res = await fetch("/api/evenementen/categorieen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId: id, naam: naam.trim() }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    zetIn(naam.trim());
    laden();
    toast.success(`Categorie "${naam.trim()}" toegevoegd`);
  };

  const categorieVerwijderen = async (categorieId) => {
    const ok = await confirm({
      title: "Categorie verwijderen",
      message: "Deze categorie verwijderen? Transacties die er al aan hangen behouden hun naam als tekst, maar tellen niet meer mee in het budgetoverzicht.",
      danger: true,
      bevestigLabel: "Verwijderen",
    });
    if (!ok) return;
    await fetch(`/api/evenementen/categorieen?id=${categorieId}`, { method: "DELETE" });
    laden();
    toast.success("Categorie verwijderd");
  };

  const { evenement, kassas, kassaOmzetTotaal, kassasMetTekort, categorieen, transacties, gekoppeldeTransacties, budgetBurnRate, nogTerugTeBetalen, balans } = overzicht;

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{evenement.naam}</h1>
          <p className="muted" style={{ fontSize: 14 }}>{evenement.datum || "Geen datum ingesteld"}</p>
        </div>
        {magBewerken && (
          <select value={evenement.status} onChange={(e) => statusWijzigen(e.target.value)}>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
      </div>

      {/* Balans */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="muted" style={{ fontSize: 12 }}>Totale inkomsten</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(balans.totaalInkomsten)}</div>
          <div className="subtle" style={{ fontSize: 11 }}>Waarvan kassa-omzet: {euro(kassaOmzetTotaal)}</div>
        </div>
        <div className="stat">
          <div className="muted" style={{ fontSize: 12 }}>Totale uitgaven</div>
          <div className="amount-neg" style={{ fontSize: 22, fontWeight: 700 }}>{euro(balans.totaalUitgaven)}</div>
          <div className="subtle" style={{ fontSize: 11 }}>Kosten: {euro(balans.kostenTotaal)} · Investeringen: {euro(balans.investeringenTotaal)}</div>
        </div>
        <div className="stat-primary">
          <div style={{ fontSize: 12, opacity: 0.75 }}>{balans.nettoWinst < 0 ? "Netto verlies" : "Netto winst"}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(Math.abs(balans.nettoWinst))}</div>
        </div>
      </div>

      {/* Gekoppelde kasboektransacties */}
      {gekoppeldeTransacties.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Gekoppelde kasboektransacties</div>
          <p className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
            Deze banktransacties staan al in het Kasboek en zijn hieraan getagd, puur ter referentie (bv. om te zien wat er al effectief binnenkwam). Ze tellen niet mee in de balans hierboven — die blijft uitsluitend wat de groep zelf via kassa's/transacties bijhoudt, zodat hetzelfde bedrag niet dubbel geteld wordt. Het kasboek zelf blijft de enige waarheid voor het Jaaroverzicht.
          </p>
          <table>
            <tbody>
              {gekoppeldeTransacties.map((t) => (
                <tr key={t.id}>
                  <td className="subtle" style={{ border: "none", padding: "3px 0", whiteSpace: "nowrap" }}>{t.datum}</td>
                  <td className="muted" style={{ border: "none", padding: "3px 0" }}>{t.tegenpartij || t.vrije_mededeling || t.omschrijving || "-"} {t.categorieen?.naam && `· ${t.categorieen.naam}`}</td>
                  <td className={t.soort === "uitgave" ? "amount-neg" : ""} style={{ border: "none", padding: "3px 0", textAlign: "right", fontWeight: 600, width: 100 }}>
                    {t.soort === "uitgave" ? "-" : "+"}{euro(t.bedrag)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Kassabeheer */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Kassabeheer</div>
        {kassasMetTekort.length > 0 && (
          <div style={{ background: "var(--danger-tint, #fdecea)", border: "1px solid var(--danger)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>
            ⚠️ Kassa-tekort gedetecteerd: {kassasMetTekort.map((k) => `${k.naam} (${euro(Math.abs(k.verschil))} te weinig)`).join(", ")}
          </div>
        )}
        <div className="table-wrap" style={{ marginBottom: magBewerken ? 12 : 0 }}>
          <table>
            <thead>
              <tr>
                <th>Naam</th>
                <th>Type</th>
                <th style={{ textAlign: "right" }}>Wisselgeld start</th>
                <th style={{ textAlign: "right" }}>Inhoud na afloop</th>
                <th style={{ textAlign: "right" }}>Omzet</th>
                <th style={{ textAlign: "right" }}>Verwacht</th>
                <th style={{ textAlign: "right" }}>Verschil</th>
                {magBewerken && <th></th>}
              </tr>
            </thead>
            <tbody>
              {kassas.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: "center", border: "none", padding: 16 }}>Nog geen kassa's.</td></tr>
              )}
              {kassas.map((k) => (
                <>
                  <tr key={k.id}>
                    <td style={{ fontWeight: 600 }}>{k.naam}</td>
                    <td>{k.type === "cash" ? "Cash" : "Digitaal"}</td>
                    <td style={{ textAlign: "right" }}>
                      {magBewerken && k.type === "cash" ? (
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                          <input type="number" step="0.01" defaultValue={k.wisselgeld_start} onBlur={(e) => kassaBijwerken(k.id, "wisselgeldStart", e.target.value)} style={{ width: 80, textAlign: "right" }} />
                          <button type="button" title="Briefjes/muntjes tellen" onClick={() => tellerOpenen(k, "wisselgeldStart")} style={{ padding: "4px 6px", fontSize: 12 }}>🧮</button>
                        </div>
                      ) : k.type === "cash" ? euro(k.wisselgeld_start) : "-"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {magBewerken ? (
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                          <input type="number" step="0.01" defaultValue={k.inhoud_einde ?? ""} placeholder="nog niet geteld" onBlur={(e) => kassaBijwerken(k.id, "inhoudEinde", e.target.value)} style={{ width: 80, textAlign: "right" }} />
                          {k.type === "cash" && (
                            <button type="button" title="Briefjes/muntjes tellen" onClick={() => tellerOpenen(k, "inhoudEinde")} style={{ padding: "4px 6px", fontSize: 12 }}>🧮</button>
                          )}
                        </div>
                      ) : k.inhoud_einde !== null ? euro(k.inhoud_einde) : "-"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(k.omzet)}</td>
                    <td style={{ textAlign: "right" }}>
                      {magBewerken ? (
                        <input
                          type="number" step="0.01" defaultValue={k.verwacht_bedrag ?? ""} placeholder="optioneel"
                          onBlur={(e) => kassaBijwerken(k.id, "verwachtBedrag", e.target.value)}
                          style={{ width: 80, textAlign: "right" }}
                        />
                      ) : k.verwacht_bedrag !== null ? euro(k.verwacht_bedrag) : "-"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: k.verschil === null ? undefined : k.heeftTekort ? "var(--danger)" : k.verschil > 0.01 ? "var(--success, #1a7f37)" : undefined }}>
                      {k.verschil === null ? "-" : `${k.verschil > 0 ? "+" : ""}${euro(k.verschil)}`}
                    </td>
                    {magBewerken && (
                      <td><button className="btn-danger" onClick={() => kassaVerwijderen(k.id)}>🗑️</button></td>
                    )}
                  </tr>
                  {tellerOpen?.kassaId === k.id && (
                    <tr>
                      <td colSpan={magBewerken ? 8 : 7} style={{ background: "var(--primary-tint)", padding: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                          {tellerOpen.veld === "wisselgeldStart" ? "Wisselgeld start" : "Inhoud na afloop"} — briefjes &amp; muntjes tellen
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 10 }}>
                          <div>
                            <div className="subtle" style={{ fontSize: 10, marginBottom: 4 }}>BRIEFJES</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {BRIEFJES.map((d) => (
                                <label key={d} style={{ fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                  €{d}
                                  <input
                                    type="number" min="0" step="1" style={{ width: 50, textAlign: "center" }}
                                    value={tellerAantallen[d] ?? ""}
                                    onChange={(e) => setTellerAantallen((prev) => ({ ...prev, [d]: e.target.value === "" ? "" : Number(e.target.value) }))}
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="subtle" style={{ fontSize: 10, marginBottom: 4 }}>MUNTJES</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {MUNTEN.map((d) => (
                                <label key={d} style={{ fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                  €{d}
                                  <input
                                    type="number" min="0" step="1" style={{ width: 50, textAlign: "center" }}
                                    value={tellerAantallen[d] ?? ""}
                                    onChange={(e) => setTellerAantallen((prev) => ({ ...prev, [d]: e.target.value === "" ? "" : Number(e.target.value) }))}
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontWeight: 700 }}>Totaal: {euro(samenstellingTotaal(tellerAantallen))}</span>
                          <button className="btn-primary" onClick={tellerToepassen}>Toepassen</button>
                          <button onClick={() => setTellerOpen(null)}>Annuleren</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
        {magBewerken && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Naam, bv. Kassa inkom" value={nieuweKassa.naam} onChange={(e) => setNieuweKassa({ ...nieuweKassa, naam: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
            <select value={nieuweKassa.type} onChange={(e) => setNieuweKassa({ ...nieuweKassa, type: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="digitaal">Digitaal (SumUp/Payconiq)</option>
            </select>
            {nieuweKassa.type === "cash" && (
              <input type="number" step="0.01" placeholder="Wisselgeld start" value={nieuweKassa.wisselgeldStart} onChange={(e) => setNieuweKassa({ ...nieuweKassa, wisselgeldStart: e.target.value })} style={{ width: 130 }} />
            )}
            <button onClick={kassaToevoegen}>+ Kassa toevoegen</button>
          </div>
        )}
      </div>

      {/* Budgetten */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Budget per hoofdcategorie</div>
        <p className="muted" style={{ fontSize: 11, marginBottom: 10 }}>Optioneel — laat leeg voor categorieën zonder vast budget.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Hoofdcategorie</th>
                <th style={{ textAlign: "right" }}>Budget</th>
                <th style={{ textAlign: "right" }}>Uitgegeven</th>
                <th style={{ textAlign: "right" }}>Resterend</th>
                {magBewerken && <th></th>}
              </tr>
            </thead>
            <tbody>
              {categorieen.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: "center", border: "none", padding: 16 }}>Nog geen categorieën — maak er een aan via het "+"-knopje bij een nieuwe transactie.</td></tr>
              )}
              {categorieen.map((c) => {
                const cat = c.naam;
                const rij = budgetBurnRate.find((b) => b.hoofdcategorie === cat);
                return (
                  <tr key={c.id}>
                    <td>{budgetKleurEmoji(rij?.uitgegeven || 0, rij?.budget)}</td>
                    <td>{cat}</td>
                    <td style={{ textAlign: "right" }}>
                      {magBewerken ? (
                        <input type="number" step="0.01" defaultValue={rij?.budget ?? ""} placeholder="geen limiet" onBlur={(e) => budgetBijwerken(cat, e.target.value)} style={{ width: 90, textAlign: "right" }} />
                      ) : rij?.budget !== null && rij?.budget !== undefined ? euro(rij.budget) : "-"}
                    </td>
                    <td style={{ textAlign: "right" }}>{euro(rij?.uitgegeven || 0)}</td>
                    <td className={rij?.resterend < 0 ? "amount-neg" : ""} style={{ textAlign: "right", fontWeight: 600 }}>
                      {rij?.resterend !== null && rij?.resterend !== undefined ? euro(rij.resterend) : "-"}
                    </td>
                    {magBewerken && (
                      <td><button className="btn-danger" onClick={() => categorieVerwijderen(c.id)}>🗑️</button></td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nog terug te betalen */}
      {nogTerugTeBetalen.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Nog terug te betalen</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wie</th>
                  <th>Omschrijving</th>
                  <th>IBAN</th>
                  <th style={{ textAlign: "right" }}>Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {nogTerugTeBetalen.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.wie?.naam || "-"}</td>
                    <td className="muted">{r.omschrijving}</td>
                    <td className="subtle">{r.wie?.iban || "⚠️ onbekend"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(r.bedrag)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transacties */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Transacties</div>
          {magBewerken && (
            <button onClick={() => setToonTransactieForm(!toonTransactieForm)} style={{ fontSize: 12 }}>
              {toonTransactieForm ? "Annuleren" : "+ Transactie toevoegen"}
            </button>
          )}
        </div>

        {toonTransactieForm && (
          <div style={{ background: "var(--primary-tint)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="grid-3" style={{ marginBottom: 8 }}>
              <input type="date" value={nieuweTransactie.datum} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, datum: e.target.value })} />
              <input placeholder="Omschrijving" value={nieuweTransactie.omschrijving} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, omschrijving: e.target.value })} style={{ gridColumn: "span 2" }} />
              <select value={nieuweTransactie.typeGeldstroom} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, typeGeldstroom: e.target.value })}>
                <option value="uitgave">Uitgave</option>
                <option value="inkomst">Inkomst</option>
              </select>
              {nieuweTransactie.typeGeldstroom === "uitgave" && (
                <select value={nieuweTransactie.typeKostenpost} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, typeKostenpost: e.target.value })}>
                  <option value="kost">Kost (eenmalig)</option>
                  <option value="investering">Investering (blijft mee)</option>
                </select>
              )}
              <input type="number" step="0.01" placeholder="Bedrag" value={nieuweTransactie.bedrag} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, bedrag: e.target.value })} />
              <div style={{ display: "flex", gap: 4 }}>
                <select value={nieuweTransactie.hoofdcategorie} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, hoofdcategorie: e.target.value })} style={{ flex: 1 }}>
                  <option value="">Hoofdcategorie...</option>
                  {categorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                </select>
                <button type="button" onClick={() => categorieToevoegen((naam) => setNieuweTransactie((prev) => ({ ...prev, hoofdcategorie: naam })))} title="Nieuwe categorie" style={{ padding: "0 10px" }}>+</button>
              </div>
              <input placeholder="Waar gekocht/besteld (optioneel)" value={nieuweTransactie.waar} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, waar: e.target.value })} />
              <input type="number" step="0.01" placeholder="Hoeveelheid (optioneel)" value={nieuweTransactie.hoeveelheid} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, hoeveelheid: e.target.value })} />
            </div>
            <button className="btn-primary" onClick={transactieToevoegen}>Toevoegen</button>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Datum</th>
                <th>Omschrijving</th>
                <th>Categorie</th>
                <th style={{ textAlign: "right" }}>Bedrag</th>
                <th>Status</th>
                {magBewerken && <th></th>}
              </tr>
            </thead>
            <tbody>
              {transacties.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", border: "none", padding: 16 }}>Nog geen transacties.</td></tr>
              )}
              {transacties.map((t) => (
                <>
                  <tr key={t.id} onClick={() => rijOpenen(t)} style={{ cursor: magBewerken ? "pointer" : "default", background: bewerkId === t.id ? "var(--primary-tint)" : undefined }}>
                    <td className="subtle" style={{ whiteSpace: "nowrap" }}>{t.transactie_code}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{t.datum}</td>
                    <td>
                      {t.omschrijving}
                      {t.waar && <span className="subtle"> · {t.waar}</span>}
                      {t.hoeveelheid ? <span className="subtle"> · {t.hoeveelheid}×</span> : ""}
                      {t.bewijsstuk_url && <> · <a href={t.bewijsstuk_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>bonnetje</a></>}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{t.hoofdcategorie || "-"}</td>
                    <td className={t.type_geldstroom === "uitgave" ? "amount-neg" : ""} style={{ textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {t.type_geldstroom === "uitgave" ? "-" : "+"}{euro(t.bedrag_totaal)}
                    </td>
                    <td><span className="badge badge-neutral">{t.status}</span></td>
                    {magBewerken && (
                      <td><button className="btn-danger" onClick={(e) => { e.stopPropagation(); transactieVerwijderen(t); }}>🗑️</button></td>
                    )}
                  </tr>
                  {bewerkId === t.id && bewerkVeld && (
                    <tr>
                      <td colSpan={magBewerken ? 7 : 6} style={{ background: "var(--primary-tint)", padding: 12 }}>
                        <div className="grid-3" style={{ marginBottom: 8 }}>
                          <input type="date" value={bewerkVeld.datum} onChange={(e) => setBewerkVeld({ ...bewerkVeld, datum: e.target.value })} />
                          <input placeholder="Omschrijving" value={bewerkVeld.omschrijving} onChange={(e) => setBewerkVeld({ ...bewerkVeld, omschrijving: e.target.value })} style={{ gridColumn: "span 2" }} />
                          <select value={bewerkVeld.typeGeldstroom} onChange={(e) => setBewerkVeld({ ...bewerkVeld, typeGeldstroom: e.target.value })}>
                            <option value="uitgave">Uitgave</option>
                            <option value="inkomst">Inkomst</option>
                          </select>
                          {bewerkVeld.typeGeldstroom === "uitgave" && (
                            <select value={bewerkVeld.typeKostenpost} onChange={(e) => setBewerkVeld({ ...bewerkVeld, typeKostenpost: e.target.value })}>
                              <option value="kost">Kost (eenmalig)</option>
                              <option value="investering">Investering (blijft mee)</option>
                            </select>
                          )}
                          <input type="number" step="0.01" placeholder="Bedrag" value={bewerkVeld.bedrag} onChange={(e) => setBewerkVeld({ ...bewerkVeld, bedrag: e.target.value })} />
                          <div style={{ display: "flex", gap: 4 }}>
                            <select value={bewerkVeld.hoofdcategorie} onChange={(e) => setBewerkVeld({ ...bewerkVeld, hoofdcategorie: e.target.value })} style={{ flex: 1 }}>
                              <option value="">Hoofdcategorie...</option>
                              {categorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                            </select>
                            <button type="button" onClick={() => categorieToevoegen((naam) => setBewerkVeld((prev) => ({ ...prev, hoofdcategorie: naam })))} title="Nieuwe categorie" style={{ padding: "0 10px" }}>+</button>
                          </div>
                          <input placeholder="Waar gekocht/besteld" value={bewerkVeld.waar} onChange={(e) => setBewerkVeld({ ...bewerkVeld, waar: e.target.value })} />
                          <input type="number" step="0.01" placeholder="Hoeveelheid" value={bewerkVeld.hoeveelheid} onChange={(e) => setBewerkVeld({ ...bewerkVeld, hoeveelheid: e.target.value })} />
                          <select value={bewerkVeld.betaalmethode} onChange={(e) => setBewerkVeld({ ...bewerkVeld, betaalmethode: e.target.value })}>
                            <option value="">Betaalmethode...</option>
                            {BETAALMETHODES.map((b) => <option key={b} value={b}>{b}</option>)}
                          </select>
                          <select value={bewerkVeld.status} onChange={(e) => setBewerkVeld({ ...bewerkVeld, status: e.target.value })}>
                            {STATUSSEN.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <select value={bewerkVeld.medewerkerUserId} onChange={(e) => setBewerkVeld({ ...bewerkVeld, medewerkerUserId: e.target.value })}>
                            <option value="">Voorgeschoten door (optioneel)...</option>
                            {gebruikers.map((g) => <option key={g.id} value={g.id}>{g.naam}</option>)}
                          </select>
                          <input placeholder="Link naar bonnetje/factuur" value={bewerkVeld.bewijsstukUrl} onChange={(e) => setBewerkVeld({ ...bewerkVeld, bewijsstukUrl: e.target.value })} style={{ gridColumn: "span 2" }} />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-primary" onClick={bewerkOpslaan}>Opslaan</button>
                          <button onClick={() => { setBewerkId(null); setBewerkVeld(null); }}>Annuleren</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
