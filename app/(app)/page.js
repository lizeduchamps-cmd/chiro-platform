"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SkeletonStatRow, SkeletonCard } from "@/components/Skeleton";

function maandLabel(maand) {
  const namen = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const [j, m] = maand.split("-");
  return `${namen[parseInt(m, 10) - 1]} ${j}`;
}

const ONBEKENDE_CATEGORIE = "Onduidelijk/Nog in te vullen";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

// Icoontje per aandachtspunt: rode stip = actie/fout, oranje = vraagt aandacht
// maar is geen probleem op zich, navy = neutrale actie (geen geld-oordeel).
function AandachtIcoon({ kleur }) {
  const tint = kleur === "danger" ? "var(--danger-tint)" : kleur === "warning" ? "var(--warning-tint)" : "var(--primary-tint)";
  const dot = kleur === "danger" ? "var(--danger)" : kleur === "warning" ? "var(--warning)" : "var(--primary)";
  return (
    <div style={{ width: 38, height: 38, borderRadius: 12, background: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{ width: 12, height: 12, borderRadius: 4, background: dot }} />
    </div>
  );
}

function AandachtRij({ href, kleur, titel, subtitel }) {
  return (
    <Link href={href} className="nav-row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 4px", textDecoration: "none", color: "inherit" }}>
      <AandachtIcoon kleur={kleur} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{titel}</div>
        {subtitel && <div className="muted" style={{ fontSize: 13 }}>{subtitel}</div>}
      </div>
      <div className="subtle" style={{ fontSize: 20 }}>›</div>
    </Link>
  );
}

function daagVerschil(datum) {
  const ms = new Date(datum + "T00:00:00") - new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
  return Math.round(ms / 86400000);
}

function MaandGrafiek({ perMaand }) {
  const maanden = Object.keys(perMaand).sort();
  if (maanden.length === 0) return <p className="subtle" style={{ fontStyle: "italic" }}>Nog geen transacties dit werkjaar.</p>;

  const max = Math.max(1, ...maanden.map((m) => Math.max(perMaand[m].inkomsten, perMaand[m].uitgaven)));

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-end", height: 180, padding: "12px 4px", overflowX: "auto" }}>
      {maanden.map((m) => (
        <div key={m} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 130 }}>
            <div title={`Inkomsten: ${euro(perMaand[m].inkomsten)}`} style={{ width: 16, background: "var(--primary)", height: `${(perMaand[m].inkomsten / max) * 130}px`, borderRadius: 4 }} />
            <div title={`Uitgaven: ${euro(perMaand[m].uitgaven)}`} style={{ width: 16, background: "var(--danger)", height: `${(perMaand[m].uitgaven / max) * 130}px`, borderRadius: 4 }} />
          </div>
          <div className="subtle" style={{ fontSize: 10, marginTop: 6 }}>{m.slice(5)}/{m.slice(2, 4)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Jaaroverzicht() {
  const { data: session } = useSession();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [data, setData] = useState(null);
  const [evenementenWinst, setEvenementenWinst] = useState([]);
  const [kalenderItems, setKalenderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aandacht, setAandacht] = useState(null);

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/jaaroverzicht?werkjaarId=${werkjaarId}`).then((r) => r.json()).then(setData);
    fetch(`/api/evenementen/afgerond?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => setEvenementenWinst(d.evenementen || []));
    fetch(`/api/kalender?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => setKalenderItems(d.kalenderItems || []));
  }, [werkjaarId]);

  // Aandachtspunten: een korte samenvatting van wat nog actie vraagt, zodat
  // je niet elke pagina apart moet afgaan om te zien wat er nog moet gebeuren.
  // Enkel voor wie mag bewerken — dit is geen info die een gewoon lid nodig heeft.
  useEffect(() => {
    if (!werkjaarId || !magBewerken) { setAandacht(null); return; }
    let actief = true;
    (async () => {
      const [fvMaandenData, evenementenData, transactiesData, groepsbudgettenData, wisselgeldData, kampkostenData] = await Promise.all([
        fetch(`/api/fv/maanden?werkjaarId=${werkjaarId}`).then((r) => r.json()),
        fetch(`/api/evenementen?werkjaarId=${werkjaarId}`).then((r) => r.json()),
        fetch(`/api/transacties?werkjaarId=${werkjaarId}`).then((r) => r.json()),
        fetch(`/api/kampbudgetten?werkjaarId=${werkjaarId}`).then((r) => r.json()),
        fetch(`/api/wisselgeld?werkjaarId=${werkjaarId}`).then((r) => r.json()),
        fetch(`/api/kampkosten?werkjaarId=${werkjaarId}`).then((r) => r.json()),
      ]);

      let fvOpenstaand = 0;
      let fvMaandLabel = "";
      const laatsteMaand = fvMaandenData.fvMaanden?.[0];
      if (laatsteMaand) {
        const fvOverzicht = await fetch(`/api/fv/overzicht?fvMaandId=${laatsteMaand.id}`).then((r) => r.json());
        fvOpenstaand = (fvOverzicht.personen || []).filter((p) => p.status !== "betaald" && p.totaal > 0).length;
        fvMaandLabel = maandLabel(laatsteMaand.maand);
      }

      const lopendeEvenementen = (evenementenData.evenementen || []).filter((e) => e.status !== "afgerond");
      const evenementOverzichten = await Promise.all(
        lopendeEvenementen.map((e) => fetch(`/api/evenementen/overzicht?evenementId=${e.id}`).then((r) => r.json()))
      );
      const evenementenTeVergoeden = evenementOverzichten.reduce((s, o) => s + (o.nogTerugTeBetalen?.length || 0), 0);

      const kasboekOngecategoriseerd = (transactiesData.transacties || []).filter(
        (t) => !t.categorie_id || t.categorieen?.naam === ONBEKENDE_CATEGORIE
      ).length;

      const budgettenOverschreden = (groepsbudgettenData.groepsbudgetten || []).filter((g) => g.statusBudget === "Overschreden").length;
      const wisselgeldNogKlaarzetten = (wisselgeldData.wisselgeldAanvragen || []).filter((w) => w.status === "Aangevraagd" || w.status === "Goedgekeurd").length;
      const kampkostenTeVergoeden = (kampkostenData.nogTerugTeBetalen || []).length;

      if (actief) setAandacht({ fvOpenstaand, fvMaandLabel, evenementenTeVergoeden, kasboekOngecategoriseerd, budgettenOverschreden, wisselgeldNogKlaarzetten, kampkostenTeVergoeden });
    })();
    return () => { actief = false; };
  }, [werkjaarId, magBewerken]);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 1100 }}>
        <SkeletonStatRow count={3} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  const aandachtRijen = aandacht ? [
    aandacht.fvOpenstaand > 0 && { href: "/fv", kleur: "danger", titel: `${aandacht.fvOpenstaand} persoon/personen nog niet betaald`, subtitel: `Financieel Verslag ${aandacht.fvMaandLabel}` },
    aandacht.budgettenOverschreden > 0 && { href: "/kampbudgetten", kleur: "danger", titel: `${aandacht.budgettenOverschreden} groepsbudget(ten) overschreden` },
    aandacht.evenementenTeVergoeden > 0 && { href: "/evenementen", kleur: "warning", titel: `${aandacht.evenementenTeVergoeden} evenement-transactie(s) nog terug te betalen` },
    aandacht.kampkostenTeVergoeden > 0 && { href: "/kampkosten", kleur: "warning", titel: `${aandacht.kampkostenTeVergoeden} kampkosten-transactie(s) nog terug te betalen` },
    aandacht.kasboekOngecategoriseerd > 0 && { href: "/kasboek", kleur: "warning", titel: `${aandacht.kasboekOngecategoriseerd} kasboektransactie(s) zonder duidelijke categorie` },
    aandacht.wisselgeldNogKlaarzetten > 0 && { href: "/wisselgeld", kleur: "primary", titel: `${aandacht.wisselgeldNogKlaarzetten} wisselgeld-aanvra(a)g(en) nog klaar te zetten` },
  ].filter(Boolean) : [];

  const vandaag = new Date().toISOString().slice(0, 10);
  const eerstvolgende = kalenderItems.filter((it) => !it.is_voltooid && it.datum_deadline >= vandaag).slice(0, 5);

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800 }}>Financieel dashboard</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 15, marginBottom: 24 }}>
        Welkom, {session?.user?.name}. Voor de details kan je naar Kasboek of CSV Upload in de zijbalk.
      </p>

      {werkjaren.length === 0 ? (
        <p>Er is nog geen werkjaar aangemaakt — ga naar Kasboek om er één te starten.</p>
      ) : !data ? (
        <SkeletonStatRow count={3} />
      ) : (
        <>
          {aandachtRijen.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Vraagt jouw aandacht</div>
              <div className="card" style={{ padding: "4px 16px" }}>
                {aandachtRijen.map((r, i) => (
                  <div key={r.href + r.titel} style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
                    <AandachtRij {...r} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {eerstvolgende.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div className="eyebrow">Eerstvolgend op de kalender</div>
                <Link href="/kalender" className="link" style={{ fontSize: 13 }}>Volledige kalender →</Link>
              </div>
              <div className="card" style={{ padding: "4px 16px" }}>
                {eerstvolgende.map((it, i) => {
                  const dagen = daagVerschil(it.datum_deadline);
                  return (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 99, background: "var(--primary)", flexShrink: 0 }} />
                      <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{it.titel}</div>
                      <span className="badge badge-primary money">{dagen <= 0 ? "vandaag" : dagen === 1 ? "morgen" : `over ${dagen} dagen`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="stat">
              <div className="muted" style={{ fontSize: 13 }}>Totale inkomsten</div>
              <div className="money" style={{ fontSize: 28, fontWeight: 700 }}>{euro(data.totaalInkomsten)}</div>
              {data.vorigJaarTotalen && <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>Vorig jaar ({data.vorigJaarTotalen.naam}): {euro(data.vorigJaarTotalen.inkomsten)}</div>}
            </div>
            <div className="stat">
              <div className="muted" style={{ fontSize: 13 }}>Totale uitgaven</div>
              <div className="money" style={{ fontSize: 28, fontWeight: 700, color: "var(--danger-deep)" }}>{euro(data.totaalUitgaven)}</div>
              {data.vorigJaarTotalen && <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>Vorig jaar ({data.vorigJaarTotalen.naam}): {euro(data.vorigJaarTotalen.uitgaven)}</div>}
            </div>
            <div className="stat-primary">
              <div style={{ fontSize: 13, opacity: 0.75 }}>Netto resultaat</div>
              <div className="money" style={{ fontSize: 28, fontWeight: 700 }}>{euro(data.netto)}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 15 }}>Inkomsten &amp; uitgaven per maand</div>
            <div className="muted" style={{ display: "flex", gap: 16, fontSize: 12, marginBottom: 4 }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--primary)", borderRadius: 3, marginRight: 4 }}></span>Inkomsten</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--danger)", borderRadius: 3, marginRight: 4 }}></span>Uitgaven</span>
            </div>
            <MaandGrafiek perMaand={data.perMaand} />
          </div>

          {evenementenWinst.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 15 }}>Afgeronde evenementen</div>
              <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Kassa-omzet en kosten/inkomsten die nog niet als kasboektransactie geboekt staan. Zodra dat wel zo is (bv. de bank-uitbetaling geïmporteerd en aan het evenement gekoppeld), zit dat al vervat in de totalen hierboven — dit kaartje telt dan niet nog eens mee.
              </p>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {evenementenWinst.map((e, i) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "9px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
                    <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{e.naam}</div>
                    <div className="subtle" style={{ fontSize: 12 }}>{e.datum || ""}</div>
                    <div className={`money ${e.nettoWinst < 0 ? "amount-neg" : ""}`} style={{ fontWeight: 700, minWidth: 90, textAlign: "right" }}>
                      {euro(e.nettoWinst)}
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "10px 0 0", borderTop: "1px solid var(--border)", fontWeight: 700 }}>
                  <div style={{ flex: 1 }}>Totaal</div>
                  <div className="money" style={{ minWidth: 90, textAlign: "right" }}>{euro(evenementenWinst.reduce((s, e) => s + e.nettoWinst, 0))}</div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
            <div className="eyebrow" style={{ flex: 1 }}>Per categorie</div>
            <div className="eyebrow" style={{ minWidth: 90, textAlign: "right" }}>Inkomsten</div>
            <div className="eyebrow" style={{ minWidth: 90, textAlign: "right" }}>Uitgaven</div>
          </div>
          <div className="card" style={{ padding: "4px 16px" }}>
            {Object.entries(data.perCategorie).sort((a, b) => (b[1].uitgaven + b[1].inkomsten) - (a[1].uitgaven + a[1].inkomsten)).map(([naam, v], i) => (
              <div key={naam} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{naam}</div>
                <div className="money" style={{ minWidth: 90, textAlign: "right", fontSize: 13 }}>{v.inkomsten ? euro(v.inkomsten) : "-"}</div>
                <div className="money amount-neg" style={{ minWidth: 90, textAlign: "right", fontSize: 13 }}>{v.uitgaven ? euro(v.uitgaven) : "-"}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
