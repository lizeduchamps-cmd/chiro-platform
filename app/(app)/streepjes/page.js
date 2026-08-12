"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonTable } from "@/components/Skeleton";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

function maandLabel(maand) {
  const namen = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const [j, m] = maand.split("-");
  return `${namen[parseInt(m, 10) - 1]} ${j}`;
}

// Robuuste CSV-parser die rekening houdt met aanhalingstekens (bv. "0,25")
function parseCSVLine(line, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === delimiter) { result.push(current); current = ""; }
      else current += char;
    }
  }
  result.push(current);
  return result.map((c) => c.trim());
}

export default function Streepjes() {
  const { data: session } = useSession();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [prijsPerStreepje, setPrijsPerStreepje] = useState(0.25);
  const [loading, setLoading] = useState(true);
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [fvMaanden, setFvMaanden] = useState([]);
  const [fvMaandId, setFvMaandId] = useState(null);
  const [bezig, setBezig] = useState(false);
  const [toonInstellingen, setToonInstellingen] = useState(false);
  const [bewerkId, setBewerkId] = useState(null);

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  const laden = () => {
    fetch("/api/streepjes").then((r) => r.json()).then((d) => {
      setUsers(d.users || []);
      setPrijsPerStreepje(d.prijsPerStreepje ?? 0.25);
      setLoading(false);
    });
  };

  useEffect(() => {
    laden();
  }, []);

  useEffect(() => {
    if (!magBewerken) return;
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.error) return toast.error("Kon werkjaren niet ophalen: " + d.error);
      setWerkjaren(d.werkjaren || []);
      if (d.werkjaren?.length) setWerkjaarId(d.werkjaren[0].id);
    });
  }, [magBewerken]);

  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/fv/maanden?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((m) => {
      if (m.error) return toast.error("Kon FV-maanden niet ophalen: " + m.error);
      setFvMaanden(m.fvMaanden || []);
      setFvMaandId(m.fvMaanden?.[0]?.id || null);
    });
  }, [werkjaarId]);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 1000 }}>
        <SkeletonTable rows={6} cols={5} />
      </div>
    );
  }

  const updateFysiek = async (userId, waarde) => {
    const heel = Math.max(0, Math.round(Number(waarde)) || 0);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, fysieke_streepjes: heel } : u)));
    await fetch("/api/streepjes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, fysiekeStreepjes: heel }),
    });
  };

  const updatePrijs = async (waarde) => {
    setPrijsPerStreepje(waarde);
    await fetch("/api/streepjes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prijsPerStreepje: parseFloat(waarde) || 0 }),
    });
  };

  const toevoegenAanFv = async (userIds) => {
    if (!fvMaandId) return toast.error("Kies eerst een FV-maand.");
    setBezig(true);
    const res = await fetch("/api/fv/streepjes-toevoegen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId, userIds }),
    });
    const data = await res.json();
    setBezig(false);
    if (data.error) return toast.error(data.error);
    toast.success(`${data.aantal} streepjes-regel(s) toegevoegd aan het FV, tellers staan terug op 0`);
    setBewerkId(null);
    laden();
  };

  const onCsv = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result.replace(/^\uFEFF/, "");
      const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim());
      if (lines.length < 2) return toast.error("Leeg bestand.");

      const headerLine = lines[0];
      const delimiter = headerLine.split(";").length > headerLine.split(",").length ? ";" : ",";
      const headerCols = parseCSVLine(headerLine, delimiter).map((h) => h.toLowerCase());
      let userColIdx = headerCols.findIndex((h) => h.includes("gebruiker") || h.includes("discord"));
      let priceColIdx = headerCols.findIndex((h) => h.includes("prijs") || h.includes("bedrag"));
      if (userColIdx === -1) userColIdx = 1;
      if (priceColIdx === -1) priceColIdx = 3;

      const aggregaten = {};
      lines.slice(1).forEach((line) => {
        const cols = parseCSVLine(line, delimiter);
        if (cols.length <= Math.max(userColIdx, priceColIdx)) return;
        let naam = (cols[userColIdx] || "").toLowerCase();
        if (naam.startsWith("@")) naam = naam.slice(1);
        const prijs = parseFloat((cols[priceColIdx] || "").replace("€", "").replace(",", "."));
        if (naam && !isNaN(prijs)) aggregaten[naam] = (aggregaten[naam] || 0) + prijs;
      });

      const res = await fetch("/api/streepjes/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aggregaten }),
      });
      const data = await res.json();
      if (data.error) return toast.error(data.error);

      let msg = `Online logboek verwerkt! ${data.matchCount} gebruikers gematcht.`;
      if (data.nietGematcht?.length) msg += ` Geen match voor: ${data.nietGematcht.join(", ")}.`;
      toast.success(msg);
      laden();
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const totaalFysiekBedrag = users.reduce((s, u) => s + (Number(u.fysieke_streepjes) || 0) * prijsPerStreepje, 0);
  const totaalOnline = users.reduce((s, u) => s + (Number(u.online_streepjes_bedrag) || 0), 0);
  const totaal = totaalFysiekBedrag + totaalOnline;
  const gebruikersMetSaldo = users.filter((u) => (Number(u.fysieke_streepjes) || 0) * prijsPerStreepje + (Number(u.online_streepjes_bedrag) || 0) > 0);
  const eigen = users.find((u) => u.id === session?.user?.userId);
  const eigenBedrag = eigen ? (Number(eigen.fysieke_streepjes) || 0) * prijsPerStreepje + (Number(eigen.online_streepjes_bedrag) || 0) : 0;

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <h1 style={{ fontSize: 30, fontWeight: 800 }}>Streepjes &amp; online drank</h1>
      <p className="muted" style={{ fontSize: 15, marginTop: 6, marginBottom: 20 }}>
        Streepjes op papier vul je hier in, online streepjes komen uit het logboek van de Discord-bot.
      </p>

      {eigen && (
        <div className={`card card-lg ${eigenBedrag > 0 ? "card-danger" : ""}`} style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="muted" style={{ fontSize: 14 }}>Jouw streepjes</div>
          <div className="money" style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", color: eigenBedrag > 0 ? "var(--danger-deep)" : undefined }}>{euro(eigenBedrag)}</div>
          <div className="muted" style={{ fontSize: 14 }}>{eigen.fysieke_streepjes || 0} op papier · {euro(Number(eigen.online_streepjes_bedrag) || 0)} online. Dit komt op je volgende Financieel Verslag.</div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
        <div>
          <div className="muted" style={{ fontSize: 14 }}>Alle leiding samen</div>
          <div className="money" style={{ fontSize: 26, fontWeight: 700 }}>{euro(totaal)}</div>
        </div>
        <div className="muted" style={{ fontSize: 13, textAlign: "right" }}>
          {gebruikersMetSaldo.length} van {users.length} hebben streepjes staan<br />
          {euro(totaalFysiekBedrag)} papier, {euro(totaalOnline)} online
        </div>
      </div>

      {magBewerken && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>Toevoegen aan Financieel Verslag</div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Kies de FV-maand en voeg de huidige streepjes-stand van iedereen (of van één persoon) daaraan toe. De tellers gaan daarna terug op 0.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {werkjaren.length > 1 && (
              <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)}>
                {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
              </select>
            )}
            <select value={fvMaandId || ""} onChange={(e) => setFvMaandId(e.target.value)}>
              {fvMaanden.length === 0 && <option value="">Nog geen FV-maand aangemaakt</option>}
              {fvMaanden.map((m) => <option key={m.id} value={m.id}>{maandLabel(m.maand)}</option>)}
            </select>
            <button
              className="btn-primary"
              disabled={bezig || !fvMaandId || gebruikersMetSaldo.length === 0}
              onClick={() => toevoegenAanFv(gebruikersMetSaldo.map((u) => u.id))}
            >
              Voeg iedereen met streepjes toe ({gebruikersMetSaldo.length})
            </button>
          </div>
        </div>
      )}

      <div className="eyebrow" style={{ marginBottom: 10 }}>Per persoon</div>
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        {users.map((u, i) => {
          const fysiekBedrag = (Number(u.fysieke_streepjes) || 0) * prijsPerStreepje;
          const online = Number(u.online_streepjes_bedrag) || 0;
          const totaalP = fysiekBedrag + online;
          const open = bewerkId === u.id;
          return (
            <div key={u.id} style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{u.naam}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{u.fysieke_streepjes || 0} op papier · {euro(online)} online</div>
                </div>
                <div className="money" style={{ fontWeight: 700, fontSize: 16, width: 90, textAlign: "right", color: totaalP > 0 ? "var(--danger-deep)" : "var(--text-subtle)" }}>{euro(totaalP)}</div>
                {magBewerken && (
                  <button className="btn-plain link" style={{ fontSize: 14 }} onClick={() => setBewerkId(open ? null : u.id)}>{open ? "Klaar" : "Wijzig"}</button>
                )}
              </div>
              {open && magBewerken && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 18px 16px", flexWrap: "wrap" }}>
                  <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Streepjes op papier</span>
                  <input type="number" step="1" min="0" value={u.fysieke_streepjes || 0} onChange={(e) => updateFysiek(u.id, e.target.value)} style={{ width: 84 }} />
                  {totaalP > 0 && (
                    <button disabled={bezig || !fvMaandId} onClick={() => toevoegenAanFv([u.id])}>Alleen deze doorzetten</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {magBewerken && (
        toonInstellingen ? (
          <div className="card">
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Prijs per streepje: €
                <input type="number" step="0.01" value={prijsPerStreepje} onChange={(e) => updatePrijs(e.target.value)} style={{ width: 70, marginLeft: 6 }} />
              </label>
              <label className="btn-primary" style={{ cursor: "pointer" }}>
                Online streepjes CSV uploaden
                <input type="file" accept=".csv" onChange={onCsv} style={{ display: "none" }} />
              </label>
              <button onClick={() => setToonInstellingen(false)}>Sluiten</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setToonInstellingen(true)}>Prijs en online logboek</button>
        )
      )}
    </div>
  );
}
