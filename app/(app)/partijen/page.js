"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

const ROLLEN = ["Leverancier", "Medewerker/Organisator", "Sponsor", "Overheid/Subsidie"];

export default function Partijen() {
  const { data: session } = useSession();
  const [partijen, setPartijen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nieuw, setNieuw] = useState({ naam: "", rol: "Leverancier", iban: "", contact: "" });

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  const laden = () => fetch("/api/partijen").then((r) => r.json()).then((d) => { setPartijen(d.partijen || []); setLoading(false); });

  useEffect(() => { laden(); }, []);

  if (loading) return <p className="muted" style={{ padding: 32 }}>Laden…</p>;

  const toevoegen = async () => {
    if (!nieuw.naam.trim()) return alert("Vul een naam in.");
    const res = await fetch("/api/partijen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nieuw),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setPartijen([...partijen, data.partij].sort((a, b) => a.naam.localeCompare(b.naam)));
    setNieuw({ naam: "", rol: "Leverancier", iban: "", contact: "" });
  };

  const bijwerken = (id, veld, waarde) => {
    fetch("/api/partijen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [veld]: waarde }),
    });
  };

  const verwijderen = async (id) => {
    if (!confirm("Deze partij verwijderen?")) return;
    await fetch(`/api/partijen?id=${id}`, { method: "DELETE" });
    setPartijen((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Partijen</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Externe leveranciers, sponsors en overheid — voor koppeling aan evenementtransacties. Interne leiding kies je rechtstreeks bij naam.
      </p>

      {magBewerken && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Nieuwe partij</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input placeholder="Naam, bv. Colruyt" value={nieuw.naam} onChange={(e) => setNieuw({ ...nieuw, naam: e.target.value })} />
            <select value={nieuw.rol} onChange={(e) => setNieuw({ ...nieuw, rol: e.target.value })}>
              {ROLLEN.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input placeholder="IBAN (optioneel)" value={nieuw.iban} onChange={(e) => setNieuw({ ...nieuw, iban: e.target.value })} />
            <input placeholder="Contact (e-mail/telefoon)" value={nieuw.contact} onChange={(e) => setNieuw({ ...nieuw, contact: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={toevoegen}>+ Toevoegen</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Naam</th>
              <th>Rol</th>
              <th>IBAN</th>
              <th>Contact</th>
              {magBewerken && <th></th>}
            </tr>
          </thead>
          <tbody>
            {partijen.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ textAlign: "center", border: "none", padding: 16 }}>Nog geen partijen.</td></tr>
            )}
            {partijen.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.naam}</td>
                <td>
                  {magBewerken ? (
                    <select defaultValue={p.rol} onChange={(e) => bijwerken(p.id, "rol", e.target.value)} style={{ fontSize: 12 }}>
                      {ROLLEN.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : p.rol}
                </td>
                <td>
                  {magBewerken ? (
                    <input defaultValue={p.iban || ""} placeholder="BE.." onBlur={(e) => bijwerken(p.id, "iban", e.target.value)} style={{ width: 160, fontSize: 12 }} />
                  ) : (p.iban || "-")}
                </td>
                <td>
                  {magBewerken ? (
                    <input defaultValue={p.contact || ""} onBlur={(e) => bijwerken(p.id, "contact", e.target.value)} style={{ width: 160, fontSize: 12 }} />
                  ) : (p.contact || "-")}
                </td>
                {magBewerken && (
                  <td><button className="btn-danger" onClick={() => verwijderen(p.id)}>🗑️</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
