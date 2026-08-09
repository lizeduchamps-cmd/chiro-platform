"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonTable } from "@/components/Skeleton";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const AFDELINGEN_MET_KAMPGELD = ["Tito", "Keti", "Aspi"];

export default function Kampbudgetten() {
  const { data: session } = useSession();
  const toast = useToast();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [groepsbudgetten, setGroepsbudgetten] = useState([]);
  const [loading, setLoading] = useState(true);

  const magBewerkenAfdeling = (afdeling) =>
    ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht) || session?.user?.groep === afdeling;

  const laden = (id) =>
    fetch(`/api/kampbudgetten?werkjaarId=${id}`).then((r) => r.json()).then((d) => setGroepsbudgetten(d.groepsbudgetten || []));

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
        <SkeletonTable rows={7} cols={7} />
      </div>
    );
  }

  const veldBijwerken = async (id, veld, waarde) => {
    setGroepsbudgetten((prev) => prev.map((g) => (g.id === id ? { ...g, [veld]: waarde } : g)));
    const res = await fetch("/api/kampbudgetten", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [veld]: waarde }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    laden(werkjaarId);
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
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Kampbudgetten</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Budget per afdeling voor het winkelen in juli, en dropping/weekend voor Tito, Keti en Aspi — berekend op basis van het aantal leden. Klik op een afdeling voor de uitgaven in detail.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Afdeling</th>
              <th style={{ textAlign: "right" }}>Leden</th>
              <th style={{ textAlign: "right" }}>€/lid winkelen</th>
              <th style={{ textAlign: "right" }}>€/lid dropping</th>
              <th style={{ textAlign: "right" }}>€/lid weekend</th>
              <th style={{ textAlign: "right" }}>Budget</th>
              <th style={{ textAlign: "right" }}>Uitgegeven</th>
              <th style={{ textAlign: "right" }}>Resterend</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {groepsbudgetten.map((g) => {
              const bewerkbaar = magBewerkenAfdeling(g.afdeling);
              const kampgeld = AFDELINGEN_MET_KAMPGELD.includes(g.afdeling);
              return (
                <tr key={g.id}>
                  <td>
                    <Link href={`/kampbudgetten/${g.id}`} style={{ fontWeight: 600, color: "var(--primary)" }}>{g.afdeling}</Link>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {bewerkbaar ? (
                      <input type="number" step="1" min="0" defaultValue={g.aantalLeden} onBlur={(e) => veldBijwerken(g.id, "aantalLeden", e.target.value)} style={{ width: 60, textAlign: "right" }} />
                    ) : g.aantalLeden}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {bewerkbaar ? (
                      <input type="number" step="0.5" min="0" defaultValue={g.budgetPerLidWinkelen} onBlur={(e) => veldBijwerken(g.id, "budgetPerLidWinkelen", e.target.value)} style={{ width: 70, textAlign: "right" }} />
                    ) : euro(g.budgetPerLidWinkelen)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {!kampgeld ? "-" : bewerkbaar ? (
                      <input type="number" step="0.5" min="0" defaultValue={g.budgetPerLidDropping} onBlur={(e) => veldBijwerken(g.id, "budgetPerLidDropping", e.target.value)} style={{ width: 70, textAlign: "right" }} />
                    ) : euro(g.budgetPerLidDropping)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {!kampgeld ? "-" : bewerkbaar ? (
                      <input type="number" step="0.5" min="0" defaultValue={g.budgetPerLidWeekend} onBlur={(e) => veldBijwerken(g.id, "budgetPerLidWeekend", e.target.value)} style={{ width: 70, textAlign: "right" }} />
                    ) : euro(g.budgetPerLidWeekend)}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(g.totaalToegewezen)}</td>
                  <td style={{ textAlign: "right" }}>
                    {euro(g.uitgegeven)}
                    {g.wachtOpGoedkeuring > 0 && <div className="subtle" style={{ fontSize: 10 }}>+{euro(g.wachtOpGoedkeuring)} in afwachting</div>}
                  </td>
                  <td className={g.resterend < 0 ? "amount-neg" : ""} style={{ textAlign: "right", fontWeight: 700 }}>{euro(g.resterend)}</td>
                  <td><span className={`badge ${g.statusBudget === "Overschreden" ? "badge-neutral amount-neg" : "badge-primary"}`}>{g.statusBudget}</span></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={5}>Totaal</td>
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
