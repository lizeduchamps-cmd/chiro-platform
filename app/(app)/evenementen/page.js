"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

const STATUS_LABEL = { gepland: "Gepland", lopend: "Lopend", afgerond: "Afgerond" };

export default function Evenementen() {
  const { data: session } = useSession();
  const [evenementen, setEvenementen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nieuweNaam, setNieuweNaam] = useState("");
  const [nieuweDatum, setNieuweDatum] = useState("");

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  const laden = () => fetch("/api/evenementen").then((r) => r.json()).then((d) => { setEvenementen(d.evenementen || []); setLoading(false); });

  useEffect(() => { laden(); }, []);

  if (loading) return <p className="muted" style={{ padding: 32 }}>Laden…</p>;

  const aanmaken = async () => {
    if (!nieuweNaam.trim()) return alert("Vul een naam in, bv. 'Fuif 2026'.");
    const res = await fetch("/api/evenementen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam: nieuweNaam.trim(), datum: nieuweDatum || null }),
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
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Evenementen</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Kassabeheer en winst/verliesbalans per evenement (fuif, taartenslag, ...).
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
              <tr><td colSpan={4} className="muted" style={{ textAlign: "center", border: "none", padding: 24 }}>Nog geen evenementen.</td></tr>
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
