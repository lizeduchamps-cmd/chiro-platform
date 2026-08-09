"use client";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

function maandLabel(maand) {
  const namen = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const [j, m] = maand.split("-");
  return `${namen[parseInt(m, 10) - 1]} ${j}`;
}

function huidigeMaandString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function FinancieelVerslag() {
  const { data: session, status } = useSession();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [fvMaanden, setFvMaanden] = useState([]);
  const [fvMaandId, setFvMaandId] = useState(null);
  const [overzicht, setOverzicht] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nieuweMaandOpen, setNieuweMaandOpen] = useState(false);
  const [nieuweMaand, setNieuweMaand] = useState({
    maand: huidigeMaandString(),
    dieselprijs: "",
    verbruik: "7",
    betaaldeadline: "",
  });
  const [nieuweRegel, setNieuweRegel] = useState({});
  const [nieuweKm, setNieuweKm] = useState({});

  const magBewerken = session?.user?.platformRecht === "admin" || session?.user?.platformRecht === "financieel_verantwoordelijke";

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      setLoading(false);
    });
  }, [status]);

  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/fv/maanden?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => {
      setFvMaanden(d.fvMaanden || []);
      setFvMaandId(d.fvMaanden?.[0]?.id || null);
    });
  }, [werkjaarId]);

  useEffect(() => {
    if (!fvMaandId) { setOverzicht(null); return; }
    ladenOverzicht(fvMaandId);
  }, [fvMaandId]);

  if (status === "loading" || loading) return <p style={{ padding: 32 }}>Laden…</p>;
  if (status === "unauthenticated") redirect("/inloggen");

  const ladenOverzicht = (id) => {
    fetch(`/api/fv/overzicht?fvMaandId=${id}`).then((r) => r.json()).then((d) => setOverzicht(d));
  };

  // Eén gedeeld km-tarief voor iedereen: dieselprijs (€/L) x verbruik (L/100km) / 100.
  const berekendKmTarief = () => {
    const diesel = parseFloat(nieuweMaand.dieselprijs);
    const verbruik = parseFloat(nieuweMaand.verbruik);
    if (!diesel || !verbruik) return null;
    return Math.round(((diesel * verbruik) / 100) * 1000) / 1000;
  };

  const nieuweMaandAanmaken = async () => {
    if (!/^\d{4}-\d{2}$/.test(nieuweMaand.maand)) return alert("Vul de maand in als JJJJ-MM, bv. 2026-05.");
    const kmTarief = berekendKmTarief();
    const res = await fetch("/api/fv/maanden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        werkjaarId,
        maand: nieuweMaand.maand,
        dieselprijs: nieuweMaand.dieselprijs ? parseFloat(nieuweMaand.dieselprijs) : null,
        kmTariefLeiding: kmTarief,
        kmTariefLogistiek: kmTarief,
        betaaldeadline: nieuweMaand.betaaldeadline || null,
      }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    const bijgewerkt = [data.fvMaand, ...fvMaanden].sort((a, b) => b.maand.localeCompare(a.maand));
    setFvMaanden(bijgewerkt);
    setFvMaandId(data.fvMaand.id);
    setNieuweMaandOpen(false);
  };

  const regelToevoegen = async (userId) => {
    const regel = nieuweRegel[userId];
    if (!regel?.omschrijving || !regel?.bedrag) return alert("Vul zowel een omschrijving als een bedrag in.");
    const res = await fetch("/api/fv/regels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId, userId, omschrijving: regel.omschrijving, bedrag: regel.bedrag }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setNieuweRegel((prev) => ({ ...prev, [userId]: { omschrijving: "", bedrag: "" } }));
    ladenOverzicht(fvMaandId);
  };

  const kmToevoegen = async (userId) => {
    const veld = nieuweKm[userId] || {};
    const km = parseFloat(veld.km);
    if (!km) return alert("Vul een aantal kilometer in.");
    const tarief = overzicht.fvMaand.km_tarief_leiding;
    if (!tarief) return alert("Er is nog geen km-tarief ingesteld voor deze FV-maand.");
    const bedrag = -(Math.round(km * tarief * 100) / 100);
    const omschrijving = veld.reden ? `Kilometervergoeding ${veld.reden} (${km} km)` : `Kilometervergoeding (${km} km)`;
    const res = await fetch("/api/fv/regels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId, userId, omschrijving, bedrag }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setNieuweKm((prev) => ({ ...prev, [userId]: { km: "", reden: "" } }));
    ladenOverzicht(fvMaandId);
  };

  const regelVerwijderen = async (id) => {
    if (!confirm("Deze regel verwijderen?")) return;
    await fetch(`/api/fv/regels?id=${id}`, { method: "DELETE" });
    ladenOverzicht(fvMaandId);
  };

  const statusToggle = async (userId, huidigeStatus) => {
    const nieuw = huidigeStatus === "betaald" ? "openstaand" : "betaald";
    await fetch("/api/fv/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId, userId, status: nieuw }),
    });
    ladenOverzicht(fvMaandId);
  };

  return (
    <Layout session={session}>
      <div style={{ padding: 32, maxWidth: 1100 }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Financieel Verslag</h1>
            <p className="muted" style={{ fontSize: 14 }}>Maandelijkse afrekening per persoon: streepjes, kilometers en overige kosten.</p>
          </div>
          {overzicht && (
            <button onClick={() => window.print()}>🖨️ Afdrukken / PDF</button>
          )}
        </div>

        <div className="no-print" style={{ display: "flex", gap: 12, alignItems: "center", margin: "16px 0", flexWrap: "wrap" }}>
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
          <select value={fvMaandId || ""} onChange={(e) => setFvMaandId(e.target.value)}>
            {fvMaanden.length === 0 && <option value="">Nog geen FV-maand</option>}
            {fvMaanden.map((m) => <option key={m.id} value={m.id}>{maandLabel(m.maand)}</option>)}
          </select>
          {magBewerken && (
            <button onClick={() => setNieuweMaandOpen(!nieuweMaandOpen)}>
              + Nieuwe FV-maand
            </button>
          )}
        </div>

        {nieuweMaandOpen && (
          <div className="no-print card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Nieuwe FV-maand</div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Iedereen krijgt meteen een lege plaats op dit FV. Streepjes voeg je bewust toe vanaf de Streepjes-pagina.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>
                Maand (JJJJ-MM)
                <input value={nieuweMaand.maand} onChange={(e) => setNieuweMaand({ ...nieuweMaand, maand: e.target.value })} style={{ display: "block", width: "100%", marginTop: 2 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                Betaaldeadline
                <input type="date" value={nieuweMaand.betaaldeadline} onChange={(e) => setNieuweMaand({ ...nieuweMaand, betaaldeadline: e.target.value })} style={{ display: "block", width: "100%", marginTop: 2 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                Dieselprijs (€/L)
                <input type="number" step="0.01" value={nieuweMaand.dieselprijs} onChange={(e) => setNieuweMaand({ ...nieuweMaand, dieselprijs: e.target.value })} style={{ display: "block", width: "100%", marginTop: 2 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                Gem. verbruik (L/100km)
                <input type="number" step="0.1" value={nieuweMaand.verbruik} onChange={(e) => setNieuweMaand({ ...nieuweMaand, verbruik: e.target.value })} style={{ display: "block", width: "100%", marginTop: 2 }} />
              </label>
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Km-vergoeding voor iedereen: {berekendKmTarief() ? `€${berekendKmTarief()}/km` : "vul dieselprijs en verbruik in"}
              {" "}(dieselprijs × verbruik ÷ 100)
            </p>
            <button className="btn-primary" onClick={nieuweMaandAanmaken}>
              Aanmaken
            </button>
          </div>
        )}

        {!overzicht ? (
          <p className="muted" style={{ fontStyle: "italic" }}>
            {fvMaanden.length === 0 ? "Nog geen FV-maand aangemaakt voor dit werkjaar." : "Laden…"}
          </p>
        ) : (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: "8px 0 16px" }}>
              {maandLabel(overzicht.fvMaand.maand)}
              {overzicht.fvMaand.betaaldeadline && (
                <span className="muted" style={{ fontSize: 12, fontWeight: 400, marginLeft: 10 }}>
                  Betaaldeadline: {overzicht.fvMaand.betaaldeadline}
                </span>
              )}
              {overzicht.fvMaand.km_tarief_leiding && (
                <span className="muted" style={{ fontSize: 12, fontWeight: 400, marginLeft: 10 }}>
                  Km-vergoeding: €{overzicht.fvMaand.km_tarief_leiding}/km
                </span>
              )}
            </h2>

            {overzicht.personen.length === 0 && (
              <p className="muted" style={{ fontStyle: "italic" }}>Nog niemand op dit FV-overzicht.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {overzicht.personen.map((p) => (
                <div key={p.user.id} className="card" style={{ pageBreakInside: "avoid" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.user.naam}</div>
                      <div className="subtle" style={{ fontSize: 11 }}>{p.user.type}{p.user.groep ? ` · ${p.user.groep}` : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className={p.totaal >= 0 ? "amount-neg" : ""} style={{ fontSize: 18, fontWeight: 700 }}>
                        {p.totaal < 0 ? "Terug te krijgen: " : "Te betalen: "}{euro(Math.abs(p.totaal))}
                      </div>
                      <button
                        className={`no-print badge ${p.status === "betaald" ? "badge-primary" : "badge-neutral"}`}
                        onClick={() => magBewerken && statusToggle(p.user.id, p.status)}
                        disabled={!magBewerken}
                        style={{ border: "none", cursor: magBewerken ? "pointer" : "default" }}
                      >
                        {p.status === "betaald" ? "✅ Betaald" : "⏳ Openstaand"}
                      </button>
                    </div>
                  </div>

                  <table style={{ marginBottom: magBewerken ? 8 : 0 }}>
                    <tbody>
                      {p.regels.length === 0 && (
                        <tr><td className="muted" style={{ padding: "4px 0", border: "none", fontStyle: "italic" }}>Nog geen regels.</td></tr>
                      )}
                      {p.regels.map((r) => (
                        <tr key={r.id}>
                          <td className="muted" style={{ padding: "6px 0", border: "none" }}>{r.omschrijving}</td>
                          <td style={{ padding: "6px 0", border: "none", textAlign: "right", fontWeight: 600, width: 100 }}>
                            {r.bedrag < 0 ? "-" : ""}{euro(Math.abs(r.bedrag))}
                          </td>
                          {magBewerken && (
                            <td className="no-print" style={{ padding: "6px 0", border: "none", width: 24, textAlign: "right" }}>
                              <button className="btn-danger" onClick={() => regelVerwijderen(r.id)} title="Verwijderen" style={{ fontSize: 12 }}>🗑️</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {magBewerken && (
                    <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                      <input
                        placeholder="Omschrijving, bv. Frituur 16/05"
                        value={nieuweRegel[p.user.id]?.omschrijving || ""}
                        onChange={(e) => setNieuweRegel((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], omschrijving: e.target.value } }))}
                        style={{ fontSize: 12, flex: 1, minWidth: 140 }}
                      />
                      <input
                        type="number" step="0.01" placeholder="Bedrag"
                        value={nieuweRegel[p.user.id]?.bedrag || ""}
                        onChange={(e) => setNieuweRegel((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], bedrag: e.target.value } }))}
                        style={{ fontSize: 12, width: 90 }}
                      />
                      <button onClick={() => regelToevoegen(p.user.id)} style={{ fontSize: 12 }}>+ Regel</button>

                      <input
                        type="number" step="1" placeholder="Km gereden"
                        value={nieuweKm[p.user.id]?.km || ""}
                        onChange={(e) => setNieuweKm((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], km: e.target.value } }))}
                        style={{ fontSize: 12, width: 90 }}
                      />
                      <input
                        placeholder="Waarvoor? bv. Weekend"
                        value={nieuweKm[p.user.id]?.reden || ""}
                        onChange={(e) => setNieuweKm((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], reden: e.target.value } }))}
                        style={{ fontSize: 12, width: 130 }}
                      />
                      <button onClick={() => kmToevoegen(p.user.id)} style={{ fontSize: 12 }}>+ Km-vergoeding</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
