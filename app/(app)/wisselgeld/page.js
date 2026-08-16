"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonTable } from "@/components/Skeleton";
import { BRIEFJES, MUNTEN, samenstellingTotaal, berekenCoupureVoorstel } from "@/lib/coupureVoorstel";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const AFDELINGEN = ["Sloebers", "Speelclub", "Rakwi", "Tito", "Keti", "Aspi", "Algemeen/Keuken"];
const STATUS_VOLGORDE = ["Aangevraagd", "Goedgekeurd", "Klaargezet", "Opgehaald"];
const STATUS_BADGE = { Aangevraagd: "badge-warning", Goedgekeurd: "badge-primary", Klaargezet: "badge-primary", Opgehaald: "badge-success" };

const LEGE_AANVRAAG = { afdeling: "", datumNodig: "", bedragGevraagd: "", samenstellingCash: "", doelActiviteit: "" };
const LEGE_PRIJSLIJN = { naam: "", prijs: "", aantalVerwacht: "" };

// Leesbare samenvatting van een coupure-object, bv. "5×€5, 2×€2, 1×€1".
function coupureSamenvatting(samenstelling) {
  return Object.entries(samenstelling || {})
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .filter(([, aantal]) => Number(aantal) > 0)
    .map(([denom, aantal]) => `${aantal}×€${denom}`)
    .join(", ");
}

// Dezelfde briefjes/muntjes-tel-grid als bij een evenement-kassa, hier
// hergebruikt voor het coupure-voorstel.
function CoupureGrid({ aantallen, setAantallen }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
      <div>
        <div className="subtle" style={{ fontSize: 11, marginBottom: 4 }}>BRIEFJES</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {BRIEFJES.map((d) => (
            <label key={d} style={{ fontSize: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              €{d}
              <input type="number" min="0" step="1" style={{ width: 54, textAlign: "center" }} value={aantallen[d] ?? ""} onChange={(e) => setAantallen((prev) => ({ ...prev, [d]: e.target.value === "" ? "" : Number(e.target.value) }))} />
            </label>
          ))}
        </div>
      </div>
      <div>
        <div className="subtle" style={{ fontSize: 11, marginBottom: 4 }}>MUNTJES</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {MUNTEN.map((d) => (
            <label key={d} style={{ fontSize: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              €{d}
              <input type="number" min="0" step="1" style={{ width: 54, textAlign: "center" }} value={aantallen[d] ?? ""} onChange={(e) => setAantallen((prev) => ({ ...prev, [d]: e.target.value === "" ? "" : Number(e.target.value) }))} />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function AanvraagKaart({ a, magActie, isFinancien, volgende, onStatusVooruit, onVerwijderen, onVoorstelOpslaan }) {
  const [wijzigCoupures, setWijzigCoupures] = useState(false);
  const [aantallen, setAantallen] = useState(a.samenstelling_voorstel || {});

  const opslaan = async () => {
    await onVoorstelOpslaan(a, aantallen);
    setWijzigCoupures(false);
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{a.afdeling}</div>
          <div className="muted" style={{ fontSize: 14 }}>{a.doel_activiteit || "Geen doel opgegeven"} · nodig op {a.datum_nodig}</div>
        </div>
        <span className={`badge ${STATUS_BADGE[a.status] || "badge-neutral"}`}>{a.status}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="muted" style={{ fontSize: 14 }}>Gevraagd</div>
          <div className="money" style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>{euro(a.bedrag_gevraagd)}</div>
          {a.samenstelling_voorstel && <div className="subtle" style={{ fontSize: 13 }}>Voorstel: {coupureSamenvatting(a.samenstelling_voorstel)}</div>}
          {!a.samenstelling_voorstel && a.samenstelling_cash && <div className="subtle" style={{ fontSize: 13 }}>{a.samenstelling_cash}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="subtle" style={{ fontSize: 13 }}>{a.aanvraag_code}</span>
          {isFinancien && <button className="btn-plain link" style={{ fontSize: 13 }} onClick={() => setWijzigCoupures(!wijzigCoupures)}>{wijzigCoupures ? "Sluiten" : "Coupures wijzigen"}</button>}
          {magActie && volgende && <button className="btn-primary" onClick={() => onStatusVooruit(a)}>{volgende} →</button>}
          {magActie && <button className="btn-danger" onClick={() => onVerwijderen(a)}>🗑️</button>}
        </div>
      </div>

      {wijzigCoupures && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <CoupureGrid aantallen={aantallen} setAantallen={setAantallen} />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="muted" style={{ fontSize: 13 }}>Totaal: <span className="money" style={{ fontWeight: 700 }}>{euro(samenstellingTotaal(aantallen))}</span></span>
            <button className="btn-primary" onClick={opslaan}>Opslaan</button>
          </div>
        </div>
      )}

      {a.verkoopprijzen?.length > 0 && (
        <div className="subtle" style={{ fontSize: 12 }}>
          Verkoopprijzen: {a.verkoopprijzen.map((p) => `${p.naam ? p.naam + " " : ""}€${p.prijs} × ${p.aantalVerwacht}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

export default function Wisselgeld() {
  const { data: session } = useSession();
  const toast = useToast();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [aanvragen, setAanvragen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAfdeling, setFilterAfdeling] = useState("");
  const [toonForm, setToonForm] = useState(false);
  const [nieuweAanvraag, setNieuweAanvraag] = useState(LEGE_AANVRAAG);
  const [modus, setModus] = useState("eenvoudig");
  const [prijslijnen, setPrijslijnen] = useState([{ ...LEGE_PRIJSLIJN }]);
  const [voorstel, setVoorstel] = useState(null);

  const isFinancien = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);
  const eigenAfdeling = session?.user?.groep || null;
  const afdelingenKeuze = isFinancien ? AFDELINGEN : eigenAfdeling ? [eigenAfdeling] : [];

  const laden = (id, afdeling) => {
    const url = new URL("/api/wisselgeld", window.location.origin);
    url.searchParams.set("werkjaarId", id);
    if (afdeling) url.searchParams.set("afdeling", afdeling);
    fetch(url).then((r) => r.json()).then((d) => setAanvragen(d.wisselgeldAanvragen || []));
  };

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!werkjaarId) return;
    laden(werkjaarId, filterAfdeling);
  }, [werkjaarId, filterAfdeling]);

  useEffect(() => {
    if (afdelingenKeuze.length === 1) setNieuweAanvraag((prev) => ({ ...prev, afdeling: afdelingenKeuze[0] }));
  }, [eigenAfdeling]);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 1000 }}>
        <SkeletonTable rows={5} cols={6} />
      </div>
    );
  }

  const prijslijnWijzigen = (i, veld, waarde) => {
    setPrijslijnen((prev) => prev.map((r, idx) => (idx === i ? { ...r, [veld]: waarde } : r)));
  };
  const prijslijnToevoegen = () => setPrijslijnen((prev) => [...prev, { ...LEGE_PRIJSLIJN }]);
  const prijslijnVerwijderen = (i) => setPrijslijnen((prev) => prev.filter((_, idx) => idx !== i));

  const voorstelBerekenen = () => {
    const geldige = prijslijnen.filter((r) => Number(r.prijs) > 0 && Number(r.aantalVerwacht) > 0);
    if (geldige.length === 0) return toast.error("Vul minstens één prijs met een verwacht aantal in.");
    const { samenstelling, totaalBedrag } = berekenCoupureVoorstel(geldige);
    setVoorstel(samenstelling);
    setNieuweAanvraag((prev) => ({ ...prev, bedragGevraagd: String(totaalBedrag) }));
    toast.success(`Voorstel berekend: ${euro(totaalBedrag)} — pas gerust nog aan.`);
  };

  const resetForm = () => {
    setNieuweAanvraag({ ...LEGE_AANVRAAG, afdeling: afdelingenKeuze.length === 1 ? afdelingenKeuze[0] : "" });
    setModus("eenvoudig");
    setPrijslijnen([{ ...LEGE_PRIJSLIJN }]);
    setVoorstel(null);
  };

  const aanvraagIndienen = async () => {
    const a = nieuweAanvraag;
    if (!a.afdeling || !a.datumNodig || !a.bedragGevraagd) return toast.error("Vul afdeling, datum en bedrag in.");
    const geldigePrijslijnen = modus === "prijzen" ? prijslijnen.filter((r) => Number(r.prijs) > 0 && Number(r.aantalVerwacht) > 0) : null;
    const res = await fetch("/api/wisselgeld", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        werkjaarId,
        ...a,
        verkoopprijzen: geldigePrijslijnen?.length ? geldigePrijslijnen : null,
        samenstellingVoorstel: modus === "prijzen" && voorstel ? voorstel : null,
      }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    resetForm();
    setToonForm(false);
    laden(werkjaarId, filterAfdeling);
    toast.success(`Aanvraag ${data.aanvraag.aanvraag_code} ingediend`);
  };

  const volgendeStatus = (huidige) => {
    const idx = STATUS_VOLGORDE.indexOf(huidige);
    return idx >= 0 && idx < STATUS_VOLGORDE.length - 1 ? STATUS_VOLGORDE[idx + 1] : null;
  };

  const statusVooruit = async (aanvraag) => {
    const nieuw = volgendeStatus(aanvraag.status);
    if (!nieuw) return;
    await fetch("/api/wisselgeld", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: aanvraag.id, status: nieuw }),
    });
    laden(werkjaarId, filterAfdeling);
    toast.success(`Status bijgewerkt naar "${nieuw}"`);
  };

  const voorstelOpslaan = async (aanvraag, aantallen) => {
    await fetch("/api/wisselgeld", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: aanvraag.id, samenstellingVoorstel: aantallen }),
    });
    laden(werkjaarId, filterAfdeling);
    toast.success("Coupure-voorstel opgeslagen");
  };

  const aanvraagVerwijderen = (aanvraag) => {
    setAanvragen((prev) => prev.filter((a) => a.id !== aanvraag.id));
    toast.undoable({
      message: "Aanvraag verwijderd",
      onUndo: () => laden(werkjaarId, filterAfdeling),
      onCommit: async () => {
        await fetch(`/api/wisselgeld?id=${aanvraag.id}`, { method: "DELETE" });
      },
    });
  };

  const magActieOp = (aanvraag) => isFinancien || (eigenAfdeling && eigenAfdeling === aanvraag.afdeling);

  const teRegelen = aanvragen.filter((a) => a.status !== "Opgehaald");
  const opgehaald = aanvragen.filter((a) => a.status === "Opgehaald");
  const nogTeRegelen = teRegelen.reduce((s, a) => s + Number(a.bedrag_gevraagd || 0), 0);

  return (
    <div style={{ padding: 32, maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800 }}>Wisselgeld</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 15, marginBottom: 20 }}>
        Vraag cash wisselgeld aan voor een activiteit of weekend. Financiën ziet nieuwe aanvragen meteen op het Financieel dashboard en op de Kalender.
      </p>

      {teRegelen.length > 0 && (
        <div className="card card-lg card-warning" style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="muted" style={{ fontSize: 14 }}>Nog te regelen</div>
          <div className="money" style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em" }}>{euro(nogTeRegelen)}</div>
          <div className="muted" style={{ fontSize: 14 }}>{teRegelen.length} aanvra{teRegelen.length > 1 ? "gen" : "ag"} onderweg.</div>
          {afdelingenKeuze.length > 0 && (
            <button className="btn-primary" onClick={() => setToonForm(!toonForm)} style={{ alignSelf: "flex-start" }}>{toonForm ? "Annuleren" : "+ Nieuwe aanvraag"}</button>
          )}
        </div>
      )}

      {teRegelen.length === 0 && afdelingenKeuze.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button className="btn-primary" onClick={() => setToonForm(!toonForm)}>{toonForm ? "Annuleren" : "+ Nieuwe aanvraag"}</button>
        </div>
      )}

      {toonForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>Nieuwe aanvraag</div>
          <div className="grid-3" style={{ marginBottom: 10 }}>
            <select value={nieuweAanvraag.afdeling} onChange={(e) => setNieuweAanvraag({ ...nieuweAanvraag, afdeling: e.target.value })} disabled={afdelingenKeuze.length === 1}>
              <option value="">Afdeling...</option>
              {afdelingenKeuze.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input type="date" placeholder="Datum nodig" value={nieuweAanvraag.datumNodig} onChange={(e) => setNieuweAanvraag({ ...nieuweAanvraag, datumNodig: e.target.value })} />
            <input placeholder="Doel, bv. Dropping snack/inkom" value={nieuweAanvraag.doelActiviteit} onChange={(e) => setNieuweAanvraag({ ...nieuweAanvraag, doelActiviteit: e.target.value })} style={{ gridColumn: "span 2" }} />
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="radio" checked={modus === "eenvoudig"} onChange={() => setModus("eenvoudig")} />
              Eenvoudig — gewoon een bedrag
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="radio" checked={modus === "prijzen"} onChange={() => setModus("prijzen")} />
              Met verkoopprijzen — automatisch coupure-voorstel
            </label>
          </div>

          {modus === "eenvoudig" ? (
            <div className="grid-2" style={{ marginBottom: 10 }}>
              <input type="number" step="0.01" placeholder="Bedrag gevraagd" value={nieuweAanvraag.bedragGevraagd} onChange={(e) => setNieuweAanvraag({ ...nieuweAanvraag, bedragGevraagd: e.target.value })} />
              <input placeholder="Samenstelling (optioneel), bv. 10x€5, 5x€10" value={nieuweAanvraag.samenstellingCash} onChange={(e) => setNieuweAanvraag({ ...nieuweAanvraag, samenstellingCash: e.target.value })} />
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <p className="subtle" style={{ fontSize: 12, marginBottom: 8 }}>
                Wat ga je verkopen, tegen welke prijs, en hoeveel verwacht je er ongeveer van te verkopen? Op basis daarvan stelt het platform voor hoeveel briefjes/muntjes van elke waarde je klaar moet leggen.
              </p>
              {prijslijnen.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <input placeholder="Wat, bv. Cola (optioneel)" value={r.naam} onChange={(e) => prijslijnWijzigen(i, "naam", e.target.value)} style={{ flex: 1, minWidth: 120 }} />
                  <input type="number" step="0.01" placeholder="Prijs" value={r.prijs} onChange={(e) => prijslijnWijzigen(i, "prijs", e.target.value)} style={{ width: 90 }} />
                  <input type="number" step="1" placeholder="Verwacht aantal" value={r.aantalVerwacht} onChange={(e) => prijslijnWijzigen(i, "aantalVerwacht", e.target.value)} style={{ width: 120 }} />
                  {prijslijnen.length > 1 && <button className="btn-danger" onClick={() => prijslijnVerwijderen(i)}>🗑️</button>}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button onClick={prijslijnToevoegen}>+ Prijs</button>
                <button className="btn-primary" onClick={voorstelBerekenen}>Bereken voorstel</button>
              </div>

              {voorstel && (
                <div style={{ background: "var(--surface-alt)", borderRadius: 14, padding: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Voorstel — pas gerust aan</div>
                  <p className="subtle" style={{ fontSize: 11, marginBottom: 10 }}>
                    Er wordt van uitgegaan dat kopers spreiden over elk briefje/muntstuk vanaf de prijs tot en met €20 — dus ook wisselgeld voor wie met €10 of €20 betaalt, niet enkel voor wie exact past betaalt.
                  </p>
                  <CoupureGrid aantallen={voorstel} setAantallen={setVoorstel} />
                  <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                    Totaal: <span className="money" style={{ fontWeight: 700 }}>{euro(samenstellingTotaal(voorstel))}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <button className="btn-primary" onClick={aanvraagIndienen}>Aanvraag indienen</button>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setFilterAfdeling("")} className={!filterAfdeling ? "btn-primary" : ""} style={{ borderRadius: "var(--radius-pill)" }}>Alle afdelingen</button>
        {AFDELINGEN.map((a) => (
          <button key={a} onClick={() => setFilterAfdeling(a)} className={filterAfdeling === a ? "btn-primary" : ""} style={{ borderRadius: "var(--radius-pill)" }}>{a}</button>
        ))}
      </div>

      {aanvragen.length === 0 && <p className="muted" style={{ fontStyle: "italic" }}>Nog geen aanvragen.</p>}

      {teRegelen.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Te regelen</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {teRegelen.map((a) => (
              <AanvraagKaart key={a.id} a={a} magActie={magActieOp(a) && (isFinancien || a.status === "Klaargezet")} isFinancien={isFinancien} volgende={volgendeStatus(a.status)} onStatusVooruit={statusVooruit} onVerwijderen={aanvraagVerwijderen} onVoorstelOpslaan={voorstelOpslaan} />
            ))}
          </div>
        </div>
      )}

      {opgehaald.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Opgehaald</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {opgehaald.map((a) => (
              <AanvraagKaart key={a.id} a={a} magActie={magActieOp(a)} isFinancien={isFinancien} volgende={null} onStatusVooruit={statusVooruit} onVerwijderen={aanvraagVerwijderen} onVoorstelOpslaan={voorstelOpslaan} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
