"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SkeletonStatRow, SkeletonCard } from "@/components/Skeleton";
import { isFinancieel } from "@/lib/permissies";
import { evenementMatchTag } from "@/lib/evenementMatch";

function maandLabel(maand) {
  const namen = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const [j, m] = maand.split("-");
  return `${namen[parseInt(m, 10) - 1]} ${j}`;
}

const ONBEKENDE_CATEGORIE = "Onduidelijk/Nog in te vullen";
const BRON_LABEL = { streepjes_bot: "Streepjes", bestelling: "Bestellingen", kilometers: "Kilometers", handmatig: "Handmatig" };

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

function daagVerschil(datum) {
  const ms = new Date(datum + "T00:00:00") - new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
  return Math.round(ms / 86400000);
}

function PijlIcoon({ richting }) {
  return richting === "in" ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
  );
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

function ChecklistKaart({ eerstvolgende }) {
  if (eerstvolgende.length === 0) return null;
  return (
    <div className="checklist-card" style={{ marginBottom: 24 }}>
      <h3>Eerstvolgend op de kalender</h3>
      {eerstvolgende.map((it) => {
        const dagen = daagVerschil(it.datum_deadline);
        return (
          <div key={it.id} className="check-item">
            <div className="check-tick" />
            <div style={{ flex: 1 }}>{it.titel}</div>
            <span style={{ fontSize: 12, opacity: 0.8 }}>{dagen <= 0 ? "vandaag" : dagen === 1 ? "morgen" : `over ${dagen}d`}</span>
          </div>
        );
      })}
      <Link href="/kalender" style={{ display: "block", marginTop: 8, fontSize: 12, fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}>
        Volledige kalender →
      </Link>
    </div>
  );
}

const SNELKOPPELINGEN = [
  { href: "/kasboek", label: "Kasboek toevoegen", icoon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg> },
  { href: "/fv", label: "Financieel verslag", icoon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="16" rx="3" /><path d="M9 9h6M9 12.5h6M9 16h3.5" /></svg> },
  { href: "/streepjes", label: "Streepjes", icoon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 6v12M11 6v12M15 6v12" /><path d="M5 8l14 6" /></svg> },
  { href: "/evenementen", label: "Evenementen", icoon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-7.2 7-12a7 7 0 10-14 0c0 4.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.4" /></svg> },
];

export default function Overzicht() {
  const { data: session } = useSession();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [data, setData] = useState(null);
  const [kalenderItems, setKalenderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aandacht, setAandacht] = useState(null);
  const [kampEvenementId, setKampEvenementId] = useState(null);
  const [recenteTransacties, setRecenteTransacties] = useState([]);
  const [eigenFv, setEigenFv] = useState(undefined);
  const [eigenEvenementen, setEigenEvenementen] = useState([]);
  const [eigenWisselgeld, setEigenWisselgeld] = useState([]);

  const financieel = isFinancieel(session);
  const userId = session?.user?.userId;

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/jaaroverzicht?werkjaarId=${werkjaarId}`).then((r) => r.json()).then(setData);
    fetch(`/api/kalender?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => setKalenderItems(d.kalenderItems || []));
  }, [werkjaarId]);

  // Financieel verantwoordelijke: aandachtspunten + recente kasboekactiviteit —
  // details die een gewoon lid niet nodig heeft.
  useEffect(() => {
    if (!werkjaarId || !financieel) { setAandacht(null); setRecenteTransacties([]); return; }
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
      if (!actief) return;

      setRecenteTransacties((transactiesData.transacties || []).filter((t) => t.soort !== "interne_transactie").slice(0, 4));

      let fvOpenstaand = 0;
      let fvMaandLabel = "";
      const laatsteMaand = fvMaandenData.fvMaanden?.[0];
      if (laatsteMaand) {
        const fvOverzicht = await fetch(`/api/fv/overzicht?fvMaandId=${laatsteMaand.id}`).then((r) => r.json());
        fvOpenstaand = (fvOverzicht.personen || []).filter((p) => p.status !== "betaald" && p.totaal > 0).length;
        fvMaandLabel = maandLabel(laatsteMaand.maand);
      }

      // Kamp is gewoon een evenement (heeft_groepsbudgetten) — nodig om de
      // aandachtspunten hieronder rechtstreeks naar zijn tabbladen te linken
      // i.p.v. naar de (niet meer bestaande) losse Kampbudgetten/Kampkosten-pagina's.
      setKampEvenementId((evenementenData.evenementen || []).find((e) => e.heeft_groepsbudgetten)?.id || null);

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
  }, [werkjaarId, financieel]);

  // Andere leiding: hun eigen FV-saldo, hun evenementen/uitstappen, hun wisselgeld.
  useEffect(() => {
    if (!werkjaarId || financieel || !userId) return;
    let actief = true;
    (async () => {
      const [fvMaandenData, evenementenData, wisselgeldData] = await Promise.all([
        fetch(`/api/fv/maanden?werkjaarId=${werkjaarId}`).then((r) => r.json()),
        fetch(`/api/evenementen?werkjaarId=${werkjaarId}`).then((r) => r.json()),
        fetch(`/api/wisselgeld?werkjaarId=${werkjaarId}`).then((r) => r.json()),
      ]);
      if (!actief) return;

      const laatsteMaand = fvMaandenData.fvMaanden?.[0];
      if (laatsteMaand) {
        const fvOverzicht = await fetch(`/api/fv/overzicht?fvMaandId=${laatsteMaand.id}`).then((r) => r.json());
        const eigen = (fvOverzicht.personen || []).find((p) => p.user.id === userId);
        if (actief) setEigenFv(eigen ? { ...eigen, maandLabel: maandLabel(laatsteMaand.maand) } : null);
      } else if (actief) setEigenFv(null);

      const tags = session?.user?.verantwoordelijkheden || [];
      setEigenEvenementen((evenementenData.evenementen || []).filter((e) => evenementMatchTag(tags, e.naam)));

      setEigenWisselgeld((wisselgeldData.wisselgeldAanvragen || []).filter((w) => w.aanvrager_user_id === userId));
    })();
    return () => { actief = false; };
  }, [werkjaarId, financieel, userId, session]);

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
    aandacht.budgettenOverschreden > 0 && { href: kampEvenementId ? `/evenementen/${kampEvenementId}?tab=groepsbudgetten` : "/evenementen", kleur: "danger", titel: `${aandacht.budgettenOverschreden} groepsbudget(ten) overschreden` },
    aandacht.evenementenTeVergoeden > 0 && { href: "/evenementen", kleur: "warning", titel: `${aandacht.evenementenTeVergoeden} evenement-transactie(s) nog terug te betalen` },
    aandacht.kampkostenTeVergoeden > 0 && { href: kampEvenementId ? `/evenementen/${kampEvenementId}?tab=kostenoverzicht` : "/evenementen", kleur: "warning", titel: `${aandacht.kampkostenTeVergoeden} kampkosten-transactie(s) nog terug te betalen` },
    aandacht.kasboekOngecategoriseerd > 0 && { href: "/kasboek", kleur: "warning", titel: `${aandacht.kasboekOngecategoriseerd} kasboektransactie(s) zonder duidelijke categorie` },
    aandacht.wisselgeldNogKlaarzetten > 0 && { href: "/wisselgeld", kleur: "primary", titel: `${aandacht.wisselgeldNogKlaarzetten} wisselgeld-aanvra(a)g(en) nog klaar te zetten` },
  ].filter(Boolean) : [];

  const vandaag = new Date().toISOString().slice(0, 10);
  const eerstvolgende = kalenderItems.filter((it) => !it.is_voltooid && it.datum_deadline >= vandaag).slice(0, 5);
  const huidigeMaand = vandaag.slice(0, 7);
  const dezeMaand = data?.perMaand?.[huidigeMaand] || { inkomsten: 0, uitgaven: 0 };
  const grootsteCategorieen = data ? Object.entries(data.perCategorie).map(([naam, v]) => ({ naam, totaal: v.inkomsten + v.uitgaven })).sort((a, b) => b.totaal - a.totaal).slice(0, 4) : [];
  const maxCategorie = Math.max(1, ...grootsteCategorieen.map((c) => c.totaal));

  return (
    <div style={{ padding: 32, maxWidth: 700 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="muted" style={{ fontSize: 14, fontWeight: 600 }}>Hallo {session?.user?.name?.split(" ")[0]} 👋</div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Overzicht</h1>
        </div>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>

      {werkjaren.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>Er is nog geen werkjaar aangemaakt — ga naar Kasboek om er één te starten.</p>
      ) : !data ? (
        <SkeletonStatRow count={3} />
      ) : financieel ? (
        <>
          {aandachtRijen.length > 0 && (
            <div style={{ marginTop: 20, marginBottom: 20 }}>
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

          <div className="card" style={{ marginTop: 20, marginBottom: 20 }}>
            <div className="stat-hero">
              <div className="stat-label">Netto resultaat dit werkjaar</div>
              <div className="money stat-value">{euro(data.netto)}</div>
              {data.vorigJaarTotalen && <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>Vorig jaar ({data.vorigJaarTotalen.naam}): {euro(data.vorigJaarTotalen.inkomsten - data.vorigJaarTotalen.uitgaven)}</div>}
            </div>
            <div className="flow-row" style={{ marginTop: 16 }}>
              <div className="flow-pill in">
                <div className="flow-label">Inkomsten {maandLabel(huidigeMaand)}</div>
                <div className="money flow-value">+ {euro(dezeMaand.inkomsten)}</div>
              </div>
              <div className="flow-pill out">
                <div className="flow-label">Uitgaven {maandLabel(huidigeMaand)}</div>
                <div className="money flow-value">− {euro(dezeMaand.uitgaven)}</div>
              </div>
            </div>
          </div>

          <div className="quick-actions" style={{ marginBottom: 24 }}>
            {SNELKOPPELINGEN.map((a) => (
              <Link key={a.href} href={a.href} className="quick-action">
                <span className="quick-action-icon">{a.icoon}</span>
                <span className="quick-action-label">{a.label}</span>
              </Link>
            ))}
          </div>

          {grootsteCategorieen.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div className="eyebrow">Grootste categorieën</div>
                <Link href="/kasboek" className="link" style={{ fontSize: 12 }}>alles →</Link>
              </div>
              <div className="card">
                {grootsteCategorieen.map((c) => (
                  <div key={c.naam} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                      <span style={{ fontWeight: 700 }}>{c.naam}</span>
                      <span className="money muted">{euro(c.totaal)}</span>
                    </div>
                    <div className="progress-track"><div className="progress-fill accent" style={{ width: `${Math.round((c.totaal / maxCategorie) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recenteTransacties.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div className="eyebrow">Recente activiteit</div>
                <Link href="/kasboek" className="link" style={{ fontSize: 12 }}>kasboek →</Link>
              </div>
              <div className="card" style={{ padding: "4px 16px" }}>
                {recenteTransacties.map((t, i) => (
                  <div key={t.id} className="txn-row" style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
                    <span className={`txn-dot ${t.soort === "inkomst" ? "in" : "out"}`}><PijlIcoon richting={t.soort === "inkomst" ? "in" : "out"} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.omschrijving || t.tegenpartij || "Transactie"}</div>
                      <div className="subtle" style={{ fontSize: 11.5 }}>{new Date(t.datum).toLocaleDateString("nl-BE")} · {t.categorieen?.naam || "Onduidelijk"}</div>
                    </div>
                    <div className={`money ${t.soort === "inkomst" ? "" : "amount-neg"}`} style={{ fontSize: 13.5, fontWeight: 700 }}>
                      {t.soort === "inkomst" ? "+ " : "− "}{euro(t.bedrag)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ChecklistKaart eerstvolgende={eerstvolgende} />
        </>
      ) : (
        <>
          <div className="card" style={{ marginTop: 20, marginBottom: 20 }}>
            <div className="stat-hero">
              <div className="stat-label">{eigenFv ? `Jouw Financieel Verslag — ${eigenFv.maandLabel}` : "Jouw Financieel Verslag"}</div>
              <div className="money stat-value">{euro(eigenFv?.totaal || 0)}</div>
              {eigenFv && <span className={`badge ${eigenFv.status === "betaald" ? "badge-success" : "badge-warning"}`} style={{ marginTop: 8, display: "inline-block" }}>{eigenFv.status === "betaald" ? "Betaald" : "Openstaand"}</span>}
            </div>
            {eigenFv?.regels?.length > 0 && (
              <div className="grid-2" style={{ marginTop: 16 }}>
                {Object.entries(eigenFv.regels.reduce((acc, r) => { const k = BRON_LABEL[r.bron] || "Handmatig"; acc[k] = (acc[k] || 0) + Number(r.bedrag); return acc; }, {})).map(([soort, bedrag]) => (
                  <div key={soort} className="stat">
                    <div className="muted" style={{ fontSize: 13 }}>{soort}</div>
                    <div className="money" style={{ fontSize: 18, fontWeight: 700 }}>{euro(bedrag)}</div>
                  </div>
                ))}
              </div>
            )}
            {eigenFv === null && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Nog geen Financieel Verslag deze maand.</p>}
            <Link href="/fv" className="link" style={{ display: "block", marginTop: 14, fontSize: 13, fontWeight: 700 }}>Volledig verslag →</Link>
          </div>

          {eigenEvenementen.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Jouw evenementen &amp; uitstappen</div>
              <div className="card" style={{ padding: "4px 16px" }}>
                {eigenEvenementen.map((e, i) => (
                  <Link key={e.id} href={`/evenementen/${e.id}`} className="nav-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", textDecoration: "none", color: "inherit" }}>
                    <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{e.naam}</div>
                    <div className={`money ${e.nettoWinst < 0 ? "amount-neg" : ""}`} style={{ fontWeight: 700, fontSize: 13 }}>{euro(e.nettoWinst)}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {eigenWisselgeld.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Jouw wisselgeldaanvragen</div>
              <div className="card" style={{ padding: "4px 16px" }}>
                {eigenWisselgeld.map((w, i) => (
                  <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
                    <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{w.doel_activiteit || w.afdeling}</div>
                    <span className="badge badge-neutral">{w.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ChecklistKaart eerstvolgende={eerstvolgende} />
        </>
      )}
    </div>
  );
}
