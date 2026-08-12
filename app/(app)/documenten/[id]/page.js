"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonCard } from "@/components/Skeleton";
import { AFDELINGEN_VOLGORDE } from "@/lib/kampAfdelingen";
import { parseKassabon, vindKlantNaam } from "@/lib/receiptParser";
import { preprocessKassabon } from "@/lib/receiptImage";
import { reconstrueerRijen } from "@/lib/receiptRows";
import { vindGebruiker } from "@/lib/smartPaste";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const LEGE_REGEL = { omschrijving: "", bedrag: "", bestemming: "kamp", kampHoofdcategorie: "", evenementId: "", evenementHoofdcategorie: "", fvUserId: "", fvMaandId: "" };

function bestemmingLabel(r) {
  if (r.bestemming === "kamp") return `Kamp · ${r.kamp_hoofdcategorie || "-"}`;
  if (r.bestemming === "evenement") return `${r.evenementen?.naam || "Evenement"} · ${r.evenement_hoofdcategorie || "-"}`;
  if (r.bestemming === "fv") return `FV · ${r.users?.naam || "-"}`;
  return "-";
}

export default function DocumentDetail({ params }) {
  const { id } = params;
  const { data: session } = useSession();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [overzicht, setOverzicht] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kampCategorieen, setKampCategorieen] = useState([]);
  const [evenementen, setEvenementen] = useState([]);
  const [evenementCategorieen, setEvenementCategorieen] = useState([]);
  const [gebruikers, setGebruikers] = useState([]);
  const [fvMaanden, setFvMaanden] = useState([]);
  const [nieuweRegel, setNieuweRegel] = useState(LEGE_REGEL);
  const [scanBezig, setScanBezig] = useState(false);
  const [scanKandidaten, setScanKandidaten] = useState(null);
  const [scanRuweTekst, setScanRuweTekst] = useState(null);
  const [scanRuweTekstOpen, setScanRuweTekstOpen] = useState(false);
  const [evenementCategorieenPerEvenement, setEvenementCategorieenPerEvenement] = useState({});

  const laden = () => fetch(`/api/documenten/overzicht?id=${id}`).then((r) => r.json()).then((d) => { setOverzicht(d); setLoading(false); });

  useEffect(() => {
    laden();
    fetch("/api/gebruikers/lijst").then((r) => r.json()).then((d) => setGebruikers(d.users || []));
  }, [id]);

  const werkjaarId = overzicht?.document?.werkjaar_id;
  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/kampkosten?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => setKampCategorieen(d.categorieen || []));
    fetch(`/api/evenementen?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => setEvenementen(d.evenementen || []));
    fetch(`/api/fv/maanden?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => setFvMaanden(d.fvMaanden || []));
  }, [werkjaarId]);

  useEffect(() => {
    if (!nieuweRegel.evenementId) { setEvenementCategorieen([]); return; }
    fetch(`/api/evenementen/overzicht?evenementId=${nieuweRegel.evenementId}`).then((r) => r.json()).then((d) => setEvenementCategorieen(d.categorieen || []));
  }, [nieuweRegel.evenementId]);

  if (loading || !overzicht) {
    return (
      <div style={{ padding: 32, maxWidth: 900 }}>
        <SkeletonCard lines={4} />
      </div>
    );
  }
  if (overzicht.error) return <p className="amount-neg" style={{ padding: 32 }}>{overzicht.error}</p>;

  const { document, regels, signedUrl, toegewezen, resterend } = overzicht;
  const magBewerken =
    ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht) ||
    (document.gekoppeld_aan === "evenement" && (session?.user?.verantwoordelijkheden || []).length > 0);
  const volledigVerdeeld = Math.abs(resterend) < 0.01;
  const isVerwerkt = document.status === "Verwerkt";

  const regelToevoegen = async () => {
    const r = nieuweRegel;
    if (!r.omschrijving || !r.bedrag) return toast.error("Vul omschrijving en bedrag in.");
    if (r.bestemming === "evenement" && !r.evenementId) return toast.error("Kies een evenement.");
    if (r.bestemming === "fv" && (!r.fvUserId || !r.fvMaandId)) return toast.error("Kies een persoon en een FV-maand.");
    const res = await fetch("/api/documenten/regels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: id, ...r }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweRegel({ ...LEGE_REGEL, bestemming: r.bestemming });
    laden();
    toast.success("Regel toegevoegd");
  };

  const regelVerwijderen = (regel) => {
    setOverzicht((prev) => {
      const nieuweRegels = prev.regels.filter((x) => x.id !== regel.id);
      const nieuwToegewezen = Math.round(nieuweRegels.reduce((s, r) => s + Number(r.bedrag), 0) * 100) / 100;
      return { ...prev, regels: nieuweRegels, toegewezen: nieuwToegewezen, resterend: Math.round((Number(prev.document.totaalbedrag) - nieuwToegewezen) * 100) / 100 };
    });
    toast.undoable({
      message: "Regel verwijderd",
      onUndo: laden,
      onCommit: async () => {
        await fetch(`/api/documenten/regels?id=${regel.id}`, { method: "DELETE" });
        laden();
      },
    });
  };

  // Bouwt de bewerkbare kandidaat-rijen op uit herkende {omschrijving,bedrag}-
  // paren. Sommige afhaalbonnen (bv. Domino's) drukken de besteller af
  // ('Klant: ALINE DEVEUX') — matcht dat met een bekende gebruiker, dan wordt
  // die alvast als FV-persoon ingevuld (nog steeds aan te passen/te verwijderen).
  const bouwScanRijen = (kandidaten, ruweTekst) => {
    const standaardBestemming = ["kamp", "evenement", "fv"].includes(document.gekoppeld_aan) ? document.gekoppeld_aan : "kamp";
    let klantUserId = "";
    if (standaardBestemming === "fv") {
      const klantNaam = vindKlantNaam(ruweTekst);
      const klant = klantNaam ? vindGebruiker(gebruikers, klantNaam) : null;
      if (klant) klantUserId = klant.id;
    }
    return kandidaten.map((k) => ({
      omschrijving: k.omschrijving,
      bedrag: String(k.bedrag),
      bestemming: standaardBestemming,
      kampHoofdcategorie: "",
      evenementId: "",
      evenementHoofdcategorie: "",
      fvUserId: klantUserId,
      fvMaandId: klantUserId ? fvMaanden[0]?.id || "" : "",
    }));
  };

  // Zuivere OCR (Tesseract.js, draait in de browser) + een regex-parser om
  // productregels te herkennen — geen AI/LLM. De mens controleert en
  // corrigeert altijd voor er iets bevestigd wordt, net als bij een manueel
  // ingevulde regel.
  const scanStarten = async () => {
    if (!signedUrl) return;
    setScanBezig(true);
    setScanRuweTekst(null);
    try {
      // Vaal thermisch bonpapier / foto met schaduw is voor ruwe OCR vaak
      // onleesbaar — eerst opschalen + zwart/wit maken (Otsu) helpt enorm.
      // Lukt de voorbewerking niet (bv. CORS op de afbeelding), val dan terug
      // op de ongewijzigde foto in plaats van helemaal te stoppen.
      let beeld = signedUrl;
      try {
        beeld = await preprocessKassabon(signedUrl);
      } catch {
        // fallback op signedUrl hierboven
      }

      // Zowel SINGLE_COLUMN als AUTO lieten Tesseract's eigen leesvolgorde-
      // logica in de war raken door de brede kolomafstand tussen naam en
      // prijs (prijs als woord gelezen, of de hele kolom weggelaten). SPARSE_
      // TEXT laat Tesseract enkel zoeken naar tekst waar dan ook, zonder een
      // samenhangende leesvolgorde te veronderstellen — en we vragen de
      // positie (bbox) van elk woord op, zodat we de rijen zelf reconstrueren
      // op basis van fysieke hoogte i.p.v. Tesseract te laten raden.
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("nld");
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const { data } = await worker.recognize(beeld, {}, { text: true, blocks: true });
      await worker.terminate();

      const rijenTekst = reconstrueerRijen(data.blocks);
      const text = rijenTekst.length > 0 ? rijenTekst.join("\n") : data.text;

      setScanRuweTekst(text);
      const kandidaten = parseKassabon(text);
      if (kandidaten.length === 0) {
        setScanRuweTekstOpen(true);
        toast.error("Geen regels herkend op dit bonnetje. Bekijk/corrigeer de ruwe OCR-tekst hieronder en klik op 'Opnieuw parsen', of vul handmatig in.");
      }
      const rijen = bouwScanRijen(kandidaten, text);
      if (rijen[0]?.fvUserId) {
        toast.success(`Besteller herkend als ${gebruikers.find((g) => g.id === rijen[0].fvUserId)?.naam} — alvast ingevuld bij elke regel.`);
      }
      setScanKandidaten(rijen);
    } catch (err) {
      toast.error("OCR mislukt: " + err.message);
    } finally {
      setScanBezig(false);
    }
  };

  const laadEvenementCategorieenVoorRij = async (evenementId) => {
    if (!evenementId || evenementCategorieenPerEvenement[evenementId]) return;
    const d = await fetch(`/api/evenementen/overzicht?evenementId=${evenementId}`).then((r) => r.json());
    setEvenementCategorieenPerEvenement((prev) => ({ ...prev, [evenementId]: d.categorieen || [] }));
  };

  const scanRijWijzigen = (index, veld, waarde) => {
    setScanKandidaten((prev) => prev.map((r, i) => (i === index ? { ...r, [veld]: waarde } : r)));
    if (veld === "evenementId") laadEvenementCategorieenVoorRij(waarde);
  };

  const scanRijVerwijderen = (index) => {
    setScanKandidaten((prev) => prev.filter((_, i) => i !== index));
  };

  // Herparst de (eventueel handmatig gecorrigeerde) ruwe OCR-tekst opnieuw,
  // zonder de foto nog eens te moeten scannen — handig als OCR een aantal of
  // prijs verkeerd las maar de tekst zelf makkelijk te corrigeren is.
  const scanHerparsen = () => {
    const kandidaten = parseKassabon(scanRuweTekst);
    if (kandidaten.length === 0) {
      toast.error("Nog steeds niets herkend in deze tekst.");
    }
    setScanKandidaten(bouwScanRijen(kandidaten, scanRuweTekst));
    toast.success(`${kandidaten.length} regel(s) herkend na herparsen`);
  };

  const scanBevestigen = async () => {
    const onvolledig = scanKandidaten.filter(
      (r) =>
        !r.omschrijving ||
        !r.bedrag ||
        (r.bestemming === "evenement" && !r.evenementId) ||
        (r.bestemming === "fv" && (!r.fvUserId || !r.fvMaandId))
    );
    if (onvolledig.length > 0) return toast.error("Vul voor elke regel een omschrijving, bedrag en bestemming in (of verwijder de regel).");
    setScanBezig(true);
    await Promise.all(
      scanKandidaten.map((r) =>
        fetch("/api/documenten/regels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: id, ...r }),
        })
      )
    );
    setScanBezig(false);
    const aantal = scanKandidaten.length;
    setScanKandidaten(null);
    setScanRuweTekst(null);
    laden();
    toast.success(`${aantal} regel(s) toegevoegd vanuit de scan`);
  };

  const verwerken = async () => {
    const ok = await confirm({
      title: "Document verwerken",
      message: `Alle ${regels.length} regel(s) omzetten naar echte transacties? Dit kan niet ongedaan gemaakt worden.`,
      bevestigLabel: "Verwerken",
    });
    if (!ok) return;
    const res = await fetch("/api/documenten/verwerken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: id }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    laden();
    toast.success(`${data.aantal} regel(s) verwerkt`);
  };

  const documentVerwijderen = async () => {
    const ok = await confirm({
      title: "Document verwijderen",
      message: isVerwerkt
        ? "Dit document en het bijhorende bestand verwijderen? De transacties die er al uit aangemaakt zijn (kamp/evenement/FV) blijven gewoon bestaan — enkel het document zelf en zijn regels verdwijnen."
        : "Dit document, het bijhorende bestand en zijn regels verwijderen?",
      danger: true,
      bevestigLabel: "Verwijderen",
    });
    if (!ok) return;
    const res = await fetch(`/api/documenten?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    toast.success("Document verwijderd");
    router.push("/documenten");
  };

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <Link href="/documenten" className="link" style={{ fontSize: 13, display: "inline-block", marginBottom: 8 }}>← Documenten</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800 }}>{document.titel}</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
            {document.gekoppeld_aan === "evenement" ? document.evenementen?.naam : document.gekoppeld_aan === "kamp" ? "Kamp" : document.gekoppeld_aan === "fv" ? "Financieel Verslag" : "Niet gekoppeld"}
            {document.users?.naam && ` · geüpload door ${document.users.naam}`}
          </p>
        </div>
        <span className={`badge ${isVerwerkt ? "badge-success" : "badge-warning"}`}>{document.status}</span>
      </div>

      {signedUrl && (
        <div className="card" style={{ marginBottom: 20 }}>
          {document.bestand_type?.startsWith("image/") ? (
            <a href={signedUrl} target="_blank" rel="noreferrer">
              <img src={signedUrl} alt={document.titel} style={{ maxWidth: "100%", maxHeight: 360, borderRadius: "var(--radius-sm)", display: "block" }} />
            </a>
          ) : (
            <a href={signedUrl} target="_blank" rel="noreferrer" className="link">📄 Bekijk document ↗</a>
          )}
        </div>
      )}

      {magBewerken && !isVerwerkt && signedUrl && document.bestand_type?.startsWith("image/") && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 15 }}>Bonnetje scannen</div>
          {!scanKandidaten ? (
            <>
              <p className="subtle" style={{ fontSize: 12, marginBottom: 10 }}>
                Leest tekst van de foto (OCR, geen AI) en herkent regels met een product en een prijs. Controleer en vul aan voor je bevestigt.
              </p>
              <button className="btn-primary" disabled={scanBezig} onClick={scanStarten}>
                {scanBezig ? "Bezig met scannen..." : "Bonnetje scannen"}
              </button>
            </>
          ) : (
            <>
              <p className="subtle" style={{ fontSize: 12, marginBottom: 10 }}>
                {scanKandidaten.length === 0
                  ? "Niets herkend — pas gerust handmatig aan via 'Regel toevoegen' hieronder."
                  : `${scanKandidaten.length} regel(s) herkend. Controleer omschrijving, bedrag en bestemming voor je bevestigt. Ontbreekt er iets? Corrigeer de ruwe OCR-tekst hieronder en parse opnieuw.`}
              </p>
              {scanRuweTekst !== null && (
                <div style={{ marginBottom: 10 }}>
                  <button onClick={() => setScanRuweTekstOpen(!scanRuweTekstOpen)}>
                    {scanRuweTekstOpen ? "▾" : "▸"} Ruwe OCR-tekst bekijken/corrigeren
                  </button>
                  {scanRuweTekstOpen && (
                    <>
                      <p className="subtle" style={{ fontSize: 12, marginTop: 8, marginBottom: 6 }}>
                        Herkende OCR iets verkeerd (een aantal, een prijs, een productnaam)? Corrigeer het hieronder en klik op "Opnieuw parsen" — dat leest de foto niet opnieuw, enkel deze tekst.
                      </p>
                      <textarea
                        value={scanRuweTekst}
                        onChange={(e) => setScanRuweTekst(e.target.value)}
                        rows={10}
                        style={{ width: "100%", fontSize: 12, fontFamily: "monospace", marginBottom: 8 }}
                      />
                      <button onClick={scanHerparsen}>🔁 Opnieuw parsen</button>
                    </>
                  )}
                </div>
              )}
              {scanKandidaten.length > 0 && (
                // Kaartjes i.p.v. een tabel: op een telefoon (het meest voor de
                // hand liggende moment om te scannen, meteen na een aankoop)
                // moest je bij een tabel opzij scrollen om de bestemming/
                // hoofdcategorie of het verwijder-knopje nog te bereiken.
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
                  {scanKandidaten.map((r, i) => (
                    <div key={i} className="card" style={{ padding: 12 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                        <input
                          value={r.omschrijving}
                          onChange={(e) => scanRijWijzigen(i, "omschrijving", e.target.value)}
                          style={{ flex: "1 1 140px", minWidth: 0 }}
                        />
                        <input
                          type="number" step="0.01" value={r.bedrag}
                          onChange={(e) => scanRijWijzigen(i, "bedrag", e.target.value)}
                          style={{ width: 90, textAlign: "right" }}
                        />
                        <button className="btn-danger" onClick={() => scanRijVerwijderen(i)}>🗑️</button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <select value={r.bestemming} onChange={(e) => scanRijWijzigen(i, "bestemming", e.target.value)}>
                          <option value="kamp">Kamp</option>
                          <option value="evenement">Evenement</option>
                          <option value="fv">FV (persoon)</option>
                        </select>
                        {r.bestemming === "kamp" && (
                          <select value={r.kampHoofdcategorie} onChange={(e) => scanRijWijzigen(i, "kampHoofdcategorie", e.target.value)}>
                            <option value="">Hoofdcategorie...</option>
                            <optgroup label="Afdeling">
                              {AFDELINGEN_VOLGORDE.map((a) => <option key={a} value={a}>{a}</option>)}
                            </optgroup>
                            <optgroup label="Algemeen">
                              {kampCategorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                            </optgroup>
                          </select>
                        )}
                        {r.bestemming === "evenement" && (
                          <>
                            <select value={r.evenementId} onChange={(e) => scanRijWijzigen(i, "evenementId", e.target.value)}>
                              <option value="">Evenement...</option>
                              {evenementen.map((e) => <option key={e.id} value={e.id}>{e.naam}</option>)}
                            </select>
                            <select value={r.evenementHoofdcategorie} onChange={(e) => scanRijWijzigen(i, "evenementHoofdcategorie", e.target.value)} disabled={!r.evenementId}>
                              <option value="">Hoofdcategorie...</option>
                              {(evenementCategorieenPerEvenement[r.evenementId] || []).map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                            </select>
                          </>
                        )}
                        {r.bestemming === "fv" && (
                          <>
                            <select value={r.fvUserId} onChange={(e) => scanRijWijzigen(i, "fvUserId", e.target.value)}>
                              <option value="">Persoon...</option>
                              {gebruikers.map((g) => <option key={g.id} value={g.id}>{g.naam}</option>)}
                            </select>
                            <select value={r.fvMaandId} onChange={(e) => scanRijWijzigen(i, "fvMaandId", e.target.value)}>
                              <option value="">FV-maand...</option>
                              {fvMaanden.map((m) => <option key={m.id} value={m.id}>{m.maand}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {scanKandidaten.length > 0 && (
                  <button className="btn-primary" disabled={scanBezig} onClick={scanBevestigen}>
                    {scanBezig ? "Bezig..." : `Alles toevoegen (${scanKandidaten.length})`}
                  </button>
                )}
                <button onClick={() => { setScanKandidaten(null); setScanRuweTekst(null); }}>Annuleren</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="muted" style={{ fontSize: 13 }}>Totaalbedrag</div>
          <div className="money" style={{ fontSize: 20, fontWeight: 700 }}>{euro(document.totaalbedrag)}</div>
        </div>
        <div className="stat">
          <div className="muted" style={{ fontSize: 13 }}>Toegewezen</div>
          <div className="money" style={{ fontSize: 20, fontWeight: 700 }}>{euro(toegewezen)}</div>
        </div>
        <div className={volledigVerdeeld ? "stat-primary" : "stat"}>
          <div style={{ fontSize: 13, opacity: volledigVerdeeld ? 0.75 : 1 }} className={!volledigVerdeeld ? "amount-neg" : ""}>Nog te verdelen</div>
          <div className={`money ${!volledigVerdeeld ? "amount-neg" : ""}`} style={{ fontSize: 20, fontWeight: 700 }}>{euro(resterend)}</div>
        </div>
      </div>

      <div className="eyebrow" style={{ marginBottom: 10 }}>Regels</div>
      <div className="card" style={{ padding: 0, marginBottom: magBewerken && !isVerwerkt ? 16 : 20 }}>
        {regels.length === 0 && <p className="muted" style={{ padding: 24, textAlign: "center" }}>Nog geen regels.</p>}
        {regels.map((r, i) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{r.omschrijving}</div>
              <div className="muted" style={{ fontSize: 12 }}>{bestemmingLabel(r)}</div>
            </div>
            <div className="money" style={{ fontWeight: 700, width: 90, textAlign: "right" }}>{euro(r.bedrag)}</div>
            {magBewerken && !isVerwerkt && (
              <button className="btn-danger" onClick={() => regelVerwijderen(r)}>🗑️</button>
            )}
          </div>
        ))}
      </div>

      {magBewerken && !isVerwerkt && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="grid-3" style={{ marginBottom: 10 }}>
            <input placeholder="Omschrijving" value={nieuweRegel.omschrijving} onChange={(e) => setNieuweRegel({ ...nieuweRegel, omschrijving: e.target.value })} style={{ gridColumn: "span 2" }} />
            <input type="number" step="0.01" placeholder="Bedrag" value={nieuweRegel.bedrag} onChange={(e) => setNieuweRegel({ ...nieuweRegel, bedrag: e.target.value })} />
            <select value={nieuweRegel.bestemming} onChange={(e) => setNieuweRegel({ ...LEGE_REGEL, omschrijving: nieuweRegel.omschrijving, bedrag: nieuweRegel.bedrag, bestemming: e.target.value })}>
              <option value="kamp">Kamp</option>
              <option value="evenement">Evenement</option>
              <option value="fv">Financieel Verslag (persoon)</option>
            </select>
            {nieuweRegel.bestemming === "kamp" && (
              <select value={nieuweRegel.kampHoofdcategorie} onChange={(e) => setNieuweRegel({ ...nieuweRegel, kampHoofdcategorie: e.target.value })} style={{ gridColumn: "span 2" }}>
                <option value="">Hoofdcategorie...</option>
                <optgroup label="Afdeling (telt mee voor kampbudget)">
                  {AFDELINGEN_VOLGORDE.map((a) => <option key={a} value={a}>{a}</option>)}
                </optgroup>
                <optgroup label="Algemeen">
                  {kampCategorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                </optgroup>
              </select>
            )}
            {nieuweRegel.bestemming === "evenement" && (
              <>
                <select value={nieuweRegel.evenementId} onChange={(e) => setNieuweRegel({ ...nieuweRegel, evenementId: e.target.value, evenementHoofdcategorie: "" })}>
                  <option value="">Evenement...</option>
                  {evenementen.map((e) => <option key={e.id} value={e.id}>{e.naam}</option>)}
                </select>
                <select value={nieuweRegel.evenementHoofdcategorie} onChange={(e) => setNieuweRegel({ ...nieuweRegel, evenementHoofdcategorie: e.target.value })} disabled={!nieuweRegel.evenementId}>
                  <option value="">Hoofdcategorie...</option>
                  {evenementCategorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                </select>
              </>
            )}
            {nieuweRegel.bestemming === "fv" && (
              <>
                <select value={nieuweRegel.fvUserId} onChange={(e) => setNieuweRegel({ ...nieuweRegel, fvUserId: e.target.value })}>
                  <option value="">Persoon...</option>
                  {gebruikers.map((g) => <option key={g.id} value={g.id}>{g.naam}</option>)}
                </select>
                <select value={nieuweRegel.fvMaandId} onChange={(e) => setNieuweRegel({ ...nieuweRegel, fvMaandId: e.target.value })}>
                  <option value="">FV-maand...</option>
                  {fvMaanden.map((m) => <option key={m.id} value={m.id}>{m.maand}</option>)}
                </select>
              </>
            )}
          </div>
          <button className="btn-primary" onClick={regelToevoegen}>+ Regel toevoegen</button>
        </div>
      )}

      {magBewerken && !isVerwerkt && (
        <button className="btn-primary" disabled={!volledigVerdeeld || regels.length === 0} onClick={verwerken}>
          {volledigVerdeeld ? "Verwerken" : `Nog ${euro(resterend)} te verdelen voor je kan verwerken`}
        </button>
      )}

      {magBewerken && (
        <div style={{ marginTop: 16 }}>
          <button className="btn-danger" onClick={documentVerwijderen}>🗑️ Document verwijderen</button>
        </div>
      )}
    </div>
  );
}
