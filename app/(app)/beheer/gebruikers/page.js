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
const RECHT_BADGE = { admin: "badge-primary", financieel_verantwoordelijke: "badge-primary", lid: "badge-neutral" };
const RECHT_KORT = { admin: "Admin", financieel_verantwoordelijke: "Financiën", lid: "Lid" };

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
  const [bewerkId, setBewerkId] = useState(null);
  const [toonVerantwoordelijkheden, setToonVerantwoordelijkheden] = useState(false);
  const [toonNieuwePersoon, setToonNieuwePersoon] = useState(false);
  const [nieuwePersoon, setNieuwePersoon] = useState({ soort: "gebruiker", discordUsername: "", naam: "" });

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
    const { soort, discordUsername, naam } = nieuwePersoon;
    if (soort === "gebruiker" && !discordUsername.trim()) return toast.error("Vul de Discord-gebruikersnaam in.");
    if (soort === "naam" && !naam.trim()) return toast.error("Vul een naam in.");
    const res = await fetch("/api/gebruikers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordUsername: soort === "gebruiker" ? discordUsername.trim() : "", naam: naam.trim() }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setUsers((prev) => [...prev, data.user].sort((a, b) => a.naam.localeCompare(b.naam)));
    setNieuwePersoon({ soort: "gebruiker", discordUsername: "", naam: "" });
    setToonNieuwePersoon(false);
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

  const zonderIban = users.filter((u) => !u.iban);

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800 }}>Gebruikers &amp; rollen</h1>
        <button className="btn-primary" onClick={() => setToonNieuwePersoon(!toonNieuwePersoon)}>{toonNieuwePersoon ? "Annuleren" : "+ Persoon toevoegen"}</button>
      </div>
      <p className="muted" style={{ fontSize: 15, marginBottom: 20 }}>
        Type, afdeling, verantwoordelijkheden en rechten per persoon. Alles wat je wijzigt, is meteen opgeslagen.
      </p>

      {toonNieuwePersoon && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>Nieuwe persoon</div>
          <div style={{ display: "flex", gap: 20, marginBottom: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <input type="radio" checked={nieuwePersoon.soort === "gebruiker"} onChange={() => setNieuwePersoon({ ...nieuwePersoon, soort: "gebruiker" })} />
              Gebruiker — kan inloggen via Discord
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <input type="radio" checked={nieuwePersoon.soort === "naam"} onChange={() => setNieuwePersoon({ ...nieuwePersoon, soort: "naam" })} />
              Naam — geen login, enkel om te kiezen bij FV/streepjes
            </label>
          </div>
          <div className="grid-2" style={{ marginBottom: 10 }}>
            {nieuwePersoon.soort === "gebruiker" && (
              <input
                placeholder="Discord-gebruikersnaam (exact, zoals in Discord)"
                value={nieuwePersoon.discordUsername}
                onChange={(e) => setNieuwePersoon({ ...nieuwePersoon, discordUsername: e.target.value })}
              />
            )}
            <input
              placeholder="Naam om te tonen"
              value={nieuwePersoon.naam}
              onChange={(e) => setNieuwePersoon({ ...nieuwePersoon, naam: e.target.value })}
              style={nieuwePersoon.soort === "naam" ? { gridColumn: "span 2" } : undefined}
            />
          </div>
          <button className="btn-primary" onClick={nieuweGebruiker}>Toevoegen</button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="muted" style={{ fontSize: 14 }}>Leiding op het platform</div>
          <div className="money" style={{ fontSize: 26, fontWeight: 700 }}>{users.length}</div>
        </div>
        {zonderIban.length > 0 && (
          <div className="muted" style={{ fontSize: 13, textAlign: "right" }}>{zonderIban.length} zonder IBAN: {zonderIban.map((u) => u.naam).join(", ")}</div>
        )}
      </div>

      <div className="eyebrow" style={{ marginBottom: 10 }}>Iedereen</div>
      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        {users.map((u, i) => {
          const open = bewerkId === u.id;
          return (
            <div key={u.id} style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{u.naam}</div>
                  <div className="subtle" style={{ fontSize: 13 }}>{u.discord_username ? `@${u.discord_username}` : "Naam (geen login)"} · {u.type || "-"}{u.groep ? ` · ${u.groep}` : ""}</div>
                </div>
                <span className={`badge ${RECHT_BADGE[u.platform_recht] || "badge-neutral"}`}>{RECHT_KORT[u.platform_recht] || "Lid"}</span>
                <button className="btn-plain link" style={{ fontSize: 14 }} onClick={() => setBewerkId(open ? null : u.id)}>{open ? "Klaar" : "Wijzig"}</button>
              </div>

              <VerantwoordelijkhedenCel
                user={u}
                alle={verantwoordelijkheden}
                open={openPicker === u.id}
                onToggleOpen={(id) => setOpenPicker((prev) => (prev === id ? null : id))}
                onToggle={toggleVerantwoordelijkheid}
              />

              {open && (
                <div className="grid-3" style={{ paddingTop: 4 }}>
                  <select value={u.type || ""} onChange={(e) => updateUser(u.id, { type: e.target.value })}>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={u.groep || ""} onChange={(e) => updateUser(u.id, { groep: e.target.value })}>
                    <option value="">Groep...</option>
                    {GROEPEN.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select value={u.platform_recht || "lid"} onChange={(e) => updateUser(u.id, { platform_recht: e.target.value })}>
                    {RECHTEN.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <input
                    defaultValue={u.iban || ""}
                    placeholder="IBAN, bv. BE68 ..."
                    onBlur={(e) => { if (e.target.value !== (u.iban || "")) updateUser(u.id, { iban: e.target.value.trim() }); }}
                    style={{ gridColumn: "span 2" }}
                  />
                  <button className="btn-danger-solid" onClick={() => verwijderGebruiker(u)}>Verwijderen</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toonVerantwoordelijkheden ? (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Verantwoordelijkheden</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={nieuweVerantwoordelijkheid}>+ Nieuwe</button>
              <button onClick={() => setToonVerantwoordelijkheden(false)}>Sluiten</button>
            </div>
          </div>
          {verantwoordelijkheden.length === 0 ? (
            <p className="muted" style={{ fontStyle: "italic", fontSize: 13 }}>Nog geen verantwoordelijkheden aangemaakt.</p>
          ) : (
            verantwoordelijkheden.map((v, i) => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{v.naam}</div>
                <select value={v.hoofdverantwoordelijke?.id || ""} onChange={(e) => hoofdverantwoordelijkeInstellen(v.id, e.target.value)}>
                  <option value="">- niemand -</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.naam}</option>)}
                </select>
                <span className="muted" style={{ fontSize: 12, minWidth: 120 }}>{v.medeverantwoordelijken.length > 0 ? v.medeverantwoordelijken.map((m) => m.naam).join(", ") : "geen mede"}</span>
                <button className="btn-danger" onClick={() => verantwoordelijkheidVerwijderen(v)}>🗑️</button>
              </div>
            ))
          )}
        </div>
      ) : (
        <button onClick={() => setToonVerantwoordelijkheden(true)}>Verantwoordelijkheden beheren</button>
      )}
    </div>
  );
}
