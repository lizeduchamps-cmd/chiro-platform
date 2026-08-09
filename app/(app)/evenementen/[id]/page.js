"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { evenementMatchTag } from "@/lib/evenementMatch";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const BETAALMETHODES = ["Overschrijving", "Cash", "Bancontact/Kaart", "Factuur op termijn"];
const STATUSSEN = ["Gepland", "Te vergoeden", "Betaald", "Afgerond"];
const STATUS_LABEL = { gepland: "Gepland", lopend: "Lopend", afgerond: "Afgerond" };

const LEGE_TRANSACTIE = {
  datum: new Date().toISOString().slice(0, 10),
  omschrijving: "",
  typeGeldstroom: "uitgave",
  typeKostenpost: "kost",
  hoofdcategorie: "",
  subcategorie: "",
  bedragExclBtw: "",
  btwTarief: "0",
  betaalmethode: "Overschrijving",
  status: "Gepland",
  wie: "", // "user:<id>" of "partij:<id>" of ""
  bewijsstukUrl: "",
};

export default function EvenementDetail({ params }) {
  const { id } = params;
  const { data: session } = useSession();
  const [overzicht, setOverzicht] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gebruikers, setGebruikers] = useState([]);
  const [partijen, setPartijen] = useState([]);
  const [nieuweKassa, setNieuweKassa] = useState({ naam: "", type: "cash", wisselgeldStart: "" });
  const [nieuweTransactie, setNieuweTransactie] = useState(LEGE_TRANSACTIE);
  const [toonTransactieForm, setToonTransactieForm] = useState(false);

  const laden = () => fetch(`/api/evenementen/overzicht?evenementId=${id}`).then((r) => r.json()).then((d) => { setOverzicht(d); setLoading(false); });

  useEffect(() => {
    laden();
    fetch("/api/gebruikers/lijst").then((r) => r.json()).then((d) => setGebruikers(d.users || []));
    fetch("/api/partijen").then((r) => r.json()).then((d) => setPartijen(d.partijen || []));
  }, [id]);

  if (loading || !overzicht) return <p className="muted" style={{ padding: 32 }}>Laden…</p>;
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
    if (!nieuweKassa.naam.trim()) return alert("Vul een naam in voor de kassa.");
    const res = await fetch("/api/evenementen/kassas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId: id, ...nieuweKassa }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setNieuweKassa({ naam: "", type: "cash", wisselgeldStart: "" });
    laden();
  };

  const kassaBijwerken = async (kassaId, veld, waarde) => {
    await fetch("/api/evenementen/kassas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: kassaId, [veld]: waarde === "" ? "" : Number(waarde) }),
    });
    laden();
  };

  const kassaVerwijderen = async (kassaId) => {
    if (!confirm("Deze kassa verwijderen?")) return;
    await fetch(`/api/evenementen/kassas?id=${kassaId}`, { method: "DELETE" });
    laden();
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
    if (!t.datum || !t.omschrijving || !t.bedragExclBtw) return alert("Vul minstens datum, omschrijving en bedrag in.");
    const partijId = t.wie.startsWith("partij:") ? t.wie.slice(7) : null;
    const medewerkerUserId = t.wie.startsWith("user:") ? t.wie.slice(5) : null;
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
        subcategorie: t.subcategorie || null,
        bedragExclBtw: t.bedragExclBtw,
        btwTarief: t.btwTarief,
        betaalmethode: t.betaalmethode,
        status: t.status,
        partijId,
        medewerkerUserId,
        bewijsstukUrl: t.bewijsstukUrl || null,
      }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setNieuweTransactie(LEGE_TRANSACTIE);
    laden();
  };

  const transactieStatusWijzigen = async (transactieId, status) => {
    await fetch("/api/evenementen/transacties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: transactieId, status }),
    });
    laden();
  };

  const transactieVerwijderen = async (transactieId) => {
    if (!confirm("Deze transactie verwijderen?")) return;
    await fetch(`/api/evenementen/transacties?id=${transactieId}`, { method: "DELETE" });
    laden();
  };

  const categorieToevoegen = async () => {
    const naam = prompt("Naam van de nieuwe categorie:");
    if (!naam?.trim()) return;
    const res = await fetch("/api/evenementen/categorieen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId: id, naam: naam.trim() }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setNieuweTransactie((prev) => ({ ...prev, hoofdcategorie: naam.trim() }));
    laden();
  };

  const categorieVerwijderen = async (categorieId) => {
    if (!confirm("Deze categorie verwijderen? Transacties die er al aan hangen behouden hun naam als tekst, maar tellen niet meer mee in het budgetoverzicht.")) return;
    await fetch(`/api/evenementen/categorieen?id=${categorieId}`, { method: "DELETE" });
    laden();
  };

  const { evenement, kassas, kassaOmzetTotaal, categorieen, transacties, gekoppeldeTransacties, budgetBurnRate, nogTerugTeBetalen, balans } = overzicht;

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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
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
            Deze banktransacties staan al in het Kasboek en zijn hieraan getagd — ze tellen mee in de balans hierboven, maar staan niet nog eens apart geregistreerd.
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
        <div className="table-wrap" style={{ marginBottom: magBewerken ? 12 : 0 }}>
          <table>
            <thead>
              <tr>
                <th>Naam</th>
                <th>Type</th>
                <th style={{ textAlign: "right" }}>Wisselgeld start</th>
                <th style={{ textAlign: "right" }}>Inhoud na afloop</th>
                <th style={{ textAlign: "right" }}>Omzet</th>
                {magBewerken && <th></th>}
              </tr>
            </thead>
            <tbody>
              {kassas.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: "center", border: "none", padding: 16 }}>Nog geen kassa's.</td></tr>
              )}
              {kassas.map((k) => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 600 }}>{k.naam}</td>
                  <td>{k.type === "cash" ? "Cash" : "Digitaal"}</td>
                  <td style={{ textAlign: "right" }}>
                    {magBewerken && k.type === "cash" ? (
                      <input type="number" step="0.01" defaultValue={k.wisselgeld_start} onBlur={(e) => kassaBijwerken(k.id, "wisselgeldStart", e.target.value)} style={{ width: 90, textAlign: "right" }} />
                    ) : k.type === "cash" ? euro(k.wisselgeld_start) : "-"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {magBewerken ? (
                      <input type="number" step="0.01" defaultValue={k.inhoud_einde ?? ""} placeholder="nog niet geteld" onBlur={(e) => kassaBijwerken(k.id, "inhoudEinde", e.target.value)} style={{ width: 90, textAlign: "right" }} />
                    ) : k.inhoud_einde !== null ? euro(k.inhoud_einde) : "-"}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(k.omzet)}</td>
                  {magBewerken && (
                    <td><button className="btn-danger" onClick={() => kassaVerwijderen(k.id)}>🗑️</button></td>
                  )}
                </tr>
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hoofdcategorie</th>
                <th style={{ textAlign: "right" }}>Budget</th>
                <th style={{ textAlign: "right" }}>Uitgegeven</th>
                <th style={{ textAlign: "right" }}>Resterend</th>
                {magBewerken && <th></th>}
              </tr>
            </thead>
            <tbody>
              {categorieen.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", border: "none", padding: 16 }}>Nog geen categorieën — maak er een aan via het "+"-knopje bij een nieuwe transactie.</td></tr>
              )}
              {categorieen.map((c) => {
                const cat = c.naam;
                const rij = budgetBurnRate.find((b) => b.hoofdcategorie === cat);
                return (
                  <tr key={c.id}>
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
                    <td style={{ fontWeight: 600 }}>{r.wie?.naam || "-"} {r.wie?.type === "intern" && <span className="subtle">(intern)</span>}</td>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
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
              <div style={{ display: "flex", gap: 4 }}>
                <select value={nieuweTransactie.hoofdcategorie} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, hoofdcategorie: e.target.value })} style={{ flex: 1 }}>
                  <option value="">Hoofdcategorie...</option>
                  {categorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                </select>
                <button type="button" onClick={categorieToevoegen} title="Nieuwe categorie" style={{ padding: "0 10px" }}>+</button>
              </div>
              <input placeholder="Subcategorie (optioneel)" value={nieuweTransactie.subcategorie} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, subcategorie: e.target.value })} />
              <input type="number" step="0.01" placeholder="Bedrag excl. btw" value={nieuweTransactie.bedragExclBtw} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, bedragExclBtw: e.target.value })} />
              <select value={nieuweTransactie.btwTarief} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, btwTarief: e.target.value })}>
                <option value="0">0% btw</option>
                <option value="6">6% btw</option>
                <option value="12">12% btw</option>
                <option value="21">21% btw</option>
              </select>
              <select value={nieuweTransactie.betaalmethode} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, betaalmethode: e.target.value })}>
                {BETAALMETHODES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={nieuweTransactie.status} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, status: e.target.value })}>
                {STATUSSEN.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={nieuweTransactie.wie} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, wie: e.target.value })}>
                <option value="">Wie (optioneel)...</option>
                <optgroup label="Interne leiding (voorgeschoten)">
                  {gebruikers.map((g) => <option key={g.id} value={`user:${g.id}`}>{g.naam}</option>)}
                </optgroup>
                <optgroup label="Externe partij">
                  {partijen.map((p) => <option key={p.id} value={`partij:${p.id}`}>{p.naam} ({p.rol})</option>)}
                </optgroup>
              </select>
              <input placeholder="Link naar bonnetje/factuur (optioneel)" value={nieuweTransactie.bewijsstukUrl} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, bewijsstukUrl: e.target.value })} style={{ gridColumn: "span 2" }} />
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
                <tr key={t.id}>
                  <td className="subtle" style={{ whiteSpace: "nowrap" }}>{t.transactie_code}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{t.datum}</td>
                  <td>
                    {t.omschrijving}
                    {t.bewijsstuk_url && <> · <a href={t.bewijsstuk_url} target="_blank" rel="noreferrer">bonnetje</a></>}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{t.hoofdcategorie || "-"}{t.subcategorie ? ` · ${t.subcategorie}` : ""}</td>
                  <td className={t.type_geldstroom === "uitgave" ? "amount-neg" : ""} style={{ textAlign: "right", fontWeight: 700 }}>
                    {t.type_geldstroom === "uitgave" ? "-" : "+"}{euro(t.bedrag_totaal)}
                  </td>
                  <td>
                    {magBewerken ? (
                      <select value={t.status} onChange={(e) => transactieStatusWijzigen(t.id, e.target.value)} style={{ fontSize: 12 }}>
                        {STATUSSEN.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className="badge badge-neutral">{t.status}</span>
                    )}
                  </td>
                  {magBewerken && (
                    <td><button className="btn-danger" onClick={() => transactieVerwijderen(t.id)}>🗑️</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
