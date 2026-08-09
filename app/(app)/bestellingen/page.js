"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

export default function Bestellingen() {
  const { data: session } = useSession();
  const [bestellingen, setBestellingen] = useState([]);
  const [bestellingId, setBestellingId] = useState(null);
  const [overzicht, setOverzicht] = useState(null);
  const [gebruikers, setGebruikers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nieuweTitel, setNieuweTitel] = useState("");
  const [nieuweDatum, setNieuweDatum] = useState(new Date().toISOString().slice(0, 10));
  const [nieuweRegel, setNieuweRegel] = useState({ userId: "", product: "", aantal: "1", prijsPerStuk: "" });
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [fvMaanden, setFvMaanden] = useState([]);
  const [fvMaandId, setFvMaandId] = useState(null);
  const [bezig, setBezig] = useState(false);
  const [globaleProducten, setGlobaleProducten] = useState({});

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  const ladenBestellingen = () => fetch("/api/bestellingen").then((r) => r.json()).then((d) => setBestellingen(d.bestellingen || []));

  const ladenGlobaleProducten = () =>
    fetch("/api/bestellingen/producten").then((r) => r.json()).then((d) => {
      const map = {};
      (d.producten || []).forEach((p) => { map[p.naam] = p.prijs; });
      setGlobaleProducten(map);
    });

  useEffect(() => {
    Promise.all([
      fetch("/api/bestellingen").then((r) => r.json()),
      fetch("/api/gebruikers/lijst").then((r) => r.json()),
      fetch("/api/werkjaren").then((r) => r.json()),
      fetch("/api/bestellingen/producten").then((r) => r.json()),
    ]).then(([b, g, w, p]) => {
      setBestellingen(b.bestellingen || []);
      setGebruikers(g.users || []);
      if (w.werkjaren?.length) { setWerkjaren(w.werkjaren); setWerkjaarId(w.werkjaren[0].id); }
      const map = {};
      (p.producten || []).forEach((prod) => { map[prod.naam] = prod.prijs; });
      setGlobaleProducten(map);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/fv/maanden?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => {
      setFvMaanden(d.fvMaanden || []);
      setFvMaandId(d.fvMaanden?.[0]?.id || null);
    });
  }, [werkjaarId]);

  const ladenOverzicht = (id) => fetch(`/api/bestellingen/overzicht?bestellingId=${id}`).then((r) => r.json()).then(setOverzicht);

  useEffect(() => {
    if (!bestellingId) { setOverzicht(null); return; }
    ladenOverzicht(bestellingId);
  }, [bestellingId]);

  if (loading) return <p className="muted" style={{ padding: 32 }}>Laden…</p>;

  const nieuweBestellingAanmaken = async () => {
    if (!nieuweTitel.trim()) return alert("Vul een titel in, bv. 'Frituur 16/05'.");
    const res = await fetch("/api/bestellingen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titel: nieuweTitel.trim(), datum: nieuweDatum }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    setBestellingen([data.bestelling, ...bestellingen]);
    setBestellingId(data.bestelling.id);
    setNieuweTitel("");
  };

  const bestellingVerwijderen = async (id) => {
    if (!confirm("Deze bestelling en al haar regels verwijderen?")) return;
    await fetch(`/api/bestellingen?id=${id}`, { method: "DELETE" });
    setBestellingen((prev) => prev.filter((b) => b.id !== id));
    if (bestellingId === id) setBestellingId(null);
  };

  const regelToevoegen = async () => {
    if (!nieuweRegel.userId || !nieuweRegel.product || !nieuweRegel.aantal || !nieuweRegel.prijsPerStuk) {
      return alert("Vul persoon, product, aantal en prijs per stuk in.");
    }
    const res = await fetch("/api/bestellingen/regels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bestellingId, ...nieuweRegel }),
    });
    const data = await res.json();
    if (data.error) return alert("⚠️ " + data.error);
    // Persoon blijft geselecteerd: handig om meteen het volgende product
    // voor dezelfde persoon toe te voegen (bv. frietjes, vlees, saus).
    setNieuweRegel((prev) => ({ userId: prev.userId, product: "", aantal: "1", prijsPerStuk: "" }));
    ladenOverzicht(bestellingId);
    ladenGlobaleProducten();
  };

  const regelVerwijderen = async (id) => {
    await fetch(`/api/bestellingen/regels?id=${id}`, { method: "DELETE" });
    ladenOverzicht(bestellingId);
  };

  const verdelenOverFv = async () => {
    if (!fvMaandId) return alert("Kies eerst een FV-maand.");
    if (!confirm("Alle subtotalen van deze bestelling toevoegen aan de gekozen FV-maand?")) return;
    setBezig(true);
    const res = await fetch("/api/bestellingen/verdelen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bestellingId, fvMaandId }),
    });
    const data = await res.json();
    setBezig(false);
    if (data.error) return alert("⚠️ " + data.error);
    alert(`✅ ${data.aantal} FV-regels toegevoegd.`);
    ladenBestellingen();
    ladenOverzicht(bestellingId);
  };

  const verdelenAllesAction = async () => {
    if (!fvMaandId) return alert("Kies eerst een FV-maand.");
    if (!confirm(`Alle openstaande bestellingen (${openstaandeBestellingen.length}) in één keer verdelen over de gekozen FV-maand?`)) return;
    setBezig(true);
    const res = await fetch("/api/bestellingen/verdelen-alles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId }),
    });
    const data = await res.json();
    setBezig(false);
    if (data.error) return alert("⚠️ " + data.error);
    alert(`✅ ${data.aantalBestellingen} bestelling(en) verdeeld, ${data.aantalRegels} FV-regels toegevoegd.`);
    ladenBestellingen();
    if (bestellingId) ladenOverzicht(bestellingId);
  };

  const totaalBestelling = (overzicht?.personen || []).reduce((s, p) => s + p.totaal, 0);
  const openstaandeBestellingen = bestellingen.filter((b) => !b.verdeeld_naar_fv_maand_id);

  // Bekende producten: eerst alle producten die ooit besteld zijn (over alle
  // bestellingen heen, bv. "Pizza salami" bij Anatolia), aangevuld/overschreven
  // door wat binnen déze bestelling al is ingevuld.
  const productPrijzen = { ...globaleProducten };
  (overzicht?.personen || []).forEach((p) => {
    p.regels.forEach((r) => {
      productPrijzen[r.product.trim()] = r.prijsPerStuk;
    });
  });
  const zoekBekendePrijs = (product) => {
    const match = Object.keys(productPrijzen).find((naam) => naam.toLowerCase() === product.trim().toLowerCase());
    return match !== undefined ? productPrijzen[match] : undefined;
  };

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Bestellingen</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Splits een rekening (frituur, pizza, ...) per persoon op en verdeel het automatisch over hun Financieel Verslag.
      </p>

      {magBewerken && openstaandeBestellingen.length > 0 && (
        <div className="card" style={{ marginBottom: 20, background: "var(--primary-tint)", borderColor: "var(--primary)" }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
            {openstaandeBestellingen.length} bestelling{openstaandeBestellingen.length > 1 ? "en" : ""} nog niet verdeeld
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {werkjaren.length > 1 && (
              <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)}>
                {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
              </select>
            )}
            <select value={fvMaandId || ""} onChange={(e) => setFvMaandId(e.target.value)}>
              {fvMaanden.length === 0 && <option value="">Nog geen FV-maand</option>}
              {fvMaanden.map((m) => <option key={m.id} value={m.id}>{m.maand}</option>)}
            </select>
            <button className="btn-primary" disabled={bezig || !fvMaandId} onClick={verdelenAllesAction}>
              Verdeel alle {openstaandeBestellingen.length} in één keer
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 260, flexShrink: 0 }}>
          {magBewerken && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Nieuwe bestelling</div>
              <input placeholder="Titel, bv. Frituur 16/05" value={nieuweTitel} onChange={(e) => setNieuweTitel(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
              <input type="date" value={nieuweDatum} onChange={(e) => setNieuweDatum(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
              <button className="btn-primary" onClick={nieuweBestellingAanmaken} style={{ width: "100%" }}>+ Aanmaken</button>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {bestellingen.length === 0 && <p className="muted" style={{ fontSize: 13, fontStyle: "italic" }}>Nog geen bestellingen.</p>}
            {bestellingen.map((b) => (
              <div
                key={b.id}
                onClick={() => setBestellingId(b.id)}
                style={{
                  padding: "8px 10px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                  background: bestellingId === b.id ? "var(--primary-tint)" : "transparent",
                  border: "1px solid " + (bestellingId === b.id ? "var(--primary)" : "var(--border)"),
                }}
              >
                <div style={{ fontWeight: 600 }}>{b.titel}</div>
                <div className="subtle" style={{ fontSize: 11 }}>
                  {b.datum} {b.verdeeld_naar_fv_maand_id && "· ✅ verdeeld over FV"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          {!overzicht ? (
            <p className="muted" style={{ fontStyle: "italic" }}>Kies of maak een bestelling om regels toe te voegen.</p>
          ) : (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{overzicht.bestelling.titel}</h2>

              {overzicht.personen.length === 0 && (
                <p className="muted" style={{ fontStyle: "italic", marginBottom: 12 }}>Nog geen regels.</p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                {overzicht.personen.map((p) => (
                  <div key={p.user.id} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 6 }}>
                      <span>{p.user.naam}</span>
                      <span>{euro(p.totaal)}</span>
                    </div>
                    <table>
                      <tbody>
                        {p.regels.map((r) => (
                          <tr key={r.id}>
                            <td className="muted" style={{ border: "none", padding: "2px 0" }}>{r.aantal}× {r.product} (à {euro(r.prijsPerStuk)})</td>
                            <td style={{ border: "none", padding: "2px 0", textAlign: "right", width: 90 }}>{euro(r.bedrag)}</td>
                            {magBewerken && !overzicht.bestelling.verdeeld_naar_fv_maand_id && (
                              <td style={{ border: "none", padding: "2px 0", width: 20 }}>
                                <button className="btn-danger" onClick={() => regelVerwijderen(r.id)} style={{ fontSize: 11 }}>🗑️</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {overzicht.personen.length > 0 && (
                <p style={{ fontWeight: 700, marginBottom: 16 }}>Totaal bestelling: {euro(totaalBestelling)}</p>
              )}

              {magBewerken && !overzicht.bestelling.verdeeld_naar_fv_maand_id && (
                <>
                  <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Regel toevoegen</div>
                    <p className="subtle" style={{ fontSize: 11, marginBottom: 8 }}>
                      Tip: na het toevoegen blijft de persoon geselecteerd — handig om meteen het volgende product voor diezelfde persoon in te geven (bv. frietjes, vlees, saus). Enter werkt ook om toe te voegen.
                      Typ een productnaam die al ooit besteld is (ook in een vorige bestelling, bv. "Pizza salami" bij Anatolia) en de prijs wordt automatisch overgenomen.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <select value={nieuweRegel.userId} onChange={(e) => setNieuweRegel({ ...nieuweRegel, userId: e.target.value })}>
                        <option value="">Persoon...</option>
                        {gebruikers.map((g) => <option key={g.id} value={g.id}>{g.naam}</option>)}
                      </select>
                      <input
                        placeholder="Product, bv. Frietjes groot"
                        value={nieuweRegel.product}
                        list="bekende-producten"
                        onChange={(e) => {
                          const product = e.target.value;
                          const bekendePrijs = zoekBekendePrijs(product);
                          setNieuweRegel((prev) => ({ ...prev, product, prijsPerStuk: bekendePrijs !== undefined ? String(bekendePrijs) : prev.prijsPerStuk }));
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); regelToevoegen(); } }}
                      />
                      <datalist id="bekende-producten">
                        {Object.keys(productPrijzen).map((naam) => <option key={naam} value={naam} />)}
                      </datalist>
                      <input
                        type="number" step="1" placeholder="Aantal"
                        value={nieuweRegel.aantal}
                        onChange={(e) => setNieuweRegel({ ...nieuweRegel, aantal: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); regelToevoegen(); } }}
                      />
                      <input
                        type="number" step="0.01" placeholder="Prijs per stuk"
                        value={nieuweRegel.prijsPerStuk}
                        onChange={(e) => setNieuweRegel({ ...nieuweRegel, prijsPerStuk: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); regelToevoegen(); } }}
                      />
                    </div>
                    <button className="btn-primary" onClick={regelToevoegen}>+ Regel toevoegen</button>
                  </div>

                  {overzicht.personen.length > 0 && (
                    <div className="card">
                      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Verdelen over Financieel Verslag</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {werkjaren.length > 1 && (
                          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)}>
                            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
                          </select>
                        )}
                        <select value={fvMaandId || ""} onChange={(e) => setFvMaandId(e.target.value)}>
                          {fvMaanden.length === 0 && <option value="">Nog geen FV-maand</option>}
                          {fvMaanden.map((m) => <option key={m.id} value={m.id}>{m.maand}</option>)}
                        </select>
                        <button className="btn-primary" disabled={bezig || !fvMaandId} onClick={verdelenOverFv}>
                          Verdeel over FV
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {magBewerken && (
                <button className="btn-danger" onClick={() => bestellingVerwijderen(bestellingId)} style={{ marginTop: 16, fontSize: 12 }}>
                  🗑️ Bestelling verwijderen
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
