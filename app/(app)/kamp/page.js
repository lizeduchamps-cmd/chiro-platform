"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SkeletonStatRow, SkeletonCard } from "@/components/Skeleton";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

export default function Kampdashboard() {
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [budgetten, setBudgetten] = useState(null);
  const [kosten, setKosten] = useState(null);
  const [wisselgeld, setWisselgeld] = useState([]);
  const [kalenderItems, setKalenderItems] = useState([]);

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/kampbudgetten?werkjaarId=${werkjaarId}`).then((r) => r.json()).then(setBudgetten);
    fetch(`/api/kampkosten?werkjaarId=${werkjaarId}`).then((r) => r.json()).then(setKosten);
    fetch(`/api/wisselgeld?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => setWisselgeld(d.wisselgeldAanvragen || []));
    fetch(`/api/kalender?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => setKalenderItems(d.kalenderItems || []));
  }, [werkjaarId]);

  if (loading || (werkjaarId && (!budgetten || !kosten))) {
    return (
      <div style={{ padding: 32, maxWidth: 1100 }}>
        <SkeletonStatRow count={3} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!werkjaarId) {
    return <div style={{ padding: 32 }}><p>Er is nog geen werkjaar aangemaakt — ga naar Kasboek om er één te starten.</p></div>;
  }

  const budgetTotalen = (budgetten.groepsbudgetten || []).reduce(
    (s, g) => ({ toegewezen: s.toegewezen + g.totaalToegewezen, uitgegeven: s.uitgegeven + g.uitgegeven }),
    { toegewezen: 0, uitgegeven: 0 }
  );
  const budgettenOverschreden = (budgetten.groepsbudgetten || []).filter((g) => g.statusBudget === "Overschreden");

  const vandaag = new Date().toISOString().slice(0, 10);
  const eerstvolgende = kalenderItems.filter((it) => !it.is_voltooid && it.datum_deadline >= vandaag).slice(0, 6);

  const wisselgeldOpen = wisselgeld.filter((w) => w.status === "Aangevraagd" || w.status === "Goedgekeurd");

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Kamp</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Overzicht van alles rond het kamp — budgetten, kosten, wisselgeld en wat eraan komt.
      </p>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <Link href="/kampbudgetten" className="stat" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          <div className="muted" style={{ fontSize: 12 }}>Kampbudgetten</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{euro(budgetTotalen.uitgegeven)} <span className="subtle" style={{ fontSize: 12, fontWeight: 400 }}>/ {euro(budgetTotalen.toegewezen)}</span></div>
          {budgettenOverschreden.length > 0 && <div className="amount-neg" style={{ fontSize: 11, marginTop: 4 }}>⚠️ {budgettenOverschreden.length} afdeling(en) overschreden</div>}
        </Link>
        <Link href="/kampkosten" className="stat" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          <div className="muted" style={{ fontSize: 12 }}>Kampkosten (netto)</div>
          <div className={kosten.balans.netto < 0 ? "amount-neg" : ""} style={{ fontSize: 20, fontWeight: 700 }}>{euro(kosten.balans.netto)}</div>
          <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>{euro(kosten.balans.totaalInkomsten)} inkomsten · {euro(kosten.balans.totaalUitgaven)} uitgaven</div>
        </Link>
        <Link href="/wisselgeld" className="stat" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          <div className="muted" style={{ fontSize: 12 }}>Wisselgeld</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{wisselgeldOpen.length} <span className="subtle" style={{ fontSize: 12, fontWeight: 400 }}>nog klaar te zetten</span></div>
          <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>{wisselgeld.length} aanvra(a)g(en) totaal</div>
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Eerstvolgend op de kalender</div>
          <Link href="/kalender" style={{ fontSize: 12 }}>Volledige kalender →</Link>
        </div>
        {eerstvolgende.length === 0 ? (
          <p className="muted" style={{ fontStyle: "italic", fontSize: 13 }}>Niets op til.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {eerstvolgende.map((it) => (
              <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{it.titel}</span>
                <span className="subtle">{it.datum_deadline}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-3">
        {(budgetten.groepsbudgetten || []).map((g) => (
          <div key={g.id} className="stat">
            <div className="muted" style={{ fontSize: 12 }}>{g.afdeling}</div>
            <div className={g.statusBudget === "Overschreden" ? "amount-neg" : ""} style={{ fontSize: 16, fontWeight: 700 }}>{euro(g.resterend)}</div>
            <div className="subtle" style={{ fontSize: 11 }}>resterend van {euro(g.totaalToegewezen)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
