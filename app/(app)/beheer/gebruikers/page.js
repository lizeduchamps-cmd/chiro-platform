"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonTable } from "@/components/Skeleton";

const GROEPEN = ["Sloebers", "Speelclub", "Rakwi", "Tito", "Keti", "Aspi"];
const TYPES = ["Hoofdleiding", "Leiding", "Logistiek", "Aspi"];
const RECHTEN = [
  { value: "admin", label: "Admin (alles)" },
  { value: "financieel_verantwoordelijke", label: "Financieel verantwoordelijke" },
  { value: "lid", label: "Lid (enkel eigen fv)" },
];

// Compacte multi-select i.p.v. een rij aangevinkte checkboxes per gebruiker:
// toegewezen verantwoordelijkheden tonen als chips, een "+ toewijzen"-knopje
// opent een klein afvinklijstje om aan te passen.
function VerantwoordelijkhedenCel({ user, alle, open, onToggleOpen, onToggle }) {
  const toegewezen = user.verantwoordelijkheden;
  return (
    <div className="popover" data-verant-picker>
      {toegewezen.map((v) => (
        <span key={v.id} className="chip">
          {v.naam}{v.isHoofdverantwoordelijke ? " ★" : ""}
        </span>
      ))}
      <button type="button" className="chip-add" onClick={() => onToggleOpen(user.id)}>
        + toewijzen
      </button>
      {open && (
        <div className="popover-menu">
          {alle.length === 0 ? (
            <div className="muted" style={{ padding: 8, fontSize: 12 }}>Nog geen verantwoordelijkheden aangemaakt.</div>
          ) : (
            alle.map((v) => (
              <label key={v.id} className="popover-item">
                <input type="checkbox" checked={toegewezen.some((x) => x.id === v.id)} onChange={() => onToggle(user, v)} />
                {v.naam}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function GebruikersBeheer() {
  const { data: session } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [verantwoordelijkheden, setVerantwoordelijkheden] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openPicker, setOpenPicker] = useState(null);

  useEffect(() => {
    if (!openPicker) return;
    const handler = (e) => { if (!e.target.closest("[data-verant-picker]")) setOpenPicker(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openPicker]);

  const laden = () =>
    fetch("/api/gebruikers")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setUsers(data.users);
          setVerantwoordelijkheden(data.verantwoordelijkheden || []);
        }
      })
      .finally(() => setLoading(false));

  useEffect(() => { laden(); }, []);

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        <SkeletonTable rows={6} cols={6} />
      </div>
    );
  }
  if (session?.user?.platformRecht !== "admin") {
    return <p style={{ padding: 32 }}>Je hebt geen toegang tot deze pagina.</p>;
  }
  if (error) return <p className="amount-neg" style={{ padding: 32 }}>{error}</p>;

  const updateUser = (id, fields) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...fields } : u)));
    fetch("/api/gebruikers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
  };

  const toggleVerantwoordelijkheid = async (u, v) => {
    const heeft = u.verantwoordelijkheden.some((x) => x.id === v.id);
    if (heeft) {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, verantwoordelijkheden: x.verantwoordelijkheden.filter((y) => y.id !== v.id) } : x)));
      await fetch(`/api/verantwoordelijkheden/toewijzingen?verantwoordelijkheidId=${v.id}&userId=${u.id}`, { method: "DELETE" });
    } else {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, verantwoordelijkheden: [...x.verantwoordelijkheden, { id: v.id, naam: v.naam, isHoofdverantwoordelijke: false }] } : x)));
      await fetch("/api/verantwoordelijkheden/toewijzingen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verantwoordelijkheidId: v.id, userId: u.id, isHoofdverantwoordelijke: false }),
      });
    }
    laden();
  };

  const hoofdverantwoordelijkeInstellen = async (verantwoordelijkheidId, userId) => {
    if (!userId) return;
    await fetch("/api/verantwoordelijkheden/toewijzingen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verantwoordelijkheidId, userId, isHoofdverantwoordelijke: true }),
    });
    laden();
    toast.success("Hoofdverantwoordelijke ingesteld");
  };

  const nieuweVerantwoordelijkheid = async () => {
    const naam = prompt("Naam van de nieuwe verantwoordelijkheid:");
    if (!naam?.trim()) return;
    const res = await fetch("/api/verantwoordelijkheden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam: naam.trim() }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    laden();
    toast.success(`Verantwoordelijkheid "${naam.trim()}" toegevoegd`);
  };

  const verantwoordelijkheidVerwijderen = async (v) => {
    const ok = await confirm({
      title: "Verantwoordelijkheid verwijderen",
      message: `"${v.naam}" verwijderen? Dit haalt de toewijzing ook bij iedereen weg.`,
      danger: true,
      bevestigLabel: "Verwijderen",
    });
    if (!ok) return;
    await fetch(`/api/verantwoordelijkheden?id=${v.id}`, { method: "DELETE" });
    laden();
    toast.success("Verantwoordelijkheid verwijderd");
  };

  const nieuweGebruiker = async () => {
    const discordUsername = prompt("Discord-gebruikersnaam (exact, zoals in Discord):");
    if (!discordUsername) return;
    const naam = prompt("Naam om te tonen (optioneel):", discordUsername);
    const res = await fetch("/api/gebruikers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordUsername, naam }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setUsers((prev) => [...prev, data.user].sort((a, b) => a.naam.localeCompare(b.naam)));
    toast.success(`${data.user.naam} toegevoegd`);
  };

  const verwijderGebruiker = async (u) => {
    const ok = await confirm({
      title: "Gebruiker verwijderen",
      message: `Weet je zeker dat je ${u.naam} wil verwijderen? Dit kan niet ongedaan gemaakt worden.`,
      danger: true,
      bevestigLabel: "Verwijderen",
    });
    if (!ok) return;
    const res = await fetch(`/api/gebruikers?id=${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    toast.success(`${u.naam} verwijderd`);
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Gebruikers &amp; rollen</h1>
        <button className="btn-primary" onClick={nieuweGebruiker}>
          + Gebruiker toevoegen
        </button>
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>
        Wijs hier per persoon het type, de groep, verantwoordelijkheden en platformrecht toe.
        Wijzigingen worden meteen opgeslagen.
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Verantwoordelijkheden</div>
          <button onClick={nieuweVerantwoordelijkheid} style={{ fontSize: 12 }}>+ Nieuwe verantwoordelijkheid</button>
        </div>
        {verantwoordelijkheden.length === 0 ? (
          <p className="muted" style={{ fontStyle: "italic", fontSize: 13 }}>Nog geen verantwoordelijkheden aangemaakt.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>Hoofdverantwoordelijke</th>
                  <th>Medeverantwoordelijken</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {verantwoordelijkheden.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.naam}</td>
                    <td>
                      <select value={v.hoofdverantwoordelijke?.id || ""} onChange={(e) => hoofdverantwoordelijkeInstellen(v.id, e.target.value)} style={{ fontSize: 12 }}>
                        <option value="">- niemand -</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.naam}</option>)}
                      </select>
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {v.medeverantwoordelijken.length > 0 ? v.medeverantwoordelijken.map((m) => m.naam).join(", ") : "-"}
                    </td>
                    <td><button className="btn-danger" onClick={() => verantwoordelijkheidVerwijderen(v)}>🗑️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="table-wrap" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Naam</th>
              <th>Type</th>
              <th>Groep</th>
              <th>Verantwoordelijkheden</th>
              <th>Platformrecht</th>
              <th>IBAN</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.naam}
                  <div className="subtle" style={{ fontSize: 11 }}>@{u.discord_username}</div>
                </td>
                <td>
                  <select value={u.type || ""} onChange={(e) => updateUser(u.id, { type: e.target.value })}>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={u.groep || ""} onChange={(e) => updateUser(u.id, { groep: e.target.value })}>
                    <option value="">-</option>
                    {GROEPEN.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <VerantwoordelijkhedenCel
                    user={u}
                    alle={verantwoordelijkheden}
                    open={openPicker === u.id}
                    onToggleOpen={(id) => setOpenPicker((prev) => (prev === id ? null : id))}
                    onToggle={toggleVerantwoordelijkheid}
                  />
                </td>
                <td>
                  <select value={u.platform_recht || "lid"} onChange={(e) => updateUser(u.id, { platform_recht: e.target.value })}>
                    {RECHTEN.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    defaultValue={u.iban || ""}
                    placeholder="BE.."
                    onBlur={(e) => { if (e.target.value !== (u.iban || "")) updateUser(u.id, { iban: e.target.value.trim() }); }}
                    style={{ width: 160, fontSize: 12 }}
                  />
                </td>
                <td>
                  <button className="btn-danger" onClick={() => verwijderGebruiker(u)} title="Verwijderen">
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
