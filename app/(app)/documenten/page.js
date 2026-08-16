"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonTable } from "@/components/Skeleton";
import { comprimeerFoto } from "@/lib/imageCompress";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const LEEG_UPLOAD = { titel: "", totaalbedrag: "", gekoppeldAan: "", evenementId: "" };

export default function Documenten() {
  const { data: session } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [documenten, setDocumenten] = useState([]);
  const [evenementen, setEvenementen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [toonForm, setToonForm] = useState(false);
  const [upload, setUpload] = useState(LEEG_UPLOAD);
  const [bestand, setBestand] = useState(null);
  const [bezig, setBezig] = useState(false);

  const magUploaden = ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht) || (session?.user?.verantwoordelijkheden || []).length > 0;

  const laden = (id, status) => {
    const url = new URL("/api/documenten", window.location.origin);
    url.searchParams.set("werkjaarId", id);
    if (status) url.searchParams.set("status", status);
    fetch(url).then((r) => r.json()).then((d) => setDocumenten(d.documenten || []));
  };

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!werkjaarId) return;
    laden(werkjaarId, statusFilter);
    fetch(`/api/evenementen?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => setEvenementen(d.evenementen || []));
  }, [werkjaarId, statusFilter]);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 900 }}>
        <SkeletonTable rows={5} cols={5} />
      </div>
    );
  }

  const uploaden = async () => {
    if (!bestand || !upload.titel || !upload.totaalbedrag) return toast.error("Kies een bestand en vul titel + totaalbedrag in.");
    setBezig(true);
    // Grote telefoonfoto's (5-10MB) doen de upload vasthangen — comprimeren
    // in de browser vóór het versturen (PDF's en al kleine foto's blijven ongemoeid).
    const teUploaden = await comprimeerFoto(bestand);
    const formData = new FormData();
    formData.append("bestand", teUploaden);
    formData.append("titel", upload.titel);
    formData.append("totaalbedrag", upload.totaalbedrag);
    formData.append("werkjaarId", werkjaarId);
    if (upload.gekoppeldAan) formData.append("gekoppeldAan", upload.gekoppeldAan);
    if (upload.gekoppeldAan === "evenement" && upload.evenementId) formData.append("evenementId", upload.evenementId);

    let data;
    try {
      // Zonder timeout blijft de knop oneindig 'Bezig...' tonen als de upload
      // om een of andere reden vasthangt — dan liever een duidelijke fout.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch("/api/documenten/upload", { method: "POST", body: formData, signal: controller.signal });
      clearTimeout(timeoutId);
      data = await res.json();
    } catch (err) {
      setBezig(false);
      return toast.error(err.name === "AbortError" ? "Upload duurde te lang (bestand mogelijk te groot) — probeer een kleinere foto." : "Upload mislukt: " + err.message);
    }
    setBezig(false);
    if (data.error) return toast.error(data.error);
    setUpload(LEEG_UPLOAD);
    setBestand(null);
    setToonForm(false);
    laden(werkjaarId, statusFilter);
    toast.success("Document geüpload");
  };

  const documentVerwijderen = async (d) => {
    const ok = await confirm({
      title: "Document verwijderen",
      message:
        d.status === "Verwerkt"
          ? `"${d.titel}" en het bijhorende bestand verwijderen? De transacties die er al uit aangemaakt zijn blijven bestaan — enkel het document zelf verdwijnt.`
          : `"${d.titel}" en het bijhorende bestand verwijderen?`,
      danger: true,
      bevestigLabel: "Verwijderen",
    });
    if (!ok) return;
    const res = await fetch(`/api/documenten?id=${d.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setDocumenten((prev) => prev.filter((x) => x.id !== d.id));
    toast.success("Document verwijderd");
  };

  const gekoppeldLabel = (d) => (d.gekoppeld_aan === "evenement" ? d.evenementen?.naam : d.gekoppeld_aan === "kamp" ? "Kamp" : d.gekoppeld_aan === "fv" ? "Financieel Verslag" : "Niet gekoppeld");

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800 }}>Documenten</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 15, marginBottom: 20 }}>
        Bonnetjes en facturen uploaden, koppelen aan kamp of een evenement, en opsplitsen in regels die automatisch doorstromen naar Kampkosten, Evenementkosten of het Financieel Verslag.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setStatusFilter("")} className={!statusFilter ? "btn-primary" : ""} style={{ borderRadius: "var(--radius-pill)" }}>Alle statussen</button>
        <button onClick={() => setStatusFilter("Nog te verwerken")} className={statusFilter === "Nog te verwerken" ? "btn-primary" : ""} style={{ borderRadius: "var(--radius-pill)" }}>Nog te verwerken</button>
        <button onClick={() => setStatusFilter("Verwerkt")} className={statusFilter === "Verwerkt" ? "btn-primary" : ""} style={{ borderRadius: "var(--radius-pill)" }}>Verwerkt</button>
        {magUploaden && (
          <button className="btn-primary" onClick={() => setToonForm(!toonForm)} style={{ marginLeft: "auto" }}>{toonForm ? "Annuleren" : "+ Document uploaden"}</button>
        )}
      </div>

      {toonForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>Nieuw document</div>
          <div className="grid-3" style={{ marginBottom: 10 }}>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setBestand(e.target.files[0] || null)} style={{ gridColumn: "span 2" }} />
            <input type="number" step="0.01" placeholder="Totaalbedrag" value={upload.totaalbedrag} onChange={(e) => setUpload({ ...upload, totaalbedrag: e.target.value })} />
            <input placeholder="Titel, bv. Colruyt kamp 14/08" value={upload.titel} onChange={(e) => setUpload({ ...upload, titel: e.target.value })} style={{ gridColumn: "span 2" }} />
            <select value={upload.gekoppeldAan} onChange={(e) => setUpload({ ...upload, gekoppeldAan: e.target.value, evenementId: "" })}>
              <option value="">Niet gekoppeld</option>
              <option value="kamp">Kamp</option>
              <option value="evenement">Evenement</option>
              <option value="fv">Financieel Verslag</option>
            </select>
            {upload.gekoppeldAan === "evenement" && (
              <select value={upload.evenementId} onChange={(e) => setUpload({ ...upload, evenementId: e.target.value })} style={{ gridColumn: "span 2" }}>
                <option value="">Kies evenement...</option>
                {evenementen.map((e) => <option key={e.id} value={e.id}>{e.naam}</option>)}
              </select>
            )}
          </div>
          <button className="btn-primary" disabled={bezig} onClick={uploaden}>{bezig ? "Bezig met uploaden…" : "Uploaden"}</button>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {documenten.length === 0 && <p className="muted" style={{ padding: 24, textAlign: "center" }}>Nog geen documenten.</p>}
        {documenten.map((d, i) => (
          <div key={d.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <Link href={`/documenten/${d.id}`} className="link" style={{ fontWeight: 700, fontSize: 15, textDecoration: "none" }}>{d.titel}</Link>
              <div className="muted" style={{ fontSize: 12 }}>{gekoppeldLabel(d)} · {new Date(d.created_at).toLocaleDateString("nl-BE")}</div>
            </div>
            <span className={`badge ${d.status === "Verwerkt" ? "badge-success" : "badge-warning"}`} style={{ flexShrink: 0 }}>{d.status}</span>
            <div className="money" style={{ fontWeight: 700, flexShrink: 0, textAlign: "right" }}>{euro(d.totaalbedrag)}</div>
            {magUploaden && (
              <button className="btn-danger" style={{ flexShrink: 0 }} onClick={() => documentVerwijderen(d)}>🗑️</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
