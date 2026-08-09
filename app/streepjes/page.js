"use client";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
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

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  const laden = () => {
    fetch("/api/streepjes").then((r) => r.json()).then((d) => {
      setUsers(d.users || []);
      setPrijsPerStreepje(d.prijsPerStreepje ?? 0.25);
      setLoading(false);
    });
  };

  useEffect(() => {
    if (status === "authenticated") laden();
  }, [status]);

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

  return (
    <Layout session={session}>
      <div style={{ padding: 32, maxWidth: 1000 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "#1E2A22", marginBottom: 4 }}>Streepjes &amp; online drank</h1>
        <p style={{ color: "#6B6B5F", fontSize: 14, marginBottom: 20 }}>
          Fysieke streepjes (op papier bijgehouden) vul je hier handmatig in. Online streepjes (via de Discord-bot) upload je als CSV.
        </p>

        {magBewerken && (
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13 }}>
              Prijs per streepje: €
              <input type="number" step="0.01" value={prijsPerStreepje} onChange={(e) => updatePrijs(e.target.value)} style={{ width: 70, marginLeft: 6, padding: 4 }} />
            </label>
            <label style={{ background: "#2F4A3C", color: "white", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
              📄 Online streepjes CSV uploaden
              <input type="file" accept=".csv" onChange={onCsv} style={{ display: "none" }} />
            </label>
          </div>
        )}

        <div style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F5F3EE", textAlign: "left" }}>
                <th style={{ padding: 10 }}>Naam</th>
                <th style={{ padding: 10 }}>Fysieke streepjes</th>
                <th style={{ padding: 10, textAlign: "right" }}>Bedrag fysiek</th>
                <th style={{ padding: 10, textAlign: "right" }}>Bedrag online</th>
                <th style={{ padding: 10, textAlign: "right" }}>Totaal</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const fysiekBedrag = (Number(u.fysieke_streepjes) || 0) * prijsPerStreepje;
                const online = Number(u.online_streepjes_bedrag) || 0;
                return (
                  <tr key={u.id} style={{ borderTop: "1px solid #F0EEE5" }}>
                    <td style={{ padding: 10 }}>
                      {u.naam}
                      <div style={{ fontSize: 11, color: "#9A9A8C" }}>@{u.discord_username}</div>
                    </td>
                    <td style={{ padding: 10 }}>
                      {magBewerken ? (
                        <input
                          type="number"
                          step="0.25"
                          value={u.fysieke_streepjes || 0}
                          onChange={(e) => updateFysiek(u.id, e.target.value)}
                          style={{ width: 70, padding: 4 }}
                        />
                      ) : (
                        u.fysieke_streepjes || 0
                      )}
                    </td>
                    <td style={{ padding: 10, textAlign: "right" }}>{euro(fysiekBedrag)}</td>
                    <td style={{ padding: 10, textAlign: "right" }}>{euro(online)}</td>
                    <td style={{ padding: 10, textAlign: "right", fontWeight: 700, color: "#2F4A3C" }}>{euro(fysiekBedrag + online)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #E4E0D4", fontWeight: 700 }}>
                <td style={{ padding: 10 }} colSpan={2}>Totaal</td>
                <td style={{ padding: 10, textAlign: "right" }}>{euro(totaalFysiekBedrag)}</td>
                <td style={{ padding: 10, textAlign: "right" }}>{euro(totaalOnline)}</td>
                <td style={{ padding: 10, textAlign: "right" }}>{euro(totaalFysiekBedrag + totaalOnline)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Layout>
  );
}
