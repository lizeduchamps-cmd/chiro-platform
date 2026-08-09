"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

const STATUS_LABEL = { gepland: "Gepland", lopend: "Lopend", afgerond: "Afgerond" };

export default function Evenementen() {
  const { data: session } = useSession();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [evenementen, setEvenementen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nieuweNaam, setNieuweNaam] = useState("");
  const [nieuweDatum, setNieuweDatum] = useState("");

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      else setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/evenementen?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => { setEvenementen(d.evenementen || []); setLoading(false); });
  }, [werkjaarId]);

  if (loading) return <p className="muted" style={{ padding: 32 }}>Laden…</p>;

  const aanmaken = async () => {
    if (!nieuweNaam.trim()) return alert("Vul een naam in, bv. 'Fuif 2026'.");
    const res = await fetch("/api/evenementen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam: nieuweNaam.trim(), datum: nieuweDatum || null, werkjaarId }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setEvenementen([data.evenement, ...evenementen]);
    setNieuweNaam("");
    setNieuweDatum("");
  };

  const verwijderen = async (id, naam) => {
    if (!confirm(`Evenement "${naam}" en alle kassa's/transacties ervan verwijderen?`)) return;
    await fetch(`/api/evenementen?id=${id}`, { method: "DELETE" });
    setEvenementen((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Evenementen</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Kassabeheer en winst/verliesbalans per evenement (fuif, taartenslag, ...). Winst van afgeronde evenementen verschijnt automatisch op het Jaaroverzicht.
      </p>

      {magBewerken && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Nieuw evenement</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Naam, bv. Fuif 2026" value={nieuweNaam} onChange={(e) => setNieuweNaam(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <input type="date" value={nieuweDatum} onChange={(e) => setNieuweDatum(e.target.value)} />
            <button className="btn-primary" onClick={aanmaken}>+ Aanmaken</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Naam</th>
              <th>Datum</th>
              <th>Status</th>
              {magBewerken && <th></th>}
            </tr>
          </thead>
          <tbody>
            {evenementen.length === 0 && (
              <tr><td colSpan={4} className="muted" style={{ textAlign: "center", border: "none", padding: 24 }}>Nog geen evenementen dit werkjaar.</td></tr>
            )}
            {evenementen.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link href={`/evenementen/${e.id}`} style={{ fontWeight: 600, color: "var(--primary)" }}>{e.naam}</Link>
                </td>
                <td>{e.datum || "-"}</td>
                <td><span className="badge badge-neutral">{STATUS_LABEL[e.status] || e.status}</span></td>
                {magBewerken && (
                  <td>
                    <button className="btn-danger" onClick={() => verwijderen(e.id, e.naam)}>🗑️</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
