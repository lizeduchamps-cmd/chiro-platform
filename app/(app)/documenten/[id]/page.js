"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonCard } from "@/components/Skeleton";
import { AFDELINGEN_VOLGORDE } from "@/lib/kampAfdelingen";
import { parseKassabon } from "@/lib/receiptParser";
import { preprocessKassabon } from "@/lib/receiptImage";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const LEGE_REGEL = { omschrijving: "", bedrag: "", bestemming: "kamp", kampHoofdcategorie: "", evenementId: "", evenementHoofdcategorie: "", fvUserId: "", fvMaandId: "" };

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

      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("nld");
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
      const {
        data: { text },
      } = await worker.recognize(beeld);
      await worker.terminate();

      setScanRuweTekst(text);
      const kandidaten = parseKassabon(text);
      if (kandidaten.length === 0) {
        toast.error("Geen regels herkend op dit bonnetje. Bekijk 'Ruwe OCR-tekst' hieronder om te zien wat er gelezen werd, of vul handmatig in.");
      }
      const standaardBestemming = ["kamp", "evenement", "fv"].includes(document.gekoppeld_aan) ? document.gekoppeld_aan : "kamp";
      setScanKandidaten(
        kandidaten.map((k) => ({
          omschrijving: k.omschrijving,
          bedrag: String(k.bedrag),
          bestemming: standaardBestemming,
          kampHoofdcategorie: "",
          evenementId: "",
          evenementHoofdcategorie: "",
          fvUserId: "",
          fvMaandId: "",
        }))
      );
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
      <p className="subtle" style={{ fontSize: 12, marginBottom: 4 }}><Link href="/documenten">← Documenten</Link></p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{document.titel}</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {document.gekoppeld_aan === "evenement" ? document.evenementen?.naam : document.gekoppeld_aan === "kamp" ? "Kamp" : document.gekoppeld_aan === "fv" ? "Financieel Verslag" : "Niet gekoppeld"}
            {document.users?.naam && ` · geüpload door ${document.users.naam}`}
          </p>
        </div>
        <span className={`badge ${isVerwerkt ? "badge-primary" : "badge-neutral"}`}>{document.status}</span>
      </div>

      {signedUrl && (
        <div className="card" style={{ marginBottom: 20 }}>
          {document.bestand_type?.startsWith("image/") ? (
            <a href={signedUrl} target="_blank" rel="noreferrer">
              <img src={signedUrl} alt={document.titel} style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, display: "block" }} />
            </a>
          ) : (
            <a href={signedUrl} target="_blank" rel="noreferrer">📄 Bekijk document ↗</a>
          )}
        </div>
      )}

      {magBewerken && !isVerwerkt && signedUrl && document.bestand_type?.startsWith("image/") && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Bonnetje scannen</div>
          {!scanKandidaten ? (
            <>
              <p className="subtle" style={{ fontSize: 11, marginBottom: 8 }}>
                Leest tekst van de foto (OCR, geen AI) en herkent regels met een product en een prijs. Controleer en vul aan voor je bevestigt.
              </p>
              <button className="btn-primary" disabled={scanBezig} onClick={scanStarten}>
                {scanBezig ? "Bezig met scannen..." : "📷 Bonnetje scannen"}
              </button>
            </>
          ) : (
            <>
              <p className="subtle" style={{ fontSize: 11, marginBottom: 8 }}>
                {scanKandidaten.length === 0
                  ? "Niets herkend — pas gerust handmatig aan via 'Regel toevoegen' hieronder."
                  : `${scanKandidaten.length} regel(s) herkend. Controleer omschrijving, bedrag en bestemming voor je bevestigt.`}
              </p>
              {scanRuweTekst && (
                <div style={{ marginBottom: 8 }}>
                  <button onClick={() => setScanRuweTekstOpen(!scanRuweTekstOpen)} style={{ fontSize: 11 }}>
                    {scanRuweTekstOpen ? "▾" : "▸"} Ruwe OCR-tekst tonen
                  </button>
                  {scanRuweTekstOpen && (
                    <pre style={{ fontSize: 11, background: "var(--primary-tint)", padding: 8, borderRadius: 6, marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
                      {scanRuweTekst}
                    </pre>
                  )}
                </div>
              )}
              {scanKandidaten.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: 8 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Omschrijving</th>
                        <th style={{ textAlign: "right" }}>Bedrag</th>
                        <th>Bestemming</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanKandidaten.map((r, i) => (
                        <tr key={i}>
                          <td><input value={r.omschrijving} onChange={(e) => scanRijWijzigen(i, "omschrijving", e.target.value)} style={{ fontSize: 12, width: 160 }} /></td>
                          <td style={{ textAlign: "right" }}>
                            <input type="number" step="0.01" value={r.bedrag} onChange={(e) => scanRijWijzigen(i, "bedrag", e.target.value)} style={{ fontSize: 12, width: 70, textAlign: "right" }} />
                          </td>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <select value={r.bestemming} onChange={(e) => scanRijWijzigen(i, "bestemming", e.target.value)} style={{ fontSize: 12 }}>
                                <option value="kamp">Kamp</option>
                                <option value="evenement">Evenement</option>
                                <option value="fv">FV (persoon)</option>
                              </select>
                              {r.bestemming === "kamp" && (
                                <select value={r.kampHoofdcategorie} onChange={(e) => scanRijWijzigen(i, "kampHoofdcategorie", e.target.value)} style={{ fontSize: 12 }}>
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
                                  <select value={r.evenementId} onChange={(e) => scanRijWijzigen(i, "evenementId", e.target.value)} style={{ fontSize: 12 }}>
                                    <option value="">Evenement...</option>
                                    {evenementen.map((e) => <option key={e.id} value={e.id}>{e.naam}</option>)}
                                  </select>
                                  <select value={r.evenementHoofdcategorie} onChange={(e) => scanRijWijzigen(i, "evenementHoofdcategorie", e.target.value)} disabled={!r.evenementId} style={{ fontSize: 12 }}>
                                    <option value="">Hoofdcategorie...</option>
                                    {(evenementCategorieenPerEvenement[r.evenementId] || []).map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                                  </select>
                                </>
                              )}
                              {r.bestemming === "fv" && (
                                <>
                                  <select value={r.fvUserId} onChange={(e) => scanRijWijzigen(i, "fvUserId", e.target.value)} style={{ fontSize: 12 }}>
                                    <option value="">Persoon...</option>
                                    {gebruikers.map((g) => <option key={g.id} value={g.id}>{g.naam}</option>)}
                                  </select>
                                  <select value={r.fvMaandId} onChange={(e) => scanRijWijzigen(i, "fvMaandId", e.target.value)} style={{ fontSize: 12 }}>
                                    <option value="">FV-maand...</option>
                                    {fvMaanden.map((m) => <option key={m.id} value={m.id}>{m.maand}</option>)}
                                  </select>
                                </>
                              )}
                            </div>
                          </td>
                          <td><button className="btn-danger" onClick={() => scanRijVerwijderen(i)} style={{ fontSize: 11 }}>🗑️</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
          <div className="muted" style={{ fontSize: 12 }}>Totaalbedrag</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{euro(document.totaalbedrag)}</div>
        </div>
        <div className="stat">
          <div className="muted" style={{ fontSize: 12 }}>Toegewezen</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{euro(toegewezen)}</div>
        </div>
        <div className={volledigVerdeeld ? "stat-primary" : "stat"}>
          <div style={{ fontSize: 12, opacity: volledigVerdeeld ? 0.75 : 1 }} className={!volledigVerdeeld ? "amount-neg" : ""}>Nog te verdelen</div>
          <div className={!volledigVerdeeld ? "amount-neg" : ""} style={{ fontSize: 20, fontWeight: 700 }}>{euro(resterend)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Regels</div>
        <div className="table-wrap" style={{ marginBottom: magBewerken && !isVerwerkt ? 16 : 0 }}>
          <table>
            <thead>
              <tr>
                <th>Omschrijving</th>
                <th>Bestemming</th>
                <th style={{ textAlign: "right" }}>Bedrag</th>
                {magBewerken && !isVerwerkt && <th></th>}
              </tr>
            </thead>
            <tbody>
              {regels.length === 0 && (
                <tr><td colSpan={4} className="muted" style={{ textAlign: "center", border: "none", padding: 16 }}>Nog geen regels.</td></tr>
              )}
              {regels.map((r) => (
                <tr key={r.id}>
                  <td>{r.omschrijving}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {r.bestemming === "kamp" && `Kamp · ${r.kamp_hoofdcategorie || "-"}`}
                    {r.bestemming === "evenement" && `${r.evenementen?.naam || "Evenement"} · ${r.evenement_hoofdcategorie || "-"}`}
                    {r.bestemming === "fv" && `FV · ${r.users?.naam || "-"}`}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(r.bedrag)}</td>
                  {magBewerken && !isVerwerkt && (
                    <td><button className="btn-danger" onClick={() => regelVerwijderen(r)}>🗑️</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {magBewerken && !isVerwerkt && (
          <>
            <div className="grid-3" style={{ marginBottom: 8 }}>
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
          </>
        )}
      </div>

      {magBewerken && !isVerwerkt && (
        <button className="btn-primary" disabled={!volledigVerdeeld || regels.length === 0} onClick={verwerken}>
          {volledigVerdeeld ? "Verwerken" : `Nog ${euro(resterend)} te verdelen voor je kan verwerken`}
        </button>
      )}

      {magBewerken && (
        <button className="btn-danger" onClick={documentVerwijderen} style={{ marginTop: 16, fontSize: 12 }}>
          🗑️ Document verwijderen
        </button>
      )}
    </div>
  );
}
