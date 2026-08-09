"use client";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

function MaandGrafiek({ perMaand }) {
  const maanden = Object.keys(perMaand).sort();
  if (maanden.length === 0) return <p style={{ color: "#9A9A8C", fontStyle: "italic" }}>Nog geen transacties dit werkjaar.</p>;

  const max = Math.max(1, ...maanden.map((m) => Math.max(perMaand[m].inkomsten, perMaand[m].uitgaven)));

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-end", height: 180, padding: "12px 4px", overflowX: "auto" }}>
      {maanden.map((m) => (
        <div key={m} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 130 }}>
            <div title={`Inkomsten: ${euro(perMaand[m].inkomsten)}`} style={{ width: 16, background: "#2F4A3C", height: `${(perMaand[m].inkomsten / max) * 130}px`, borderRadius: 3 }} />
            <div title={`Uitgaven: ${euro(perMaand[m].uitgaven)}`} style={{ width: 16, background: "#B24C4C", height: `${(perMaand[m].uitgaven / max) * 130}px`, borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 10, color: "#6B6B5F", marginTop: 6 }}>{m.slice(5)}/{m.slice(2, 4)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Jaaroverzicht() {
  const { data: session, status } = useSession();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      setLoading(false);
    });
  }, [status]);

  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/jaaroverzicht?werkjaarId=${werkjaarId}`).then((r) => r.json()).then(setData);
  }, [werkjaarId]);

  if (status === "loading" || loading) return <p style={{ padding: 32 }}>Laden…</p>;
  if (status === "unauthenticated") redirect("/inloggen");

  return (
    <Layout session={session}>
      <div style={{ padding: 32, maxWidth: 1100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#1E2A22" }}>Jaaroverzicht</h1>
          {werkjaren.length > 0 && (
            <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ padding: 8, fontWeight: 600 }}>
              {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
            </select>
          )}
        </div>
        <p style={{ color: "#6B6B5F", fontSize: 14, marginBottom: 24 }}>
          Welkom, {session.user.name}. Voor de details kan je naar Kasboek of CSV Upload in de zijbalk.
        </p>

        {werkjaren.length === 0 ? (
          <p>Er is nog geen werkjaar aangemaakt — ga naar Kasboek om er één te starten.</p>
        ) : !data ? (
          <p>Laden…</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#6B6B5F" }}>Totale inkomsten</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#2F4A3C" }}>{euro(data.totaalInkomsten)}</div>
                {data.vorigJaarTotalen && <div style={{ fontSize: 11, color: "#9A9A8C" }}>Vorig jaar ({data.vorigJaarTotalen.naam}): {euro(data.vorigJaarTotalen.inkomsten)}</div>}
              </div>
              <div style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#6B6B5F" }}>Totale uitgaven</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#B24C4C" }}>{euro(data.totaalUitgaven)}</div>
                {data.vorigJaarTotalen && <div style={{ fontSize: 11, color: "#9A9A8C" }}>Vorig jaar ({data.vorigJaarTotalen.naam}): {euro(data.vorigJaarTotalen.uitgaven)}</div>}
              </div>
              <div style={{ background: "#2F4A3C", color: "white", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#D9A62E" }}>Netto resultaat</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(data.netto)}</div>
              </div>
            </div>

            <div style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, padding: 16, marginBottom: 24 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Inkomsten &amp; uitgaven per maand</div>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#6B6B5F", marginBottom: 4 }}>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#2F4A3C", borderRadius: 2, marginRight: 4 }}></span>Inkomsten</span>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#B24C4C", borderRadius: 2, marginRight: 4 }}></span>Uitgaven</span>
              </div>
              <MaandGrafiek perMaand={data.perMaand} />
            </div>

            <div style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F5F3EE", textAlign: "left" }}>
                    <th style={{ padding: 8 }}>Categorie</th>
                    <th style={{ padding: 8, textAlign: "right" }}>Inkomsten</th>
                    <th style={{ padding: 8, textAlign: "right" }}>Uitgaven</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.perCategorie).sort((a, b) => (b[1].uitgaven + b[1].inkomsten) - (a[1].uitgaven + a[1].inkomsten)).map(([naam, v]) => (
                    <tr key={naam} style={{ borderTop: "1px solid #F0EEE5" }}>
                      <td style={{ padding: 8 }}>{naam}</td>
                      <td style={{ padding: 8, textAlign: "right", color: "#2F4A3C" }}>{v.inkomsten ? euro(v.inkomsten) : "-"}</td>
                      <td style={{ padding: 8, textAlign: "right", color: "#B24C4C" }}>{v.uitgaven ? euro(v.uitgaven) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
