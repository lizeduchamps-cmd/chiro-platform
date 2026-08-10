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
      <div style={{ padding: 32, maxWidth: 1100 }}>
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

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Kampkosten</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Kosten en inkomsten van het kamp. Kies bij "Hoofdcategorie" een afdeling (Sloebers t.e.m. Aspi) en het bedrag telt automatisch mee in hun kampbudget — kies een algemene categorie voor kosten die niet bij één afdeling horen (leiding, tenten, kampplaats, keuken, ...).
      </p>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="muted" style={{ fontSize: 12 }}>Totale inkomsten</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(balans.totaalInkomsten)}</div>
        </div>
        <div className="stat">
          <div className="muted" style={{ fontSize: 12 }}>Totale uitgaven</div>
          <div className="amount-neg" style={{ fontSize: 22, fontWeight: 700 }}>{euro(balans.totaalUitgaven)}</div>
        </div>
        <div className="stat-primary">
          <div style={{ fontSize: 12, opacity: 0.75 }}>{balans.netto < 0 ? "Netto verlies" : "Netto resultaat"}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(Math.abs(balans.netto))}</div>
        </div>
      </div>

      {nogTerugTeBetalen.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Nog terug te betalen</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wie</th>
                  <th>Omschrijving</th>
                  <th>IBAN</th>
                  <th style={{ textAlign: "right" }}>Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {nogTerugTeBetalen.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.wie?.naam || "-"}</td>
                    <td className="muted">{r.omschrijving}</td>
                    <td className="subtle">{r.wie?.iban || "⚠️ onbekend"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(r.bedrag)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Transacties</div>
          {magBewerken && (
            <button onClick={() => setToonForm(!toonForm)} style={{ fontSize: 12 }}>{toonForm ? "Annuleren" : "+ Transactie toevoegen"}</button>
          )}
        </div>

        {toonForm && (
          <div style={{ background: "var(--primary-tint)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
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
                <button type="button" onClick={() => categorieToevoegen((naam) => setNieuweTransactie((prev) => ({ ...prev, hoofdcategorie: naam })))} title="Nieuwe categorie" style={{ padding: "0 10px" }}>+</button>
              </div>
              <input type="number" step="0.01" placeholder="Bedrag" value={nieuweTransactie.bedrag} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, bedrag: e.target.value })} />
            </div>
            <button className="btn-primary" onClick={transactieToevoegen}>Toevoegen</button>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Datum</th>
                <th>Omschrijving</th>
                <th>Categorie</th>
                <th style={{ textAlign: "right" }}>Bedrag</th>
                <th>Status</th>
                {magBewerken && <th></th>}
              </tr>
            </thead>
            <tbody>
              {transacties.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", border: "none", padding: 16 }}>Nog geen transacties.</td></tr>
              )}
              {transacties.map((t) => (
                <>
                  <tr key={t.id} onClick={() => rijOpenen(t)} style={{ cursor: magBewerken ? "pointer" : "default", background: bewerkId === t.id ? "var(--primary-tint)" : undefined }}>
                    <td className="subtle" style={{ whiteSpace: "nowrap" }}>{t.transactie_code}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{t.datum}</td>
                    <td>
                      {t.omschrijving}
                      {t.bewijsstuk_url && <> · <a href={t.bewijsstuk_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>bonnetje</a></>}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{t.hoofdcategorie || "-"}</td>
                    <td className={t.type_geldstroom === "uitgave" ? "amount-neg" : ""} style={{ textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {t.type_geldstroom === "uitgave" ? "-" : "+"}{euro(t.bedrag)}
                    </td>
                    <td><span className="badge badge-neutral">{t.status}</span></td>
                    {magBewerken && (
                      <td><button className="btn-danger" onClick={(e) => { e.stopPropagation(); transactieVerwijderen(t); }}>🗑️</button></td>
                    )}
                  </tr>
                  {bewerkId === t.id && bewerkVeld && (
                    <tr>
                      <td colSpan={magBewerken ? 7 : 6} style={{ background: "var(--primary-tint)", padding: 12 }}>
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
                            <button type="button" onClick={() => categorieToevoegen((naam) => setBewerkVeld((prev) => ({ ...prev, hoofdcategorie: naam })))} title="Nieuwe categorie" style={{ padding: "0 10px" }}>+</button>
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
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
