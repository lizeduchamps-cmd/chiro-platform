"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonTable } from "@/components/Skeleton";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

const LEEG_UPLOAD = { titel: "", totaalbedrag: "", gekoppeldAan: "", evenementId: "" };

export default function Documenten() {
  const { data: session } = useSession();
  const toast = useToast();
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
      <div style={{ padding: 32, maxWidth: 1000 }}>
        <SkeletonTable rows={5} cols={5} />
      </div>
    );
  }

  const uploaden = async () => {
    if (!bestand || !upload.titel || !upload.totaalbedrag) return toast.error("Kies een bestand en vul titel + totaalbedrag in.");
    setBezig(true);
    const formData = new FormData();
    formData.append("bestand", bestand);
    formData.append("titel", upload.titel);
    formData.append("totaalbedrag", upload.totaalbedrag);
    formData.append("werkjaarId", werkjaarId);
    if (upload.gekoppeldAan) formData.append("gekoppeldAan", upload.gekoppeldAan);
    if (upload.gekoppeldAan === "evenement" && upload.evenementId) formData.append("evenementId", upload.evenementId);

    const res = await fetch("/api/documenten/upload", { method: "POST", body: formData });
    const data = await res.json();
    setBezig(false);
    if (data.error) return toast.error(data.error);
    setUpload(LEEG_UPLOAD);
    setBestand(null);
    setToonForm(false);
    laden(werkjaarId, statusFilter);
    toast.success("Document geüpload");
  };

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Documenten</h1>
        {werkjaren.length > 0 && (
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
            {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Bonnetjes en facturen uploaden, koppelen aan kamp of een evenement, en opsplitsen in regels die automatisch doorstromen naar Kampkosten, Evenementkosten of het Financieel Verslag.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Alle statussen</option>
          <option value="Nog te verwerken">Nog te verwerken</option>
          <option value="Verwerkt">Verwerkt</option>
        </select>
        {magUploaden && (
          <button className="btn-primary" onClick={() => setToonForm(!toonForm)}>{toonForm ? "Annuleren" : "+ Document uploaden"}</button>
        )}
      </div>

      {toonForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Nieuw document</div>
          <div className="grid-3" style={{ marginBottom: 8 }}>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setBestand(e.target.files[0] || null)} style={{ gridColumn: "span 2" }} />
            <input type="number" step="0.01" placeholder="Totaalbedrag" value={upload.totaalbedrag} onChange={(e) => setUpload({ ...upload, totaalbedrag: e.target.value })} />
            <input placeholder="Titel, bv. Colruyt kamp 14/08" value={upload.titel} onChange={(e) => setUpload({ ...upload, titel: e.target.value })} style={{ gridColumn: "span 2" }} />
            <select value={upload.gekoppeldAan} onChange={(e) => setUpload({ ...upload, gekoppeldAan: e.target.value, evenementId: "" })}>
              <option value="">Niet gekoppeld</option>
              <option value="kamp">Kamp</option>
              <option value="evenement">Evenement</option>
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

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Titel</th>
              <th>Gekoppeld aan</th>
              <th style={{ textAlign: "right" }}>Totaalbedrag</th>
              <th>Status</th>
              <th>Datum</th>
            </tr>
          </thead>
          <tbody>
            {documenten.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ textAlign: "center", border: "none", padding: 24 }}>Nog geen documenten.</td></tr>
            )}
            {documenten.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/documenten/${d.id}`} style={{ fontWeight: 600, color: "var(--primary)" }}>{d.titel}</Link>
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {d.gekoppeld_aan === "evenement" ? d.evenementen?.naam : d.gekoppeld_aan === "kamp" ? "Kamp" : "-"}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{euro(d.totaalbedrag)}</td>
                <td><span className={`badge ${d.status === "Verwerkt" ? "badge-primary" : "badge-neutral"}`}>{d.status}</span></td>
                <td className="subtle" style={{ whiteSpace: "nowrap" }}>{new Date(d.created_at).toLocaleDateString("nl-BE")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
