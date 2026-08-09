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
    kmTariefLeiding: "",
    kmTariefLogistiek: "",
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

  const nieuweMaandAanmaken = async () => {
    if (!/^\d{4}-\d{2}$/.test(nieuweMaand.maand)) return alert("Vul de maand in als JJJJ-MM, bv. 2026-05.");
    const res = await fetch("/api/fv/maanden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        werkjaarId,
        maand: nieuweMaand.maand,
        dieselprijs: nieuweMaand.dieselprijs ? parseFloat(nieuweMaand.dieselprijs) : null,
        kmTariefLeiding: nieuweMaand.kmTariefLeiding ? parseFloat(nieuweMaand.kmTariefLeiding) : null,
        kmTariefLogistiek: nieuweMaand.kmTariefLogistiek ? parseFloat(nieuweMaand.kmTariefLogistiek) : null,
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

  const kmToevoegen = async (userId, userType) => {
    const km = parseFloat(nieuweKm[userId]);
    if (!km) return alert("Vul een aantal kilometer in.");
    const tarief = userType === "Logistiek" ? overzicht.fvMaand.km_tarief_logistiek : overzicht.fvMaand.km_tarief_leiding;
    if (!tarief) return alert("Er is nog geen km-tarief ingesteld voor deze FV-maand.");
    const bedrag = -(Math.round(km * tarief * 100) / 100);
    const res = await fetch("/api/fv/regels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId, userId, omschrijving: `Kilometervergoeding (${km} km)`, bedrag }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setNieuweKm((prev) => ({ ...prev, [userId]: "" }));
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
            <h1 style={{ fontSize: 20, fontWeight: 600, color: "#1E2A22", marginBottom: 4 }}>Financieel Verslag</h1>
            <p style={{ color: "#6B6B5F", fontSize: 14 }}>Maandelijkse afrekening per persoon: streepjes, kilometers en overige kosten.</p>
          </div>
          {overzicht && (
            <button onClick={() => window.print()} style={{ padding: "8px 14px" }}>🖨️ Afdrukken / PDF</button>
          )}
        </div>

        <div className="no-print" style={{ display: "flex", gap: 12, alignItems: "center", margin: "16px 0", flexWrap: "wrap" }}>
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ padding: 8 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
          <select value={fvMaandId || ""} onChange={(e) => setFvMaandId(e.target.value)} style={{ padding: 8 }}>
            {fvMaanden.length === 0 && <option value="">Nog geen FV-maand</option>}
            {fvMaanden.map((m) => <option key={m.id} value={m.id}>{maandLabel(m.maand)}</option>)}
          </select>
          {magBewerken && (
            <button onClick={() => setNieuweMaandOpen(!nieuweMaandOpen)} style={{ padding: "8px 12px" }}>
              + Nieuwe FV-maand
            </button>
          )}
        </div>

        {nieuweMaandOpen && (
          <div className="no-print" style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Nieuwe FV-maand</div>
            <p style={{ fontSize: 12, color: "#9A9A8C", marginBottom: 10 }}>
              Bij het aanmaken wordt de huidige streepjes-stand van iedereen automatisch overgenomen als FV-regel, waarna de tellers op de Streepjes-pagina terug op 0 gaan.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>
                Maand (JJJJ-MM)
                <input value={nieuweMaand.maand} onChange={(e) => setNieuweMaand({ ...nieuweMaand, maand: e.target.value })} style={{ display: "block", width: "100%", padding: 6, marginTop: 2 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                Betaaldeadline
                <input type="date" value={nieuweMaand.betaaldeadline} onChange={(e) => setNieuweMaand({ ...nieuweMaand, betaaldeadline: e.target.value })} style={{ display: "block", width: "100%", padding: 6, marginTop: 2 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                Dieselprijs (€/L)
                <input type="number" step="0.01" value={nieuweMaand.dieselprijs} onChange={(e) => setNieuweMaand({ ...nieuweMaand, dieselprijs: e.target.value })} style={{ display: "block", width: "100%", padding: 6, marginTop: 2 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                Km-tarief leiding (€/km)
                <input type="number" step="0.01" value={nieuweMaand.kmTariefLeiding} onChange={(e) => setNieuweMaand({ ...nieuweMaand, kmTariefLeiding: e.target.value })} style={{ display: "block", width: "100%", padding: 6, marginTop: 2 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                Km-tarief logistiek (€/km)
                <input type="number" step="0.01" value={nieuweMaand.kmTariefLogistiek} onChange={(e) => setNieuweMaand({ ...nieuweMaand, kmTariefLogistiek: e.target.value })} style={{ display: "block", width: "100%", padding: 6, marginTop: 2 }} />
              </label>
            </div>
            <button onClick={nieuweMaandAanmaken} style={{ background: "#2F4A3C", color: "white", padding: "8px 16px", borderRadius: 8, border: "none" }}>
              Aanmaken
            </button>
          </div>
        )}

        {!overzicht ? (
          <p style={{ color: "#9A9A8C", fontStyle: "italic" }}>
            {fvMaanden.length === 0 ? "Nog geen FV-maand aangemaakt voor dit werkjaar." : "Laden…"}
          </p>
        ) : (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#1E2A22", margin: "8px 0 16px" }}>
              {maandLabel(overzicht.fvMaand.maand)}
              {overzicht.fvMaand.betaaldeadline && (
                <span style={{ fontSize: 12, color: "#9A9A8C", fontWeight: 400, marginLeft: 10 }}>
                  Betaaldeadline: {overzicht.fvMaand.betaaldeadline}
                </span>
              )}
            </h2>

            {overzicht.personen.length === 0 && (
              <p style={{ color: "#9A9A8C", fontStyle: "italic" }}>Nog niemand op dit FV-overzicht.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {overzicht.personen.map((p) => (
                <div key={p.user.id} style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, padding: 16, pageBreakInside: "avoid" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#1E2A22" }}>{p.user.naam}</div>
                      <div style={{ fontSize: 11, color: "#9A9A8C" }}>{p.user.type}{p.user.groep ? ` · ${p.user.groep}` : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: p.totaal < 0 ? "#2F4A3C" : "#B24C4C" }}>
                        {p.totaal < 0 ? "Terug te krijgen: " : "Te betalen: "}{euro(Math.abs(p.totaal))}
                      </div>
                      <button
                        className="no-print"
                        onClick={() => magBewerken && statusToggle(p.user.id, p.status)}
                        disabled={!magBewerken}
                        style={{
                          fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "none",
                          background: p.status === "betaald" ? "#DCE9DE" : "#FBEFE0",
                          color: p.status === "betaald" ? "#2F4A3C" : "#9A6A1E",
                          cursor: magBewerken ? "pointer" : "default",
                        }}
                      >
                        {p.status === "betaald" ? "✅ Betaald" : "⏳ Openstaand"}
                      </button>
                    </div>
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: magBewerken ? 8 : 0 }}>
                    <tbody>
                      {p.regels.length === 0 && (
                        <tr><td style={{ padding: "4px 0", color: "#9A9A8C", fontStyle: "italic" }}>Nog geen regels.</td></tr>
                      )}
                      {p.regels.map((r) => (
                        <tr key={r.id} style={{ borderTop: "1px solid #F0EEE5" }}>
                          <td style={{ padding: "6px 0", color: "#6B6B5F" }}>{r.omschrijving}</td>
                          <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: r.bedrag < 0 ? "#2F4A3C" : "#1E2A22", width: 100 }}>
                            {r.bedrag < 0 ? "-" : ""}{euro(Math.abs(r.bedrag))}
                          </td>
                          {magBewerken && (
                            <td className="no-print" style={{ padding: "6px 0", width: 24, textAlign: "right" }}>
                              <button onClick={() => regelVerwijderen(r.id)} title="Verwijderen" style={{ fontSize: 12 }}>🗑️</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {magBewerken && (
                    <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid #F0EEE5", paddingTop: 8 }}>
                      <input
                        placeholder="Omschrijving, bv. Frituur 16/05"
                        value={nieuweRegel[p.user.id]?.omschrijving || ""}
                        onChange={(e) => setNieuweRegel((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], omschrijving: e.target.value } }))}
                        style={{ padding: 6, fontSize: 12, flex: 1, minWidth: 140 }}
                      />
                      <input
                        type="number" step="0.01" placeholder="Bedrag"
                        value={nieuweRegel[p.user.id]?.bedrag || ""}
                        onChange={(e) => setNieuweRegel((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], bedrag: e.target.value } }))}
                        style={{ padding: 6, fontSize: 12, width: 90 }}
                      />
                      <button onClick={() => regelToevoegen(p.user.id)} style={{ padding: "6px 10px", fontSize: 12 }}>+ Regel</button>

                      <input
                        type="number" step="1" placeholder="Km gereden"
                        value={nieuweKm[p.user.id] || ""}
                        onChange={(e) => setNieuweKm((prev) => ({ ...prev, [p.user.id]: e.target.value }))}
                        style={{ padding: 6, fontSize: 12, width: 90 }}
                      />
                      <button onClick={() => kmToevoegen(p.user.id, p.user.type)} style={{ padding: "6px 10px", fontSize: 12 }}>+ Km-vergoeding</button>
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
