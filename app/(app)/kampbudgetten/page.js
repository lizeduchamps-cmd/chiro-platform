"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonTable } from "@/components/Skeleton";
import { AFDELINGEN_OUD } from "@/lib/kampAfdelingen";
import { budgetKleurEmoji } from "@/lib/budgetKleur";

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

export default function Kampbudgetten() {
  const { data: session } = useSession();
  const toast = useToast();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [groepsbudgetten, setGroepsbudgetten] = useState([]);
  const [tarieven, setTarieven] = useState(LEGE_TARIEVEN);
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
      <div style={{ padding: 32, maxWidth: 1100 }}>
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

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Kampbudgetten</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Budget voor het winkelen in juli, en dropping/weekend voor Tito, Keti en Aspi — dezelfde tarieven voor iedereen, berekend op basis van het aantal leden. Uitgaven log je bij <Link href="/kampkosten" style={{ color: "var(--primary)" }}>Kampkosten</Link> onder de juiste afdeling.
      </p>

      {magBewerken && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Tarieven (gelden voor alle afdelingen samen)</div>
          <div className="grid-3" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12 }}>
              €/lid winkelen — Sloebers/Speelclub/Rakwi
              <input type="number" step="0.5" min="0" value={tarieven.winkelenJong} onChange={(e) => setTarieven({ ...tarieven, winkelenJong: e.target.value })} style={{ display: "block", width: "100%", marginTop: 2 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              €/lid winkelen — Tito/Keti/Aspi
              <input type="number" step="0.5" min="0" value={tarieven.winkelenOud} onChange={(e) => setTarieven({ ...tarieven, winkelenOud: e.target.value })} style={{ display: "block", width: "100%", marginTop: 2 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              €/lid dropping — Tito/Keti/Aspi
              <input type="number" step="0.5" min="0" value={tarieven.droppingPerLid} onChange={(e) => setTarieven({ ...tarieven, droppingPerLid: e.target.value })} style={{ display: "block", width: "100%", marginTop: 2 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              €/lid weekend — Tito/Keti/Aspi
              <input type="number" step="0.5" min="0" value={tarieven.weekendPerLid} onChange={(e) => setTarieven({ ...tarieven, weekendPerLid: e.target.value })} style={{ display: "block", width: "100%", marginTop: 2 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              Vast budget weekendplaats (per groep) — Tito/Keti/Aspi
              <input type="number" step="1" min="0" value={tarieven.weekendplaatsVast} onChange={(e) => setTarieven({ ...tarieven, weekendplaatsVast: e.target.value })} style={{ display: "block", width: "100%", marginTop: 2 }} />
            </label>
          </div>
          <button className="btn-primary" onClick={tarievenOpslaan}>Tarieven opslaan</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Afdeling</th>
              <th style={{ textAlign: "right" }}>Leden</th>
              <th style={{ textAlign: "right" }}>Budget</th>
              <th style={{ textAlign: "right" }}>Uitgegeven</th>
              <th style={{ textAlign: "right" }}>Resterend</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {groepsbudgetten.map((g) => (
              <tr key={g.id}>
                <td>
                  <Link href={`/kampbudgetten/${g.id}`} style={{ fontWeight: 600, color: "var(--primary)" }}>{g.afdeling}</Link>
                  {AFDELINGEN_OUD.includes(g.afdeling) && <span className="subtle" style={{ fontSize: 10 }}> (+dropping/weekend)</span>}
                </td>
                <td style={{ textAlign: "right" }}>
                  {magBewerken ? (
                    <input type="number" step="1" min="0" defaultValue={g.aantalLeden} onBlur={(e) => aantalLedenBijwerken(g.id, e.target.value)} style={{ width: 60, textAlign: "right" }} />
                  ) : g.aantalLeden}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(g.totaalToegewezen)}</td>
                <td style={{ textAlign: "right" }}>{euro(g.uitgegeven)}</td>
                <td className={g.resterend < 0 ? "amount-neg" : ""} style={{ textAlign: "right", fontWeight: 700 }}>{euro(g.resterend)}</td>
                <td>
                  {budgetKleurEmoji(g.uitgegeven, g.totaalToegewezen)}{" "}
                  <span className={`badge ${g.statusBudget === "Overschreden" ? "badge-neutral amount-neg" : "badge-primary"}`}>{g.statusBudget}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={2}>Totaal</td>
              <td style={{ textAlign: "right" }}>{euro(totalen.toegewezen)}</td>
              <td style={{ textAlign: "right" }}>{euro(totalen.uitgegeven)}</td>
              <td className={totalen.resterend < 0 ? "amount-neg" : ""} style={{ textAlign: "right" }}>{euro(totalen.resterend)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
