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

function MaandGrafiek({ perMaand }) {
  const maanden = Object.keys(perMaand).sort();
  if (maanden.length === 0) return <p className="subtle" style={{ fontStyle: "italic" }}>Nog geen transacties dit werkjaar.</p>;

  const max = Math.max(1, ...maanden.map((m) => Math.max(perMaand[m].inkomsten, perMaand[m].uitgaven)));

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-end", height: 180, padding: "12px 4px", overflowX: "auto" }}>
      {maanden.map((m) => (
        <div key={m} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 130 }}>
            <div title={`Inkomsten: ${euro(perMaand[m].inkomsten)}`} style={{ width: 16, background: "#1b315c", height: `${(perMaand[m].inkomsten / max) * 130}px`, borderRadius: 3 }} />
            <div title={`Uitgaven: ${euro(perMaand[m].uitgaven)}`} style={{ width: 16, background: "#B3261E", height: `${(perMaand[m].uitgaven / max) * 130}px`, borderRadius: 3 }} />
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
  }, [werkjaarId]);

  // Aandachtspunten: een korte samenvatting van wat nog actie vraagt, zodat
  // je niet elke pagina apart moet afgaan om te zien wat er nog moet gebeuren.
  // Enkel voor wie mag bewerken — dit is geen info die een gewoon lid nodig heeft.
  useEffect(() => {
    if (!werkjaarId || !magBewerken) { setAandacht(null); return; }
    let actief = true;
    (async () => {
      const [fvMaandenData, evenementenData, transactiesData, groepsbudgettenData, wisselgeldData] = await Promise.all([
        fetch(`/api/fv/maanden?werkjaarId=${werkjaarId}`).then((r) => r.json()),
        fetch(`/api/evenementen?werkjaarId=${werkjaarId}`).then((r) => r.json()),
        fetch(`/api/transacties?werkjaarId=${werkjaarId}`).then((r) => r.json()),
        fetch(`/api/kampbudgetten?werkjaarId=${werkjaarId}`).then((r) => r.json()),
        fetch(`/api/wisselgeld?werkjaarId=${werkjaarId}`).then((r) => r.json()),
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

      if (actief) setAandacht({ fvOpenstaand, fvMaandLabel, evenementenTeVergoeden, kasboekOngecategoriseerd, budgettenOverschreden, wisselgeldNogKlaarzetten });
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

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Jaaroverzicht</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>
        Welkom, {session?.user?.name}. Voor de details kan je naar Kasboek of CSV Upload in de zijbalk.
      </p>

      {werkjaren.length === 0 ? (
        <p>Er is nog geen werkjaar aangemaakt — ga naar Kasboek om er één te starten.</p>
      ) : !data ? (
        <SkeletonStatRow count={3} />
      ) : (
        <>
          {aandacht && (aandacht.fvOpenstaand > 0 || aandacht.evenementenTeVergoeden > 0 || aandacht.kasboekOngecategoriseerd > 0 || aandacht.budgettenOverschreden > 0 || aandacht.wisselgeldNogKlaarzetten > 0) && (
            <div className="card" style={{ marginBottom: 24, borderColor: "var(--primary)" }}>
              <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Aandachtspunten</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {aandacht.fvOpenstaand > 0 && (
                  <Link href="/fv" style={{ display: "flex", justifyContent: "space-between", fontSize: 13, textDecoration: "none", color: "inherit" }}>
                    <span>⏳ {aandacht.fvOpenstaand} persoon/personen nog niet betaald op FV {aandacht.fvMaandLabel}</span>
                    <span className="muted">Bekijken →</span>
                  </Link>
                )}
                {aandacht.evenementenTeVergoeden > 0 && (
                  <Link href="/evenementen" style={{ display: "flex", justifyContent: "space-between", fontSize: 13, textDecoration: "none", color: "inherit" }}>
                    <span>💸 {aandacht.evenementenTeVergoeden} evenement-transactie(s) nog terug te betalen</span>
                    <span className="muted">Bekijken →</span>
                  </Link>
                )}
                {aandacht.kasboekOngecategoriseerd > 0 && (
                  <Link href="/kasboek" style={{ display: "flex", justifyContent: "space-between", fontSize: 13, textDecoration: "none", color: "inherit" }}>
                    <span>🏷️ {aandacht.kasboekOngecategoriseerd} kasboektransactie(s) zonder (duidelijke) categorie</span>
                    <span className="muted">Bekijken →</span>
                  </Link>
                )}
                {aandacht.budgettenOverschreden > 0 && (
                  <Link href="/kampbudgetten" style={{ display: "flex", justifyContent: "space-between", fontSize: 13, textDecoration: "none", color: "inherit" }}>
                    <span>⚠️ {aandacht.budgettenOverschreden} groepsbudget(ten) overschreden</span>
                    <span className="muted">Bekijken →</span>
                  </Link>
                )}
                {aandacht.wisselgeldNogKlaarzetten > 0 && (
                  <Link href="/wisselgeld" style={{ display: "flex", justifyContent: "space-between", fontSize: 13, textDecoration: "none", color: "inherit" }}>
                    <span>💶 {aandacht.wisselgeldNogKlaarzetten} wisselgeld-aanvra(a)g(en) nog klaar te zetten</span>
                    <span className="muted">Bekijken →</span>
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="stat">
              <div className="muted" style={{ fontSize: 12 }}>Totale inkomsten</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(data.totaalInkomsten)}</div>
              {data.vorigJaarTotalen && <div className="subtle" style={{ fontSize: 11 }}>Vorig jaar ({data.vorigJaarTotalen.naam}): {euro(data.vorigJaarTotalen.inkomsten)}</div>}
            </div>
            <div className="stat">
              <div className="muted" style={{ fontSize: 12 }}>Totale uitgaven</div>
              <div className="amount-neg" style={{ fontSize: 22, fontWeight: 700 }}>{euro(data.totaalUitgaven)}</div>
              {data.vorigJaarTotalen && <div className="subtle" style={{ fontSize: 11 }}>Vorig jaar ({data.vorigJaarTotalen.naam}): {euro(data.vorigJaarTotalen.uitgaven)}</div>}
            </div>
            <div className="stat-primary">
              <div style={{ fontSize: 12, opacity: 0.75 }}>Netto resultaat</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(data.netto)}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Inkomsten &amp; uitgaven per maand</div>
            <div className="muted" style={{ display: "flex", gap: 16, fontSize: 11, marginBottom: 4 }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#1b315c", borderRadius: 2, marginRight: 4 }}></span>Inkomsten</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#B3261E", borderRadius: 2, marginRight: 4 }}></span>Uitgaven</span>
            </div>
            <MaandGrafiek perMaand={data.perMaand} />
          </div>

          {evenementenWinst.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Afgeronde evenementen</div>
              <p className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
                Kassa-omzet en kosten/inkomsten die nog niet als kasboektransactie geboekt staan. Zodra dat wel zo is (bv. de bank-uitbetaling geïmporteerd en aan het evenement gekoppeld), zit dat al vervat in de totalen hierboven — dit kaartje telt dan niet nog eens mee.
              </p>
              <table>
                <tbody>
                  {evenementenWinst.map((e) => (
                    <tr key={e.id}>
                      <td style={{ border: "none", padding: "4px 0" }}>{e.naam}</td>
                      <td className="subtle" style={{ border: "none", padding: "4px 0" }}>{e.datum || ""}</td>
                      <td className={e.nettoWinst < 0 ? "amount-neg" : ""} style={{ border: "none", padding: "4px 0", textAlign: "right", fontWeight: 700 }}>
                        {euro(e.nettoWinst)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700 }}>
                    <td style={{ borderTop: "1px solid var(--border)", padding: "6px 0" }} colSpan={2}>Totaal</td>
                    <td style={{ borderTop: "1px solid var(--border)", padding: "6px 0", textAlign: "right" }}>
                      {euro(evenementenWinst.reduce((s, e) => s + e.nettoWinst, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Categorie</th>
                  <th style={{ textAlign: "right" }}>Inkomsten</th>
                  <th style={{ textAlign: "right" }}>Uitgaven</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.perCategorie).sort((a, b) => (b[1].uitgaven + b[1].inkomsten) - (a[1].uitgaven + a[1].inkomsten)).map(([naam, v]) => (
                  <tr key={naam}>
                    <td>{naam}</td>
                    <td style={{ textAlign: "right" }}>{v.inkomsten ? euro(v.inkomsten) : "-"}</td>
                    <td className="amount-neg" style={{ textAlign: "right" }}>{v.uitgaven ? euro(v.uitgaven) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
