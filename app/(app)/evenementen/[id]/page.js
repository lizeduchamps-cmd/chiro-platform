"use client";
import { useSession, getSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { evenementMatchTag } from "@/lib/evenementMatch";
import { BRIEFJES, MUNTEN, samenstellingTotaal } from "@/lib/coupureVoorstel";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonStatRow, SkeletonCard } from "@/components/Skeleton";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

// Zelfde drempels als lib/budgetKleur.js (<80% groen, tot 100% oranje, erboven rood).
function budgetVulling(uitgegeven, budget) {
  if (!budget) return { pct: 0, kleur: "" };
  const pct = (Number(uitgegeven) / Number(budget)) * 100;
  return { pct: Math.min(100, pct), kleur: pct > 100 ? "danger" : pct >= 80 ? "warning" : "" };
}

const STATUS_BADGE = { Gepland: "badge-neutral", "Te vergoeden": "badge-warning", Betaald: "badge-success", Afgerond: "badge-neutral" };

const BETAALMETHODES = ["Overschrijving", "Cash", "Bancontact/Kaart", "Factuur op termijn"];
const STATUSSEN = ["Gepland", "Te vergoeden", "Betaald", "Afgerond"];
const STATUS_LABEL = { gepland: "Gepland", lopend: "Lopend", afgerond: "Afgerond" };

const LEGE_TRANSACTIE = {
  datum: new Date().toISOString().slice(0, 10),
  omschrijving: "",
  typeGeldstroom: "uitgave",
  typeKostenpost: "kost",
  hoofdcategorie: "",
  waar: "",
  hoeveelheid: "",
  bedrag: "",
};

// Zet een transactie-rij uit de API om naar het formaat van het bewerkformulier.
function naarBewerkVeld(t) {
  return {
    datum: t.datum || "",
    omschrijving: t.omschrijving || "",
    typeGeldstroom: t.type_geldstroom || "uitgave",
    typeKostenpost: t.type_kostenpost || "kost",
    hoofdcategorie: t.hoofdcategorie || "",
    waar: t.waar || "",
    hoeveelheid: t.hoeveelheid ?? "",
    bedrag: t.bedrag_totaal ?? "",
    betaalmethode: t.betaalmethode || "",
    status: t.status || "Gepland",
    medewerkerUserId: t.medewerker_user_id || "",
    bewijsstukUrl: t.bewijsstuk_url || "",
  };
}

export default function EvenementDetail({ params }) {
  const ruweId = decodeURIComponent(params.id);
  const { data: session } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [evenementId, setEvenementId] = useState(null);
  const [melding, setMelding] = useState(null);
  const [overzicht, setOverzicht] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gebruikers, setGebruikers] = useState([]);
  const [nieuweKassa, setNieuweKassa] = useState({ naam: "", type: "cash", wisselgeldStart: "" });
  const [toonNieuweKassa, setToonNieuweKassa] = useState(false);
  const [nieuweTransactie, setNieuweTransactie] = useState(LEGE_TRANSACTIE);
  const [toonTransactieForm, setToonTransactieForm] = useState(false);
  const [bewerkId, setBewerkId] = useState(null);
  const [bewerkVeld, setBewerkVeld] = useState(null);
  const [tellerOpen, setTellerOpen] = useState(null);
  const [tellerAantallen, setTellerAantallen] = useState({});
  const [nieuwTicket, setNieuwTicket] = useState({ naam: "", prijs: "", aantalVerkocht: "" });
  const [nieuweSponsor, setNieuweSponsor] = useState({ naam: "", bedrag: "", opmerking: "" });
  const [kasSamenstelling, setKasSamenstelling] = useState({});
  const [kasSamenstellingGewijzigd, setKasSamenstellingGewijzigd] = useState(false);
  const [toonKopieren, setToonKopieren] = useState(false);
  const [kopieerBronnen, setKopieerBronnen] = useState([]);
  const [kopieerBron, setKopieerBron] = useState("");

  // Vaste namen in de zijbalk (bv. "Lazarus") wijzen rechtstreeks naar dit pad
  // i.p.v. naar een evenement-id, want dat verandert elk werkjaar. Is het al
  // een geldig id, gebruik het meteen; is het een naam, zoek (of maak, als
  // het nog niet bestaat) het evenement voor het huidige werkjaar op — zonder
  // de URL te wijzigen, zodat bv. /evenementen/Lazarus permanent hetzelfde
  // adres blijft, elk werkjaar opnieuw.
  useEffect(() => {
    setLoading(true);
    setMelding(null);
    setOverzicht(null);
    if (UUID_RE.test(ruweId)) { setEvenementId(ruweId); return; }

    setEvenementId(null);
    (async () => {
      const w = await fetch("/api/werkjaren").then((r) => r.json());
      const actueel = w.werkjaren?.[0];
      if (!actueel) { setMelding("Nog geen werkjaar aangemaakt."); setLoading(false); return; }

      const e = await fetch(`/api/evenementen?werkjaarId=${actueel.id}`).then((r) => r.json());
      const zoek = ruweId.toLowerCase();
      const lijst = e.evenementen || [];
      const gevonden = lijst.find((ev) => ev.naam.toLowerCase() === zoek) || lijst.find((ev) => ev.naam.toLowerCase().includes(zoek));
      if (gevonden) { setEvenementId(gevonden.id); return; }

      const sessie = await getSession();
      if (!["admin", "financieel_verantwoordelijke"].includes(sessie?.user?.platformRecht)) {
        setMelding(`Nog geen evenement "${ruweId}" voor werkjaar ${actueel.naam}. Vraag een admin of financieel verantwoordelijke om dit aan te maken.`);
        setLoading(false);
        return;
      }
      const res = await fetch("/api/evenementen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam: ruweId, werkjaarId: actueel.id }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        setMelding(`Aanmaken van "${ruweId}" is mislukt.`);
        setLoading(false);
        return;
      }
      setEvenementId(data.evenement.id);
    })();
  }, [ruweId]);

  const laden = () => fetch(`/api/evenementen/overzicht?evenementId=${evenementId}`).then((r) => r.json()).then((d) => { setOverzicht(d); setLoading(false); });

  useEffect(() => {
    if (!evenementId) return;
    laden();
    fetch("/api/gebruikers/lijst").then((r) => r.json()).then((d) => setGebruikers(d.users || []));
  }, [evenementId]);

  // Houdt het lokale invoerraster voor de kassa-samenstelling in sync met de
  // server: elke keer overzicht opnieuw geladen wordt (na opslaan, kopiëren,
  // een kassa toevoegen/verwijderen, ...) start het raster weer vanaf de
  // opgeslagen waarden.
  useEffect(() => {
    const init = {};
    (overzicht?.kassas || []).forEach((k) => {
      if (k.type === "cash") init[k.id] = { ...(k.wisselgeld_start_samenstelling || {}) };
    });
    setKasSamenstelling(init);
    setKasSamenstellingGewijzigd(false);
  }, [overzicht]);

  if (melding) {
    return (
      <div style={{ padding: 32, maxWidth: 500 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{ruweId}</h1>
        <p className="muted">{melding}</p>
      </div>
    );
  }

  if (loading || !overzicht) {
    return (
      <div style={{ padding: 32, maxWidth: 1100 }}>
        <SkeletonStatRow count={3} />
        <SkeletonCard lines={3} />
      </div>
    );
  }
  if (overzicht.error) return <p className="amount-neg" style={{ padding: 32 }}>{overzicht.error}</p>;

  // Admin/financieel_verantwoordelijke mogen altijd; daarnaast wie een
  // verantwoordelijkheid-tag heeft die overeenkomt met de naam van dit
  // evenement (bv. "Taartenslag" bij evenement "Taartenslag 2026").
  const magBewerken =
    ["admin", "financieel_verantwoordelijke"].includes(session?.user?.platformRecht) ||
    evenementMatchTag(session?.user?.verantwoordelijkheden, overzicht.evenement.naam);

  const statusWijzigen = async (status) => {
    await fetch("/api/evenementen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: evenementId, status }),
    });
    laden();
  };

  const ticketToevoegen = async () => {
    if (!nieuwTicket.naam.trim() || nieuwTicket.prijs === "") return toast.error("Vul naam en prijs in.");
    const res = await fetch("/api/evenementen/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId, ...nieuwTicket }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuwTicket({ naam: "", prijs: "", aantalVerkocht: "" });
    laden();
  };

  const ticketBijwerken = async (id, veld, waarde) => {
    await fetch("/api/evenementen/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, evenementId, [veld]: waarde }),
    });
    laden();
  };

  const ticketVerwijderen = async (id) => {
    await fetch(`/api/evenementen/tickets?id=${id}&evenementId=${evenementId}`, { method: "DELETE" });
    laden();
  };

  const sponsorToevoegen = async () => {
    if (!nieuweSponsor.naam.trim() || nieuweSponsor.bedrag === "") return toast.error("Vul naam en bedrag in.");
    const res = await fetch("/api/evenementen/sponsors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId, ...nieuweSponsor }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweSponsor({ naam: "", bedrag: "", opmerking: "" });
    laden();
  };

  const sponsorVerwijderen = async (id) => {
    await fetch(`/api/evenementen/sponsors?id=${id}&evenementId=${evenementId}`, { method: "DELETE" });
    laden();
  };

  const kassaToevoegen = async () => {
    if (!nieuweKassa.naam.trim()) return toast.error("Vul een naam in voor de kassa.");
    const res = await fetch("/api/evenementen/kassas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId, ...nieuweKassa }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweKassa({ naam: "", type: "cash", wisselgeldStart: "" });
    setToonNieuweKassa(false);
    laden();
    toast.success("Kassa toegevoegd");
  };

  const kassaBijwerken = async (kassaId, veld, waarde) => {
    await fetch("/api/evenementen/kassas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: kassaId, [veld]: waarde === "" ? "" : Number(waarde) }),
    });
    laden();
  };

  // Enkel nog voor "Inhoud na afloop" — dat is de werkelijkheid die na een
  // evenement altijd opnieuw geteld moet worden. "Wisselgeld start" (vooraf)
  // gebeurt hieronder via de gecombineerde kassa-samenstellingstabel.
  const tellerOpenen = (kassa) => {
    if (tellerOpen === kassa.id) { setTellerOpen(null); return; }
    setTellerAantallen(kassa.inhoud_einde_samenstelling || {});
    setTellerOpen(kassa.id);
  };

  const tellerToepassen = async () => {
    const totaal = Math.round(samenstellingTotaal(tellerAantallen) * 100) / 100;
    await fetch("/api/evenementen/kassas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tellerOpen, inhoudEinde: totaal, inhoudEindeSamenstelling: tellerAantallen }),
    });
    setTellerOpen(null);
    laden();
    toast.success("Kassa-inhoud bijgewerkt");
  };

  const kassaVerwijderen = async (kassaId) => {
    const ok = await confirm({ title: "Kassa verwijderen", message: "Deze kassa verwijderen?", danger: true, bevestigLabel: "Verwijderen" });
    if (!ok) return;
    await fetch(`/api/evenementen/kassas?id=${kassaId}`, { method: "DELETE" });
    laden();
    toast.success("Kassa verwijderd");
  };

  const kasSamenstellingWijzigen = (kassaId, denom, waarde) => {
    setKasSamenstelling((prev) => ({
      ...prev,
      [kassaId]: { ...prev[kassaId], [denom]: waarde === "" ? "" : Number(waarde) },
    }));
    setKasSamenstellingGewijzigd(true);
  };

  const kasSamenstellingOpslaan = async () => {
    const cashKassas = (overzicht?.kassas || []).filter((k) => k.type === "cash");
    await Promise.all(
      cashKassas.map((k) => {
        const samenstelling = kasSamenstelling[k.id] || {};
        return fetch("/api/evenementen/kassas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: k.id,
            wisselgeldStart: Math.round(samenstellingTotaal(samenstelling) * 100) / 100,
            wisselgeldStartSamenstelling: samenstelling,
          }),
        });
      })
    );
    laden();
    toast.success("Kassa-samenstelling opgeslagen");
  };

  const kopierenOpenen = async () => {
    const res = await fetch(`/api/evenementen/kassas/bronnen?exclude=${evenementId}`);
    const data = await res.json();
    setKopieerBronnen(data.evenementen || []);
    setToonKopieren(true);
  };

  const kassasKopieren = async () => {
    if (!kopieerBron) return;
    const res = await fetch("/api/evenementen/kassas/kopieer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId, bronEvenementId: kopieerBron }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setToonKopieren(false);
    setKopieerBron("");
    laden();
    toast.success("Kassa-samenstelling gekopieerd — pas gerust aan.");
  };

  const budgetBijwerken = async (hoofdcategorie, budgetToegewezen) => {
    await fetch("/api/evenementen/budgetten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId, hoofdcategorie, budgetToegewezen: budgetToegewezen === "" ? "" : Number(budgetToegewezen) }),
    });
    laden();
  };

  const transactieToevoegen = async () => {
    const t = nieuweTransactie;
    if (!t.datum || !t.omschrijving || !t.bedrag) return toast.error("Vul minstens datum, omschrijving en bedrag in.");
    const res = await fetch("/api/evenementen/transacties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evenementId,
        datum: t.datum,
        omschrijving: t.omschrijving,
        typeGeldstroom: t.typeGeldstroom,
        typeKostenpost: t.typeKostenpost,
        hoofdcategorie: t.hoofdcategorie || null,
        waar: t.waar || null,
        hoeveelheid: t.hoeveelheid || null,
        bedrag: t.bedrag,
      }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweTransactie(LEGE_TRANSACTIE);
    laden();
    toast.success("Transactie toegevoegd");
  };

  // Optimistisch: de rij verdwijnt meteen; de balans/budgetten herberekenen
  // pas na de undo-periode (via laden()), dat is de enige stap die écht een
  // volledige serverherberekening nodig heeft.
  const transactieVerwijderen = (t) => {
    if (bewerkId === t.id) { setBewerkId(null); setBewerkVeld(null); }
    setOverzicht((prev) => ({ ...prev, transacties: prev.transacties.filter((x) => x.id !== t.id) }));
    toast.undoable({
      message: "Transactie verwijderd",
      onUndo: laden,
      onCommit: async () => {
        await fetch(`/api/evenementen/transacties?id=${t.id}`, { method: "DELETE" });
        laden();
      },
    });
  };

  const rijOpenen = (t) => {
    if (!magBewerken) return;
    if (bewerkId === t.id) { setBewerkId(null); setBewerkVeld(null); return; }
    setBewerkId(t.id);
    setBewerkVeld(naarBewerkVeld(t));
  };

  const bewerkOpslaan = async () => {
    const v = bewerkVeld;
    if (!v.datum || !v.omschrijving || !v.bedrag) return toast.error("Vul minstens datum, omschrijving en bedrag in.");
    const res = await fetch("/api/evenementen/transacties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: bewerkId,
        datum: v.datum,
        omschrijving: v.omschrijving,
        typeGeldstroom: v.typeGeldstroom,
        typeKostenpost: v.typeGeldstroom === "uitgave" ? v.typeKostenpost : null,
        hoofdcategorie: v.hoofdcategorie || null,
        waar: v.waar || null,
        hoeveelheid: v.hoeveelheid === "" ? null : v.hoeveelheid,
        bedrag: v.bedrag,
        betaalmethode: v.betaalmethode || null,
        status: v.status,
        medewerkerUserId: v.medewerkerUserId || null,
        bewijsstukUrl: v.bewijsstukUrl || null,
      }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setBewerkId(null);
    setBewerkVeld(null);
    laden();
    toast.success("Transactie bijgewerkt");
  };

  const categorieToevoegen = async (zetIn) => {
    const naam = prompt("Naam van de nieuwe categorie:");
    if (!naam?.trim()) return;
    const res = await fetch("/api/evenementen/categorieen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId, naam: naam.trim() }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    zetIn(naam.trim());
    laden();
    toast.success(`Categorie "${naam.trim()}" toegevoegd`);
  };

  const categorieVerwijderen = async (categorieId) => {
    const ok = await confirm({
      title: "Categorie verwijderen",
      message: "Deze categorie verwijderen? Transacties die er al aan hangen behouden hun naam als tekst, maar tellen niet meer mee in het budgetoverzicht.",
      danger: true,
      bevestigLabel: "Verwijderen",
    });
    if (!ok) return;
    await fetch(`/api/evenementen/categorieen?id=${categorieId}`, { method: "DELETE" });
    laden();
    toast.success("Categorie verwijderd");
  };

  const { evenement, kassas, kassasMetTekort, categorieen, transacties, gekoppeldeTransacties, tickets, ticketOmzet, sponsors, sponsorBedrag, budgetBurnRate, nogTerugTeBetalen, balans } = overzicht;
  const cashKassas = kassas.filter((k) => k.type === "cash");
  const ALLE_COUPURES = [...BRIEFJES, ...MUNTEN];

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800 }}>{evenement.naam}</h1>
          <p className="muted" style={{ fontSize: 15, marginTop: 6 }}>{evenement.datum || "Geen datum ingesteld"}</p>
        </div>
        {magBewerken && (
          <select value={evenement.status} onChange={(e) => statusWijzigen(e.target.value)} style={{ fontWeight: 600 }}>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
      </div>

      {/* Balans */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="muted" style={{ fontSize: 13 }}>Totale inkomsten</div>
          <div className="money" style={{ fontSize: 24, fontWeight: 700 }}>{euro(balans.totaalInkomsten)}</div>
        </div>
        <div className="stat">
          <div className="muted" style={{ fontSize: 13 }}>Totale uitgaven</div>
          <div className="money" style={{ fontSize: 24, fontWeight: 700, color: "var(--danger-deep)" }}>{euro(balans.totaalUitgaven)}</div>
        </div>
        <div className="stat-primary">
          <div style={{ fontSize: 13, opacity: 0.75 }}>{balans.nettoWinst < 0 ? "Netto verlies" : "Netto winst"}</div>
          <div className="money" style={{ fontSize: 24, fontWeight: 700 }}>{euro(Math.abs(balans.nettoWinst))}</div>
        </div>
      </div>

      {/* Ticketverkoop (optionele module) */}
      {evenement.heeft_ticketverkoop && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Ticketverkoop</div>
            <div className="money" style={{ fontWeight: 700 }}>{euro(ticketOmzet)}</div>
          </div>
          {tickets.length === 0 && <p className="muted" style={{ fontStyle: "italic", fontSize: 13, marginBottom: 10 }}>Nog geen ticket-types.</p>}
          {tickets.map((t, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 120, fontWeight: 600, fontSize: 14 }}>{t.naam}</div>
              {magBewerken ? (
                <>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                    €<input type="number" step="0.01" defaultValue={t.prijs} onBlur={(e) => ticketBijwerken(t.id, "prijs", Number(e.target.value))} style={{ width: 70 }} />
                  </label>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                    ×<input type="number" step="1" defaultValue={t.aantal_verkocht} onBlur={(e) => ticketBijwerken(t.id, "aantalVerkocht", Number(e.target.value))} style={{ width: 60 }} />
                  </label>
                </>
              ) : (
                <span className="subtle" style={{ fontSize: 13 }}>{euro(t.prijs)} × {t.aantal_verkocht}</span>
              )}
              <div className="money" style={{ fontWeight: 700, minWidth: 80, textAlign: "right" }}>{euro(Number(t.prijs) * Number(t.aantal_verkocht))}</div>
              {magBewerken && <button className="btn-danger" onClick={() => ticketVerwijderen(t.id)}>🗑️</button>}
            </div>
          ))}
          {magBewerken && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <input placeholder="Type, bv. Vroegboek" value={nieuwTicket.naam} onChange={(e) => setNieuwTicket({ ...nieuwTicket, naam: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
              <input type="number" step="0.01" placeholder="Prijs" value={nieuwTicket.prijs} onChange={(e) => setNieuwTicket({ ...nieuwTicket, prijs: e.target.value })} style={{ width: 80 }} />
              <input type="number" step="1" placeholder="Aantal" value={nieuwTicket.aantalVerkocht} onChange={(e) => setNieuwTicket({ ...nieuwTicket, aantalVerkocht: e.target.value })} style={{ width: 80 }} />
              <button className="btn-primary" onClick={ticketToevoegen}>+ Type</button>
            </div>
          )}
        </div>
      )}

      {/* Sponsoring (optionele module) */}
      {evenement.heeft_sponsoring && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Sponsoring</div>
            <div className="money" style={{ fontWeight: 700 }}>{euro(sponsorBedrag)}</div>
          </div>
          {sponsors.length === 0 && <p className="muted" style={{ fontStyle: "italic", fontSize: 13, marginBottom: 10 }}>Nog geen sponsors.</p>}
          {sponsors.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
              <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{s.naam}{s.opmerking && <span className="muted" style={{ fontWeight: 400 }}> — {s.opmerking}</span>}</div>
              <div className="money" style={{ fontWeight: 700 }}>{euro(s.bedrag)}</div>
              {magBewerken && <button className="btn-danger" onClick={() => sponsorVerwijderen(s.id)}>🗑️</button>}
            </div>
          ))}
          {magBewerken && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <input placeholder="Sponsor" value={nieuweSponsor.naam} onChange={(e) => setNieuweSponsor({ ...nieuweSponsor, naam: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
              <input type="number" step="0.01" placeholder="Bedrag" value={nieuweSponsor.bedrag} onChange={(e) => setNieuweSponsor({ ...nieuweSponsor, bedrag: e.target.value })} style={{ width: 90 }} />
              <input placeholder="Opmerking (optioneel)" value={nieuweSponsor.opmerking} onChange={(e) => setNieuweSponsor({ ...nieuweSponsor, opmerking: e.target.value })} style={{ width: 160 }} />
              <button className="btn-primary" onClick={sponsorToevoegen}>+ Sponsor</button>
            </div>
          )}
        </div>
      )}

      {/* Gekoppelde kasboektransacties */}
      {gekoppeldeTransacties.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 15 }}>Gekoppelde kasboektransacties</div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Deze banktransacties staan al in het Kasboek en zijn hieraan getagd, puur ter referentie. Ze tellen niet mee in de balans hierboven — die blijft uitsluitend wat de groep zelf via kassa's/transacties bijhoudt.
          </p>
          {gekoppeldeTransacties.map((t, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", fontSize: 14 }}>
              <div className="subtle money">{t.datum}</div>
              <div className="muted" style={{ flex: 1 }}>{t.tegenpartij || t.vrije_mededeling || t.omschrijving || "-"} {t.categorieen?.naam && `· ${t.categorieen.naam}`}</div>
              <div className={`money ${t.soort === "uitgave" ? "amount-neg" : ""}`} style={{ fontWeight: 700 }}>{t.soort === "uitgave" ? "-" : "+"}{euro(t.bedrag)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Kassabeheer */}
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Kassabeheer</div>
        {kassasMetTekort.length > 0 && (
          <div className="card card-danger" style={{ marginBottom: 14, fontSize: 14 }}>
            ⚠️ Kassa-tekort gedetecteerd: {kassasMetTekort.map((k) => `${k.naam} (${euro(Math.abs(k.verschil))} te weinig)`).join(", ")}
          </div>
        )}
        {kassas.length === 0 && <p className="muted" style={{ fontStyle: "italic", marginBottom: 14 }}>Nog geen kassa's.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: magBewerken ? 14 : 0 }}>
          {kassas.map((k) => (
            <div key={k.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{k.naam}</div>
                  <div className="subtle" style={{ fontSize: 13 }}>{k.type === "cash" ? "Cash" : "Digitaal"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ textAlign: "right" }}>
                    <div className="muted" style={{ fontSize: 12 }}>Omzet</div>
                    <div className="money" style={{ fontWeight: 700, fontSize: 18 }}>{euro(k.omzet)}</div>
                  </div>
                  {k.verschil !== null && (
                    <span className={`badge ${k.heeftTekort ? "badge-danger" : "badge-success"}`}>{k.verschil > 0 ? "+" : ""}{euro(k.verschil)}</span>
                  )}
                  {magBewerken && <button className="btn-danger" onClick={() => kassaVerwijderen(k.id)}>🗑️</button>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {k.type === "cash" && (
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                    Wisselgeld start
                    {magBewerken ? (
                      <input key={`${k.id}-ws-${k.wisselgeld_start}`} type="number" step="0.01" defaultValue={k.wisselgeld_start} onBlur={(e) => kassaBijwerken(k.id, "wisselgeldStart", e.target.value)} style={{ width: 90 }} />
                    ) : <span className="money" style={{ fontWeight: 600 }}>{euro(k.wisselgeld_start)}</span>}
                  </label>
                )}
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                  Inhoud na afloop
                  {magBewerken ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <input key={`${k.id}-ie-${k.inhoud_einde}`} type="number" step="0.01" defaultValue={k.inhoud_einde ?? ""} placeholder="nog niet geteld" onBlur={(e) => kassaBijwerken(k.id, "inhoudEinde", e.target.value)} style={{ width: 90 }} />
                      {k.type === "cash" && <button type="button" title="Briefjes/muntjes tellen" onClick={() => tellerOpenen(k)}>🧮</button>}
                    </div>
                  ) : <span className="money" style={{ fontWeight: 600 }}>{k.inhoud_einde !== null ? euro(k.inhoud_einde) : "-"}</span>}
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                  Verwacht
                  {magBewerken ? (
                    <input key={`${k.id}-vb-${k.verwacht_bedrag}`} type="number" step="0.01" defaultValue={k.verwacht_bedrag ?? ""} placeholder="optioneel" onBlur={(e) => kassaBijwerken(k.id, "verwachtBedrag", e.target.value)} style={{ width: 90 }} />
                  ) : <span className="money" style={{ fontWeight: 600 }}>{k.verwacht_bedrag !== null ? euro(k.verwacht_bedrag) : "-"}</span>}
                </label>
              </div>

              {tellerOpen === k.id && (
                <div style={{ background: "var(--surface-alt)", borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                    Inhoud na afloop — briefjes &amp; muntjes tellen
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 12 }}>
                    <div>
                      <div className="subtle" style={{ fontSize: 11, marginBottom: 4 }}>BRIEFJES</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {BRIEFJES.map((d) => (
                          <label key={d} style={{ fontSize: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            €{d}
                            <input type="number" min="0" step="1" style={{ width: 54, textAlign: "center" }} value={tellerAantallen[d] ?? ""} onChange={(e) => setTellerAantallen((prev) => ({ ...prev, [d]: e.target.value === "" ? "" : Number(e.target.value) }))} />
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="subtle" style={{ fontSize: 11, marginBottom: 4 }}>MUNTJES</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {MUNTEN.map((d) => (
                          <label key={d} style={{ fontSize: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            €{d}
                            <input type="number" min="0" step="1" style={{ width: 54, textAlign: "center" }} value={tellerAantallen[d] ?? ""} onChange={(e) => setTellerAantallen((prev) => ({ ...prev, [d]: e.target.value === "" ? "" : Number(e.target.value) }))} />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="money" style={{ fontWeight: 700 }}>Totaal: {euro(samenstellingTotaal(tellerAantallen))}</span>
                    <button className="btn-primary" onClick={tellerToepassen}>Toepassen</button>
                    <button onClick={() => setTellerOpen(null)}>Annuleren</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        {magBewerken && (
          toonNieuweKassa ? (
            <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input placeholder="Naam, bv. Kassa inkom" value={nieuweKassa.naam} onChange={(e) => setNieuweKassa({ ...nieuweKassa, naam: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
              <select value={nieuweKassa.type} onChange={(e) => setNieuweKassa({ ...nieuweKassa, type: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="digitaal">Digitaal (SumUp/Payconiq)</option>
              </select>
              {nieuweKassa.type === "cash" && (
                <input type="number" step="0.01" placeholder="Wisselgeld start" value={nieuweKassa.wisselgeldStart} onChange={(e) => setNieuweKassa({ ...nieuweKassa, wisselgeldStart: e.target.value })} style={{ width: 130 }} />
              )}
              <button className="btn-primary" onClick={kassaToevoegen}>Toevoegen</button>
              <button onClick={() => setToonNieuweKassa(false)}>Annuleren</button>
            </div>
          ) : toonKopieren ? (
            <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {kopieerBronnen.length === 0 ? (
                <p className="subtle" style={{ fontSize: 13 }}>Geen ander evenement met kassa's gevonden om van te kopiëren.</p>
              ) : (
                <>
                  <select value={kopieerBron} onChange={(e) => setKopieerBron(e.target.value)} style={{ minWidth: 220 }}>
                    <option value="">Kies een evenement...</option>
                    {kopieerBronnen.map((b) => <option key={b.id} value={b.id}>{b.naam}{b.datum ? ` (${b.datum})` : ""}</option>)}
                  </select>
                  <button className="btn-primary" disabled={!kopieerBron} onClick={kassasKopieren}>Kopieer kassa-samenstelling</button>
                </>
              )}
              <button onClick={() => { setToonKopieren(false); setKopieerBron(""); }}>Annuleren</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setToonNieuweKassa(true)}>+ Kassa toevoegen</button>
              {kassas.length === 0 && <button onClick={kopierenOpenen}>↺ Dupliceer van vorig jaar</button>}
            </div>
          )
        )}

        {cashKassas.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Kassa-samenstelling — wat je vooraf klaarlegt</div>
            <p className="subtle" style={{ fontSize: 12, marginBottom: 10 }}>Coupures per kassa; "Wisselgeld start" hierboven wordt hier automatisch uit opgeteld.</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Coupure</th>
                    {cashKassas.map((k) => <th key={k.id}>{k.naam}</th>)}
                    {cashKassas.length > 1 && <th>Totaal stuks</th>}
                  </tr>
                </thead>
                <tbody>
                  {ALLE_COUPURES.map((d) => (
                    <tr key={d}>
                      <td>€{d}</td>
                      {cashKassas.map((k) => (
                        <td key={k.id}>
                          {magBewerken ? (
                            <input type="number" min="0" step="1" style={{ width: 60 }} value={kasSamenstelling[k.id]?.[d] ?? ""} onChange={(e) => kasSamenstellingWijzigen(k.id, d, e.target.value)} />
                          ) : (kasSamenstelling[k.id]?.[d] || 0)}
                        </td>
                      ))}
                      {cashKassas.length > 1 && <td className="muted">{cashKassas.reduce((s, k) => s + Number(kasSamenstelling[k.id]?.[d] || 0), 0)}</td>}
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700 }}>
                    <td>Totaal</td>
                    {cashKassas.map((k) => <td key={k.id} className="money">{euro(samenstellingTotaal(kasSamenstelling[k.id] || {}))}</td>)}
                    {cashKassas.length > 1 && <td></td>}
                  </tr>
                </tbody>
              </table>
            </div>
            {magBewerken && kasSamenstellingGewijzigd && (
              <button className="btn-primary" style={{ marginTop: 10 }} onClick={kasSamenstellingOpslaan}>Samenstelling opslaan</button>
            )}
          </div>
        )}
      </div>

      {/* Budgetten */}
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Budget per hoofdcategorie</div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Optioneel — laat leeg voor categorieën zonder vast budget.</p>
        {categorieen.length === 0 && (
          <p className="muted" style={{ fontStyle: "italic" }}>Nog geen categorieën — maak er een aan via het "+"-knopje bij een nieuwe transactie.</p>
        )}
        <div className="card" style={{ padding: 0 }}>
          {categorieen.map((c, i) => {
            const cat = c.naam;
            const rij = budgetBurnRate.find((b) => b.hoofdcategorie === cat);
            const { pct, kleur } = budgetVulling(rij?.uitgegeven, rij?.budget);
            return (
              <div key={c.id} style={{ padding: "14px 18px", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{cat}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    {magBewerken ? (
                      <input type="number" step="0.01" defaultValue={rij?.budget ?? ""} placeholder="geen limiet" onBlur={(e) => budgetBijwerken(cat, e.target.value)} style={{ width: 90, textAlign: "right" }} />
                    ) : (
                      <span className="money muted" style={{ fontSize: 13 }}>{rij?.budget !== null && rij?.budget !== undefined ? euro(rij.budget) : "geen limiet"}</span>
                    )}
                    <span className="money" style={{ fontWeight: 700 }}>{euro(rij?.uitgegeven || 0)}</span>
                    {magBewerken && <button className="btn-danger" onClick={() => categorieVerwijderen(c.id)}>🗑️</button>}
                  </div>
                </div>
                {rij?.budget ? (
                  <>
                    <div className="progress-track"><div className={`progress-fill ${kleur}`} style={{ width: `${pct}%` }} /></div>
                    <div className={`muted money ${rij.resterend < 0 ? "amount-neg" : ""}`} style={{ fontSize: 12 }}>
                      {rij.resterend < 0 ? "over budget: " : "resterend: "}{euro(Math.abs(rij.resterend))}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Nog terug te betalen */}
      {nogTerugTeBetalen.length > 0 && (
        <div className="card card-warning" style={{ marginBottom: 24 }}>
          <span className="badge badge-warning" style={{ marginBottom: 10, display: "inline-block" }}>Nog terug te betalen</span>
          {nogTerugTeBetalen.map((r, i) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{r.wie?.naam || "-"}</div>
                <div className="subtle" style={{ fontSize: 13 }}>{r.omschrijving} · {r.wie?.iban || "IBAN onbekend"}</div>
              </div>
              <div className="money" style={{ fontWeight: 700, fontSize: 17 }}>{euro(r.bedrag)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Transacties */}
      <div className="eyebrow" style={{ marginBottom: 10 }}>Transacties</div>
      <div style={{ marginBottom: 12 }}>
        {magBewerken && (
          <button onClick={() => setToonTransactieForm(!toonTransactieForm)}>{toonTransactieForm ? "Annuleren" : "+ Transactie toevoegen"}</button>
        )}
      </div>

      {toonTransactieForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="grid-3" style={{ marginBottom: 8 }}>
            <input type="date" value={nieuweTransactie.datum} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, datum: e.target.value })} />
            <input placeholder="Omschrijving" value={nieuweTransactie.omschrijving} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, omschrijving: e.target.value })} style={{ gridColumn: "span 2" }} />
            <select value={nieuweTransactie.typeGeldstroom} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, typeGeldstroom: e.target.value })}>
              <option value="uitgave">Uitgave</option>
              <option value="inkomst">Inkomst</option>
            </select>
            {nieuweTransactie.typeGeldstroom === "uitgave" && (
              <select value={nieuweTransactie.typeKostenpost} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, typeKostenpost: e.target.value })}>
                <option value="kost">Kost (eenmalig)</option>
                <option value="investering">Investering (blijft mee)</option>
              </select>
            )}
            <input type="number" step="0.01" placeholder="Bedrag" value={nieuweTransactie.bedrag} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, bedrag: e.target.value })} />
            <div style={{ display: "flex", gap: 4 }}>
              <select value={nieuweTransactie.hoofdcategorie} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, hoofdcategorie: e.target.value })} style={{ flex: 1 }}>
                <option value="">Hoofdcategorie...</option>
                {categorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
              </select>
              <button type="button" onClick={() => categorieToevoegen((naam) => setNieuweTransactie((prev) => ({ ...prev, hoofdcategorie: naam })))} title="Nieuwe categorie">+</button>
            </div>
            <input placeholder="Waar gekocht/besteld (optioneel)" value={nieuweTransactie.waar} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, waar: e.target.value })} />
            <input type="number" step="0.01" placeholder="Hoeveelheid (optioneel)" value={nieuweTransactie.hoeveelheid} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, hoeveelheid: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={transactieToevoegen}>Toevoegen</button>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {transacties.length === 0 && <p className="muted" style={{ padding: 24, textAlign: "center" }}>Nog geen transacties.</p>}
        {transacties.map((t, i) => {
          const open = bewerkId === t.id;
          return (
            <div key={t.id} style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: magBewerken ? "pointer" : "default" }} onClick={() => rijOpenen(t)}>
                <div className="money muted" style={{ width: 60, fontSize: 13, flexShrink: 0 }}>{t.datum}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {t.omschrijving}
                    {t.waar && <span className="subtle"> · {t.waar}</span>}
                    {t.hoeveelheid ? <span className="subtle"> · {t.hoeveelheid}×</span> : ""}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t.transactie_code}{t.hoofdcategorie ? ` · ${t.hoofdcategorie}` : ""}
                    {t.bewijsstuk_url && <> · <a href={t.bewijsstuk_url} target="_blank" rel="noreferrer" className="link" onClick={(e) => e.stopPropagation()}>bonnetje</a></>}
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[t.status] || "badge-neutral"}`}>{t.status}</span>
                <div className={`money ${t.type_geldstroom === "uitgave" ? "amount-neg" : ""}`} style={{ width: 90, textAlign: "right", fontWeight: 700, color: t.type_geldstroom !== "uitgave" ? "var(--success-text)" : undefined }}>
                  {t.type_geldstroom === "uitgave" ? "-" : "+"}{euro(t.bedrag_totaal)}
                </div>
                {magBewerken && (
                  <button className="btn-danger" onClick={(e) => { e.stopPropagation(); transactieVerwijderen(t); }}>🗑️</button>
                )}
              </div>
              {open && bewerkVeld && (
                <div style={{ padding: "0 18px 16px" }}>
                  <div className="grid-3" style={{ marginBottom: 8 }}>
                    <input type="date" value={bewerkVeld.datum} onChange={(e) => setBewerkVeld({ ...bewerkVeld, datum: e.target.value })} />
                    <input placeholder="Omschrijving" value={bewerkVeld.omschrijving} onChange={(e) => setBewerkVeld({ ...bewerkVeld, omschrijving: e.target.value })} style={{ gridColumn: "span 2" }} />
                    <select value={bewerkVeld.typeGeldstroom} onChange={(e) => setBewerkVeld({ ...bewerkVeld, typeGeldstroom: e.target.value })}>
                      <option value="uitgave">Uitgave</option>
                      <option value="inkomst">Inkomst</option>
                    </select>
                    {bewerkVeld.typeGeldstroom === "uitgave" && (
                      <select value={bewerkVeld.typeKostenpost} onChange={(e) => setBewerkVeld({ ...bewerkVeld, typeKostenpost: e.target.value })}>
                        <option value="kost">Kost (eenmalig)</option>
                        <option value="investering">Investering (blijft mee)</option>
                      </select>
                    )}
                    <input type="number" step="0.01" placeholder="Bedrag" value={bewerkVeld.bedrag} onChange={(e) => setBewerkVeld({ ...bewerkVeld, bedrag: e.target.value })} />
                    <div style={{ display: "flex", gap: 4 }}>
                      <select value={bewerkVeld.hoofdcategorie} onChange={(e) => setBewerkVeld({ ...bewerkVeld, hoofdcategorie: e.target.value })} style={{ flex: 1 }}>
                        <option value="">Hoofdcategorie...</option>
                        {categorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                      </select>
                      <button type="button" onClick={() => categorieToevoegen((naam) => setBewerkVeld((prev) => ({ ...prev, hoofdcategorie: naam })))} title="Nieuwe categorie">+</button>
                    </div>
                    <input placeholder="Waar gekocht/besteld" value={bewerkVeld.waar} onChange={(e) => setBewerkVeld({ ...bewerkVeld, waar: e.target.value })} />
                    <input type="number" step="0.01" placeholder="Hoeveelheid" value={bewerkVeld.hoeveelheid} onChange={(e) => setBewerkVeld({ ...bewerkVeld, hoeveelheid: e.target.value })} />
                    <select value={bewerkVeld.betaalmethode} onChange={(e) => setBewerkVeld({ ...bewerkVeld, betaalmethode: e.target.value })}>
                      <option value="">Betaalmethode...</option>
                      {BETAALMETHODES.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <select value={bewerkVeld.status} onChange={(e) => setBewerkVeld({ ...bewerkVeld, status: e.target.value })}>
                      {STATUSSEN.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={bewerkVeld.medewerkerUserId} onChange={(e) => setBewerkVeld({ ...bewerkVeld, medewerkerUserId: e.target.value })}>
                      <option value="">Voorgeschoten door (optioneel)...</option>
                      {gebruikers.map((g) => <option key={g.id} value={g.id}>{g.naam}</option>)}
                    </select>
                    <input placeholder="Link naar bonnetje/factuur" value={bewerkVeld.bewijsstukUrl} onChange={(e) => setBewerkVeld({ ...bewerkVeld, bewijsstukUrl: e.target.value })} style={{ gridColumn: "span 2" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" onClick={bewerkOpslaan}>Opslaan</button>
                    <button onClick={() => { setBewerkId(null); setBewerkVeld(null); }}>Annuleren</button>
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
