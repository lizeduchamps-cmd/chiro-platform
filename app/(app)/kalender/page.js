"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonCard } from "@/components/Skeleton";

const MAAND_NAMEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const DAG_NAMEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const TYPES = ["Jaarlijks Actiepunt", "Voorschot Deadline", "Factuur Vervaldatum"];

// Wisselgeld-aanvragen en FV-betaaldeadlines zijn "virtueel": ze staan niet
// zelf in kalender_items maar worden live opgehaald uit hun eigen tabel (zie
// /api/kalender) — dus geen toggle/verwijder-knop, klik linkt gewoon door.
function itemKleur(type) {
  if (type === "Wisselgeld Deadline") return { bg: "var(--primary-tint)", fg: "var(--primary)" };
  if (type === "FV Betaaldeadline") return { bg: "var(--warning-tint)", fg: "var(--warning-text)" };
  if (type === "Evenement") return { bg: "var(--success-tint)", fg: "var(--success-text)" };
  if (type === "Jaarlijks Actiepunt") return { bg: "var(--bg)", fg: "var(--text-muted)" };
  return { bg: "var(--danger-tint)", fg: "var(--danger)" }; // Voorschot Deadline / Factuur Vervaldatum
}

function toDatumString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Bouwt de volledige rasterweken voor een maand (start op maandag), inclusief
// de laatste/eerste dagen van de vorige/volgende maand die nodig zijn om de
// weken vol te maken.
function maandRaster(jaar, maandIndex) {
  const eersteDag = new Date(jaar, maandIndex, 1);
  const startOffset = (eersteDag.getDay() + 6) % 7; // 0 = maandag
  const start = new Date(jaar, maandIndex, 1 - startOffset);
  const dagen = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dagen.push(d);
  }
  return dagen;
}

const LEEG_ITEM = { titel: "", type: "Jaarlijks Actiepunt", datumDeadline: "", toegewezenAan: "" };

export default function Kalender() {
  const { data: session } = useSession();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [huidigeMaand, setHuidigeMaand] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [toonForm, setToonForm] = useState(false);
  const [nieuwItem, setNieuwItem] = useState(LEEG_ITEM);

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  const laden = (id) => fetch(`/api/kalender?werkjaarId=${id}`).then((r) => r.json()).then((d) => setItems(d.kalenderItems || []));

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
        <SkeletonCard lines={6} />
      </div>
    );
  }

  const itemsPerDag = {};
  items.forEach((it) => { (itemsPerDag[it.datum_deadline] = itemsPerDag[it.datum_deadline] || []).push(it); });

  const maandWisselen = (delta) => {
    setHuidigeMaand((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const itemToevoegen = async () => {
    if (!nieuwItem.titel || !nieuwItem.datumDeadline) return toast.error("Vul minstens titel en datum in.");
    const res = await fetch("/api/kalender", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, ...nieuwItem }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuwItem(LEEG_ITEM);
    setToonForm(false);
    laden(werkjaarId);
    toast.success("Item toegevoegd aan de kalender");
  };

  const itemKlikken = (item) => {
    if (item.virtueel) { router.push(item.link); return; }
    if (!magBewerken) return;
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, is_voltooid: !it.is_voltooid } : it)));
    fetch("/api/kalender", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, isVoltooid: !item.is_voltooid }),
    });
  };

  const itemVerwijderen = async (item) => {
    const ok = await confirm({ title: "Item verwijderen", message: `"${item.titel}" van de kalender verwijderen?`, danger: true, bevestigLabel: "Verwijderen" });
    if (!ok) return;
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    await fetch(`/api/kalender?id=${item.id}`, { method: "DELETE" });
    toast.success("Item verwijderd");
  };

  const dagen = maandRaster(huidigeMaand.getFullYear(), huidigeMaand.getMonth());
  const vandaag = toDatumString(new Date());

  return (
    <div style={{ padding: 32, maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Kalender</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {werkjaren.length > 0 && (
            <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
              {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
            </select>
          )}
          {magBewerken && (
            <button className="btn-primary" onClick={() => setToonForm(!toonForm)}>{toonForm ? "Annuleren" : "+ Item toevoegen"}</button>
          )}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Deadlines en actiepunten — FV-betaaldeadlines en alle wisselgeld-aanvragen (ook afgelopen) verschijnen hier automatisch, zodat je altijd ziet wat eraan komt en wat er al geweest is.
      </p>

      {toonForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Nieuw kalenderitem</div>
          <div className="grid-3" style={{ marginBottom: 8 }}>
            <input placeholder="Titel, bv. Waarborg kampplaats storten" value={nieuwItem.titel} onChange={(e) => setNieuwItem({ ...nieuwItem, titel: e.target.value })} style={{ gridColumn: "span 2" }} />
            <input type="date" value={nieuwItem.datumDeadline} onChange={(e) => setNieuwItem({ ...nieuwItem, datumDeadline: e.target.value })} />
            <select value={nieuwItem.type} onChange={(e) => setNieuwItem({ ...nieuwItem, type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="Toegewezen aan (optioneel), bv. Penningmeester" value={nieuwItem.toegewezenAan} onChange={(e) => setNieuwItem({ ...nieuwItem, toegewezenAan: e.target.value })} style={{ gridColumn: "span 2" }} />
          </div>
          <button className="btn-primary" onClick={itemToevoegen}>Toevoegen</button>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => maandWisselen(-1)}>← Vorige</button>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{MAAND_NAMEN[huidigeMaand.getMonth()]} {huidigeMaand.getFullYear()}</div>
        <button onClick={() => maandWisselen(1)}>Volgende →</button>
      </div>

      <div className="table-wrap" style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", minWidth: 840 }}>
          {DAG_NAMEN.map((d) => (
            <div key={d} className="muted" style={{ padding: 8, fontSize: 11, fontWeight: 600, textAlign: "center", borderBottom: "1px solid var(--border)" }}>{d}</div>
          ))}
          {dagen.map((dag) => {
            const key = toDatumString(dag);
            const buitenMaand = dag.getMonth() !== huidigeMaand.getMonth();
            const dagItems = itemsPerDag[key] || [];
            return (
              <div
                key={key}
                style={{
                  minHeight: 92, padding: 6, borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
                  background: buitenMaand ? "var(--surface-alt)" : key === vandaag ? "var(--primary-tint)" : "var(--surface)",
                }}
              >
                <div className={buitenMaand ? "subtle" : "muted"} style={{ fontSize: 11, fontWeight: key === vandaag ? 700 : 400, marginBottom: 4 }}>{dag.getDate()}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {dagItems.map((it) => {
                    const kleur = itemKleur(it.type);
                    return (
                      <div
                        key={it.id}
                        onClick={() => itemKlikken(it)}
                        title={it.virtueel ? "Klik om te bekijken" : it.toegewezen_aan ? `Toegewezen aan: ${it.toegewezen_aan}` : it.type}
                        style={{
                          fontSize: 10, padding: "2px 5px", borderRadius: 5, cursor: it.virtueel || magBewerken ? "pointer" : "default",
                          background: it.is_voltooid ? "var(--bg)" : kleur.bg,
                          color: it.is_voltooid ? "var(--text-subtle)" : kleur.fg,
                          textDecoration: it.is_voltooid ? "line-through" : "none",
                          display: "flex", justifyContent: "space-between", gap: 4,
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.titel}</span>
                        {magBewerken && !it.virtueel && (
                          <span onClick={(e) => { e.stopPropagation(); itemVerwijderen(it); }} style={{ flexShrink: 0 }}>✕</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
