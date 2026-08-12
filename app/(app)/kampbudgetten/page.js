"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonTable } from "@/components/Skeleton";
import { AFDELINGEN_OUD } from "@/lib/kampAfdelingen";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const LEGE_TARIEVEN = { winkelenJong: 0, winkelenOud: 0, droppingPerLid: 0, weekendPerLid: 0, weekendplaatsVast: 50 };

function naarFormVeld(t) {
  return {
    winkelenJong: t.winkelen_jong,
    winkelenOud: t.winkelen_oud,
    droppingPerLid: t.dropping_per_lid,
    weekendPerLid: t.weekend_per_lid,
    weekendplaatsVast: t.weekendplaats_vast,
  };
}

// Zelfde drempels als lib/budgetKleur.js (<80% groen, tot 100% oranje, erboven rood).
function budgetStatus(uitgegeven, budget) {
  if (!budget) return { pct: 0, kleur: "", badge: "badge-neutral", label: "Geen budget" };
  const pct = (Number(uitgegeven) / Number(budget)) * 100;
  if (pct > 100) return { pct: 100, kleur: "danger", badge: "badge-danger", label: "Over budget" };
  if (pct >= 80) return { pct, kleur: "warning", badge: "badge-warning", label: "Bijna op" };
  return { pct, kleur: "", badge: "badge-success", label: "Op schema" };
}

function AfdelingRij({ g, groot, magBewerken, onAantalLeden }) {
  const status = budgetStatus(g.uitgegeven, g.totaalToegewezen);
  return (
    <div style={{ padding: groot ? 0 : "14px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
      <Link href={`/kampbudgetten/${g.id}`} className={groot ? "" : "nav-row"} style={{ display: "block", textDecoration: "none", color: "inherit", margin: groot ? 0 : "-14px -4px", padding: groot ? 0 : "14px 4px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: groot ? 18 : 16, color: "var(--primary)" }}>
              {g.afdeling}
              {AFDELINGEN_OUD.includes(g.afdeling) && <span className="subtle" style={{ fontSize: 12, fontWeight: 500 }}> · dropping/weekend</span>}
            </div>
            <span className={`badge ${status.badge}`}>{status.label}</span>
          </div>
          <div className="progress-track" style={{ height: groot ? 12 : 9 }}><div className={`progress-fill ${status.kleur}`} style={{ width: `${status.pct}%` }} /></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="muted money" style={{ fontSize: 14 }}>{euro(g.uitgegeven)} van {euro(g.totaalToegewezen)}</div>
            <div style={{ textAlign: "right" }}>
              <div className="muted" style={{ fontSize: 12 }}>{g.resterend < 0 ? "Over budget" : "Nog te besteden"}</div>
              <div className={`money ${g.resterend < 0 ? "amount-neg" : ""}`} style={{ fontWeight: 700, fontSize: groot ? 22 : 16, color: g.resterend >= 0 ? "var(--success-text)" : undefined }}>{euro(Math.abs(g.resterend))}</div>
            </div>
          </div>
        </div>
      </Link>
      {magBewerken && (
        <label className="muted" style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          Aantal leden
          <input type="number" step="1" min="0" defaultValue={g.aantalLeden} onBlur={(e) => onAantalLeden(g.id, e.target.value)} style={{ width: 70 }} />
        </label>
      )}
    </div>
  );
}

export default function Kampbudgetten() {
  const { data: session } = useSession();
  const toast = useToast();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [groepsbudgetten, setGroepsbudgetten] = useState([]);
  const [tarieven, setTarieven] = useState(LEGE_TARIEVEN);
  const [toonTarieven, setToonTarieven] = useState(false);
  const [loading, setLoading] = useState(true);

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  const laden = (id) =>
    fetch(`/api/kampbudgetten?werkjaarId=${id}`).then((r) => r.json()).then((d) => {
      setGroepsbudgetten(d.groepsbudgetten || []);
      if (d.tarieven) setTarieven(naarFormVeld(d.tarieven));
    });

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!werkjaarId) return;
    laden(werkjaarId);
  }, [werkjaarId]);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 800 }}>
        <SkeletonTable rows={6} cols={5} />
      </div>
    );
  }

  const aantalLedenBijwerken = async (id, waarde) => {
    setGroepsbudgetten((prev) => prev.map((g) => (g.id === id ? { ...g, aantalLeden: waarde } : g)));
    const res = await fetch("/api/kampbudgetten", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, aantalLeden: waarde }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    laden(werkjaarId);
  };

  const tarievenOpslaan = async () => {
    const res = await fetch("/api/kampbudgetten/tarieven", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, ...tarieven }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    laden(werkjaarId);
    toast.success("Tarieven opgeslagen");
  };

  const totalen = groepsbudgetten.reduce(
    (s, g) => ({
      toegewezen: s.toegewezen + g.totaalToegewezen,
      uitgegeven: s.uitgegeven + g.uitgegeven,
      resterend: s.resterend + g.resterend,
    }),
    { toegewezen: 0, uitgegeven: 0, resterend: 0 }
  );
  const totaalStatus = budgetStatus(totalen.uitgegeven, totalen.toegewezen);
  const jouwAfdeling = groepsbudgetten.find((g) => g.afdeling === session?.user?.groep);
  const andere = groepsbudgetten.filter((g) => g.id !== jouwAfdeling?.id);

  return (
    <div style={{ padding: 32, maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800 }}>Kampbudgetten</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 15, marginBottom: 20 }}>
        Budget voor het winkelen in juli, en dropping/weekend voor Tito, Keti en Aspi. Uitgaven log je bij <Link href="/kampkosten" className="link">Kampkosten</Link> onder de juiste afdeling.
      </p>

      {magBewerken && (
        toonTarieven ? (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>Tarieven (gelden voor alle afdelingen samen)</div>
            <div className="grid-3" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                €/lid winkelen — Sloebers/Speelclub/Rakwi
                <input type="number" step="0.5" min="0" value={tarieven.winkelenJong} onChange={(e) => setTarieven({ ...tarieven, winkelenJong: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                €/lid winkelen — Tito/Keti/Aspi
                <input type="number" step="0.5" min="0" value={tarieven.winkelenOud} onChange={(e) => setTarieven({ ...tarieven, winkelenOud: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                €/lid dropping — Tito/Keti/Aspi
                <input type="number" step="0.5" min="0" value={tarieven.droppingPerLid} onChange={(e) => setTarieven({ ...tarieven, droppingPerLid: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                €/lid weekend — Tito/Keti/Aspi
                <input type="number" step="0.5" min="0" value={tarieven.weekendPerLid} onChange={(e) => setTarieven({ ...tarieven, weekendPerLid: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Vast budget weekendplaats (per groep) — Tito/Keti/Aspi
                <input type="number" step="1" min="0" value={tarieven.weekendplaatsVast} onChange={(e) => setTarieven({ ...tarieven, weekendplaatsVast: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" onClick={tarievenOpslaan}>Tarieven opslaan</button>
              <button onClick={() => setToonTarieven(false)}>Sluiten</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setToonTarieven(true)} style={{ marginBottom: 20 }}>Tarieven aanpassen</button>
        )
      )}

      <div className={`card card-lg ${totaalStatus.kleur === "danger" ? "card-danger" : totaalStatus.kleur === "warning" ? "card-warning" : ""}`} style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className={`badge ${totaalStatus.badge}`}>{totaalStatus.label}</span>
          <span className="muted" style={{ fontSize: 14 }}>Alle afdelingen samen</span>
        </div>
        <div className="muted" style={{ fontSize: 14 }}>Nog te besteden op kamp</div>
        <div className="money" style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", color: totalen.resterend >= 0 ? "var(--success-text)" : "var(--danger-deep)" }}>{euro(Math.abs(totalen.resterend))}</div>
        <div className="progress-track"><div className={`progress-fill ${totaalStatus.kleur}`} style={{ width: `${totaalStatus.pct}%` }} /></div>
        <div className="muted money" style={{ fontSize: 14 }}>{euro(totalen.uitgegeven)} van {euro(totalen.toegewezen)} uitgegeven</div>
      </div>

      {jouwAfdeling && (
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Jouw afdeling</div>
          <div className="card" style={{ borderWidth: 1.5, borderColor: "var(--text)" }}>
            <AfdelingRij g={jouwAfdeling} groot magBewerken={magBewerken} onAantalLeden={aantalLedenBijwerken} />
          </div>
        </div>
      )}

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{jouwAfdeling ? "De andere afdelingen" : "Alle afdelingen"}</div>
        <div className="card" style={{ padding: "4px 18px" }}>
          {andere.length === 0 && <p className="muted" style={{ padding: "16px 0", textAlign: "center" }}>Geen afdelingen.</p>}
          {andere.map((g, i) => (
            <div key={g.id} style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
              <AfdelingRij g={g} magBewerken={magBewerken} onAantalLeden={aantalLedenBijwerken} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
