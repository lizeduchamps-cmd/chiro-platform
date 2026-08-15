"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonStatRow, SkeletonTable } from "@/components/Skeleton";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const LEGE_NIEUW = {
  rekeningType: "zicht",
  datum: new Date().toISOString().slice(0, 10),
  soort: "uitgave",
  tegenpartij: "",
  vrijeMededeling: "",
  omschrijving: "",
  bedrag: "",
  categorieId: "",
  interneBestemmingRekening: "spaar",
  evenementId: "",
};

export default function Kasboek() {
  const { data: session } = useSession();
  const toast = useToast();
  const confirm = useConfirm();

  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [categorieen, setCategorieen] = useState([]);
  const [evenementen, setEvenementen] = useState([]);
  const [transacties, setTransacties] = useState([]);
  const [saldos, setSaldos] = useState(null);
  const [zoekterm, setZoekterm] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [alleenOngecategoriseerd, setAlleenOngecategoriseerd] = useState(false);
  const [alleenNietZeker, setAlleenNietZeker] = useState(false);
  const [geselecteerd, setGeselecteerd] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toonNieuwForm, setToonNieuwForm] = useState(false);
  const [bewerkId, setBewerkId] = useState(null);
  const [nieuw, setNieuw] = useState(LEGE_NIEUW);

  const magBewerken = session?.user?.platformRecht === "admin" || session?.user?.platformRecht === "financieel_verantwoordelijke";

  // Basisdata laden: werkjaren + categorieën
  useEffect(() => {
    Promise.all([
      fetch("/api/werkjaren").then((r) => r.json()),
      fetch("/api/categorieen").then((r) => r.json()),
    ]).then(([wj, cat]) => {
      if (wj.werkjaren?.length) {
        setWerkjaren(wj.werkjaren);
        setWerkjaarId(wj.werkjaren[0].id);
      } else {
        setError("Er is nog geen werkjaar aangemaakt. Maak eerst een werkjaar aan.");
      }
      if (cat.categorieen) setCategorieen(cat.categorieen);
      setLoading(false);
    });
  }, []);

  // Transacties + saldos laden zodra het werkjaar bekend is (of wijzigt)
  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/transacties?werkjaarId=${werkjaarId}`)
      .then((r) => r.json())
      .then((data) => setTransacties(data.transacties || []));
    fetch(`/api/saldos?werkjaarId=${werkjaarId}`)
      .then((r) => r.json())
      .then((data) => setSaldos(data.saldos));
    fetch(`/api/evenementen?werkjaarId=${werkjaarId}`)
      .then((r) => r.json())
      .then((data) => setEvenementen(data.evenementen || []));
  }, [werkjaarId]);

  // Selectie leegmaken zodra het werkjaar of de filters wijzigen, zodat je nooit
  // per ongeluk een verborgen (niet meer zichtbare) transactie meeverwijdert.
  useEffect(() => {
    setGeselecteerd(new Set());
  }, [werkjaarId, zoekterm, filterCat, alleenOngecategoriseerd, alleenNietZeker]);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 1100 }}>
        <SkeletonStatRow count={3} />
        <SkeletonTable rows={6} cols={7} />
      </div>
    );
  }

  const herladen = () => {
    fetch(`/api/transacties?werkjaarId=${werkjaarId}`)
      .then((r) => r.json())
      .then((data) => setTransacties(data.transacties || []));
    fetch(`/api/saldos?werkjaarId=${werkjaarId}`)
      .then((r) => r.json())
      .then((data) => setSaldos(data.saldos));
  };

  const nieuwWerkjaar = async () => {
    const suggestie = (() => {
      const jaren = werkjaren.map((w) => parseInt(w.naam.split("-")[0])).filter((n) => !isNaN(n));
      const maxJaar = jaren.length ? Math.max(...jaren) : new Date().getFullYear();
      return `${maxJaar + 1}-${maxJaar + 2}`;
    })();
    const naam = prompt("Nieuw werkjaar (formaat JJJJ-JJJJ):", suggestie);
    if (!naam) return;
    const overnemen = werkjaarId && (await confirm({ message: "Eindsaldo van het huidige werkjaar overnemen als startsaldo?", bevestigLabel: "Overnemen" }));
    const res = await fetch("/api/werkjaren", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam, overnemenVanWerkjaarId: overnemen ? werkjaarId : null }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setWerkjaren([data.werkjaar, ...werkjaren]);
    setWerkjaarId(data.werkjaar.id);
    toast.success(`Werkjaar "${naam}" aangemaakt`);
  };

  const werkjaarVerwijderen = async () => {
    const huidig = werkjaren.find((w) => w.id === werkjaarId);
    if (!huidig) return;
    const bevestiging = prompt(
      `Dit verwijdert werkjaar "${huidig.naam}" volledig, inclusief alle transacties en financiële verslagen van dat jaar. Dit kan niet ongedaan gemaakt worden.\n\nTyp "${huidig.naam}" om te bevestigen:`
    );
    if (bevestiging !== huidig.naam) {
      if (bevestiging !== null) toast.error("Naam kwam niet overeen, er is niets verwijderd.");
      return;
    }
    const res = await fetch(`/api/werkjaren?id=${werkjaarId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    const overgebleven = werkjaren.filter((w) => w.id !== werkjaarId);
    setWerkjaren(overgebleven);
    setWerkjaarId(overgebleven[0]?.id || null);
    if (overgebleven.length === 0) setError("Er is nog geen werkjaar aangemaakt. Maak eerst een werkjaar aan.");
    toast.success(`Werkjaar "${huidig.naam}" verwijderd`);
  };

  const nieuweCategorie = async () => {
    const naam = prompt("Naam van de nieuwe categorie:");
    if (!naam) return;
    const res = await fetch("/api/categorieen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setCategorieen([...categorieen, data.categorie].sort((a, b) => a.naam.localeCompare(b.naam)));
    toast.success(`Categorie "${naam}" toegevoegd`);
  };

  const wijzigStartsaldo = async (type, huidig) => {
    const nieuwSaldo = prompt(`Nieuw startsaldo voor ${type === "zicht" ? "zichtrekening" : "spaarrekening"}:`, huidig);
    if (nieuwSaldo === null) return;
    await fetch("/api/rekeningen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, type, startsaldo: parseFloat(nieuwSaldo) || 0 }),
    });
    herladen();
  };

  const updateCategorie = async (id, categorieId) => {
    setTransacties((prev) => prev.map((t) => (t.id === id ? { ...t, categorie_id: categorieId } : t)));
    await fetch("/api/transacties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, categorieId: categorieId || null }),
    });
    // De categoriewijziging kan een automatische evenement-koppeling triggeren
    // (zie backend) — herladen zodat die meteen zichtbaar is.
    herladen();
  };

  // Koppelt (of ontkoppelt) een kasboektransactie aan een evenement — zo telt
  // die euro mee in de balans van dat evenement zonder ze nog eens apart in
  // te geven, en blijft het kasboek de enige echte bron voor het bedrag zelf.
  const updateEvenement = async (id, evenementId) => {
    setTransacties((prev) => prev.map((t) => (t.id === id ? { ...t, evenement_id: evenementId } : t)));
    await fetch("/api/transacties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, evenementId: evenementId || null }),
    });
  };

  const verwijderTx = (t) => {
    if (bewerkId === t.id) setBewerkId(null);
    setTransacties((prev) => prev.filter((x) => x.id !== t.id));
    setGeselecteerd((prev) => {
      const next = new Set(prev);
      next.delete(t.id);
      return next;
    });
    toast.undoable({
      message: "Transactie verwijderd",
      onUndo: herladen,
      onCommit: async () => {
        await fetch(`/api/transacties?id=${t.id}`, { method: "DELETE" });
        herladen();
      },
    });
  };

  const toggleSelectie = (id) => {
    setGeselecteerd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectieAlles = () => {
    setGeselecteerd((prev) =>
      prev.size === gefilterd.length ? new Set() : new Set(gefilterd.map((t) => t.id))
    );
  };

  const verwijderGeselecteerd = () => {
    const aantal = geselecteerd.size;
    if (!aantal) return;
    const ids = [...geselecteerd];
    setTransacties((prev) => prev.filter((t) => !geselecteerd.has(t.id)));
    setGeselecteerd(new Set());
    toast.undoable({
      message: `${aantal} transactie${aantal > 1 ? "s" : ""} verwijderd`,
      onUndo: herladen,
      onCommit: async () => {
        const res = await fetch("/api/transacties/bulk", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const data = await res.json();
        if (data.error) toast.error(data.error);
        herladen();
      },
    });
  };

  const opslaanNieuw = async () => {
    if (!nieuw.bedrag) return toast.error("Vul een bedrag in.");
    const res = await fetch("/api/transacties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, ...nieuw, categorieId: nieuw.categorieId || null }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuw(LEGE_NIEUW);
    setToonNieuwForm(false);
    herladen();
    toast.success("Transactie toegevoegd");
  };

  const ongecategoriseerd = transacties.filter((t) => !t.categorie_id);
  const nietZeker = transacties.filter((t) => t.categorie_zekerheid === "waarschijnlijk" || t.categorie_zekerheid === "onzeker");

  const basislijst = alleenOngecategoriseerd ? ongecategoriseerd : alleenNietZeker ? nietZeker : transacties;
  const gefilterd = basislijst.filter((t) => {
    const term = zoekterm.toLowerCase();
    const matchZoek =
      !term ||
      t.tegenpartij?.toLowerCase().includes(term) ||
      t.vrije_mededeling?.toLowerCase().includes(term) ||
      t.omschrijving?.toLowerCase().includes(term) ||
      String(t.bedrag).includes(term) ||
      t.datum.includes(term);
    const matchCat = !filterCat || t.categorie_id === filterCat;
    return matchZoek && matchCat;
  });

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <p className="amount-neg" style={{ marginBottom: 16 }}>{error}</p>
        <button className="btn-primary" onClick={nieuwWerkjaar}>+ Werkjaar aanmaken</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800 }}>Kasboek</h1>
          <p className="muted" style={{ fontSize: 15, marginTop: 6 }}>Alles wat op de rekening van de Chiro binnenkomt en buitengaat.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
          {magBewerken && (
            <button onClick={nieuwWerkjaar} title="Nieuw werkjaar">+ Werkjaar</button>
          )}
          {magBewerken && werkjaarId && (
            <button className="btn-danger" onClick={werkjaarVerwijderen} title="Werkjaar verwijderen">🗑️</button>
          )}
          <Link href="/kasboek/upload" className="btn-primary" style={{ display: "inline-block", textDecoration: "none" }}>
            Bankuittreksel importeren
          </Link>
        </div>
      </div>

      {saldos && (
        <div className="grid-3" style={{ marginBottom: 24 }}>
          <div className="stat-primary">
            <div style={{ fontSize: 13, opacity: 0.75 }}>Totaal lopend saldo</div>
            <div className="money" style={{ fontSize: 26, fontWeight: 700 }}>{euro(saldos.totaal)}</div>
          </div>
          <div className="stat">
            <div className="muted" style={{ fontSize: 13 }}>Algemene zichtrekening</div>
            <div className="money" style={{ fontSize: 26, fontWeight: 700 }}>{euro(saldos.zichtLopend)}</div>
            <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
              Startsaldo: {euro(saldos.zichtStart)}{" "}
              {magBewerken && <a href="#" className="link" onClick={(e) => { e.preventDefault(); wijzigStartsaldo("zicht", saldos.zichtStart); }}>wijzig</a>}
            </div>
          </div>
          <div className="stat">
            <div className="muted" style={{ fontSize: 13 }}>Spaarrekening</div>
            <div className="money" style={{ fontSize: 26, fontWeight: 700 }}>{euro(saldos.spaarLopend)}</div>
            <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
              Startsaldo: {euro(saldos.spaarStart)}{" "}
              {magBewerken && <a href="#" className="link" onClick={(e) => { e.preventDefault(); wijzigStartsaldo("spaar", saldos.spaarStart); }}>wijzig</a>}
            </div>
          </div>
        </div>
      )}

      {ongecategoriseerd.length > 0 && (
        <div className="card card-warning" style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="badge badge-warning" style={{ alignSelf: "flex-start" }}>Nog na te kijken</span>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{ongecategoriseerd.length} regel{ongecategoriseerd.length > 1 ? "s hebben" : " heeft"} nog geen duidelijke categorie</div>
          <p className="muted" style={{ fontSize: 13 }}>Duid aan waarvoor die betaling was, dan kloppen de cijfers op het dashboard.</p>
          <button onClick={() => setAlleenOngecategoriseerd((v) => !v)} style={{ alignSelf: "flex-start" }}>
            {alleenOngecategoriseerd ? "✕ Toon alle regels" : "Toon enkel deze regels"}
          </button>
        </div>
      )}

      {nietZeker.length > 0 && (
        <div className="card card-warning" style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="badge badge-warning" style={{ alignSelf: "flex-start" }}>Niet helemaal zeker</span>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{nietZeker.length} transactie{nietZeker.length > 1 ? "s zijn" : " is"} niet helemaal zeker gecategoriseerd</div>
          <p className="muted" style={{ fontSize: 13 }}>Automatisch toegewezen op basis van een zwakke of gedeeltelijke match — controleer of de categorie klopt.</p>
          <button onClick={() => setAlleenNietZeker((v) => !v)} style={{ alignSelf: "flex-start" }}>
            {alleenNietZeker ? "✕ Toon alle regels" : "Toon enkel deze regels"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Zoek op naam, mededeling, bedrag, datum..."
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Alle categorieën</option>
          {categorieen.map((c) => <option key={c.id} value={c.id}>{c.naam}</option>)}
        </select>
        {magBewerken && (
          <>
            <button onClick={() => setToonNieuwForm((v) => !v)}>{toonNieuwForm ? "Annuleren" : "+ Handmatig toevoegen"}</button>
            <button onClick={nieuweCategorie}>+ Categorie</button>
          </>
        )}
      </div>

      {magBewerken && toonNieuwForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>Nieuwe transactie</div>
          <div className="grid-4" style={{ marginBottom: 8 }}>
            <select value={nieuw.rekeningType} onChange={(e) => setNieuw({ ...nieuw, rekeningType: e.target.value })}>
              <option value="zicht">Algemene zichtrekening</option>
              <option value="spaar">Spaarrekening</option>
            </select>
            <select value={nieuw.soort} onChange={(e) => setNieuw({ ...nieuw, soort: e.target.value })}>
              <option value="uitgave">Uitgave</option>
              <option value="inkomst">Inkomst</option>
              <option value="interne_transactie">Interne transactie</option>
            </select>
            {nieuw.soort === "interne_transactie" && (
              <select value={nieuw.interneBestemmingRekening} onChange={(e) => setNieuw({ ...nieuw, interneBestemmingRekening: e.target.value })}>
                <option value="spaar">Naar spaarrekening</option>
                <option value="zicht">Naar zichtrekening</option>
              </select>
            )}
            <input type="date" value={nieuw.datum} onChange={(e) => setNieuw({ ...nieuw, datum: e.target.value })} />
          </div>
          <div className="grid-4" style={{ marginBottom: 8 }}>
            <input placeholder="Tegenpartij / naam" value={nieuw.tegenpartij} onChange={(e) => setNieuw({ ...nieuw, tegenpartij: e.target.value })} />
            <input placeholder="Vrije mededeling" value={nieuw.vrijeMededeling} onChange={(e) => setNieuw({ ...nieuw, vrijeMededeling: e.target.value })} />
            <select value={nieuw.categorieId} onChange={(e) => setNieuw({ ...nieuw, categorieId: e.target.value })}>
              <option value="">Categorie...</option>
              {categorieen.map((c) => <option key={c.id} value={c.id}>{c.naam}</option>)}
            </select>
            <input type="number" step="0.01" placeholder="Bedrag" value={nieuw.bedrag} onChange={(e) => setNieuw({ ...nieuw, bedrag: e.target.value })} />
            {evenementen.length > 0 && (
              <select value={nieuw.evenementId} onChange={(e) => setNieuw({ ...nieuw, evenementId: e.target.value })}>
                <option value="">Evenement (optioneel)...</option>
                {evenementen.map((e) => <option key={e.id} value={e.id}>{e.naam}</option>)}
              </select>
            )}
          </div>
          <button className="btn-primary" onClick={opslaanNieuw}>Opslaan</button>
        </div>
      )}

      {magBewerken && geselecteerd.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--primary-tint)", borderRadius: 12, padding: "10px 16px", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{geselecteerd.size} transactie{geselecteerd.size > 1 ? "s" : ""} geselecteerd</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setGeselecteerd(new Set())}>Selectie opheffen</button>
            <button className="btn-danger-solid" onClick={verwijderGeselecteerd}>🗑️ Verwijder geselecteerde</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div className="eyebrow">{alleenOngecategoriseerd ? "Nog aan te duiden" : alleenNietZeker ? "Niet helemaal zeker" : "Alle regels"} · {gefilterd.length}</div>
        {magBewerken && gefilterd.length > 0 && (
          <button className="btn-plain" onClick={toggleSelectieAlles} style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            {geselecteerd.size === gefilterd.length ? "☑" : "☐"} Alles selecteren
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {gefilterd.length === 0 && (
          <p className="muted" style={{ padding: 24, textAlign: "center" }}>Geen transacties gevonden.</p>
        )}
        {gefilterd.map((t, i) => {
          const teken = t.soort === "uitgave" ? -1 : t.soort === "interne_transactie" ? 0 : 1;
          const open = bewerkId === t.id;
          return (
            <div key={t.id} style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", background: geselecteerd.has(t.id) ? "var(--primary-tint)" : undefined }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                {magBewerken && (
                  <input type="checkbox" checked={geselecteerd.has(t.id)} onChange={() => toggleSelectie(t.id)} />
                )}
                <div className="money muted" style={{ width: 60, fontSize: 13, flexShrink: 0 }}>
                  {new Date(t.datum + "T00:00:00").toLocaleDateString("nl-BE", { day: "numeric", month: "short" })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{t.tegenpartij || t.omschrijving || "-"}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t.vrije_mededeling || "Geen mededeling"}
                    {t.rekening_type === "spaar" && " · Spaar"}
                    {t.soort === "interne_transactie" && ` → ${t.interne_bestemming_rekening === "zicht" ? "Zicht" : "Spaar"}`}
                  </div>
                </div>
                {!t.categorie_id ? (
                  <span className="badge badge-warning" style={{ whiteSpace: "nowrap" }}>Nog aanduiden</span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="badge badge-neutral" style={{ whiteSpace: "nowrap" }}>{t.categorieen?.naam || "-"}</span>
                    {t.categorie_zekerheid === "waarschijnlijk" && <span className="badge badge-warning" style={{ whiteSpace: "nowrap" }}>Waarschijnlijk</span>}
                    {t.categorie_zekerheid === "onzeker" && <span className="badge badge-danger" style={{ whiteSpace: "nowrap" }}>Onzeker</span>}
                  </span>
                )}
                <div className={`money ${teken < 0 ? "amount-neg" : ""}`} style={{ width: 100, textAlign: "right", fontWeight: 700, fontSize: 15, color: teken > 0 ? "var(--success-text)" : undefined }}>
                  {teken === 0 ? "" : teken > 0 ? "+" : "-"}{euro(t.bedrag)}
                </div>
                {magBewerken && (
                  <button className="btn-plain link" style={{ fontSize: 14, whiteSpace: "nowrap" }} onClick={() => setBewerkId(open ? null : t.id)}>
                    {open ? "Sluiten" : "Wijzig"}
                  </button>
                )}
              </div>
              {open && (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-end", padding: "0 18px 18px", marginLeft: magBewerken ? 34 : 0, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                    Categorie
                    <select value={t.categorie_id || ""} onChange={(e) => updateCategorie(t.id, e.target.value)}>
                      <option value="">-</option>
                      {categorieen.map((c) => <option key={c.id} value={c.id}>{c.naam}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                    Hoort bij evenement
                    <select value={t.evenement_id || ""} onChange={(e) => updateEvenement(t.id, e.target.value)}>
                      <option value="">Geen</option>
                      {evenementen.map((e) => <option key={e.id} value={e.id}>{e.naam}</option>)}
                    </select>
                  </label>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="subtle" style={{ fontSize: 12 }}>{t.rekening_type === "zicht" ? "Zichtrekening" : "Spaarrekening"} · {t.datum}</span>
                    <button className="btn-danger-solid" onClick={() => verwijderTx(t)}>Verwijderen</button>
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
