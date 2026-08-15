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
// Dit is een indirecte gok (geen eigen tekst-match), dus altijd "onzeker".
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
          t.zekerheid = "onzeker";
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

  // Zekerheid van de automatische match: een lang/specifiek trefwoord (bv.
  // "leidingsweekend") is een veel sterkere aanwijzing dan een kort/generiek
  // woordje (bv. "fin") — vandaar de knip op tekstlengte.
  const categoriseer = (rawMemo, rawDesc, tegenpartij, bedrag) => {
    const tekst = `${rawMemo} ${rawDesc} ${tegenpartij}`.toLowerCase();
    if (bedrag > 0 && bedrag % 60 === 0 && (rawMemo.trim() || rawDesc.trim())) {
      return { categorie: "Lidgeld", zekerheid: "zeker" };
    }
    for (const regel of regels) {
      if (tekst.includes(regel.bevat_tekst)) {
        return { categorie: regel.categorieen?.naam || ONBEKEND, zekerheid: regel.bevat_tekst.length >= 6 ? "zeker" : "waarschijnlijk" };
      }
    }
    return { categorie: ONBEKEND, zekerheid: null };
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
    const { categorie, zekerheid } = categoriseer(vrijeMededeling, omschrijving, tegenpartij, bedrag);

    resultaat.push({
      id: `${Date.now()}_${Math.random()}`,
      datum, tegenpartij, vrijeMededeling, omschrijving,
      iban: cols[ibanIdx] || "",
      bedrag,
      categorie,
      zekerheid,
    });
  }
  return resultaat;
}

function TransactieRij({ t, geselecteerd, onToggleSelect, categorieNamen, onCategorie, onVerwijder, open, onToggleOpen, altijdOpen }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
        <input type="checkbox" checked={geselecteerd} onChange={onToggleSelect} />
        <div className="money muted" style={{ width: 56, fontSize: 13, flexShrink: 0 }}>
          {t.datum ? new Date(t.datum + "T00:00:00").toLocaleDateString("nl-BE", { day: "numeric", month: "short" }) : "-"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{t.tegenpartij}</div>
          <div className="muted" style={{ fontSize: 12 }}>{t.vrijeMededeling || t.omschrijving || "Geen mededeling"}</div>
        </div>
        <div className={`money ${t.bedrag < 0 ? "amount-neg" : ""}`} style={{ width: 100, textAlign: "right", fontWeight: 700, fontSize: 15, color: t.bedrag > 0 ? "var(--success-text)" : undefined }}>
          {euro(t.bedrag)}
        </div>
        {altijdOpen ? (
          <button className="btn-danger" onClick={onVerwijder} title="Verwijderen">🗑️</button>
        ) : (
          <button className="btn-plain link" style={{ fontSize: 14 }} onClick={onToggleOpen}>{open ? "Sluiten" : "Wijzig"}</button>
        )}
      </div>
      {(altijdOpen || open) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "0 18px 16px", marginLeft: 34, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 13 }}>{altijdOpen ? "Waarvoor was dit?" : "Categorie"}</span>
          <select value={t.categorie} onChange={(e) => onCategorie(e.target.value)} style={{ fontWeight: t.categorie === ONBEKEND ? 700 : 500 }}>
            {categorieNamen.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {!altijdOpen && <button className="btn-danger" onClick={onVerwijder} title="Verwijderen">🗑️</button>}
        </div>
      )}
    </div>
  );
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
  const [toonAlleRegels, setToonAlleRegels] = useState(false);
  const [bewerkId, setBewerkId] = useState(null);
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
      setToonAlleRegels(false);
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

  const updateCat = (id, cat) => setPending((prev) => prev.map((t) => (t.id === id ? { ...t, categorie: cat, zekerheid: null } : t)));
  const verwijder = (t) => {
    setPending((prev) => prev.filter((x) => x.id !== t.id));
    setGeselecteerd((prev) => prev.filter((x) => x !== t.id));
    toast.undoable({ message: "Rij verwijderd uit de lijst", onUndo: () => setPending((prev) => [...prev, t]) });
  };
  const toggleSelect = (id) => setGeselecteerd((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleSelectAll = (ids) =>
    setGeselecteerd((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
  const bulkToepassen = () => {
    if (!bulkCat) return;
    setPending((prev) => prev.map((t) => (geselecteerd.includes(t.id) ? { ...t, categorie: bulkCat, zekerheid: null } : t)));
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

  const categorieNamen = Array.from(new Set([...categorieen.map((c) => c.naam), ONBEKEND]));
  const twijfel = pending.filter((t) => t.categorie === ONBEKEND);
  const zichtbaar = (toonAlleRegels ? pending : twijfel).filter((t) => !filterCat || t.categorie === filterCat);
  const percentageOk = pending.length ? Math.round(((pending.length - twijfel.length) / pending.length) * 100) : 0;

  const stap = pending.length === 0 ? 1 : 2;

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800 }}>Bankuittreksel importeren</h1>
          <p className="muted" style={{ fontSize: 15, marginTop: 6, maxWidth: 560 }}>
            Kies je KBC Touch-export (.csv). Transacties worden automatisch gecategoriseerd; controleer en pas aan waar nodig.
          </p>
          <div style={{ display: "flex", gap: 8, fontSize: 14, marginTop: 12, alignItems: "center" }}>
            <span style={{ fontWeight: stap === 1 ? 700 : 500, color: stap === 1 ? "var(--text)" : "var(--text-muted)" }}>1 · Bestand kiezen</span>
            <span className="subtle">→</span>
            <span style={{ fontWeight: stap === 2 ? 700 : 500, color: stap === 2 ? "var(--text)" : "var(--text-muted)" }}>2 · Twijfelgevallen</span>
            <span className="subtle">→</span>
            <span className="muted">3 · Toevoegen</span>
          </div>
        </div>
        <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
          {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "16px 0 20px" }}>
        <button onClick={() => setToonHistoriek(!toonHistoriek)}>🕓 Importhistoriek {toonHistoriek ? "verbergen" : "tonen"}</button>
        <button onClick={() => setToonRegels(!toonRegels)}>⚙️ Categorisatieregels {toonRegels ? "verbergen" : "beheren"}</button>
        {magBewerken && <button onClick={nieuweCategorie}>+ Categorie</button>}
      </div>

      {toonHistoriek && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Importhistoriek (dit werkjaar)</div>
          {historiek.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, fontStyle: "italic" }}>Nog geen CSV geïmporteerd voor dit werkjaar.</p>
          ) : (
            <div>
              {historiek.map((h, i) => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", fontSize: 13 }}>
                  <div className="subtle" style={{ width: 130 }}>{new Date(h.created_at).toLocaleString("nl-BE")}</div>
                  <div className="muted" style={{ flex: 1 }}>{h.bestandsnaam || "-"} · {h.users?.naam || "-"}</div>
                  <div className="money">{h.aantal_in_bestand} in bestand</div>
                  <div className="money" style={{ color: "var(--success-text)" }}>+{h.aantal_nieuw}</div>
                  {h.aantal_duplicaten > 0 && <div className="money amount-neg">{h.aantal_duplicaten} dubbel</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {toonRegels && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Categorisatieregels</div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Als de mededeling, omschrijving of naam van de tegenpartij deze tekst bevat, wordt automatisch deze categorie toegewezen.
          </p>
          <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 12 }}>
            {regels.map((r, i) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "8px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
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

      {pending.length === 0 ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
          <label className="btn-primary" style={{ cursor: "pointer" }}>
            CSV-bestand kiezen
            <input type="file" accept=".csv" onChange={onFile} style={{ display: "none" }} />
          </label>
          <p className="muted" style={{ fontSize: 13 }}>Nog geen bestand geladen.</p>
        </div>
      ) : (
        <>
          <div className={`card ${twijfel.length > 0 ? "card-warning" : "card-success"}`} style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className={`badge ${twijfel.length > 0 ? "badge-warning" : "badge-success"}`}>{twijfel.length > 0 ? "Nog even nakijken" : "Klaar"}</span>
              <span className="muted" style={{ fontSize: 14 }}>{bestandsnaam} · {pending.length} regels</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>
              {pending.length - twijfel.length} regels zijn automatisch gecategoriseerd.{twijfel.length > 0 ? ` Bij ${twijfel.length} twijfelen we.` : ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="progress-track" style={{ flex: 1 }}><div className={`progress-fill ${twijfel.length > 0 ? "warning" : ""}`} style={{ width: `${percentageOk}%` }} /></div>
              <div className="money" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)" }}>{percentageOk}%</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={bevestigen} disabled={bezigMetOpslaan}>
                {bezigMetOpslaan ? "Bezig met opslaan…" : `${pending.length} regels toevoegen aan het kasboek`}
              </button>
              <button onClick={draaiPatroonherkenningOpnieuw}>Herkenning opnieuw proberen</button>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div className="eyebrow">{toonAlleRegels ? `Alle regels · ${pending.length}` : `Waarover we twijfelen · ${twijfel.length}`}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {zichtbaar.length > 0 && (
                <button className="btn-plain" style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }} onClick={() => toggleSelectAll(zichtbaar.map((t) => t.id))}>
                  {zichtbaar.every((t) => geselecteerd.includes(t.id)) ? "☑" : "☐"} Alles selecteren
                </button>
              )}
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ fontSize: 12 }}>
                <option value="">Alle categorieën</option>
                {categorieNamen.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn-plain link" style={{ fontSize: 13 }} onClick={() => setToonAlleRegels((v) => !v)}>
                {toonAlleRegels ? "Enkel twijfelgevallen" : "Alle regels bekijken"}
              </button>
            </div>
          </div>

          {geselecteerd.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--primary-tint)", borderRadius: 12, padding: "10px 16px", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{geselecteerd.length} geselecteerd</span>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
                  <option value="">Categorie voor selectie...</option>
                  {categorieNamen.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="btn-primary" onClick={bulkToepassen}>Toepassen</button>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 0, marginBottom: 20 }}>
            {zichtbaar.length === 0 && (
              <p className="muted" style={{ padding: 24, textAlign: "center" }}>{toonAlleRegels ? "Geen regels gevonden." : "Geen twijfelgevallen meer — alles is gecategoriseerd."}</p>
            )}
            {zichtbaar.map((t, i) => (
              <div key={t.id} style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
                <TransactieRij
                  t={t}
                  geselecteerd={geselecteerd.includes(t.id)}
                  onToggleSelect={() => toggleSelect(t.id)}
                  categorieNamen={categorieNamen}
                  onCategorie={(cat) => updateCat(t.id, cat)}
                  onVerwijder={() => verwijder(t)}
                  altijdOpen={!toonAlleRegels}
                  open={bewerkId === t.id}
                  onToggleOpen={() => setBewerkId(bewerkId === t.id ? null : t.id)}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
