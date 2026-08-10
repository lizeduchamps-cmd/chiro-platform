"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonCard } from "@/components/Skeleton";
import { AFDELINGEN_VOLGORDE } from "@/lib/kampAfdelingen";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const LEGE_REGEL = { omschrijving: "", bedrag: "", bestemming: "kamp", kampHoofdcategorie: "", evenementId: "", evenementHoofdcategorie: "", fvUserId: "", fvMaandId: "" };

export default function DocumentDetail({ params }) {
  const { id } = params;
  const { data: session } = useSession();
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

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <p className="subtle" style={{ fontSize: 12, marginBottom: 4 }}><Link href="/documenten">← Documenten</Link></p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{document.titel}</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {document.gekoppeld_aan === "evenement" ? document.evenementen?.naam : document.gekoppeld_aan === "kamp" ? "Kamp" : "Niet gekoppeld"}
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
    </div>
  );
}
