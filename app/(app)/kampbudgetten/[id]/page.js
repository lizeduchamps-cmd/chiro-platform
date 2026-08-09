"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonStatRow, SkeletonCard } from "@/components/Skeleton";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const LEGE_UITGAVE = { datum: new Date().toISOString().slice(0, 10), omschrijving: "", bedrag: "", bewijsstukUrl: "" };

export default function KampbudgetDetail({ params }) {
  const { id } = params;
  const { data: session } = useSession();
  const toast = useToast();
  const [overzicht, setOverzicht] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nieuweUitgave, setNieuweUitgave] = useState(LEGE_UITGAVE);
  const [toonForm, setToonForm] = useState(false);

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

  const { groepsbudget, uitgaven, wisselgeldAanvragen, balans } = overzicht;
  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht) || session?.user?.groep === groepsbudget.afdeling;
  const isFinancien = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  const uitgaveToevoegen = async () => {
    if (!nieuweUitgave.datum || !nieuweUitgave.omschrijving || !nieuweUitgave.bedrag) return toast.error("Vul datum, omschrijving en bedrag in.");
    const res = await fetch("/api/kampbudgetten/uitgaven", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groepsbudgetId: id, ...nieuweUitgave }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweUitgave(LEGE_UITGAVE);
    laden();
    toast.success("Uitgave ingediend");
  };

  const uitgaveVerwijderen = (uitgave) => {
    setOverzicht((prev) => ({ ...prev, uitgaven: prev.uitgaven.filter((u) => u.id !== uitgave.id) }));
    toast.undoable({
      message: "Uitgave verwijderd",
      onUndo: laden,
      onCommit: async () => {
        await fetch(`/api/kampbudgetten/uitgaven?id=${uitgave.id}`, { method: "DELETE" });
        laden();
      },
    });
  };

  const statusWijzigen = async (uitgaveId, status) => {
    await fetch("/api/kampbudgetten/uitgaven", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: uitgaveId, status }),
    });
    laden();
    toast.success(status === "Goedgekeurd" ? "Uitgave goedgekeurd" : "Uitgave afgekeurd");
  };

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <p className="subtle" style={{ fontSize: 12, marginBottom: 4 }}><Link href="/kampbudgetten">← Kampbudgetten</Link></p>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>{groepsbudget.afdeling}</h1>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="muted" style={{ fontSize: 12 }}>Toegewezen budget</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(balans.totaalToegewezen)}</div>
          <div className="subtle" style={{ fontSize: 11 }}>{groepsbudget.aantal_leden} leden</div>
        </div>
        <div className="stat">
          <div className="muted" style={{ fontSize: 12 }}>Uitgegeven (goedgekeurd)</div>
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
          {magBewerken && (
            <button onClick={() => setToonForm(!toonForm)} style={{ fontSize: 12 }}>{toonForm ? "Annuleren" : "+ Uitgave toevoegen"}</button>
          )}
        </div>

        {toonForm && (
          <div style={{ background: "var(--primary-tint)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="grid-3" style={{ marginBottom: 8 }}>
              <input type="date" value={nieuweUitgave.datum} onChange={(e) => setNieuweUitgave({ ...nieuweUitgave, datum: e.target.value })} />
              <input placeholder="Omschrijving, bv. Colruyt winkelen" value={nieuweUitgave.omschrijving} onChange={(e) => setNieuweUitgave({ ...nieuweUitgave, omschrijving: e.target.value })} style={{ gridColumn: "span 2" }} />
              <input type="number" step="0.01" placeholder="Bedrag" value={nieuweUitgave.bedrag} onChange={(e) => setNieuweUitgave({ ...nieuweUitgave, bedrag: e.target.value })} />
              <input placeholder="Link naar bonnetje (optioneel)" value={nieuweUitgave.bewijsstukUrl} onChange={(e) => setNieuweUitgave({ ...nieuweUitgave, bewijsstukUrl: e.target.value })} style={{ gridColumn: "span 2" }} />
            </div>
            <button className="btn-primary" onClick={uitgaveToevoegen}>Indienen</button>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Omschrijving</th>
                <th style={{ textAlign: "right" }}>Bedrag</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {uitgaven.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", border: "none", padding: 16 }}>Nog geen uitgaven.</td></tr>
              )}
              {uitgaven.map((u) => (
                <tr key={u.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{u.datum}</td>
                  <td>
                    {u.omschrijving}
                    {u.users?.naam && <span className="subtle"> · {u.users.naam}</span>}
                    {u.bewijsstuk_url && <> · <a href={u.bewijsstuk_url} target="_blank" rel="noreferrer">bonnetje</a></>}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(u.bedrag)}</td>
                  <td>
                    <span className={`badge ${u.status === "Goedgekeurd" ? "badge-primary" : u.status === "Afgekeurd" ? "amount-neg" : "badge-neutral"}`}>{u.status}</span>
                  </td>
                  <td style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    {isFinancien && u.status === "Ingediend" && (
                      <>
                        <button onClick={() => statusWijzigen(u.id, "Goedgekeurd")} style={{ fontSize: 11 }}>✓</button>
                        <button onClick={() => statusWijzigen(u.id, "Afgekeurd")} style={{ fontSize: 11 }}>✕</button>
                      </>
                    )}
                    {magBewerken && <button className="btn-danger" onClick={() => uitgaveVerwijderen(u)} style={{ fontSize: 11 }}>🗑️</button>}
                  </td>
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
