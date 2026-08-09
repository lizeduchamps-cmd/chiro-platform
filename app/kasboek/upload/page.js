"use client";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const ONBEKEND = "Onduidelijk/Nog in te vullen";

// Patroonherkenning: transacties met hetzelfde bedrag binnen dezelfde maand
// krijgen automatisch dezelfde categorie als er al één bekend is in die groep.
function slimmePatroonherkenning(lijst) {
  const groepen = {};
  lijst.forEach((t) => {
    const maandKey = t.datum ? t.datum.slice(0, 7) : "onbekend";
    const key = `${maandKey}_${t.bedrag}`;
    (groepen[key] = groepen[key] || []).push(t);
  });
  let aantal = 0;
  Object.values(groepen).forEach((groep) => {
    const bekend = groep.find((t) => t.categorie !== ONBEKEND);
    if (bekend) {
      groep.forEach((t) => {
        if (t.categorie === ONBEKEND) {
          t.categorie = bekend.categorie;
          aantal++;
        }
      });
    }
  });
  return aantal;
}

function parseKbcCsv(text, regels) {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headerCols = lines[0].split(";").map((c) => c.replace(/"/g, "").trim());
  const idx = (naam, fallback) => { const i = headerCols.indexOf(naam); return i !== -1 ? i : fallback; };
  const dateIdx = idx("Datum", 5);
  const descIdx = idx("Omschrijving", 6);
  const amountIdx = idx("Bedrag", 8);
  const ibanIdx = idx("rekeningnummer tegenpartij", 12);
  const nameIdx = idx("Naam tegenpartij", 14);
  const memoIdx = idx("Vrije mededeling", 17);

  const categoriseer = (rawMemo, rawDesc, tegenpartij, bedrag) => {
    const tekst = `${rawMemo} ${rawDesc} ${tegenpartij}`.toLowerCase();
    if (bedrag > 0 && bedrag % 60 === 0 && (rawMemo.trim() || rawDesc.trim())) return "Lidgeld";
    for (const regel of regels) {
      if (tekst.includes(regel.bevat_tekst)) return regel.categorieen?.naam || ONBEKEND;
    }
    return ONBEKEND;
  };

  const resultaat = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map((c) => c.replace(/"/g, "").trim());
    if (cols.length <= Math.max(dateIdx, amountIdx)) continue;

    const rawDate = cols[dateIdx] || "";
    let datum = rawDate;
    if (rawDate.includes("/")) {
      const p = rawDate.split("/");
      if (p.length === 3) datum = `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
    }

    const bedrag = parseFloat((cols[amountIdx] || "").replace(/\./g, "").replace(",", "."));
    if (isNaN(bedrag)) continue;

    const tegenpartij = cols[nameIdx] || "KBC Transactie";
    const vrijeMededeling = cols[memoIdx] || "";
    const omschrijving = cols[descIdx] || "";

    resultaat.push({
      id: `${Date.now()}_${Math.random()}`,
      datum, tegenpartij, vrijeMededeling, omschrijving,
      iban: cols[ibanIdx] || "",
      bedrag,
      categorie: categoriseer(vrijeMededeling, omschrijving, tegenpartij, bedrag),
    });
  }
  return resultaat;
}

export default function CsvUpload() {
  const { data: session, status } = useSession();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [categorieen, setCategorieen] = useState([]);
  const [regels, setRegels] = useState([]);
  const [pending, setPending] = useState([]);
  const [geselecteerd, setGeselecteerd] = useState([]);
  const [bulkCat, setBulkCat] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [bezigMetOpslaan, setBezigMetOpslaan] = useState(false);
  const [toonRegels, setToonRegels] = useState(false);
  const [nieuweRegelTekst, setNieuweRegelTekst] = useState("");
  const [nieuweRegelCat, setNieuweRegelCat] = useState("");

  const ladenRegels = () => fetch("/api/categorisatie-regels").then((r) => r.json()).then((d) => setRegels(d.regels || []));

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
    });
    fetch("/api/categorieen").then((r) => r.json()).then((d) => setCategorieen(d.categorieen || []));
    ladenRegels();
  }, [status]);

  if (status === "loading") return <p style={{ padding: 32 }}>Laden…</p>;
  if (status === "unauthenticated") redirect("/inloggen");

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht);
  if (!magBewerken) {
    return <Layout session={session}><p style={{ padding: 32 }}>Je hebt geen toegang tot deze pagina.</p></Layout>;
  }

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const nieuw = parseKbcCsv(evt.target.result, regels);
      if (nieuw.length === 0) return alert("⚠️ Er konden geen transacties worden uitgelezen.");
      const aantalSlim = slimmePatroonherkenning(nieuw);
      setPending(nieuw);
      setGeselecteerd([]);
      let msg = `✅ ${nieuw.length} transacties uit '${file.name}' geladen!`;
      if (aantalSlim > 0) msg += `\n🔮 Waarvan ${aantalSlim} automatisch toegewezen via herkenning van herhaalde bedragen.`;
      alert(msg);
    };
    reader.readAsText(file, "ISO-8859-1");
    e.target.value = "";
  };

  const draaiPatroonherkenningOpnieuw = () => {
    const kopie = [...pending];
    const aantal = slimmePatroonherkenning(kopie);
    setPending(kopie);
    alert(aantal > 0 ? `🔮 ${aantal} extra transacties toegewezen!` : "ℹ️ Geen nieuwe patronen gevonden.");
  };

  const updateCat = (id, cat) => setPending((prev) => prev.map((t) => (t.id === id ? { ...t, categorie: cat } : t)));
  const verwijder = (id) => { setPending((prev) => prev.filter((t) => t.id !== id)); setGeselecteerd((prev) => prev.filter((x) => x !== id)); };
  const toggleSelect = (id) => setGeselecteerd((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleSelectAll = (ids, checked) =>
    setGeselecteerd((prev) => (checked ? Array.from(new Set([...prev, ...ids])) : prev.filter((x) => !ids.includes(x))));
  const bulkToepassen = () => {
    if (!bulkCat) return;
    setPending((prev) => prev.map((t) => (geselecteerd.includes(t.id) ? { ...t, categorie: bulkCat } : t)));
    setGeselecteerd([]);
  };

  const bevestigen = async () => {
    if (pending.length === 0) return;
    setBezigMetOpslaan(true);
    const res = await fetch("/api/transacties/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, transacties: pending }),
    });
    const data = await res.json();
    setBezigMetOpslaan(false);
    if (data.error) return alert("⚠️ " + data.error);
    alert(`✅ ${data.aantal} transacties toegevoegd aan het kasboek!`);
    setPending([]);
    setGeselecteerd([]);
  };

  const nieuweRegelOpslaan = async () => {
    if (!nieuweRegelTekst || !nieuweRegelCat) return alert("Vul zowel een tekst als een categorie in.");
    const res = await fetch("/api/categorisatie-regels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bevatTekst: nieuweRegelTekst, categorieId: nieuweRegelCat }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setRegels((prev) => [...prev, data.regel]);
    setNieuweRegelTekst("");
    setNieuweRegelCat("");
  };

  const regelVerwijderen = async (id) => {
    await fetch(`/api/categorisatie-regels?id=${id}`, { method: "DELETE" });
    setRegels((prev) => prev.filter((r) => r.id !== id));
  };

  const gefilterd = filterCat ? pending.filter((t) => t.categorie === filterCat) : pending;
  const categorieNamen = Array.from(new Set([...categorieen.map((c) => c.naam), ONBEKEND]));

  const BevestigKnop = () => (
    <button
      onClick={bevestigen}
      disabled={bezigMetOpslaan}
      style={{ background: "#2F4A3C", color: "white", padding: "10px 20px", borderRadius: 8, border: "none", fontWeight: 600 }}
    >
      {bezigMetOpslaan ? "Bezig met opslaan…" : `✅ ${pending.length} transacties definitief toevoegen aan kasboek`}
    </button>
  );

  return (
    <Layout session={session}>
      <div style={{ padding: 32, maxWidth: 1100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: "#1E2A22", marginBottom: 4 }}>KBC CSV Upload</h1>
            <p style={{ color: "#6B6B5F", fontSize: 14 }}>
              Upload je KBC Touch-export (.csv). Transacties worden automatisch gecategoriseerd; controleer en pas aan waar nodig.
            </p>
          </div>
          <button onClick={() => setToonRegels(!toonRegels)} style={{ padding: "8px 12px", fontSize: 12 }}>
            ⚙️ Categorisatieregels {toonRegels ? "verbergen" : "beheren"}
          </button>
        </div>

        {toonRegels && (
          <div style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, padding: 16, marginTop: 12, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Categorisatieregels</div>
            <p style={{ fontSize: 12, color: "#6B6B5F", marginBottom: 12 }}>
              Als de mededeling, omschrijving of naam van de tegenpartij deze tekst bevat, wordt automatisch deze categorie toegewezen.
            </p>
            <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12 }}>
              {regels.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #F0EEE5" }}>
                  <span><strong>"{r.bevat_tekst}"</strong> → {r.categorieen?.naam}</span>
                  <button onClick={() => regelVerwijderen(r.id)} style={{ color: "#B24C4C", background: "none", border: "none", cursor: "pointer" }}>🗑️</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder='Tekst, bv. "fin"' value={nieuweRegelTekst} onChange={(e) => setNieuweRegelTekst(e.target.value)} style={{ flex: 1, padding: 6 }} />
              <select value={nieuweRegelCat} onChange={(e) => setNieuweRegelCat(e.target.value)} style={{ padding: 6 }}>
                <option value="">Categorie...</option>
                {categorieen.map((c) => <option key={c.id} value={c.id}>{c.naam}</option>)}
              </select>
              <button onClick={nieuweRegelOpslaan} style={{ padding: "6px 12px" }}>+ Toevoegen</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "20px 0", flexWrap: "wrap" }}>
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ padding: 8 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
          <label style={{ background: "#2F4A3C", color: "white", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
            📄 CSV-bestand kiezen
            <input type="file" accept=".csv" onChange={onFile} style={{ display: "none" }} />
          </label>
          {pending.length > 0 && (
            <>
              <button onClick={draaiPatroonherkenningOpnieuw} style={{ padding: "8px 12px" }}>🔮 Patroonherkenning opnieuw</button>
              <div style={{ flex: 1 }} />
              <BevestigKnop />
            </>
          )}
        </div>

        {pending.length === 0 ? (
          <p style={{ color: "#9A9A8C", fontStyle: "italic" }}>Nog geen bestand geladen.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#6B6B5F" }}>{pending.length} transacties klaar om te bevestigen</span>
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ padding: 6, fontSize: 12 }}>
                <option value="">Alle categorieën</option>
                {categorieNamen.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {geselecteerd.length > 0 && (
                <>
                  <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} style={{ padding: 6, fontSize: 12 }}>
                    <option value="">Categorie voor selectie...</option>
                    {categorieNamen.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={bulkToepassen} style={{ padding: "6px 10px", fontSize: 12 }}>Toepassen op {geselecteerd.length} geselecteerd</button>
                </>
              )}
            </div>

            <div style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F5F3EE", textAlign: "left" }}>
                    <th style={{ padding: 8 }}>
                      <input type="checkbox" onChange={(e) => toggleSelectAll(gefilterd.map((t) => t.id), e.target.checked)} />
                    </th>
                    <th style={{ padding: 8 }}>Datum</th>
                    <th style={{ padding: 8 }}>Tegenpartij</th>
                    <th style={{ padding: 8 }}>Mededeling</th>
                    <th style={{ padding: 8 }}>Categorie</th>
                    <th style={{ padding: 8, textAlign: "right" }}>Bedrag</th>
                    <th style={{ padding: 8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {gefilterd.map((t) => (
                    <tr key={t.id} style={{ borderTop: "1px solid #F0EEE5" }}>
                      <td style={{ padding: 8 }}>
                        <input type="checkbox" checked={geselecteerd.includes(t.id)} onChange={() => toggleSelect(t.id)} />
                      </td>
                      <td style={{ padding: 8, whiteSpace: "nowrap" }}>{t.datum}</td>
                      <td style={{ padding: 8, fontWeight: 600 }}>{t.tegenpartij}</td>
                      <td style={{ padding: 8, color: "#6B6B5F", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.vrijeMededeling || t.omschrijving || <span style={{ fontStyle: "italic", color: "#B5B5A7" }}>Geen mededeling</span>}
                      </td>
                      <td style={{ padding: 8 }}>
                        <select
                          value={t.categorie}
                          onChange={(e) => updateCat(t.id, e.target.value)}
                          style={{ fontSize: 12, color: t.categorie === ONBEKEND ? "#B24C4C" : "#1E2A22", fontWeight: t.categorie === ONBEKEND ? 700 : 400 }}
                        >
                          {categorieNamen.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: 8, textAlign: "right", fontWeight: 700, color: t.bedrag < 0 ? "#B24C4C" : "#2F4A3C" }}>{euro(t.bedrag)}</td>
                      <td style={{ padding: 8 }}>
                        <button onClick={() => verwijder(t.id)}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <BevestigKnop />
          </>
        )}
      </div>
    </Layout>
  );
}
