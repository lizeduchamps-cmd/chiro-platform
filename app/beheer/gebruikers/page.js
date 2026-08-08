"use client";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";

const GROEPEN = ["Sloebers", "Speelclub", "Rakwi", "Tito", "Keti", "Aspi"];
const TYPES = ["Hoofdleiding", "Leiding", "Logistiek"];
const RECHTEN = [
  { value: "admin", label: "Admin (alles)" },
  { value: "financieel_verantwoordelijke", label: "Financieel verantwoordelijke" },
  { value: "lid", label: "Lid (enkel eigen fv)" },
];
const VERANTWOORDELIJKHEDEN = [
  "Financiën",
  "Ledenadministratie",
  "Taartenslag",
  "Vlaams weekend",
  "De fuif",
  "Winkelverantwoordelijke",
];

export default function GebruikersBeheer() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/gebruikers")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setUsers(data.users);
      })
      .finally(() => setLoading(false));
  }, [status]);

  if (status === "loading" || loading) return <p style={{ padding: 32 }}>Laden…</p>;
  if (status === "unauthenticated") redirect("/inloggen");
  if (session.user.platformRecht !== "admin") {
    return <p style={{ padding: 32 }}>Je hebt geen toegang tot deze pagina.</p>;
  }
  if (error) return <p style={{ padding: 32, color: "#B24C4C" }}>{error}</p>;

  const updateUser = (id, fields) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...fields } : u)));
    fetch("/api/gebruikers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
  };

  const toggleVerantwoordelijkheid = (u, v) => {
    const has = (u.verantwoordelijkheden || []).includes(v);
    const nieuw = has
      ? u.verantwoordelijkheden.filter((x) => x !== v)
      : [...(u.verantwoordelijkheden || []), v];
    updateUser(u.id, { verantwoordelijkheden: nieuw });
  };

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: "#1E2A22" }}>Gebruikers &amp; rollen</h1>
      <p style={{ color: "#6B6B5F", fontSize: 14, marginBottom: 24 }}>
        Wijs hier per persoon het type, de groep, verantwoordelijkheden en platformrecht toe.
        Wijzigingen worden meteen opgeslagen.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", background: "white" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #E4E0D4", background: "#F5F3EE" }}>
              <th style={{ padding: 10 }}>Naam</th>
              <th style={{ padding: 10 }}>Type</th>
              <th style={{ padding: 10 }}>Groep</th>
              <th style={{ padding: 10 }}>Verantwoordelijkheden</th>
              <th style={{ padding: 10 }}>Platformrecht</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #F0EEE5" }}>
                <td style={{ padding: 10 }}>
                  {u.naam}
                  <div style={{ fontSize: 11, color: "#9A9A8C" }}>@{u.discord_username}</div>
                </td>
                <td style={{ padding: 10 }}>
                  <select value={u.type || ""} onChange={(e) => updateUser(u.id, { type: e.target.value })}>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 10 }}>
                  <select value={u.groep || ""} onChange={(e) => updateUser(u.id, { groep: e.target.value })}>
                    <option value="">-</option>
                    {GROEPEN.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 10 }}>
                  {VERANTWOORDELIJKHEDEN.map((v) => (
                    <label key={v} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 10, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={(u.verantwoordelijkheden || []).includes(v)}
                        onChange={() => toggleVerantwoordelijkheid(u, v)}
                      />
                      {v}
                    </label>
                  ))}
                </td>
                <td style={{ padding: 10 }}>
                  <select value={u.platform_recht || "lid"} onChange={(e) => updateUser(u.id, { platform_recht: e.target.value })}>
                    {RECHTEN.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
