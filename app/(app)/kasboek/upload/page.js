"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/NotifyProvider";

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
  const { data: session } = useSession();
  const toast = useToast();
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
  const [bestandsnaam, setBestandsnaam] = useState("");
  const [toonHistoriek, setToonHistoriek] = useState(false);
  const [historiek, setHistoriek] = useState([]);

  const ladenRegels = () => fetch("/api/categorisatie-regels").then((r) => r.json()).then((d) => setRegels(d.regels || []));
  const ladenHistoriek = () => {
    if (!werkjaarId) return;
    fetch(`/api/csv-imports?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => setHistoriek(d.imports || []));
  };

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
    });
    fetch("/api/categorieen").then((r) => r.json()).then((d) => setCategorieen(d.categorieen || []));
    ladenRegels();
  }, []);

  useEffect(() => { ladenHistoriek(); }, [werkjaarId]);

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);
  if (!magBewerken) {
    return <p style={{ padding: 32 }}>Je hebt geen toegang tot deze pagina.</p>;
  }

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const nieuw = parseKbcCsv(evt.target.result, regels);
      if (nieuw.length === 0) return toast.error("Er konden geen transacties worden uitgelezen.");
      const aantalSlim = slimmePatroonherkenning(nieuw);
      setPending(nieuw);
      setGeselecteerd([]);
      setBestandsnaam(file.name);
      let msg = `${nieuw.length} transacties uit '${file.name}' geladen!`;
      if (aantalSlim > 0) msg += ` Waarvan ${aantalSlim} automatisch toegewezen via herkenning van herhaalde bedragen.`;
      toast.success(msg);
    };
    reader.readAsText(file, "ISO-8859-1");
    e.target.value = "";
  };

  const draaiPatroonherkenningOpnieuw = () => {
    const kopie = [...pending];
    const aantal = slimmePatroonherkenning(kopie);
    setPending(kopie);
    if (aantal > 0) toast.success(`${aantal} extra transacties toegewezen!`);
    else toast.info("Geen nieuwe patronen gevonden.");
  };

  const updateCat = (id, cat) => setPending((prev) => prev.map((t) => (t.id === id ? { ...t, categorie: cat } : t)));
  const verwijder = (t) => {
    setPending((prev) => prev.filter((x) => x.id !== t.id));
    setGeselecteerd((prev) => prev.filter((x) => x !== t.id));
    toast.undoable({ message: "Rij verwijderd uit de lijst", onUndo: () => setPending((prev) => [...prev, t]) });
  };
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
      body: JSON.stringify({ werkjaarId, transacties: pending, bestandsnaam }),
    });
    const data = await res.json();
    setBezigMetOpslaan(false);
    if (data.error) return toast.error(data.error);
    let msg = `${data.aantal} transacties toegevoegd aan het kasboek!`;
    if (data.aantalDuplicaten > 0) msg += ` ${data.aantalDuplicaten} overgeslagen als duplicaat.`;
    toast.success(msg);
    setPending([]);
    setGeselecteerd([]);
    setBestandsnaam("");
    ladenHistoriek();
  };

  const nieuweRegelOpslaan = async () => {
    if (!nieuweRegelTekst || !nieuweRegelCat) return toast.error("Vul zowel een tekst als een categorie in.");
    const res = await fetch("/api/categorisatie-regels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bevatTekst: nieuweRegelTekst, categorieId: nieuweRegelCat }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setRegels((prev) => [...prev, data.regel]);
    setNieuweRegelTekst("");
    setNieuweRegelCat("");
    toast.success("Regel toegevoegd");
  };

  const regelVerwijderen = (r) => {
    setRegels((prev) => prev.filter((x) => x.id !== r.id));
    toast.undoable({
      message: "Categorisatieregel verwijderd",
      onUndo: () => setRegels((prev) => [...prev, r]),
      onCommit: () => fetch(`/api/categorisatie-regels?id=${r.id}`, { method: "DELETE" }),
    });
  };

  const nieuweCategorie = async () => {
    const naam = prompt("Naam van de nieuwe categorie:");
    if (!naam) return;
    const res = await fetch("/api/categorieen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setCategorieen((prev) => [...prev, data.categorie].sort((a, b) => a.naam.localeCompare(b.naam)));
    toast.success(`Categorie "${naam}" toegevoegd`);
  };

  const gefilterd = filterCat ? pending.filter((t) => t.categorie === filterCat) : pending;
  const categorieNamen = Array.from(new Set([...categorieen.map((c) => c.naam), ONBEKEND]));

  const BevestigKnop = () => (
    <button
      className="btn-primary"
      onClick={bevestigen}
      disabled={bezigMetOpslaan}
      style={{ padding: "10px 20px", fontWeight: 600 }}
    >
      {bezigMetOpslaan ? "Bezig met opslaan…" : `✅ ${pending.length} transacties definitief toevoegen aan kasboek`}
    </button>
  );

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>KBC CSV Upload</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            Upload je KBC Touch-export (.csv). Transacties worden automatisch gecategoriseerd; controleer en pas aan waar nodig.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setToonHistoriek(!toonHistoriek)} style={{ fontSize: 12 }}>
            🕓 Importhistoriek {toonHistoriek ? "verbergen" : "tonen"}
          </button>
          <button onClick={() => setToonRegels(!toonRegels)} style={{ fontSize: 12 }}>
            ⚙️ Categorisatieregels {toonRegels ? "verbergen" : "beheren"}
          </button>
        </div>
      </div>

      {toonHistoriek && (
        <div className="card" style={{ marginTop: 12, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Importhistoriek (dit werkjaar)</div>
          {historiek.length === 0 ? (
            <p className="muted" style={{ fontSize: 12, fontStyle: "italic" }}>Nog geen CSV geïmporteerd voor dit werkjaar.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Wanneer</th>
                  <th>Door</th>
                  <th>Bestand</th>
                  <th style={{ textAlign: "right" }}>In bestand</th>
                  <th style={{ textAlign: "right" }}>Nieuw</th>
                  <th style={{ textAlign: "right" }}>Duplicaten</th>
                </tr>
              </thead>
              <tbody>
                {historiek.map((h) => (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(h.created_at).toLocaleString("nl-BE")}</td>
                    <td className="muted">{h.users?.naam || "-"}</td>
                    <td className="muted">{h.bestandsnaam || "-"}</td>
                    <td style={{ textAlign: "right" }}>{h.aantal_in_bestand}</td>
                    <td style={{ textAlign: "right" }}>{h.aantal_nieuw}</td>
                    <td style={{ textAlign: "right" }} className={h.aantal_duplicaten > 0 ? "amount-neg" : ""}>{h.aantal_duplicaten}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {toonRegels && (
        <div className="card" style={{ marginTop: 12, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Categorisatieregels</div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Als de mededeling, omschrijving of naam van de tegenpartij deze tekst bevat, wordt automatisch deze categorie toegewezen.
          </p>
          <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12 }}>
            {regels.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span><strong>"{r.bevat_tekst}"</strong> → {r.categorieen?.naam}</span>
                <button className="btn-danger" onClick={() => regelVerwijderen(r)}>🗑️</button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder='Tekst, bv. "fin"' value={nieuweRegelTekst} onChange={(e) => setNieuweRegelTekst(e.target.value)} style={{ flex: 1 }} />
            <select value={nieuweRegelCat} onChange={(e) => setNieuweRegelCat(e.target.value)}>
              <option value="">Categorie...</option>
              {categorieen.map((c) => <option key={c.id} value={c.id}>{c.naam}</option>)}
            </select>
            <button onClick={nieuweRegelOpslaan}>+ Toevoegen</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "20px 0", flexWrap: "wrap" }}>
        <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)}>
          {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
        </select>
        <label className="btn-primary" style={{ padding: "8px 16px", cursor: "pointer", fontSize: 13, display: "inline-block" }}>
          📄 CSV-bestand kiezen
          <input type="file" accept=".csv" onChange={onFile} style={{ display: "none" }} />
        </label>
        <button onClick={nieuweCategorie}>+ Categorie</button>
        {pending.length > 0 && (
          <>
            <button onClick={draaiPatroonherkenningOpnieuw}>🔮 Patroonherkenning opnieuw</button>
            <div style={{ flex: 1 }} />
            <BevestigKnop />
          </>
        )}
      </div>

      {pending.length === 0 ? (
        <p className="muted" style={{ fontStyle: "italic" }}>Nog geen bestand geladen.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 13 }}>{pending.length} transacties klaar om te bevestigen</span>
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ fontSize: 12 }}>
              <option value="">Alle categorieën</option>
              {categorieNamen.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {geselecteerd.length > 0 && (
              <>
                <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} style={{ fontSize: 12 }}>
                  <option value="">Categorie voor selectie...</option>
                  {categorieNamen.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={bulkToepassen} style={{ fontSize: 12 }}>Toepassen op {geselecteerd.length} geselecteerd</button>
              </>
            )}
          </div>

          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" onChange={(e) => toggleSelectAll(gefilterd.map((t) => t.id), e.target.checked)} />
                  </th>
                  <th>Datum</th>
                  <th>Tegenpartij</th>
                  <th>Mededeling</th>
                  <th>Categorie</th>
                  <th style={{ textAlign: "right" }}>Bedrag</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {gefilterd.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <input type="checkbox" checked={geselecteerd.includes(t.id)} onChange={() => toggleSelect(t.id)} />
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{t.datum}</td>
                    <td style={{ fontWeight: 600 }}>{t.tegenpartij}</td>
                    <td className="muted" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.vrijeMededeling || t.omschrijving || <span className="subtle" style={{ fontStyle: "italic" }}>Geen mededeling</span>}
                    </td>
                    <td>
                      <select
                        value={t.categorie}
                        onChange={(e) => updateCat(t.id, e.target.value)}
                        className={t.categorie === ONBEKEND ? "amount-neg" : ""}
                        style={{ fontSize: 12, fontWeight: t.categorie === ONBEKEND ? 700 : 400 }}
                      >
                        {categorieNamen.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className={t.bedrag < 0 ? "amount-neg" : ""} style={{ textAlign: "right", fontWeight: 700 }}>{euro(t.bedrag)}</td>
                    <td>
                      <button className="btn-danger" onClick={() => verwijder(t)}>🗑️</button>
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
  );
}
