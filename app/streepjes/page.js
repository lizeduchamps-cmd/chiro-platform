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
  const { data: session, status } = useSession();
  const [users, setUsers] = useState([]);
  const [prijsPerStreepje, setPrijsPerStreepje] = useState(0.25);
  const [loading, setLoading] = useState(true);
  const [fvMaanden, setFvMaanden] = useState([]);
  const [fvMaandId, setFvMaandId] = useState(null);
  const [bezig, setBezig] = useState(false);

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  const laden = () => {
    fetch("/api/streepjes").then((r) => r.json()).then((d) => {
      setUsers(d.users || []);
      setPrijsPerStreepje(d.prijsPerStreepje ?? 0.25);
      setLoading(false);
    });
  };

  useEffect(() => {
    if (status === "loading") return;
    if (status === "authenticated") laden();
    else setLoading(false);
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || !magBewerken) return;
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      const werkjaarId = d.werkjaren?.[0]?.id;
      if (!werkjaarId) return;
      fetch(`/api/fv/maanden?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((m) => {
        setFvMaanden(m.fvMaanden || []);
        setFvMaandId(m.fvMaanden?.[0]?.id || null);
      });
    });
  }, [status, magBewerken]);

  if (status === "loading" || loading) return <p style={{ padding: 32 }}>Laden…</p>;
  if (status === "unauthenticated") redirect("/inloggen");

  const updateFysiek = async (userId, waarde) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, fysieke_streepjes: waarde } : u)));
    await fetch("/api/streepjes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, fysiekeStreepjes: parseFloat(waarde) || 0 }),
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
    if (!fvMaandId) return alert("Kies eerst een FV-maand.");
    setBezig(true);
    const res = await fetch("/api/fv/streepjes-toevoegen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId, userIds }),
    });
    const data = await res.json();
    setBezig(false);
    if (data.error) return alert("⚠️ " + data.error);
    alert(`✅ ${data.aantal} streepjes-regel(s) toegevoegd aan het FV. Tellers zijn terug op 0 gezet.`);
    laden();
  };

  const onCsv = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result.replace(/^\uFEFF/, "");
      const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim());
      if (lines.length < 2) return alert("⚠️ Leeg bestand.");

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
      if (data.error) return alert("⚠️ " + data.error);

      let msg = `✅ Online logboek verwerkt! ${data.matchCount} gebruikers gematcht.`;
      if (data.nietGematcht?.length) msg += `\n\n⚠️ Geen match voor: ${data.nietGematcht.join(", ")}`;
      alert(msg);
      laden();
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const totaalFysiekBedrag = users.reduce((s, u) => s + (Number(u.fysieke_streepjes) || 0) * prijsPerStreepje, 0);
  const totaalOnline = users.reduce((s, u) => s + (Number(u.online_streepjes_bedrag) || 0), 0);
  const gebruikersMetSaldo = users.filter((u) => (Number(u.fysieke_streepjes) || 0) * prijsPerStreepje + (Number(u.online_streepjes_bedrag) || 0) > 0);

  return (
    <Layout session={session}>
      <div style={{ padding: 32, maxWidth: 1000 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Streepjes &amp; online drank</h1>
        <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
          Fysieke streepjes (op papier bijgehouden) vul je hier handmatig in. Online streepjes (via de Discord-bot) upload je als CSV.
        </p>

        {magBewerken && (
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13 }}>
              Prijs per streepje: €
              <input type="number" step="0.01" value={prijsPerStreepje} onChange={(e) => updatePrijs(e.target.value)} style={{ width: 70, marginLeft: 6 }} />
            </label>
            <label className="btn-primary" style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, display: "inline-block" }}>
              📄 Online streepjes CSV uploaden
              <input type="file" accept=".csv" onChange={onCsv} style={{ display: "none" }} />
            </label>
          </div>
        )}

        {magBewerken && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Toevoegen aan Financieel Verslag</div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Kies de FV-maand en voeg de huidige streepjes-stand van iedereen (of van één persoon) daaraan toe. De tellers gaan daarna terug op 0.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Naam</th>
                <th>Fysieke streepjes</th>
                <th style={{ textAlign: "right" }}>Bedrag fysiek</th>
                <th style={{ textAlign: "right" }}>Bedrag online</th>
                <th style={{ textAlign: "right" }}>Totaal</th>
                {magBewerken && <th></th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const fysiekBedrag = (Number(u.fysieke_streepjes) || 0) * prijsPerStreepje;
                const online = Number(u.online_streepjes_bedrag) || 0;
                const totaal = fysiekBedrag + online;
                return (
                  <tr key={u.id}>
                    <td>
                      {u.naam}
                      <div className="subtle" style={{ fontSize: 11 }}>@{u.discord_username}</div>
                    </td>
                    <td>
                      {magBewerken ? (
                        <input
                          type="number"
                          step="0.25"
                          value={u.fysieke_streepjes || 0}
                          onChange={(e) => updateFysiek(u.id, e.target.value)}
                          style={{ width: 70 }}
                        />
                      ) : (
                        u.fysieke_streepjes || 0
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>{euro(fysiekBedrag)}</td>
                    <td style={{ textAlign: "right" }}>{euro(online)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(totaal)}</td>
                    {magBewerken && (
                      <td style={{ textAlign: "right" }}>
                        {totaal > 0 && (
                          <button disabled={bezig || !fvMaandId} onClick={() => toevoegenAanFv([u.id])} style={{ fontSize: 11, padding: "4px 8px" }}>
                            + FV
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={2}>Totaal</td>
                <td style={{ textAlign: "right" }}>{euro(totaalFysiekBedrag)}</td>
                <td style={{ textAlign: "right" }}>{euro(totaalOnline)}</td>
                <td style={{ textAlign: "right" }}>{euro(totaalFysiekBedrag + totaalOnline)}</td>
                {magBewerken && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Layout>
  );
}
