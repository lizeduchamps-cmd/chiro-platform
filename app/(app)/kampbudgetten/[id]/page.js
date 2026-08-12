"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SkeletonStatRow, SkeletonCard } from "@/components/Skeleton";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const STATUS_BADGE = { Gepland: "badge-neutral", "Te vergoeden": "badge-warning", Betaald: "badge-success", Afgerond: "badge-neutral" };

export default function KampbudgetDetail({ params }) {
  const { id } = params;
  const [overzicht, setOverzicht] = useState(null);
  const [loading, setLoading] = useState(true);

  const laden = () => fetch(`/api/kampbudgetten/overzicht?id=${id}`).then((r) => r.json()).then((d) => { setOverzicht(d); setLoading(false); });

  useEffect(() => { laden(); }, [id]);

  if (loading || !overzicht) {
    return (
      <div style={{ padding: 32, maxWidth: 800 }}>
        <SkeletonStatRow count={3} />
        <SkeletonCard lines={3} />
      </div>
    );
  }
  if (overzicht.error) return <p className="amount-neg" style={{ padding: 32 }}>{overzicht.error}</p>;

  const { groepsbudget, transacties, wisselgeldAanvragen, balans } = overzicht;
  const overschreden = balans.statusBudget === "Overschreden";
  const pct = balans.totaalToegewezen ? Math.min(100, (balans.uitgegeven / balans.totaalToegewezen) * 100) : 0;

  return (
    <div style={{ padding: 32, maxWidth: 800 }}>
      <Link href="/kampbudgetten" className="link" style={{ fontSize: 13, display: "inline-block", marginBottom: 8 }}>← Kampbudgetten</Link>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>{groepsbudget.afdeling}</h1>
      <p className="muted" style={{ fontSize: 15, marginBottom: 20 }}>{groepsbudget.aantal_leden} leden</p>

      <div className={`card card-lg ${overschreden ? "card-danger" : ""}`} style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        {overschreden && <span className="badge badge-danger" style={{ alignSelf: "flex-start" }}>Overschreden</span>}
        <div className="muted" style={{ fontSize: 14 }}>{overschreden ? "Over budget" : "Nog te besteden"}</div>
        <div className="money" style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", color: overschreden ? "var(--danger-deep)" : "var(--success-text)" }}>{euro(Math.abs(balans.resterend))}</div>
        <div className="progress-track"><div className={`progress-fill ${overschreden ? "danger" : ""}`} style={{ width: `${pct}%` }} /></div>
        <div className="muted money" style={{ fontSize: 14 }}>{euro(balans.uitgegeven)} van {euro(balans.totaalToegewezen)} uitgegeven</div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div className="eyebrow">Uitgaven</div>
          <Link href="/kampkosten" className="link" style={{ fontSize: 13 }}>+ Uitgave toevoegen →</Link>
        </div>
        <p className="subtle" style={{ fontSize: 12, marginBottom: 10 }}>
          Dit zijn alle Kampkosten-transacties met "{groepsbudget.afdeling}" als hoofdcategorie — bewerk of verwijder ze op de Kampkosten-pagina zelf.
        </p>
        <div className="card" style={{ padding: 0 }}>
          {transacties.length === 0 && <p className="muted" style={{ padding: 24, textAlign: "center" }}>Nog geen uitgaven.</p>}
          {transacties.map((t, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  {t.omschrijving}
                  {t.users?.naam && <span className="subtle"> · {t.users.naam}</span>}
                  {t.bewijsstuk_url && <> · <a href={t.bewijsstuk_url} target="_blank" rel="noreferrer" className="link">bonnetje</a></>}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{t.transactie_code} · {t.datum}</div>
              </div>
              <span className={`badge ${STATUS_BADGE[t.status] || "badge-neutral"}`}>{t.status}</span>
              <div className="money" style={{ fontWeight: 700, width: 90, textAlign: "right" }}>{euro(t.bedrag)}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div className="eyebrow">Wisselgeld-aanvragen</div>
          <Link href="/wisselgeld" className="link" style={{ fontSize: 13 }}>Nieuwe aanvraag →</Link>
        </div>
        <div className="card" style={{ padding: 0 }}>
          {wisselgeldAanvragen.length === 0 && <p className="muted" style={{ padding: 24, textAlign: "center" }}>Nog geen aanvragen.</p>}
          {wisselgeldAanvragen.map((w, i) => (
            <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{w.doel_activiteit || "-"}</div>
                <div className="muted" style={{ fontSize: 12 }}>{w.aanvraag_code} · nodig op {w.datum_nodig}</div>
              </div>
              <span className="badge badge-neutral">{w.status}</span>
              <div className="money" style={{ fontWeight: 700, width: 90, textAlign: "right" }}>{euro(w.bedrag_gevraagd)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
