"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonTable } from "@/components/Skeleton";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const AFDELINGEN = ["Sloebers", "Speelclub", "Rakwi", "Tito", "Keti", "Aspi", "Algemeen/Keuken"];
const STATUS_VOLGORDE = ["Aangevraagd", "Goedgekeurd", "Klaargezet", "Opgehaald"];

const LEGE_AANVRAAG = { afdeling: "", datumNodig: "", bedragGevraagd: "", samenstellingCash: "", doelActiviteit: "" };

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

  const aanvraagIndienen = async () => {
    const a = nieuweAanvraag;
    if (!a.afdeling || !a.datumNodig || !a.bedragGevraagd) return toast.error("Vul afdeling, datum en bedrag in.");
    const res = await fetch("/api/wisselgeld", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, ...a }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweAanvraag({ ...LEGE_AANVRAAG, afdeling: afdelingenKeuze.length === 1 ? afdelingenKeuze[0] : "" });
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

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Wisselgeld-aanvragen</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Vraag cash wisselgeld aan voor een activiteit of weekend. Financiën ziet nieuwe aanvragen meteen op het Financieel dashboard en op de Kalender.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <select value={filterAfdeling} onChange={(e) => setFilterAfdeling(e.target.value)}>
          <option value="">Alle afdelingen</option>
          {AFDELINGEN.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {afdelingenKeuze.length > 0 && (
          <button className="btn-primary" onClick={() => setToonForm(!toonForm)}>{toonForm ? "Annuleren" : "+ Nieuwe aanvraag"}</button>
        )}
      </div>

      {toonForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Nieuwe aanvraag</div>
          <div className="grid-3" style={{ marginBottom: 8 }}>
            <select value={nieuweAanvraag.afdeling} onChange={(e) => setNieuweAanvraag({ ...nieuweAanvraag, afdeling: e.target.value })} disabled={afdelingenKeuze.length === 1}>
              <option value="">Afdeling...</option>
              {afdelingenKeuze.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input type="date" placeholder="Datum nodig" value={nieuweAanvraag.datumNodig} onChange={(e) => setNieuweAanvraag({ ...nieuweAanvraag, datumNodig: e.target.value })} />
            <input type="number" step="0.01" placeholder="Bedrag gevraagd" value={nieuweAanvraag.bedragGevraagd} onChange={(e) => setNieuweAanvraag({ ...nieuweAanvraag, bedragGevraagd: e.target.value })} />
            <input placeholder="Doel, bv. Dropping snack/inkom" value={nieuweAanvraag.doelActiviteit} onChange={(e) => setNieuweAanvraag({ ...nieuweAanvraag, doelActiviteit: e.target.value })} style={{ gridColumn: "span 2" }} />
            <input placeholder="Samenstelling (optioneel), bv. 10x€5, 5x€10" value={nieuweAanvraag.samenstellingCash} onChange={(e) => setNieuweAanvraag({ ...nieuweAanvraag, samenstellingCash: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={aanvraagIndienen}>Aanvraag indienen</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Afdeling</th>
              <th>Datum nodig</th>
              <th>Doel</th>
              <th style={{ textAlign: "right" }}>Bedrag</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {aanvragen.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ textAlign: "center", border: "none", padding: 24 }}>Nog geen aanvragen.</td></tr>
            )}
            {aanvragen.map((a) => (
              <tr key={a.id}>
                <td className="subtle">{a.aanvraag_code}</td>
                <td style={{ fontWeight: 600 }}>{a.afdeling}</td>
                <td style={{ whiteSpace: "nowrap" }}>{a.datum_nodig}</td>
                <td className="muted">{a.doel_activiteit || "-"}{a.samenstelling_cash && <div className="subtle" style={{ fontSize: 11 }}>{a.samenstelling_cash}</div>}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(a.bedrag_gevraagd)}</td>
                <td><span className={`badge ${a.status === "Opgehaald" ? "badge-primary" : "badge-neutral"}`}>{a.status}</span></td>
                <td style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  {magActieOp(a) && volgendeStatus(a.status) && (isFinancien || a.status === "Klaargezet") && (
                    <button onClick={() => statusVooruit(a)} style={{ fontSize: 11 }}>→ {volgendeStatus(a.status)}</button>
                  )}
                  {magActieOp(a) && <button className="btn-danger" onClick={() => aanvraagVerwijderen(a)} style={{ fontSize: 11 }}>🗑️</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
