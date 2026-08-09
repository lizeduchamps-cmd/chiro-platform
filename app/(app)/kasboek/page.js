"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

export default function Kasboek() {
  const { data: session } = useSession();

  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [categorieen, setCategorieen] = useState([]);
  const [evenementen, setEvenementen] = useState([]);
  const [transacties, setTransacties] = useState([]);
  const [saldos, setSaldos] = useState(null);
  const [zoekterm, setZoekterm] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [geselecteerd, setGeselecteerd] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nieuw, setNieuw] = useState({
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
  });

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
  }, [werkjaarId, zoekterm, filterCat]);

  if (loading) return <p className="muted" style={{ padding: 32 }}>Laden…</p>;

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
    const overnemen = werkjaarId && confirm("Eindsaldo van het huidige werkjaar overnemen als startsaldo?");
    const res = await fetch("/api/werkjaren", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam, overnemenVanWerkjaarId: overnemen ? werkjaarId : null }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setWerkjaren([data.werkjaar, ...werkjaren]);
    setWerkjaarId(data.werkjaar.id);
  };

  const werkjaarVerwijderen = async () => {
    const huidig = werkjaren.find((w) => w.id === werkjaarId);
    if (!huidig) return;
    const bevestiging = prompt(
      `Dit verwijdert werkjaar "${huidig.naam}" volledig, inclusief alle transacties en financiële verslagen van dat jaar. Dit kan niet ongedaan gemaakt worden.\n\nTyp "${huidig.naam}" om te bevestigen:`
    );
    if (bevestiging !== huidig.naam) {
      if (bevestiging !== null) alert("Naam kwam niet overeen, er is niets verwijderd.");
      return;
    }
    const res = await fetch(`/api/werkjaren?id=${werkjaarId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    const overgebleven = werkjaren.filter((w) => w.id !== werkjaarId);
    setWerkjaren(overgebleven);
    setWerkjaarId(overgebleven[0]?.id || null);
    if (overgebleven.length === 0) setError("Er is nog geen werkjaar aangemaakt. Maak eerst een werkjaar aan.");
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
    if (data.error) return alert("⚠️ " + data.error);
    setCategorieen([...categorieen, data.categorie].sort((a, b) => a.naam.localeCompare(b.naam)));
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

  const verwijderTx = async (id) => {
    if (!confirm("Deze transactie verwijderen?")) return;
    await fetch(`/api/transacties?id=${id}`, { method: "DELETE" });
    setTransacties((prev) => prev.filter((t) => t.id !== id));
    setGeselecteerd((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    herladen();
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

  const verwijderGeselecteerd = async () => {
    const aantal = geselecteerd.size;
    if (!aantal) return;
    if (!confirm(`${aantal} transactie${aantal > 1 ? "s" : ""} verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return;
    const ids = [...geselecteerd];
    const res = await fetch("/api/transacties/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setTransacties((prev) => prev.filter((t) => !geselecteerd.has(t.id)));
    setGeselecteerd(new Set());
    herladen();
  };

  const opslaanNieuw = async () => {
    if (!nieuw.bedrag) return alert("Vul een bedrag in.");
    const res = await fetch("/api/transacties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, ...nieuw, categorieId: nieuw.categorieId || null }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setNieuw({ ...nieuw, tegenpartij: "", vrijeMededeling: "", omschrijving: "", bedrag: "" });
    herladen();
  };

  const gefilterd = transacties.filter((t) => {
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
        <button onClick={nieuwWerkjaar}>➕ Werkjaar aanmaken</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Werkjaar</label>
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => (
              <option key={w.id} value={w.id}>{w.naam}</option>
            ))}
          </select>
          {magBewerken && (
            <button onClick={nieuwWerkjaar} style={{ marginLeft: 8 }}>➕ Nieuw werkjaar</button>
          )}
          {magBewerken && werkjaarId && (
            <button className="btn-danger" onClick={werkjaarVerwijderen} style={{ marginLeft: 4 }} title="Werkjaar verwijderen">🗑️</button>
          )}
        </div>
        {magBewerken && <button onClick={nieuweCategorie}>+ Categorie</button>}
      </div>

      {saldos && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          <div className="stat">
            <div className="muted" style={{ fontSize: 12 }}>Algemene zichtrekening</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(saldos.zichtLopend)}</div>
            <div className="subtle" style={{ fontSize: 11 }}>
              Startsaldo: {euro(saldos.zichtStart)}{" "}
              {magBewerken && <a href="#" onClick={(e) => { e.preventDefault(); wijzigStartsaldo("zicht", saldos.zichtStart); }}>(wijzig)</a>}
            </div>
          </div>
          <div className="stat">
            <div className="muted" style={{ fontSize: 12 }}>Spaarrekening</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(saldos.spaarLopend)}</div>
            <div className="subtle" style={{ fontSize: 11 }}>
              Startsaldo: {euro(saldos.spaarStart)}{" "}
              {magBewerken && <a href="#" onClick={(e) => { e.preventDefault(); wijzigStartsaldo("spaar", saldos.spaarStart); }}>(wijzig)</a>}
            </div>
          </div>
          <div className="stat-primary">
            <div style={{ fontSize: 12, opacity: 0.75 }}>Totaal lopend saldo</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(saldos.totaal)}</div>
          </div>
        </div>
      )}

      {magBewerken && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Nieuwe transactie</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
            <input placeholder="Tegenpartij / naam" value={nieuw.tegenpartij} onChange={(e) => setNieuw({ ...nieuw, tegenpartij: e.target.value })} />
            <input placeholder="Vrije mededeling" value={nieuw.vrijeMededeling} onChange={(e) => setNieuw({ ...nieuw, vrijeMededeling: e.target.value })} />
            <select value={nieuw.categorieId} onChange={(e) => setNieuw({ ...nieuw, categorieId: e.target.value })}>
              <option value="">Categorie...</option>
              {categorieen.map((c) => (
                <option key={c.id} value={c.id}>{c.naam}</option>
              ))}
            </select>
            <input type="number" step="0.01" placeholder="Bedrag" value={nieuw.bedrag} onChange={(e) => setNieuw({ ...nieuw, bedrag: e.target.value })} />
            {evenementen.length > 0 && (
              <select value={nieuw.evenementId} onChange={(e) => setNieuw({ ...nieuw, evenementId: e.target.value })}>
                <option value="">Evenement (optioneel)...</option>
                {evenementen.map((e) => (
                  <option key={e.id} value={e.id}>{e.naam}</option>
                ))}
              </select>
            )}
          </div>
          <button className="btn-primary" onClick={opslaanNieuw}>
            Opslaan
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="🔍 Zoek op naam, mededeling, bedrag, datum..."
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Alle categorieën</option>
          {categorieen.map((c) => (
            <option key={c.id} value={c.id}>{c.naam}</option>
          ))}
        </select>
      </div>

      {magBewerken && geselecteerd.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--primary-tint)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 16px", marginBottom: 16 }}>
          <span>{geselecteerd.size} transactie{geselecteerd.size > 1 ? "s" : ""} geselecteerd</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setGeselecteerd(new Set())}>Selectie opheffen</button>
            <button onClick={verwijderGeselecteerd} style={{ background: "var(--danger)", color: "white", border: "none" }}>
              🗑️ Verwijder geselecteerde
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              {magBewerken && (
                <th style={{ width: 28 }}>
                  <input
                    type="checkbox"
                    checked={gefilterd.length > 0 && geselecteerd.size === gefilterd.length}
                    onChange={toggleSelectieAlles}
                    title="Alles selecteren"
                  />
                </th>
              )}
              <th>Datum</th>
              <th>Rekening</th>
              <th>Tegenpartij</th>
              <th>Mededeling</th>
              <th>Categorie</th>
              <th>Evenement</th>
              <th style={{ textAlign: "right" }}>Bedrag</th>
              {magBewerken && <th></th>}
            </tr>
          </thead>
          <tbody>
            {gefilterd.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ padding: 24, textAlign: "center", border: "none" }}>Geen transacties gevonden.</td></tr>
            )}
            {gefilterd.map((t) => {
              const teken = t.soort === "uitgave" ? -1 : t.soort === "interne_transactie" ? 0 : 1;
              return (
                <tr key={t.id} style={{ background: geselecteerd.has(t.id) ? "var(--primary-tint)" : undefined }}>
                  {magBewerken && (
                    <td>
                      <input type="checkbox" checked={geselecteerd.has(t.id)} onChange={() => toggleSelectie(t.id)} />
                    </td>
                  )}
                  <td style={{ whiteSpace: "nowrap" }}>{t.datum}</td>
                  <td>
                    {t.rekening_type === "zicht" ? "Zicht" : "Spaar"}
                    {t.soort === "interne_transactie" && ` → ${t.interne_bestemming_rekening === "zicht" ? "Zicht" : "Spaar"}`}
                  </td>
                  <td style={{ fontWeight: 600 }}>{t.tegenpartij || "-"}</td>
                  <td className="muted">{t.vrije_mededeling || t.omschrijving || "-"}</td>
                  <td>
                    {magBewerken ? (
                      <select value={t.categorie_id || ""} onChange={(e) => updateCategorie(t.id, e.target.value)} style={{ fontSize: 12 }}>
                        <option value="">-</option>
                        {categorieen.map((c) => (
                          <option key={c.id} value={c.id}>{c.naam}</option>
                        ))}
                      </select>
                    ) : (
                      t.categorieen?.naam || "-"
                    )}
                  </td>
                  <td>
                    {magBewerken ? (
                      <select value={t.evenement_id || ""} onChange={(e) => updateEvenement(t.id, e.target.value)} style={{ fontSize: 12 }}>
                        <option value="">-</option>
                        {evenementen.map((e) => (
                          <option key={e.id} value={e.id}>{e.naam}</option>
                        ))}
                      </select>
                    ) : (
                      t.evenementen?.naam || "-"
                    )}
                  </td>
                  <td className={teken < 0 ? "amount-neg" : ""} style={{ textAlign: "right", fontWeight: 700 }}>
                    {teken === 0 ? "" : teken > 0 ? "+" : "-"}{euro(t.bedrag)}
                  </td>
                  {magBewerken && (
                    <td>
                      <button className="btn-danger" onClick={() => verwijderTx(t.id)} title="Verwijderen">🗑️</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
