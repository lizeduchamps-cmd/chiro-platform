"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonStatRow, SkeletonCard } from "@/components/Skeleton";
import { AFDELINGEN_VOLGORDE } from "@/lib/kampAfdelingen";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const STATUSSEN = ["Gepland", "Te vergoeden", "Betaald", "Afgerond"];
const STATUS_BADGE = { Gepland: "badge-neutral", "Te vergoeden": "badge-warning", Betaald: "badge-success", Afgerond: "badge-neutral" };

const LEGE_TRANSACTIE = {
  datum: new Date().toISOString().slice(0, 10),
  omschrijving: "",
  typeGeldstroom: "uitgave",
  hoofdcategorie: "",
  bedrag: "",
};

function naarBewerkVeld(t) {
  return {
    datum: t.datum || "",
    omschrijving: t.omschrijving || "",
    typeGeldstroom: t.type_geldstroom || "uitgave",
    hoofdcategorie: t.hoofdcategorie || "",
    bedrag: t.bedrag ?? "",
    status: t.status || "Gepland",
    medewerkerUserId: t.medewerker_user_id || "",
    bewijsstukUrl: t.bewijsstuk_url || "",
  };
}

export default function Kampkosten() {
  const { data: session } = useSession();
  const toast = useToast();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [overzicht, setOverzicht] = useState(null);
  const [gebruikers, setGebruikers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nieuweTransactie, setNieuweTransactie] = useState(LEGE_TRANSACTIE);
  const [toonForm, setToonForm] = useState(false);
  const [bewerkId, setBewerkId] = useState(null);
  const [bewerkVeld, setBewerkVeld] = useState(null);

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  const laden = (id) => fetch(`/api/kampkosten?werkjaarId=${id}`).then((r) => r.json()).then(setOverzicht);

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      setLoading(false);
    });
    fetch("/api/gebruikers/lijst").then((r) => r.json()).then((d) => setGebruikers(d.users || []));
  }, []);

  useEffect(() => {
    if (!werkjaarId) return;
    laden(werkjaarId);
  }, [werkjaarId]);

  if (loading || (werkjaarId && !overzicht)) {
    return (
      <div style={{ padding: 32, maxWidth: 900 }}>
        <SkeletonStatRow count={3} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  const transactieToevoegen = async () => {
    const t = nieuweTransactie;
    if (!t.datum || !t.omschrijving || !t.bedrag) return toast.error("Vul minstens datum, omschrijving en bedrag in.");
    const res = await fetch("/api/kampkosten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, ...t, hoofdcategorie: t.hoofdcategorie || null }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweTransactie(LEGE_TRANSACTIE);
    laden(werkjaarId);
    toast.success("Transactie toegevoegd");
  };

  const transactieVerwijderen = (t) => {
    if (bewerkId === t.id) { setBewerkId(null); setBewerkVeld(null); }
    setOverzicht((prev) => ({ ...prev, transacties: prev.transacties.filter((x) => x.id !== t.id) }));
    toast.undoable({
      message: "Transactie verwijderd",
      onUndo: () => laden(werkjaarId),
      onCommit: async () => {
        await fetch(`/api/kampkosten?id=${t.id}`, { method: "DELETE" });
        laden(werkjaarId);
      },
    });
  };

  const rijOpenen = (t) => {
    if (!magBewerken) return;
    if (bewerkId === t.id) { setBewerkId(null); setBewerkVeld(null); return; }
    setBewerkId(t.id);
    setBewerkVeld(naarBewerkVeld(t));
  };

  const bewerkOpslaan = async () => {
    const v = bewerkVeld;
    if (!v.datum || !v.omschrijving || !v.bedrag) return toast.error("Vul minstens datum, omschrijving en bedrag in.");
    const res = await fetch("/api/kampkosten", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: bewerkId,
        datum: v.datum,
        omschrijving: v.omschrijving,
        typeGeldstroom: v.typeGeldstroom,
        hoofdcategorie: v.hoofdcategorie || null,
        bedrag: v.bedrag,
        status: v.status,
        medewerkerUserId: v.medewerkerUserId || null,
        bewijsstukUrl: v.bewijsstukUrl || null,
      }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setBewerkId(null);
    setBewerkVeld(null);
    laden(werkjaarId);
    toast.success("Transactie bijgewerkt");
  };

  const categorieToevoegen = async (zetIn) => {
    const naam = prompt("Naam van de nieuwe categorie:");
    if (!naam?.trim()) return;
    const res = await fetch("/api/kampkosten/categorieen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, naam: naam.trim() }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    zetIn(naam.trim());
    laden(werkjaarId);
    toast.success(`Categorie "${naam.trim()}" toegevoegd`);
  };

  if (!werkjaarId) {
    return (
      <div style={{ padding: 32 }}>
        <p>Er is nog geen werkjaar aangemaakt — ga naar Kasboek om er één te starten.</p>
      </div>
    );
  }

  const { categorieen, transacties, nogTerugTeBetalen, balans } = overzicht;
  const inHetGroen = balans.netto >= 0;

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800 }}>Kampkosten</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 15, marginBottom: 20 }}>
        Alles wat het kamp kost en opbrengt. Zet je bij een kost een afdeling als categorie, dan telt het bedrag mee in hun kampbudget.
      </p>

      <div className={`card card-lg ${inHetGroen ? "card-success" : "card-danger"}`} style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="muted" style={{ fontSize: 14 }}>Het kamp staat {inHetGroen ? "in het groen" : "in het rood"}</div>
        <div className="money" style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", color: inHetGroen ? "var(--success-text)" : "var(--danger-deep)" }}>{euro(Math.abs(balans.netto))}</div>
        <div className="muted money" style={{ fontSize: 14 }}>{euro(balans.totaalInkomsten)} binnengekomen, {euro(balans.totaalUitgaven)} uitgegeven.</div>
      </div>

      {nogTerugTeBetalen.length > 0 && (
        <div className="card card-warning" style={{ marginBottom: 20 }}>
          <span className="badge badge-warning" style={{ marginBottom: 10, display: "inline-block" }}>Nog terug te betalen</span>
          {nogTerugTeBetalen.map((r, i) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{r.wie?.naam || "-"}</div>
                <div className="subtle" style={{ fontSize: 13 }}>{r.omschrijving} · {r.wie?.iban || "IBAN onbekend"}</div>
              </div>
              <div className="money" style={{ fontWeight: 700, fontSize: 17 }}>{euro(r.bedrag)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div className="eyebrow">Transacties</div>
        {magBewerken && (
          <button onClick={() => setToonForm(!toonForm)}>{toonForm ? "Annuleren" : "+ Transactie toevoegen"}</button>
        )}
      </div>

      {toonForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="grid-3" style={{ marginBottom: 8 }}>
            <input type="date" value={nieuweTransactie.datum} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, datum: e.target.value })} />
            <input placeholder="Omschrijving" value={nieuweTransactie.omschrijving} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, omschrijving: e.target.value })} style={{ gridColumn: "span 2" }} />
            <select value={nieuweTransactie.typeGeldstroom} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, typeGeldstroom: e.target.value })}>
              <option value="uitgave">Uitgave</option>
              <option value="inkomst">Inkomst</option>
            </select>
            <div style={{ display: "flex", gap: 4 }}>
              <select value={nieuweTransactie.hoofdcategorie} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, hoofdcategorie: e.target.value })} style={{ flex: 1 }}>
                <option value="">Hoofdcategorie...</option>
                <optgroup label="Afdeling (telt mee voor kampbudget)">
                  {AFDELINGEN_VOLGORDE.map((a) => <option key={a} value={a}>{a}</option>)}
                </optgroup>
                <optgroup label="Algemeen">
                  {categorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                </optgroup>
              </select>
              <button type="button" onClick={() => categorieToevoegen((naam) => setNieuweTransactie((prev) => ({ ...prev, hoofdcategorie: naam })))} title="Nieuwe categorie">+</button>
            </div>
            <input type="number" step="0.01" placeholder="Bedrag" value={nieuweTransactie.bedrag} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, bedrag: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={transactieToevoegen}>Toevoegen</button>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {transacties.length === 0 && <p className="muted" style={{ padding: 24, textAlign: "center" }}>Nog geen transacties.</p>}
        {transacties.map((t, i) => {
          const open = bewerkId === t.id;
          return (
            <div key={t.id} style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: magBewerken ? "pointer" : "default" }} onClick={() => rijOpenen(t)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {t.omschrijving}
                    {t.bewijsstuk_url && <> · <a href={t.bewijsstuk_url} target="_blank" rel="noreferrer" className="link" onClick={(e) => e.stopPropagation()}>bonnetje</a></>}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{t.transactie_code} · {t.datum}{t.hoofdcategorie ? ` · ${t.hoofdcategorie}` : ""}</div>
                </div>
                <span className={`badge ${STATUS_BADGE[t.status] || "badge-neutral"}`}>{t.status}</span>
                <div className={`money ${t.type_geldstroom === "uitgave" ? "amount-neg" : ""}`} style={{ width: 90, textAlign: "right", fontWeight: 700, color: t.type_geldstroom !== "uitgave" ? "var(--success-text)" : undefined }}>
                  {t.type_geldstroom === "uitgave" ? "-" : "+"}{euro(t.bedrag)}
                </div>
                {magBewerken && (
                  <button className="btn-danger" onClick={(e) => { e.stopPropagation(); transactieVerwijderen(t); }}>🗑️</button>
                )}
              </div>
              {open && bewerkVeld && (
                <div style={{ padding: "0 18px 16px" }}>
                  <div className="grid-3" style={{ marginBottom: 8 }}>
                    <input type="date" value={bewerkVeld.datum} onChange={(e) => setBewerkVeld({ ...bewerkVeld, datum: e.target.value })} />
                    <input placeholder="Omschrijving" value={bewerkVeld.omschrijving} onChange={(e) => setBewerkVeld({ ...bewerkVeld, omschrijving: e.target.value })} style={{ gridColumn: "span 2" }} />
                    <select value={bewerkVeld.typeGeldstroom} onChange={(e) => setBewerkVeld({ ...bewerkVeld, typeGeldstroom: e.target.value })}>
                      <option value="uitgave">Uitgave</option>
                      <option value="inkomst">Inkomst</option>
                    </select>
                    <div style={{ display: "flex", gap: 4 }}>
                      <select value={bewerkVeld.hoofdcategorie} onChange={(e) => setBewerkVeld({ ...bewerkVeld, hoofdcategorie: e.target.value })} style={{ flex: 1 }}>
                        <option value="">Hoofdcategorie...</option>
                        {categorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                      </select>
                      <button type="button" onClick={() => categorieToevoegen((naam) => setBewerkVeld((prev) => ({ ...prev, hoofdcategorie: naam })))} title="Nieuwe categorie">+</button>
                    </div>
                    <input type="number" step="0.01" placeholder="Bedrag" value={bewerkVeld.bedrag} onChange={(e) => setBewerkVeld({ ...bewerkVeld, bedrag: e.target.value })} />
                    <select value={bewerkVeld.status} onChange={(e) => setBewerkVeld({ ...bewerkVeld, status: e.target.value })}>
                      {STATUSSEN.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={bewerkVeld.medewerkerUserId} onChange={(e) => setBewerkVeld({ ...bewerkVeld, medewerkerUserId: e.target.value })}>
                      <option value="">Voorgeschoten door (optioneel)...</option>
                      {gebruikers.map((g) => <option key={g.id} value={g.id}>{g.naam}</option>)}
                    </select>
                    <input placeholder="Link naar bonnetje/factuur" value={bewerkVeld.bewijsstukUrl} onChange={(e) => setBewerkVeld({ ...bewerkVeld, bewijsstukUrl: e.target.value })} style={{ gridColumn: "span 2" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" onClick={bewerkOpslaan}>Opslaan</button>
                    <button onClick={() => { setBewerkId(null); setBewerkVeld(null); }}>Annuleren</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
