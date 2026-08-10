"use client";
import { useEffect, useState } from "react";
import { SkeletonCard } from "@/components/Skeleton";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const BRON_KLEUR = {
  FV: "badge-primary",
  Evenement: "badge-neutral",
  Kampkosten: "badge-neutral",
};

export default function Terugbetalingen() {
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [overzicht, setOverzicht] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/terugbetalingen/overzicht?werkjaarId=${werkjaarId}`).then((r) => r.json()).then(setOverzicht);
  }, [werkjaarId]);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 900 }}>
        <SkeletonCard lines={4} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Terugbetalingen</h1>
        {werkjaren.length > 1 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Alles wat de groep nog moet terugbetalen: FV met een openstaand negatief saldo, en Evenement-/Kampkosten-transacties met status "Te vergoeden".
      </p>

      {!overzicht ? (
        <SkeletonCard lines={4} />
      ) : overzicht.groepen.length === 0 ? (
        <p className="muted" style={{ fontStyle: "italic" }}>Niets openstaand — mooi zo.</p>
      ) : (
        <>
          <div className="stat-primary" style={{ marginBottom: 20, maxWidth: 260 }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Totaal nog terug te betalen</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(overzicht.totaal)}</div>
          </div>

          {overzicht.groepen.map((g) => (
            <div key={g.naam} className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{g.naam}</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{euro(g.totaal)}</div>
              </div>
              <div className="subtle" style={{ fontSize: 11, marginBottom: 10 }}>{g.iban || "⚠️ IBAN onbekend"}</div>
              <table>
                <tbody>
                  {g.items.map((item) => (
                    <tr key={item.id}>
                      <td style={{ border: "none", padding: "3px 4px 3px 0", width: 100 }}>
                        <span className={`badge ${BRON_KLEUR[item.bron] || "badge-neutral"}`} style={{ fontSize: 10 }}>{item.bron}</span>
                      </td>
                      <td className="muted" style={{ border: "none", padding: "3px 0" }}>
                        {item.omschrijving} {item.datum && <span className="subtle">· {item.datum}</span>}
                      </td>
                      <td style={{ border: "none", padding: "3px 0", textAlign: "right", fontWeight: 600, width: 100 }}>{euro(item.bedrag)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
