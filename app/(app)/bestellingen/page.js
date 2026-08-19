"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseNaamRegels, vindGebruiker, splitProducten } from "@/lib/smartPaste";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonCard } from "@/components/Skeleton";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

export default function Bestellingen() {
  const { data: session } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const vanFv = useSearchParams().get("van") === "fv";
  const [bestellingen, setBestellingen] = useState([]);
  const [bestellingId, setBestellingId] = useState(null);
  const [overzicht, setOverzicht] = useState(null);
  const [gebruikers, setGebruikers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nieuweTitel, setNieuweTitel] = useState("");
  const [nieuweDatum, setNieuweDatum] = useState(new Date().toISOString().slice(0, 10));
  const [nieuweWinkel, setNieuweWinkel] = useState("");
  const [nieuweRegel, setNieuweRegel] = useState({ userId: "", product: "", aantal: "1", prijsPerStuk: "" });
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [fvMaanden, setFvMaanden] = useState([]);
  const [fvMaandId, setFvMaandId] = useState(null);
  const [bezig, setBezig] = useState(false);
  const [globaleProducten, setGlobaleProducten] = useState({});
  const [plakOpen, setPlakOpen] = useState(false);
  const [plakTekst, setPlakTekst] = useState("");
  const [plakPreview, setPlakPreview] = useState(null);
  const [gelijkOpen, setGelijkOpen] = useState(false);
  const [gelijkOmschrijving, setGelijkOmschrijving] = useState("");
  const [gelijkTotaal, setGelijkTotaal] = useState("");
  const [gelijkGeselecteerd, setGelijkGeselecteerd] = useState(new Set());

  const magBewerken = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht);

  const ladenBestellingen = () => fetch("/api/bestellingen").then((r) => r.json()).then((d) => setBestellingen(d.bestellingen || []));

  // Zonder winkel: prijzen over alle bestellingen heen. Met winkel: enkel
  // prijzen die bij diezelfde winkel horen, want "frietjes" bij de ene
  // frituur kost niet hetzelfde als bij de andere.
  const ladenGlobaleProducten = (winkel) =>
    fetch(`/api/bestellingen/producten${winkel ? `?winkel=${encodeURIComponent(winkel)}` : ""}`).then((r) => r.json()).then((d) => {
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

  useEffect(() => {
    ladenGlobaleProducten(overzicht?.bestelling?.winkel || null);
  }, [overzicht?.bestelling?.winkel]);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 1000 }}>
        <SkeletonCard lines={3} />
      </div>
    );
  }

  const nieuweBestellingAanmaken = async () => {
    if (!nieuweTitel.trim()) return toast.error("Vul een titel in, bv. 'Frituur 16/05'.");
    const res = await fetch("/api/bestellingen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titel: nieuweTitel.trim(), datum: nieuweDatum, winkel: nieuweWinkel.trim() || null }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setBestellingen([data.bestelling, ...bestellingen]);
    setBestellingId(data.bestelling.id);
    setNieuweTitel("");
    setNieuweWinkel("");
  };

  const winkelBijwerken = async (waarde) => {
    await fetch("/api/bestellingen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bestellingId, winkel: waarde }),
    });
    ladenBestellingen();
    ladenOverzicht(bestellingId);
  };

  const bestellingVerwijderen = async (id) => {
    const ok = await confirm({ title: "Bestelling verwijderen", message: "Deze bestelling en al haar regels verwijderen?", danger: true, bevestigLabel: "Verwijderen" });
    if (!ok) return;
    await fetch(`/api/bestellingen?id=${id}`, { method: "DELETE" });
    setBestellingen((prev) => prev.filter((b) => b.id !== id));
    if (bestellingId === id) setBestellingId(null);
    toast.success("Bestelling verwijderd");
  };

  const regelToevoegen = async () => {
    if (!nieuweRegel.userId || !nieuweRegel.product || !nieuweRegel.aantal || !nieuweRegel.prijsPerStuk) {
      return toast.error("Vul persoon, product, aantal en prijs per stuk in.");
    }
    const res = await fetch("/api/bestellingen/regels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bestellingId, ...nieuweRegel }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    // Persoon blijft geselecteerd: handig om meteen het volgende product
    // voor dezelfde persoon toe te voegen (bv. frietjes, vlees, saus).
    setNieuweRegel((prev) => ({ userId: prev.userId, product: "", aantal: "1", prijsPerStuk: "" }));
    ladenOverzicht(bestellingId);
    ladenGlobaleProducten(overzicht?.bestelling?.winkel || null);
  };

  // Optimistisch: de regel (en desnoods de hele persoon, als het hun laatste
  // regel was) verdwijnt meteen uit het overzicht.
  const regelVerwijderen = (persoonId, regel) => {
    setOverzicht((prev) => ({
      ...prev,
      personen: prev.personen
        .map((p) =>
          p.user.id === persoonId
            ? { ...p, regels: p.regels.filter((x) => x.id !== regel.id), totaal: Math.round((p.totaal - regel.bedrag) * 100) / 100 }
            : p
        )
        .filter((p) => p.regels.length > 0),
    }));
    toast.undoable({
      message: "Regel verwijderd",
      onUndo: () => ladenOverzicht(bestellingId),
      onCommit: async () => {
        await fetch(`/api/bestellingen/regels?id=${regel.id}`, { method: "DELETE" });
      },
    });
  };

  const verdelenOverFv = async () => {
    if (!fvMaandId) return toast.error("Kies eerst een FV-maand.");
    const ok = await confirm({ title: "Verdelen over FV", message: "Alle subtotalen van deze bestelling toevoegen aan de gekozen FV-maand?", bevestigLabel: "Verdelen" });
    if (!ok) return;
    setBezig(true);
    const res = await fetch("/api/bestellingen/verdelen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bestellingId, fvMaandId }),
    });
    const data = await res.json();
    setBezig(false);
    if (data.error) return toast.error(data.error);
    toast.success(`${data.aantal} FV-regels toegevoegd`);
    ladenBestellingen();
    ladenOverzicht(bestellingId);
  };

  const verdelenAllesAction = async () => {
    if (!fvMaandId) return toast.error("Kies eerst een FV-maand.");
    const ok = await confirm({
      title: "Alles verdelen",
      message: `Alle openstaande bestellingen (${openstaandeBestellingen.length}) in één keer verdelen over de gekozen FV-maand?`,
      bevestigLabel: "Verdelen",
    });
    if (!ok) return;
    setBezig(true);
    const res = await fetch("/api/bestellingen/verdelen-alles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId }),
    });
    const data = await res.json();
    setBezig(false);
    if (data.error) return toast.error(data.error);
    toast.success(`${data.aantalBestellingen} bestelling(en) verdeeld, ${data.aantalRegels} FV-regels toegevoegd`);
    ladenBestellingen();
    if (bestellingId) ladenOverzicht(bestellingId);
  };

  const gelijkToggle = (userId) => {
    setGelijkGeselecteerd((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Voor leefweek e.d.: iedereen betaalt evenveel, dus i.p.v. per product een
  // regel per persoon met hetzelfde bedrag (totaal/aantal deelnemers) — geen
  // eigen module nodig, dit hergebruikt gewoon dezelfde bestelling_regels.
  const gelijkBevestigen = async () => {
    const totaal = Number(gelijkTotaal);
    if (!gelijkOmschrijving.trim() || !totaal || gelijkGeselecteerd.size === 0) {
      return toast.error("Vul een omschrijving en totaalbedrag in, en vink minstens één deelnemer aan.");
    }
    const perPersoon = Math.round((totaal / gelijkGeselecteerd.size) * 100) / 100;
    setBezig(true);
    await Promise.all(
      [...gelijkGeselecteerd].map((userId) =>
        fetch("/api/bestellingen/regels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bestellingId, userId, product: gelijkOmschrijving.trim(), aantal: "1", prijsPerStuk: String(perPersoon) }),
        })
      )
    );
    setBezig(false);
    setGelijkOmschrijving("");
    setGelijkTotaal("");
    setGelijkGeselecteerd(new Set());
    setGelijkOpen(false);
    ladenOverzicht(bestellingId);
    ladenGlobaleProducten(overzicht?.bestelling?.winkel || null);
    toast.success(`${gelijkGeselecteerd.size} regels toegevoegd (${euro(perPersoon)} per persoon)`);
  };

  const totaalBestelling = (overzicht?.personen || []).reduce((s, p) => s + p.totaal, 0);
  const openstaandeBestellingen = bestellingen.filter((b) => !b.verdeeld_naar_fv_maand_id);
  const bekendeWinkels = [...new Set(bestellingen.map((b) => b.winkel).filter(Boolean))];

  // Bekende producten: eerst alle producten die ooit besteld zijn (gescoped op
  // de winkel van déze bestelling, zie ladenGlobaleProducten), aangevuld/
  // overschreven door wat binnen déze bestelling al is ingevuld.
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

  // Zet geplakte tekst ("Naam: item1 met item2 en item3" per regel) om in een
  // bewerkbare preview: per regel de gematchte persoon en per product de
  // gekende prijs (indien bekend) zodat je enkel nog nieuwe prijzen moet invullen.
  const plakVerwerken = () => {
    const regels = parseNaamRegels(plakTekst);
    if (regels.length === 0) return toast.error("Geen regels herkend. Verwacht formaat: 'Naam: product1 met product2 en product3'.");
    const rijen = regels.flatMap(({ naam, rest }) => {
      const gebruiker = vindGebruiker(gebruikers, naam);
      return splitProducten(rest).map((product) => ({
        naam,
        userId: gebruiker?.id || "",
        product,
        aantal: "1",
        prijsPerStuk: zoekBekendePrijs(product) !== undefined ? String(zoekBekendePrijs(product)) : "",
      }));
    });
    setPlakPreview(rijen);
  };

  const plakRijWijzigen = (index, veld, waarde) => {
    setPlakPreview((prev) => {
      const bijgewerkt = prev.map((r, i) => (i === index ? { ...r, [veld]: waarde } : r));
      // Prijs invullen voor één product vult meteen dezelfde prijs in bij elk
      // ander persoon met datzelfde product in deze plak-preview.
      if (veld !== "prijsPerStuk") return bijgewerkt;
      const product = bijgewerkt[index].product.trim().toLowerCase();
      if (!product) return bijgewerkt;
      return bijgewerkt.map((r) => (r.product.trim().toLowerCase() === product ? { ...r, prijsPerStuk: waarde } : r));
    });
  };

  const plakRijVerwijderen = (index) => {
    setPlakPreview((prev) => prev.filter((_, i) => i !== index));
  };

  const plakBevestigen = async () => {
    const onvolledig = plakPreview.filter((r) => !r.userId || !r.product || !r.prijsPerStuk);
    if (onvolledig.length > 0) return toast.error("Vul voor elke regel een persoon, product en prijs in (of verwijder de regel).");
    setBezig(true);
    await Promise.all(
      plakPreview.map((r) =>
        fetch("/api/bestellingen/regels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bestellingId, userId: r.userId, product: r.product, aantal: r.aantal, prijsPerStuk: r.prijsPerStuk }),
        })
      )
    );
    setBezig(false);
    setPlakTekst("");
    setPlakPreview(null);
    setPlakOpen(false);
    ladenOverzicht(bestellingId);
    ladenGlobaleProducten(overzicht?.bestelling?.winkel || null);
    toast.success(`${plakPreview.length} regels toegevoegd`);
  };

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      {vanFv && (
        <Link href="/fv" className="link" style={{ fontSize: 13, display: "inline-block", marginBottom: 8 }}>← Financieel Verslag</Link>
      )}
      <h1 style={{ fontSize: 30, fontWeight: 800 }}>Bestellingen</h1>
      <p className="muted" style={{ fontSize: 15, marginTop: 6, marginBottom: 20 }}>
        Splits een rekening (frituur, pizza, leefweek, ...) per persoon op en verdeel het automatisch over hun Financieel Verslag. Gebruik "Regel toevoegen" of "Slim plakken" als iedereen iets anders koos, of "Gelijk verdelen" als iedereen evenveel betaalt (bv. leefweek).
      </p>

      {magBewerken && openstaandeBestellingen.length > 0 && (
        <div className="card card-lg" style={{ marginBottom: 20, background: "var(--primary)", color: "white", border: "none" }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 16 }}>
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
            <button style={{ background: "white", color: "var(--primary)", fontWeight: 700, border: "none" }} disabled={bezig || !fvMaandId} onClick={verdelenAllesAction}>
              Verdeel alle {openstaandeBestellingen.length} in één keer
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 270, flexShrink: 0 }}>
          {magBewerken && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>Nieuwe bestelling</div>
              <input placeholder="Titel, bv. Frituur 16/05" value={nieuweTitel} onChange={(e) => setNieuweTitel(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
              <input type="date" value={nieuweDatum} onChange={(e) => setNieuweDatum(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
              <input
                placeholder="Winkel, bv. Anatolia (optioneel)"
                value={nieuweWinkel}
                list="bekende-winkels"
                onChange={(e) => setNieuweWinkel(e.target.value)}
                style={{ width: "100%", marginBottom: 10 }}
              />
              <datalist id="bekende-winkels">
                {bekendeWinkels.map((w) => <option key={w} value={w} />)}
              </datalist>
              <button className="btn-primary" onClick={nieuweBestellingAanmaken} style={{ width: "100%" }}>+ Aanmaken</button>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bestellingen.length === 0 && <p className="muted" style={{ fontSize: 13, fontStyle: "italic" }}>Nog geen bestellingen.</p>}
            {bestellingen.map((b) => (
              <div
                key={b.id}
                onClick={() => setBestellingId(b.id)}
                className="card"
                style={{
                  padding: "10px 14px", cursor: "pointer",
                  background: bestellingId === b.id ? "var(--primary-tint)" : "var(--surface)",
                  borderColor: bestellingId === b.id ? "var(--primary)" : "var(--border)",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>{b.titel}</div>
                <div className="subtle" style={{ fontSize: 12 }}>
                  {b.datum} {b.winkel && `· ${b.winkel}`}
                </div>
                {b.verdeeld_naar_fv_maand_id && <span className="badge badge-success" style={{ marginTop: 6, display: "inline-block" }}>Verdeeld over FV</span>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          {!overzicht ? (
            <p className="muted" style={{ fontStyle: "italic" }}>Kies of maak een bestelling om regels toe te voegen.</p>
          ) : (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{overzicht.bestelling.titel}</h2>
              <div style={{ marginBottom: 16 }}>
                {magBewerken && !overzicht.bestelling.verdeeld_naar_fv_maand_id ? (
                  <>
                    <input
                      key={`winkel-${overzicht.bestelling.id}-${overzicht.bestelling.winkel}`}
                      placeholder="Winkel (optioneel)"
                      defaultValue={overzicht.bestelling.winkel || ""}
                      list="bekende-winkels"
                      onBlur={(e) => winkelBijwerken(e.target.value.trim())}
                      style={{ width: 220 }}
                    />
                    <p className="subtle" style={{ fontSize: 12, marginTop: 4 }}>
                      Bepaalt welke eerder gebruikte prijzen als suggestie verschijnen.
                    </p>
                  </>
                ) : overzicht.bestelling.winkel ? (
                  <span className="subtle" style={{ fontSize: 13 }}>{overzicht.bestelling.winkel}</span>
                ) : null}
              </div>

              {overzicht.personen.length === 0 && (
                <p className="muted" style={{ fontStyle: "italic", marginBottom: 16 }}>Nog geen regels.</p>
              )}

              {overzicht.personen.length > 0 && (
                <div className="card" style={{ padding: 0, marginBottom: 16 }}>
                  {overzicht.personen.map((p, pi) => (
                    <div key={p.user.id} style={{ padding: "14px 18px", borderTop: pi > 0 ? "1px solid var(--border-soft)" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
                        <span>{p.user.naam}</span>
                        <span className="money">{euro(p.totaal)}</span>
                      </div>
                      {p.regels.map((r, ri) => (
                        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderTop: ri > 0 ? "1px solid var(--border-soft)" : "none" }}>
                          <span className="muted" style={{ fontSize: 13 }}>{r.aantal}× {r.product} (à {euro(r.prijsPerStuk)})</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{euro(r.bedrag)}</span>
                            {magBewerken && !overzicht.bestelling.verdeeld_naar_fv_maand_id && (
                              <button className="btn-danger" onClick={() => regelVerwijderen(p.user.id, r)}>🗑️</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {overzicht.personen.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>Totaal bestelling</span>
                  <span className="money" style={{ fontWeight: 700, fontSize: 20 }}>{euro(totaalBestelling)}</span>
                </div>
              )}

              {magBewerken && !overzicht.bestelling.verdeeld_naar_fv_maand_id && (
                <>
                  <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: plakOpen ? 10 : 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>Slim plakken</div>
                      <button onClick={() => setPlakOpen(!plakOpen)}>{plakOpen ? "Annuleren" : "Lijst plakken"}</button>
                    </div>
                    {plakOpen && (
                      <>
                        <p className="subtle" style={{ fontSize: 12, marginBottom: 8 }}>
                          Plak een lijst zoals "Aline: mini friet met tomaten ketchup en boulet" (één persoon per regel, producten gescheiden door "met", "en" of een komma). Nadien kan je alles controleren en aanpassen voor je bevestigt.
                        </p>
                        <textarea
                          value={plakTekst}
                          onChange={(e) => setPlakTekst(e.target.value)}
                          placeholder={"Aline: mini friet met tomaten ketchup en boulet\nToon: kleine friet met joppie en broodje mexicano"}
                          rows={5}
                          style={{ width: "100%", marginBottom: 8, fontFamily: "inherit" }}
                        />
                        {!plakPreview ? (
                          <button className="btn-primary" onClick={plakVerwerken}>Verwerken</button>
                        ) : (
                          <>
                            {plakPreview.length === 0 ? (
                              <p className="muted" style={{ fontStyle: "italic", marginBottom: 8 }}>Niets meer om toe te voegen.</p>
                            ) : (
                              <div className="card" style={{ padding: 0, marginBottom: 8 }}>
                                {plakPreview.map((r, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", flexWrap: "wrap" }}>
                                    <select value={r.userId} onChange={(e) => plakRijWijzigen(i, "userId", e.target.value)} style={{ flex: 1, minWidth: 140, borderColor: r.userId ? undefined : "var(--danger)" }}>
                                      <option value="">{r.naam} (niet gevonden)</option>
                                      {gebruikers.map((g) => <option key={g.id} value={g.id}>{g.naam}</option>)}
                                    </select>
                                    <input value={r.product} onChange={(e) => plakRijWijzigen(i, "product", e.target.value)} style={{ width: 160 }} />
                                    <input type="number" step="1" value={r.aantal} onChange={(e) => plakRijWijzigen(i, "aantal", e.target.value)} style={{ width: 60 }} />
                                    <input type="number" step="0.01" value={r.prijsPerStuk} onChange={(e) => plakRijWijzigen(i, "prijsPerStuk", e.target.value)} style={{ width: 80 }} />
                                    <button className="btn-danger" onClick={() => plakRijVerwijderen(i)}>🗑️</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 8 }}>
                              {plakPreview.length > 0 && (
                                <button className="btn-primary" disabled={bezig} onClick={plakBevestigen}>Alles toevoegen ({plakPreview.length})</button>
                              )}
                              <button onClick={() => setPlakPreview(null)}>Opnieuw verwerken</button>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: gelijkOpen ? 10 : 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>Gelijk verdelen</div>
                      <button onClick={() => setGelijkOpen(!gelijkOpen)}>{gelijkOpen ? "Annuleren" : "Totaalbedrag delen"}</button>
                    </div>
                    {gelijkOpen && (
                      <>
                        <p className="subtle" style={{ fontSize: 12, marginBottom: 8 }}>
                          Voor leefweek e.d.: iedereen die meeat betaalt evenveel — vul het totaalbedrag in en vink de deelnemers aan, het bedrag wordt gelijk verdeeld.
                        </p>
                        <div className="grid-2" style={{ marginBottom: 8 }}>
                          <input placeholder="Omschrijving, bv. Leefweek maandag" value={gelijkOmschrijving} onChange={(e) => setGelijkOmschrijving(e.target.value)} />
                          <input type="number" step="0.01" placeholder="Totaalbedrag" value={gelijkTotaal} onChange={(e) => setGelijkTotaal(e.target.value)} />
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                          {gebruikers.map((g) => (
                            <label key={g.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 12, fontSize: 13 }}>
                              <input type="checkbox" checked={gelijkGeselecteerd.has(g.id)} onChange={() => gelijkToggle(g.id)} />
                              {g.naam}
                            </label>
                          ))}
                        </div>
                        {gelijkGeselecteerd.size > 0 && Number(gelijkTotaal) > 0 && (
                          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                            {euro(Math.round((Number(gelijkTotaal) / gelijkGeselecteerd.size) * 100) / 100)} per persoon ({gelijkGeselecteerd.size} deelnemers)
                          </p>
                        )}
                        <button className="btn-primary" disabled={bezig} onClick={gelijkBevestigen}>+ Regels toevoegen</button>
                      </>
                    )}
                  </div>

                  <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>Regel toevoegen</div>
                    <p className="subtle" style={{ fontSize: 12, marginBottom: 10 }}>
                      Tip: na het toevoegen blijft de persoon geselecteerd — handig om meteen het volgende product voor diezelfde persoon in te geven (bv. frietjes, vlees, saus). Enter werkt ook om toe te voegen.
                      Typ een productnaam die al ooit besteld is (ook in een vorige bestelling, bv. "Pizza salami" bij Anatolia) en de prijs wordt automatisch overgenomen.
                    </p>
                    <div className="grid-2" style={{ marginBottom: 10 }}>
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
                    <div className="card" style={{ marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>Verdelen over Financieel Verslag</div>
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
                <button className="btn-danger" onClick={() => bestellingVerwijderen(bestellingId)}>
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
