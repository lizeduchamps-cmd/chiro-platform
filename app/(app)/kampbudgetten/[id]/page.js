"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SkeletonStatRow, SkeletonCard } from "@/components/Skeleton";
import { budgetKleurEmoji } from "@/lib/budgetKleur";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

export default function KampbudgetDetail({ params }) {
  const { id } = params;
  const { data: session } = useSession();
  const [overzicht, setOverzicht] = useState(null);
  const [loading, setLoading] = useState(true);

  const laden = () => fetch(`/api/kampbudgetten/overzicht?id=${id}`).then((r) => r.json()).then((d) => { setOverzicht(d); setLoading(false); });

  useEffect(() => { laden(); }, [id]);

  if (loading || !overzicht) {
    return (
      <div style={{ padding: 32, maxWidth: 1000 }}>
        <SkeletonStatRow count={3} />
        <SkeletonCard lines={3} />
      </div>
    );
  }
  if (overzicht.error) return <p className="amount-neg" style={{ padding: 32 }}>{overzicht.error}</p>;

  const { groepsbudget, transacties, wisselgeldAanvragen, balans } = overzicht;

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <p className="subtle" style={{ fontSize: 12, marginBottom: 4 }}><Link href="/kampbudgetten">← Kampbudgetten</Link></p>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>{groepsbudget.afdeling}</h1>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="muted" style={{ fontSize: 12 }}>Toegewezen budget</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {budgetKleurEmoji(balans.uitgegeven, balans.totaalToegewezen)} {euro(balans.totaalToegewezen)}
          </div>
          <div className="subtle" style={{ fontSize: 11 }}>{groepsbudget.aantal_leden} leden</div>
        </div>
        <div className="stat">
          <div className="muted" style={{ fontSize: 12 }}>Uitgegeven</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(balans.uitgegeven)}</div>
        </div>
        <div className={balans.statusBudget === "Overschreden" ? "stat" : "stat-primary"} style={balans.statusBudget === "Overschreden" ? { borderColor: "var(--danger)" } : undefined}>
          <div style={{ fontSize: 12, opacity: balans.statusBudget === "Overschreden" ? 1 : 0.75 }} className={balans.statusBudget === "Overschreden" ? "amount-neg" : ""}>
            {balans.statusBudget === "Overschreden" ? "⚠️ Overschreden" : "Resterend"}
          </div>
          <div className={balans.statusBudget === "Overschreden" ? "amount-neg" : ""} style={{ fontSize: 22, fontWeight: 700 }}>{euro(Math.abs(balans.resterend))}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Uitgaven</div>
          <Link href="/kampkosten" style={{ fontSize: 12 }}>+ Uitgave toevoegen bij Kampkosten →</Link>
        </div>
        <p className="subtle" style={{ fontSize: 11, marginBottom: 10 }}>
          Dit zijn alle Kampkosten-transacties met "{groepsbudget.afdeling}" als hoofdcategorie — bewerk of verwijder ze op de Kampkosten-pagina zelf.
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Datum</th>
                <th>Omschrijving</th>
                <th style={{ textAlign: "right" }}>Bedrag</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transacties.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", border: "none", padding: 16 }}>Nog geen uitgaven.</td></tr>
              )}
              {transacties.map((t) => (
                <tr key={t.id}>
                  <td className="subtle" style={{ whiteSpace: "nowrap" }}>{t.transactie_code}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{t.datum}</td>
                  <td>
                    {t.omschrijving}
                    {t.users?.naam && <span className="subtle"> · {t.users.naam}</span>}
                    {t.bewijsstuk_url && <> · <a href={t.bewijsstuk_url} target="_blank" rel="noreferrer">bonnetje</a></>}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(t.bedrag)}</td>
                  <td><span className="badge badge-neutral">{t.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Wisselgeld-aanvragen</div>
          <Link href="/wisselgeld" style={{ fontSize: 12 }}>Nieuwe aanvraag →</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Datum nodig</th>
                <th>Doel</th>
                <th style={{ textAlign: "right" }}>Bedrag</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {wisselgeldAanvragen.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", border: "none", padding: 16 }}>Nog geen aanvragen.</td></tr>
              )}
              {wisselgeldAanvragen.map((w) => (
                <tr key={w.id}>
                  <td className="subtle">{w.aanvraag_code}</td>
                  <td>{w.datum_nodig}</td>
                  <td className="muted">{w.doel_activiteit || "-"}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(w.bedrag_gevraagd)}</td>
                  <td><span className="badge badge-neutral">{w.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
