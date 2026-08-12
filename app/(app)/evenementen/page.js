"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonTable } from "@/components/Skeleton";

const STATUS_LABEL = { gepland: "Gepland", lopend: "Lopend", afgerond: "Afgerond" };

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

function EvenementKaart({ e, magBewerken, onVerwijderen }) {
  const afgerond = e.status === "afgerond";
  const winst = e.nettoWinst >= 0;
  const vulling = e.totaalInkomsten > 0 ? Math.min(100, Math.round((e.totaalUitgaven / e.totaalInkomsten) * 100)) : 0;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <Link href={`/evenementen/${e.id}`} style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)", textDecoration: "none" }}>{e.naam}</Link>
          <div className="subtle" style={{ fontSize: 13 }}>{e.datum || "Geen datum"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="badge badge-neutral">{STATUS_LABEL[e.status] || e.status}</span>
          {magBewerken && <button className="btn-danger" onClick={() => onVerwijderen(e.id, e.naam)}>🗑️</button>}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="muted" style={{ fontSize: 14 }}>{afgerond ? (winst ? "Winst" : "Verlies") : "Voorlopig resultaat"}</div>
          <div className="money" style={{ fontSize: 26, fontWeight: 700, color: winst ? "var(--success-text)" : "var(--danger-deep)" }}>{euro(Math.abs(e.nettoWinst))}</div>
        </div>
        <Link href={`/evenementen/${e.id}`} className="link" style={{ fontSize: 15, fontWeight: 700, textDecoration: "none" }}>Bekijken →</Link>
      </div>

      <div className="progress-track"><div className={`progress-fill ${winst ? "" : "danger"}`} style={{ width: `${vulling}%` }} /></div>
      <div className="muted money" style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <div>In {euro(e.totaalInkomsten)}</div>
        <div>Uit {euro(e.totaalUitgaven)}</div>
      </div>
    </div>
  );
}

export default function Evenementen() {
  const { data: session } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [evenementen, setEvenementen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toonNieuw, setToonNieuw] = useState(false);
  const [nieuweNaam, setNieuweNaam] = useState("");
  const [nieuweDatum, setNieuweDatum] = useState("");

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      else setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/evenementen?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => { setEvenementen(d.evenementen || []); setLoading(false); });
  }, [werkjaarId]);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 900 }}>
        <SkeletonTable rows={4} cols={4} />
      </div>
    );
  }

  const aanmaken = async () => {
    if (!nieuweNaam.trim()) return toast.error("Vul een naam in, bv. 'Fuif 2026'.");
    const res = await fetch("/api/evenementen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam: nieuweNaam.trim(), datum: nieuweDatum || null, werkjaarId }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setEvenementen([data.evenement, ...evenementen]);
    setNieuweNaam("");
    setNieuweDatum("");
    setToonNieuw(false);
    toast.success(`Evenement "${data.evenement.naam}" aangemaakt`);
  };

  const verwijderen = async (id, naam) => {
    const ok = await confirm({
      title: "Evenement verwijderen",
      message: `Evenement "${naam}" en alle kassa's/transacties ervan verwijderen? Dit kan niet ongedaan gemaakt worden.`,
      danger: true,
      bevestigLabel: "Verwijderen",
    });
    if (!ok) return;
    await fetch(`/api/evenementen?id=${id}`, { method: "DELETE" });
    setEvenementen((prev) => prev.filter((e) => e.id !== id));
    toast.success(`Evenement "${naam}" verwijderd`);
  };

  const lopend = evenementen.filter((e) => e.status !== "afgerond");
  const afgesloten = evenementen.filter((e) => e.status === "afgerond");

  return (
    <div style={{ padding: 32, maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800 }}>Evenementen</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 15, marginBottom: 24 }}>
        Kassabeheer en winst/verliesbalans per evenement. Winst van afgeronde evenementen verschijnt automatisch op het Financieel dashboard.
      </p>

      {evenementen.length === 0 && (
        <p className="muted" style={{ fontStyle: "italic", marginBottom: 20 }}>Nog geen evenementen dit werkjaar.</p>
      )}

      {lopend.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Loopt nu</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {lopend.map((e) => <EvenementKaart key={e.id} e={e} magBewerken={magBewerken} onVerwijderen={verwijderen} />)}
          </div>
        </div>
      )}

      {afgesloten.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Afgesloten</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {afgesloten.map((e) => <EvenementKaart key={e.id} e={e} magBewerken={magBewerken} onVerwijderen={verwijderen} />)}
          </div>
        </div>
      )}

      {magBewerken && (
        toonNieuw ? (
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>Nieuw evenement</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input placeholder="Naam, bv. Fuif 2026" value={nieuweNaam} onChange={(e) => setNieuweNaam(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
              <input type="date" value={nieuweDatum} onChange={(e) => setNieuweDatum(e.target.value)} />
              <button className="btn-primary" onClick={aanmaken}>Aanmaken</button>
              <button onClick={() => setToonNieuw(false)}>Annuleren</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setToonNieuw(true)}
            style={{ width: "100%", background: "var(--surface)", border: "1.5px dashed var(--border-strong)", borderRadius: 18, padding: 16, textAlign: "center", fontSize: 15, fontWeight: 700, color: "var(--primary)" }}
          >
            + Nieuw evenement
          </button>
        )
      )}
    </div>
  );
}
