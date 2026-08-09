"use client";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

export default function Kasboek() {
  const { data: session, status } = useSession();

  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [categorieen, setCategorieen] = useState([]);
  const [transacties, setTransacties] = useState([]);
  const [saldos, setSaldos] = useState(null);
  const [zoekterm, setZoekterm] = useState("");
  const [filterCat, setFilterCat] = useState("");
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
  });

  const magBewerken = session?.user?.platformRecht === "admin" || session?.user?.platformRecht === "financieel_verantwoordelijke";

  // Basisdata laden: werkjaren + categorieën
  useEffect(() => {
    if (status !== "authenticated") return;
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
  }, [status]);

  // Transacties + saldos laden zodra het werkjaar bekend is (of wijzigt)
  useEffect(() => {
    if (!werkjaarId) return;
    fetch(`/api/transacties?werkjaarId=${werkjaarId}`)
      .then((r) => r.json())
      .then((data) => setTransacties(data.transacties || []));
    fetch(`/api/saldos?werkjaarId=${werkjaarId}`)
      .then((r) => r.json())
      .then((data) => setSaldos(data.saldos));
  }, [werkjaarId]);

  if (status === "loading" || loading) return <p style={{ padding: 32 }}>Laden…</p>;
  if (status === "unauthenticated") redirect("/inloggen");

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

  const verwijderTx = async (id) => {
    if (!confirm("Deze transactie verwijderen?")) return;
    await fetch(`/api/transacties?id=${id}`, { method: "DELETE" });
    setTransacties((prev) => prev.filter((t) => t.id !== id));
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
      <Layout session={session}>
        <div style={{ padding: 32 }}>
          <p style={{ color: "#B24C4C", marginBottom: 16 }}>{error}</p>
          <button onClick={nieuwWerkjaar}>➕ Werkjaar aanmaken</button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout session={session}>
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: "#6B6B5F", display: "block", marginBottom: 4 }}>Werkjaar</label>
          <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ padding: 8, fontWeight: 600 }}>
            {werkjaren.map((w) => (
              <option key={w.id} value={w.id}>{w.naam}</option>
            ))}
          </select>
          {magBewerken && (
            <button onClick={nieuwWerkjaar} style={{ marginLeft: 8 }}>➕ Nieuw werkjaar</button>
          )}
        </div>
        {magBewerken && <button onClick={nieuweCategorie}>+ Categorie</button>}
      </div>

      {saldos && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          <div style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#6B6B5F" }}>Algemene zichtrekening</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#2F4A3C" }}>{euro(saldos.zichtLopend)}</div>
            <div style={{ fontSize: 11, color: "#9A9A8C" }}>
              Startsaldo: {euro(saldos.zichtStart)}{" "}
              {magBewerken && <a href="#" onClick={(e) => { e.preventDefault(); wijzigStartsaldo("zicht", saldos.zichtStart); }}>(wijzig)</a>}
            </div>
          </div>
          <div style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#6B6B5F" }}>Spaarrekening</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#2F4A3C" }}>{euro(saldos.spaarLopend)}</div>
            <div style={{ fontSize: 11, color: "#9A9A8C" }}>
              Startsaldo: {euro(saldos.spaarStart)}{" "}
              {magBewerken && <a href="#" onClick={(e) => { e.preventDefault(); wijzigStartsaldo("spaar", saldos.spaarStart); }}>(wijzig)</a>}
            </div>
          </div>
          <div style={{ background: "#2F4A3C", color: "white", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#D9A62E" }}>Totaal lopend saldo</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{euro(saldos.totaal)}</div>
          </div>
        </div>
      )}

      {magBewerken && (
        <div style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, padding: 16, marginBottom: 20 }}>
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
          </div>
          <button onClick={opslaanNieuw} style={{ background: "#2F4A3C", color: "white", padding: "8px 16px", borderRadius: 8, border: "none" }}>
            Opslaan
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="🔍 Zoek op naam, mededeling, bedrag, datum..."
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          style={{ padding: 8, flex: 1, minWidth: 240 }}
        />
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ padding: 8 }}>
          <option value="">Alle categorieën</option>
          {categorieen.map((c) => (
            <option key={c.id} value={c.id}>{c.naam}</option>
          ))}
        </select>
      </div>

      <div style={{ background: "white", border: "1px solid #E4E0D4", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F5F3EE", textAlign: "left" }}>
              <th style={{ padding: 8 }}>Datum</th>
              <th style={{ padding: 8 }}>Rekening</th>
              <th style={{ padding: 8 }}>Tegenpartij</th>
              <th style={{ padding: 8 }}>Mededeling</th>
              <th style={{ padding: 8 }}>Categorie</th>
              <th style={{ padding: 8, textAlign: "right" }}>Bedrag</th>
              {magBewerken && <th style={{ padding: 8 }}></th>}
            </tr>
          </thead>
          <tbody>
            {gefilterd.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#9A9A8C" }}>Geen transacties gevonden.</td></tr>
            )}
            {gefilterd.map((t) => {
              const teken = t.soort === "uitgave" ? -1 : t.soort === "interne_transactie" ? 0 : 1;
              return (
                <tr key={t.id} style={{ borderTop: "1px solid #F0EEE5" }}>
                  <td style={{ padding: 8, whiteSpace: "nowrap" }}>{t.datum}</td>
                  <td style={{ padding: 8 }}>
                    {t.rekening_type === "zicht" ? "Zicht" : "Spaar"}
                    {t.soort === "interne_transactie" && ` → ${t.interne_bestemming_rekening === "zicht" ? "Zicht" : "Spaar"}`}
                  </td>
                  <td style={{ padding: 8, fontWeight: 600 }}>{t.tegenpartij || "-"}</td>
                  <td style={{ padding: 8, color: "#6B6B5F" }}>{t.vrije_mededeling || t.omschrijving || "-"}</td>
                  <td style={{ padding: 8 }}>
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
                  <td style={{ padding: 8, textAlign: "right", fontWeight: 700, color: teken < 0 ? "#B24C4C" : "#2F4A3C" }}>
                    {teken === 0 ? "" : teken > 0 ? "+" : "-"}{euro(t.bedrag)}
                  </td>
                  {magBewerken && (
                    <td style={{ padding: 8 }}>
                      <button onClick={() => verwijderTx(t.id)} title="Verwijderen">🗑️</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </Layout>
  );
}
