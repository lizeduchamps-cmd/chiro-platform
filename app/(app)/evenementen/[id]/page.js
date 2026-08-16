"use client";
import { useSession, getSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { evenementMatchTag } from "@/lib/evenementMatch";
import { BRIEFJES, MUNTEN, samenstellingTotaal } from "@/lib/coupureVoorstel";
import { AFDELINGEN_VOLGORDE, AFDELINGEN_OUD } from "@/lib/kampAfdelingen";
import { useToast, useConfirm } from "@/components/NotifyProvider";
import { SkeletonStatRow, SkeletonCard } from "@/components/Skeleton";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

// Zelfde lijniconen-stijl als de zijbalk (NavIcon in components/Layout.js) —
// gestapelde muntjes, i.p.v. een emoji, om coupures tellen/aanpassen te openen.
function MuntenIcon({ color = "currentColor" }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v5c0 1.66 3.13 3 7 3s7-1.34 7-3V6" />
      <path d="M5 11v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" />
    </svg>
  );
}

// Zelfde drempels als lib/budgetKleur.js (<80% groen, tot 100% oranje, erboven rood).
function budgetVulling(uitgegeven, budget) {
  if (!budget) return { pct: 0, kleur: "" };
  const pct = (Number(uitgegeven) / Number(budget)) * 100;
  return { pct: Math.min(100, pct), kleur: pct > 100 ? "danger" : pct >= 80 ? "warning" : "" };
}

const STATUS_BADGE = { Gepland: "badge-neutral", "Te vergoeden": "badge-warning", Betaald: "badge-success", Afgerond: "badge-neutral" };

const TICKET_STATUS_LABEL = { klopt: "Klopt", tekort: "Tekort", teveel: "Teveel", nogNietAfgerekend: "Nog niet afgerekend" };
const TICKET_STATUS_BADGE = { klopt: "badge-success", tekort: "badge-danger", teveel: "badge-warning", nogNietAfgerekend: "badge-neutral" };

// Eén ticketverkoper-rij (Lazarus-achtige fuiven): bandjes meegenomen/
// teruggebracht per soort, wat er binnenkwam, en de status die daaruit volgt.
function TicketverkoperRij({ t, magBewerken, onBijwerken, onVerwijderen }) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{t.naam}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={`badge ${TICKET_STATUS_BADGE[t.status]}`}>
            {TICKET_STATUS_LABEL[t.status]}{t.verschil !== null && t.status !== "klopt" ? ` · ${euro(Math.abs(t.verschil))}` : ""}
          </span>
          {magBewerken && <button className="btn-danger" onClick={() => onVerwijderen(t.id)}>🗑️</button>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 }}>
          Jeugd meegenomen
          {magBewerken ? <input type="number" min="0" step="1" defaultValue={t.jeugd_meegenomen} onBlur={(e) => onBijwerken(t.id, "jeugdMeegenomen", e.target.value)} style={{ width: 70 }} /> : t.jeugd_meegenomen}
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 }}>
          Jeugd teruggebracht
          {magBewerken ? <input type="number" min="0" step="1" defaultValue={t.jeugd_teruggebracht ?? ""} placeholder="?" onBlur={(e) => onBijwerken(t.id, "jeugdTeruggebracht", e.target.value)} style={{ width: 70 }} /> : (t.jeugd_teruggebracht ?? "-")}
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 }}>
          30+ meegenomen
          {magBewerken ? <input type="number" min="0" step="1" defaultValue={t.volwassen_meegenomen} onBlur={(e) => onBijwerken(t.id, "volwassenMeegenomen", e.target.value)} style={{ width: 70 }} /> : t.volwassen_meegenomen}
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 }}>
          30+ teruggebracht
          {magBewerken ? <input type="number" min="0" step="1" defaultValue={t.volwassen_teruggebracht ?? ""} placeholder="?" onBlur={(e) => onBijwerken(t.id, "volwassenTeruggebracht", e.target.value)} style={{ width: 70 }} /> : (t.volwassen_teruggebracht ?? "-")}
        </label>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 }}>
          Cash ontvangen
          {magBewerken ? <input type="number" step="0.01" defaultValue={t.cash_ontvangen ?? ""} placeholder="optioneel" onBlur={(e) => onBijwerken(t.id, "cashOntvangen", e.target.value)} style={{ width: 90 }} /> : euro(t.cash_ontvangen)}
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 }}>
          Overschrijving ontvangen
          {magBewerken ? <input type="number" step="0.01" defaultValue={t.overschrijving_ontvangen ?? ""} placeholder="optioneel" onBlur={(e) => onBijwerken(t.id, "overschrijvingOntvangen", e.target.value)} style={{ width: 90 }} /> : euro(t.overschrijving_ontvangen)}
        </label>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          {t.verschuldigd !== null && <div className="subtle" style={{ fontSize: 11 }}>verschuldigd {euro(t.verschuldigd)}</div>}
          <div className="money" style={{ fontWeight: 700 }}>ontvangen {euro(t.ontvangen)}</div>
        </div>
      </div>
    </div>
  );
}

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

// Welke tabbladen een evenement heeft hangt af van zijn optionele modules —
// zelfde vinkjes als bij het aanmaken. Kostenoverzicht en Kassabeheer staan
// er altijd; de rest verschijnt enkel als de bijhorende module aanstaat. Zo
// is Kamp gewoon een evenement met Groepsbudgetten + Rekening scannen aan,
// i.p.v. een aparte pagina buiten dit ene pad om.
const TABS = [
  { key: "kostenoverzicht", label: "Kostenoverzicht" },
  { key: "kassabeheer", label: "Kassabeheer" },
  { key: "ticketverkoop", label: "Ticketverkoop", gate: "heeft_ticketverkoop" },
  { key: "sponsoring", label: "Sponsoring", gate: "heeft_sponsoring" },
  { key: "groepsbudgetten", label: "Groepsbudgetten", gate: "heeft_groepsbudgetten" },
  { key: "rekeningscannen", label: "Rekening scannen", gate: "heeft_rekening_scan" },
];

export default function EvenementDetail({ params }) {
  const ruweId = decodeURIComponent(params.id);
  const { data: session } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const zoekParams = useSearchParams();
  const [evenementId, setEvenementId] = useState(null);
  const [melding, setMelding] = useState(null);
  const [overzicht, setOverzicht] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gebruikers, setGebruikers] = useState([]);
  const [tab, setTab] = useState(zoekParams.get("tab") || "kostenoverzicht");
  const [nieuweKassa, setNieuweKassa] = useState({ naam: "", type: "cash" });
  const [toonNieuweKassa, setToonNieuweKassa] = useState(false);
  const [nieuweTransactie, setNieuweTransactie] = useState(LEGE_TRANSACTIE);
  const [toonTransactieForm, setToonTransactieForm] = useState(false);
  const [bewerkId, setBewerkId] = useState(null);
  const [bewerkVeld, setBewerkVeld] = useState(null);
  const [tellerOpen, setTellerOpen] = useState(null); // { kassaId, veld: "wisselgeldStart" | "inhoudEinde" }
  const [tellerAantallen, setTellerAantallen] = useState({});
  const [nieuweTicketverkoper, setNieuweTicketverkoper] = useState({ naam: "" });
  const [nietKloppendFilter, setNietKloppendFilter] = useState(false);
  const [nieuweSponsor, setNieuweSponsor] = useState({ naam: "", bedrag: "", opmerking: "", contact: "" });
  const [toonDrempels, setToonDrempels] = useState(false);
  const [nieuweDrempel, setNieuweDrempel] = useState({ drempelbedrag: "", gratisTickets: "", drankbonnetjes: "" });
  const [drempelBronnen, setDrempelBronnen] = useState([]);
  const [drempelBronKeuze, setDrempelBronKeuze] = useState("");
  const [kopieerBronnen, setKopieerBronnen] = useState([]);
  const [kopieerKeuze, setKopieerKeuze] = useState("");

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

  const ticketPrijzenBijwerken = async (veld, waarde) => {
    await fetch("/api/evenementen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: evenementId, [veld]: waarde }),
    });
    laden();
  };

  const ticketverkoperToevoegen = async () => {
    if (!nieuweTicketverkoper.naam.trim()) return toast.error("Vul een naam in.");
    const res = await fetch("/api/evenementen/ticketverkopers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId, naam: nieuweTicketverkoper.naam.trim() }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweTicketverkoper({ naam: "" });
    laden();
  };

  const ticketverkoperBijwerken = async (id, veld, waarde) => {
    await fetch("/api/evenementen/ticketverkopers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, evenementId, [veld]: waarde }),
    });
    laden();
  };

  const ticketverkoperVerwijderen = async (id) => {
    const ok = await confirm({ title: "Verkoper verwijderen", message: "Deze ticketverkoper verwijderen?", danger: true, bevestigLabel: "Verwijderen" });
    if (!ok) return;
    await fetch(`/api/evenementen/ticketverkopers?id=${id}&evenementId=${evenementId}`, { method: "DELETE" });
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
    setNieuweSponsor({ naam: "", bedrag: "", opmerking: "", contact: "" });
    laden();
  };

  const sponsorBijwerken = async (id, veld, waarde) => {
    await fetch("/api/evenementen/sponsors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, evenementId, [veld]: waarde }),
    });
    laden();
  };

  const sponsorVerwijderen = async (id) => {
    await fetch(`/api/evenementen/sponsors?id=${id}&evenementId=${evenementId}`, { method: "DELETE" });
    laden();
  };

  const drempelToevoegen = async () => {
    if (nieuweDrempel.drempelbedrag === "") return toast.error("Vul een drempelbedrag in.");
    const res = await fetch("/api/evenementen/sponsor-drempels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId, ...nieuweDrempel }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweDrempel({ drempelbedrag: "", gratisTickets: "", drankbonnetjes: "" });
    laden();
  };

  const drempelBijwerken = async (id, veld, waarde) => {
    await fetch("/api/evenementen/sponsor-drempels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, evenementId, [veld]: waarde }),
    });
    laden();
  };

  const drempelVerwijderen = async (id) => {
    await fetch(`/api/evenementen/sponsor-drempels?id=${id}&evenementId=${evenementId}`, { method: "DELETE" });
    laden();
  };

  const drempelsKopierenLaden = async () => {
    const res = await fetch(`/api/evenementen/sponsor-drempels/bronnen?exclude=${evenementId}`);
    const data = await res.json();
    setDrempelBronnen(data.bronnen || []);
    setDrempelBronKeuze("");
    setToonDrempels(true);
  };

  const drempelsKopierenToepassen = async () => {
    const bron = drempelBronnen.find((b) => b.evenementId === drempelBronKeuze);
    if (!bron) return;
    await Promise.all(
      bron.drempels.map((d) =>
        fetch("/api/evenementen/sponsor-drempels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evenementId, drempelbedrag: d.drempelbedrag, gratisTickets: d.gratisTickets, drankbonnetjes: d.drankbonnetjes }),
        })
      )
    );
    setDrempelBronKeuze("");
    laden();
    toast.success("Drempels gekopieerd — pas gerust aan.");
  };

  const kassaToevoegen = async () => {
    if (!nieuweKassa.naam.trim()) return toast.error("Vul een naam in voor de kassa.");
    const res = await fetch("/api/evenementen/kassas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evenementId, naam: nieuweKassa.naam, type: nieuweKassa.type }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    const type = nieuweKassa.type;
    setNieuweKassa({ naam: "", type: "cash" });
    setToonNieuweKassa(false);
    laden();
    toast.success("Kassa toegevoegd");
    // Meteen doorklikken naar het telpaneel: coupures invullen kan zo
    // meteen, zonder eerst een los totaalbedrag te moeten intypen.
    if (type === "cash") {
      setTellerAantallen({});
      setTellerOpen({ kassaId: data.kassa.id, veld: "wisselgeldStart" });
      kopierenLaden();
    }
  };

  const kassaBijwerken = async (kassaId, veld, waarde) => {
    await fetch("/api/evenementen/kassas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: kassaId, [veld]: waarde === "" ? "" : Number(waarde) }),
    });
    laden();
  };

  const tellerOpenen = (kassa, veld) => {
    if (tellerOpen?.kassaId === kassa.id && tellerOpen?.veld === veld) { setTellerOpen(null); return; }
    const bestaande = veld === "wisselgeldStart" ? kassa.wisselgeld_start_samenstelling : kassa.inhoud_einde_samenstelling;
    setTellerAantallen(bestaande || {});
    setTellerOpen({ kassaId: kassa.id, veld });
    if (veld === "wisselgeldStart") kopierenLaden();
  };

  const tellerToepassen = async () => {
    const totaal = Math.round(samenstellingTotaal(tellerAantallen) * 100) / 100;
    const samenstellingVeld = tellerOpen.veld === "wisselgeldStart" ? "wisselgeldStartSamenstelling" : "inhoudEindeSamenstelling";
    await fetch("/api/evenementen/kassas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tellerOpen.kassaId, [tellerOpen.veld]: totaal, [samenstellingVeld]: tellerAantallen }),
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

  // Bronnen voor "kopieer van vorig jaar" — cash-kassa's van andere
  // evenementen, ophalen zodra het wisselgeld-start-telpaneel opengaat.
  const kopierenLaden = async () => {
    const res = await fetch(`/api/evenementen/kassas/bronnen?exclude=${evenementId}`);
    const data = await res.json();
    setKopieerBronnen(data.kassas || []);
    setKopieerKeuze("");
  };

  // Vult enkel het lokale telraster — pas bij "Toepassen" wordt het echt
  // opgeslagen, zodat je de overgenomen coupures nog kan bijstellen.
  const kopieerToepassen = () => {
    const bron = kopieerBronnen.find((b) => b.id === kopieerKeuze);
    if (!bron) return;
    setTellerAantallen(bron.wisselgeld_start_samenstelling || {});
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

  const { evenement, kassas, kassasMetTekort, categorieen, transacties, gekoppeldeTransacties, ticketverkopers, ticketOmzet, sponsors, sponsorDrempels, sponsorBedrag, budgetBurnRate, nogTerugTeBetalen, balans } = overzicht;
  const nietKloppendeVerkopers = (ticketverkopers || []).filter((t) => t.status !== "klopt");
  const tabsBeschikbaar = TABS.filter((t) => !t.gate || evenement[t.gate]);

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

      {/* Tabbladen */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {tabsBeschikbaar.map((t) => (
          <button key={t.key} className={tab === t.key ? "btn-primary" : ""} style={{ borderRadius: "var(--radius-pill)" }} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === "kostenoverzicht" && (
        evenement.heeft_groepsbudgetten ? (
          <KampKostenoverzicht werkjaarId={evenement.werkjaar_id} gekoppeldeTransacties={gekoppeldeTransacties} gebruikers={gebruikers} magBewerken={magBewerken} />
        ) : (
          <>
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
          </>
        )
      )}

      {tab === "kassabeheer" && (
        <div>
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
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input key={`${k.id}-ws-${k.wisselgeld_start}`} type="number" step="0.01" defaultValue={k.wisselgeld_start} onBlur={(e) => kassaBijwerken(k.id, "wisselgeldStart", e.target.value)} style={{ width: 90 }} />
                          <button type="button" title="Coupures tellen" className="btn-plain" onClick={() => tellerOpenen(k, "wisselgeldStart")}><MuntenIcon color="var(--text-subtle)" /></button>
                        </div>
                      ) : <span className="money" style={{ fontWeight: 600 }}>{euro(k.wisselgeld_start)}</span>}
                    </label>
                  )}
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                    Inhoud na afloop
                    {magBewerken ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input key={`${k.id}-ie-${k.inhoud_einde}`} type="number" step="0.01" defaultValue={k.inhoud_einde ?? ""} placeholder="nog niet geteld" onBlur={(e) => kassaBijwerken(k.id, "inhoudEinde", e.target.value)} style={{ width: 90 }} />
                        {k.type === "cash" && <button type="button" title="Coupures tellen" className="btn-plain" onClick={() => tellerOpenen(k, "inhoudEinde")}><MuntenIcon color="var(--text-subtle)" /></button>}
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

                {/* Digitale betalingen die naast deze kassa binnenkwamen (bv. mensen die aan de toog met SumUp betaalden) — tellen bovenop mee in de omzet. */}
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  {[["digitaal_sumup", "digitaalSumup", "SumUp"], ["digitaal_bancontact", "digitaalBancontact", "Bancontact"], ["digitaal_kbc_qr", "digitaalKbcQr", "KBC QR-code"]].map(([veld, apiVeld, label]) => (
                    <label key={veld} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                      {label}
                      {magBewerken ? (
                        <input key={`${k.id}-${veld}-${k[veld]}`} type="number" step="0.01" defaultValue={k[veld] ?? ""} placeholder="optioneel" onBlur={(e) => kassaBijwerken(k.id, apiVeld, e.target.value)} style={{ width: 90 }} />
                      ) : <span className="money" style={{ fontWeight: 600 }}>{k[veld] ? euro(k[veld]) : "-"}</span>}
                    </label>
                  ))}
                </div>

                {tellerOpen?.kassaId === k.id && (
                  <div style={{ background: "var(--surface-alt)", borderRadius: 14, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                      {tellerOpen.veld === "wisselgeldStart" ? "Wisselgeld start" : "Inhoud na afloop"} — briefjes &amp; muntjes tellen
                    </div>
                    {tellerOpen.veld === "wisselgeldStart" && kopieerBronnen.length > 0 && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                        <select value={kopieerKeuze} onChange={(e) => setKopieerKeuze(e.target.value)} style={{ fontSize: 12 }}>
                          <option value="">Kopieer van vorig jaar...</option>
                          {kopieerBronnen.map((b) => <option key={b.id} value={b.id}>{b.evenementNaam} — {b.naam} ({euro(b.wisselgeld_start)})</option>)}
                        </select>
                        <button type="button" disabled={!kopieerKeuze} onClick={kopieerToepassen}>Overnemen</button>
                      </div>
                    )}
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
                <button className="btn-primary" onClick={kassaToevoegen}>Toevoegen</button>
                <button onClick={() => setToonNieuweKassa(false)}>Annuleren</button>
              </div>
            ) : (
              <button onClick={() => setToonNieuweKassa(true)}>+ Kassa toevoegen</button>
            )
          )}
        </div>
      )}

      {tab === "ticketverkoop" && evenement.heeft_ticketverkoop && (
        <div>
          {nietKloppendeVerkopers.length > 0 && (
            <div className="card card-warning" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span>⚠️ {nietKloppendeVerkopers.length} perso(o)n(en) kloppen nog niet</span>
              <button onClick={() => setNietKloppendFilter(!nietKloppendFilter)}>{nietKloppendFilter ? "Toon iedereen" : "Toon enkel deze"}</button>
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Online</div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "flex", flexDirection: "column", gap: 4, maxWidth: 200 }}>
              Totaal (bv. opgezocht via Tickoweb)
              {magBewerken ? (
                <input key={`online-${evenement.ticketverkoop_online_bedrag}`} type="number" step="0.01" defaultValue={evenement.ticketverkoop_online_bedrag ?? ""} placeholder="optioneel" onBlur={(e) => ticketPrijzenBijwerken("ticketverkoopOnlineBedrag", e.target.value)} />
              ) : <span className="money" style={{ fontWeight: 700 }}>{euro(evenement.ticketverkoop_online_bedrag)}</span>}
            </label>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Fysiek — bandjesprijzen dit jaar</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 }}>
                Prijs jeugdbandje
                {magBewerken ? (
                  <input key={`pj-${evenement.ticket_prijs_jeugd}`} type="number" step="0.01" defaultValue={evenement.ticket_prijs_jeugd ?? ""} onBlur={(e) => ticketPrijzenBijwerken("ticketPrijsJeugd", e.target.value)} style={{ width: 90 }} />
                ) : <span className="money" style={{ fontWeight: 600 }}>{euro(evenement.ticket_prijs_jeugd)}</span>}
              </label>
              <label style={{ fontSize: 13, fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 }}>
                Prijs 30+ bandje
                {magBewerken ? (
                  <input key={`pv-${evenement.ticket_prijs_volwassen}`} type="number" step="0.01" defaultValue={evenement.ticket_prijs_volwassen ?? ""} onBlur={(e) => ticketPrijzenBijwerken("ticketPrijsVolwassen", e.target.value)} style={{ width: 90 }} />
                ) : <span className="money" style={{ fontWeight: 600 }}>{euro(evenement.ticket_prijs_volwassen)}</span>}
              </label>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div className="eyebrow">Verkopers</div>
            <div className="money" style={{ fontWeight: 700 }}>Totaal: {euro(ticketOmzet)}</div>
          </div>

          {(nietKloppendFilter ? nietKloppendeVerkopers : ticketverkopers).length === 0 && (
            <p className="muted" style={{ fontStyle: "italic", fontSize: 13, marginBottom: 10 }}>{nietKloppendFilter ? "Iedereen klopt." : "Nog geen verkopers."}</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: magBewerken ? 14 : 0 }}>
            {(nietKloppendFilter ? nietKloppendeVerkopers : ticketverkopers).map((t) => (
              <TicketverkoperRij key={t.id} t={t} magBewerken={magBewerken} onBijwerken={ticketverkoperBijwerken} onVerwijderen={ticketverkoperVerwijderen} />
            ))}
          </div>

          {magBewerken && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input placeholder="Naam verkoper" value={nieuweTicketverkoper.naam} onChange={(e) => setNieuweTicketverkoper({ naam: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
              <button className="btn-primary" onClick={ticketverkoperToevoegen}>+ Verkoper</button>
            </div>
          )}
        </div>
      )}

      {tab === "sponsoring" && evenement.heeft_sponsoring && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Sponsordrempels</div>
              {magBewerken && (
                toonDrempels ? (
                  <button onClick={() => setToonDrempels(false)}>Sluiten</button>
                ) : (
                  <button onClick={drempelsKopierenLaden}>↺ Kopieer van vorig jaar</button>
                )
              )}
            </div>
            {toonDrempels && drempelBronnen.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <select value={drempelBronKeuze} onChange={(e) => setDrempelBronKeuze(e.target.value)}>
                  <option value="">Kies een evenement...</option>
                  {drempelBronnen.map((b) => <option key={b.evenementId} value={b.evenementId}>{b.evenementNaam}{b.evenementDatum ? ` (${b.evenementDatum})` : ""} — {b.drempels.length} drempel(s)</option>)}
                </select>
                <button disabled={!drempelBronKeuze} onClick={drempelsKopierenToepassen}>Overnemen</button>
              </div>
            )}
            {toonDrempels && drempelBronnen.length === 0 && <p className="subtle" style={{ fontSize: 13, marginBottom: 12 }}>Geen ander evenement met drempels gevonden.</p>}

            {(sponsorDrempels || []).length === 0 && <p className="muted" style={{ fontStyle: "italic", fontSize: 13, marginBottom: 10 }}>Nog geen drempels ingesteld.</p>}
            {(sponsorDrempels || []).map((d, i) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", flexWrap: "wrap" }}>
                {magBewerken ? (
                  <>
                    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>vanaf €<input type="number" step="1" defaultValue={d.drempelbedrag} onBlur={(e) => drempelBijwerken(d.id, "drempelbedrag", e.target.value)} style={{ width: 70 }} /></label>
                    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>🎟️ gratis<input type="number" step="1" min="0" defaultValue={d.gratis_tickets} onBlur={(e) => drempelBijwerken(d.id, "gratisTickets", e.target.value)} style={{ width: 60 }} /></label>
                    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>🍹 bonnen<input type="number" step="1" min="0" defaultValue={d.drankbonnetjes} onBlur={(e) => drempelBijwerken(d.id, "drankbonnetjes", e.target.value)} style={{ width: 60 }} /></label>
                    <button className="btn-danger" onClick={() => drempelVerwijderen(d.id)}>🗑️</button>
                  </>
                ) : (
                  <span className="subtle" style={{ fontSize: 13 }}>vanaf {euro(d.drempelbedrag)}: {d.gratis_tickets} gratis ticket(s), {d.drankbonnetjes} drankbon(nen)</span>
                )}
              </div>
            ))}
            {magBewerken && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <input type="number" step="1" placeholder="Drempelbedrag" value={nieuweDrempel.drempelbedrag} onChange={(e) => setNieuweDrempel({ ...nieuweDrempel, drempelbedrag: e.target.value })} style={{ width: 110 }} />
                <input type="number" step="1" placeholder="Gratis tickets" value={nieuweDrempel.gratisTickets} onChange={(e) => setNieuweDrempel({ ...nieuweDrempel, gratisTickets: e.target.value })} style={{ width: 110 }} />
                <input type="number" step="1" placeholder="Drankbonnetjes" value={nieuweDrempel.drankbonnetjes} onChange={(e) => setNieuweDrempel({ ...nieuweDrempel, drankbonnetjes: e.target.value })} style={{ width: 110 }} />
                <button className="btn-primary" onClick={drempelToevoegen}>+ Drempel</button>
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Sponsors</div>
              <div className="money" style={{ fontWeight: 700 }}>{euro(sponsorBedrag)}</div>
            </div>
            {sponsors.length === 0 && <p className="muted" style={{ fontStyle: "italic", fontSize: 13, marginBottom: 10 }}>Nog geen sponsors.</p>}
            {sponsors.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", flexWrap: "wrap" }}>
                {magBewerken ? (
                  <>
                    <input defaultValue={s.naam} onBlur={(e) => sponsorBijwerken(s.id, "naam", e.target.value)} style={{ flex: 1, minWidth: 120, fontWeight: 600 }} />
                    <input type="number" step="0.01" defaultValue={s.bedrag} onBlur={(e) => sponsorBijwerken(s.id, "bedrag", Number(e.target.value))} style={{ width: 90 }} />
                    <input defaultValue={s.contact || ""} placeholder="Contact" onBlur={(e) => sponsorBijwerken(s.id, "contact", e.target.value)} style={{ width: 140 }} />
                    <input defaultValue={s.opmerking || ""} placeholder="Opmerking" onBlur={(e) => sponsorBijwerken(s.id, "opmerking", e.target.value)} style={{ width: 140 }} />
                  </>
                ) : (
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.naam}</div>
                    {(s.contact || s.opmerking) && <div className="muted" style={{ fontSize: 12 }}>{[s.contact, s.opmerking].filter(Boolean).join(" · ")}</div>}
                  </div>
                )}
                {(s.gratisTickets > 0 || s.drankbonnetjes > 0) && (
                  <span className="subtle" style={{ fontSize: 12 }}>
                    {s.gratisTickets > 0 ? `${s.gratisTickets} gratis ticket(s)` : ""}{s.gratisTickets > 0 && s.drankbonnetjes > 0 ? ", " : ""}{s.drankbonnetjes > 0 ? `${s.drankbonnetjes} drankbon(nen)` : ""}
                  </span>
                )}
                <div className="money" style={{ fontWeight: 700 }}>{euro(s.bedrag)}</div>
                {magBewerken && <button className="btn-danger" onClick={() => sponsorVerwijderen(s.id)}>🗑️</button>}
              </div>
            ))}
            {magBewerken && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <input placeholder="Bedrijfsnaam" value={nieuweSponsor.naam} onChange={(e) => setNieuweSponsor({ ...nieuweSponsor, naam: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                <input type="number" step="0.01" placeholder="Bedrag" value={nieuweSponsor.bedrag} onChange={(e) => setNieuweSponsor({ ...nieuweSponsor, bedrag: e.target.value })} style={{ width: 90 }} />
                <input placeholder="Contactgegevens" value={nieuweSponsor.contact} onChange={(e) => setNieuweSponsor({ ...nieuweSponsor, contact: e.target.value })} style={{ width: 160 }} />
                <input placeholder="Opmerking (optioneel)" value={nieuweSponsor.opmerking} onChange={(e) => setNieuweSponsor({ ...nieuweSponsor, opmerking: e.target.value })} style={{ width: 160 }} />
                <button className="btn-primary" onClick={sponsorToevoegen}>+ Sponsor</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "groepsbudgetten" && evenement.heeft_groepsbudgetten && (
        <GroepsbudgettenTab werkjaarId={evenement.werkjaar_id} session={session} magBewerken={magBewerken} />
      )}

      {tab === "rekeningscannen" && evenement.heeft_rekening_scan && (
        <p className="muted" style={{ fontStyle: "italic" }}>
          Binnenkort beschikbaar — rekening scannen wacht nog op een beslissing over de Anthropic API.
        </p>
      )}
    </div>
  );
}

// ============================================================
// Groepsbudgetten-tabblad (overgenomen van de vroegere /kampbudgetten pagina)
// ============================================================

const LEGE_TARIEVEN = { winkelenJong: 0, winkelenOud: 0, droppingPerLid: 0, weekendPerLid: 0, weekendplaatsVast: 50 };

function naarTarievenFormVeld(t) {
  return {
    winkelenJong: t.winkelen_jong,
    winkelenOud: t.winkelen_oud,
    droppingPerLid: t.dropping_per_lid,
    weekendPerLid: t.weekend_per_lid,
    weekendplaatsVast: t.weekendplaats_vast,
  };
}

function kampBudgetStatus(uitgegeven, budget) {
  if (!budget) return { pct: 0, kleur: "", badge: "badge-neutral", label: "Geen budget" };
  const pct = (Number(uitgegeven) / Number(budget)) * 100;
  if (pct > 100) return { pct: 100, kleur: "danger", badge: "badge-danger", label: "Over budget" };
  if (pct >= 80) return { pct, kleur: "warning", badge: "badge-warning", label: "Bijna op" };
  return { pct, kleur: "", badge: "badge-success", label: "Op schema" };
}

function AfdelingRij({ g, groot, magBewerken, onAantalLeden, open, onToggleOpen }) {
  const status = kampBudgetStatus(g.uitgegeven, g.totaalToegewezen);
  return (
    <div style={{ padding: groot ? 0 : "14px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggleOpen(g.id)}
        className={groot ? "" : "nav-row"}
        style={{ display: "block", cursor: "pointer", margin: groot ? 0 : "-14px -4px", padding: groot ? 0 : "14px 4px" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: groot ? 18 : 16, color: "var(--primary)" }}>
              {g.afdeling}
              {AFDELINGEN_OUD.includes(g.afdeling) && <span className="subtle" style={{ fontSize: 12, fontWeight: 500 }}> · dropping/weekend</span>}
            </div>
            <span className={`badge ${status.badge}`}>{status.label}</span>
          </div>
          <div className="progress-track" style={{ height: groot ? 12 : 9 }}><div className={`progress-fill ${status.kleur}`} style={{ width: `${status.pct}%` }} /></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="muted money" style={{ fontSize: 14 }}>{euro(g.uitgegeven)} van {euro(g.totaalToegewezen)}</div>
            <div style={{ textAlign: "right" }}>
              <div className="muted" style={{ fontSize: 12 }}>{g.resterend < 0 ? "Over budget" : "Nog te besteden"}</div>
              <div className={`money ${g.resterend < 0 ? "amount-neg" : ""}`} style={{ fontWeight: 700, fontSize: groot ? 22 : 16, color: g.resterend >= 0 ? "var(--success-text)" : undefined }}>{euro(Math.abs(g.resterend))}</div>
            </div>
          </div>
        </div>
      </div>
      {magBewerken && (
        <label className="muted" style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          Aantal leden
          <input type="number" step="1" min="0" defaultValue={g.aantalLeden} onBlur={(e) => onAantalLeden(g.id, e.target.value)} style={{ width: 70 }} />
        </label>
      )}
      {open && <AfdelingDetail groepsbudgetId={g.id} />}
    </div>
  );
}

// Inline-uitklap i.p.v. een aparte /kampbudgetten/[id]-route: toont de
// Kampkosten-transacties en wisselgeld-aanvragen voor deze ene afdeling.
function AfdelingDetail({ groepsbudgetId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`/api/kampbudgetten/overzicht?id=${groepsbudgetId}`).then((r) => r.json()).then(setData);
  }, [groepsbudgetId]);

  if (!data) return <p className="muted" style={{ fontSize: 13, fontStyle: "italic" }}>Laden...</p>;
  if (data.error) return <p className="amount-neg" style={{ fontSize: 13 }}>{data.error}</p>;

  const { transacties, wisselgeldAanvragen } = data;

  return (
    <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Uitgaven</div>
        <p className="subtle" style={{ fontSize: 11, marginBottom: 8 }}>
          Alle transacties met deze afdeling als hoofdcategorie — bewerk of verwijder ze via het Kostenoverzicht-tabblad.
        </p>
        {transacties.length === 0 && <p className="muted" style={{ fontSize: 13, fontStyle: "italic" }}>Nog geen uitgaven.</p>}
        {transacties.map((t, i) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", fontSize: 13 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {t.omschrijving}
                {t.users?.naam && <span className="subtle"> · {t.users.naam}</span>}
                {t.bewijsstuk_url && <> · <a href={t.bewijsstuk_url} target="_blank" rel="noreferrer" className="link" onClick={(e) => e.stopPropagation()}>bonnetje</a></>}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>{t.transactie_code} · {t.datum}</div>
            </div>
            <span className={`badge ${STATUS_BADGE[t.status] || "badge-neutral"}`}>{t.status}</span>
            <div className="money" style={{ fontWeight: 700, width: 80, textAlign: "right" }}>{euro(t.bedrag)}</div>
          </div>
        ))}
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div className="eyebrow">Wisselgeld-aanvragen</div>
          <Link href="/wisselgeld" className="link" style={{ fontSize: 12 }} onClick={(e) => e.stopPropagation()}>Nieuwe aanvraag →</Link>
        </div>
        {wisselgeldAanvragen.length === 0 && <p className="muted" style={{ fontSize: 13, fontStyle: "italic" }}>Nog geen aanvragen.</p>}
        {wisselgeldAanvragen.map((w, i) => (
          <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", fontSize: 13 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{w.doel_activiteit || "-"}</div>
              <div className="muted" style={{ fontSize: 11 }}>{w.aanvraag_code} · nodig op {w.datum_nodig}</div>
            </div>
            <span className="badge badge-neutral">{w.status}</span>
            <div className="money" style={{ fontWeight: 700, width: 80, textAlign: "right" }}>{euro(w.bedrag_gevraagd)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroepsbudgettenTab({ werkjaarId, session, magBewerken }) {
  const toast = useToast();
  const [groepsbudgetten, setGroepsbudgetten] = useState([]);
  const [tarieven, setTarieven] = useState(LEGE_TARIEVEN);
  const [toonTarieven, setToonTarieven] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const laden = () =>
    fetch(`/api/kampbudgetten?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((d) => {
      setGroepsbudgetten(d.groepsbudgetten || []);
      if (d.tarieven) setTarieven(naarTarievenFormVeld(d.tarieven));
      setLoading(false);
    });

  useEffect(() => { if (werkjaarId) laden(); }, [werkjaarId]);

  if (loading) return <SkeletonCard lines={4} />;

  const aantalLedenBijwerken = async (id, waarde) => {
    setGroepsbudgetten((prev) => prev.map((g) => (g.id === id ? { ...g, aantalLeden: waarde } : g)));
    const res = await fetch("/api/kampbudgetten", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, aantalLeden: waarde }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    laden();
  };

  const tarievenOpslaan = async () => {
    const res = await fetch("/api/kampbudgetten/tarieven", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, ...tarieven }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    laden();
    toast.success("Tarieven opgeslagen");
  };

  const totalen = groepsbudgetten.reduce(
    (s, g) => ({
      toegewezen: s.toegewezen + g.totaalToegewezen,
      uitgegeven: s.uitgegeven + g.uitgegeven,
      resterend: s.resterend + g.resterend,
    }),
    { toegewezen: 0, uitgegeven: 0, resterend: 0 }
  );
  const totaalStatus = kampBudgetStatus(totalen.uitgegeven, totalen.toegewezen);
  const jouwAfdeling = groepsbudgetten.find((g) => g.afdeling === session?.user?.groep);
  const andere = groepsbudgetten.filter((g) => g.id !== jouwAfdeling?.id);
  const toggleOpen = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
        Budget voor het winkelen in juli, en dropping/weekend voor Tito, Keti en Aspi. Uitgaven log je bij het Kostenoverzicht-tabblad onder de juiste afdeling.
      </p>

      {magBewerken && (
        toonTarieven ? (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>Tarieven (gelden voor alle afdelingen samen)</div>
            <div className="grid-3" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                €/lid winkelen — Sloebers/Speelclub/Rakwi
                <input type="number" step="0.5" min="0" value={tarieven.winkelenJong} onChange={(e) => setTarieven({ ...tarieven, winkelenJong: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                €/lid winkelen — Tito/Keti/Aspi
                <input type="number" step="0.5" min="0" value={tarieven.winkelenOud} onChange={(e) => setTarieven({ ...tarieven, winkelenOud: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                €/lid dropping — Tito/Keti/Aspi
                <input type="number" step="0.5" min="0" value={tarieven.droppingPerLid} onChange={(e) => setTarieven({ ...tarieven, droppingPerLid: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                €/lid weekend — Tito/Keti/Aspi
                <input type="number" step="0.5" min="0" value={tarieven.weekendPerLid} onChange={(e) => setTarieven({ ...tarieven, weekendPerLid: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Vast budget weekendplaats (per groep) — Tito/Keti/Aspi
                <input type="number" step="1" min="0" value={tarieven.weekendplaatsVast} onChange={(e) => setTarieven({ ...tarieven, weekendplaatsVast: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" onClick={tarievenOpslaan}>Tarieven opslaan</button>
              <button onClick={() => setToonTarieven(false)}>Sluiten</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setToonTarieven(true)} style={{ marginBottom: 20 }}>Tarieven aanpassen</button>
        )
      )}

      <div className={`card card-lg ${totaalStatus.kleur === "danger" ? "card-danger" : totaalStatus.kleur === "warning" ? "card-warning" : ""}`} style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className={`badge ${totaalStatus.badge}`}>{totaalStatus.label}</span>
          <span className="muted" style={{ fontSize: 14 }}>Alle afdelingen samen</span>
        </div>
        <div className="muted" style={{ fontSize: 14 }}>Nog te besteden op kamp</div>
        <div className="money" style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", color: totalen.resterend >= 0 ? "var(--success-text)" : "var(--danger-deep)" }}>{euro(Math.abs(totalen.resterend))}</div>
        <div className="progress-track"><div className={`progress-fill ${totaalStatus.kleur}`} style={{ width: `${totaalStatus.pct}%` }} /></div>
        <div className="muted money" style={{ fontSize: 14 }}>{euro(totalen.uitgegeven)} van {euro(totalen.toegewezen)} uitgegeven</div>
      </div>

      {jouwAfdeling && (
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Jouw afdeling</div>
          <div className="card" style={{ borderWidth: 1.5, borderColor: "var(--text)" }}>
            <AfdelingRij g={jouwAfdeling} groot magBewerken={magBewerken} onAantalLeden={aantalLedenBijwerken} open={openId === jouwAfdeling.id} onToggleOpen={toggleOpen} />
          </div>
        </div>
      )}

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{jouwAfdeling ? "De andere afdelingen" : "Alle afdelingen"}</div>
        <div className="card" style={{ padding: "4px 18px" }}>
          {andere.length === 0 && <p className="muted" style={{ padding: "16px 0", textAlign: "center" }}>Geen afdelingen.</p>}
          {andere.map((g, i) => (
            <div key={g.id} style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
              <AfdelingRij g={g} magBewerken={magBewerken} onAantalLeden={aantalLedenBijwerken} open={openId === g.id} onToggleOpen={toggleOpen} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Kostenoverzicht voor Kamp (overgenomen van de vroegere /kampkosten pagina)
// ============================================================

const LEGE_KAMP_TRANSACTIE = {
  datum: new Date().toISOString().slice(0, 10),
  omschrijving: "",
  typeGeldstroom: "uitgave",
  hoofdcategorie: "",
  bedrag: "",
};

function naarKampBewerkVeld(t) {
  return {
    datum: t.datum || "",
    omschrijving: t.omschrijving || "",
    typeGeldstroom: t.type_geldstroom || "uitgave",
    hoofdcategorie: t.hoofdcategorie || "",
    bedrag: t.bedrag ?? "",
    status: t.status || "Gepland",
    medewerkerUserId: t.medewerker_user_id || "",
    bewijsstukUrl: t.bewijsstuk_url || "",
  };
}

function KampKostenoverzicht({ werkjaarId, gekoppeldeTransacties, gebruikers, magBewerken }) {
  const toast = useToast();
  const [overzicht, setOverzicht] = useState(null);
  const [nieuweTransactie, setNieuweTransactie] = useState(LEGE_KAMP_TRANSACTIE);
  const [toonForm, setToonForm] = useState(false);
  const [bewerkId, setBewerkId] = useState(null);
  const [bewerkVeld, setBewerkVeld] = useState(null);

  const laden = () => fetch(`/api/kampkosten?werkjaarId=${werkjaarId}`).then((r) => r.json()).then(setOverzicht);

  useEffect(() => { if (werkjaarId) laden(); }, [werkjaarId]);

  if (!overzicht) return <SkeletonCard lines={4} />;

  const transactieToevoegen = async () => {
    const t = nieuweTransactie;
    if (!t.datum || !t.omschrijving || !t.bedrag) return toast.error("Vul minstens datum, omschrijving en bedrag in.");
    const res = await fetch("/api/kampkosten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, ...t, hoofdcategorie: t.hoofdcategorie || null }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweTransactie(LEGE_KAMP_TRANSACTIE);
    laden();
    toast.success("Transactie toegevoegd");
  };

  const transactieVerwijderen = (t) => {
    if (bewerkId === t.id) { setBewerkId(null); setBewerkVeld(null); }
    setOverzicht((prev) => ({ ...prev, transacties: prev.transacties.filter((x) => x.id !== t.id) }));
    toast.undoable({
      message: "Transactie verwijderd",
      onUndo: laden,
      onCommit: async () => {
        await fetch(`/api/kampkosten?id=${t.id}`, { method: "DELETE" });
        laden();
      },
    });
  };

  const rijOpenen = (t) => {
    if (!magBewerken) return;
    if (bewerkId === t.id) { setBewerkId(null); setBewerkVeld(null); return; }
    setBewerkId(t.id);
    setBewerkVeld(naarKampBewerkVeld(t));
  };

  const bewerkOpslaan = async () => {
    const v = bewerkVeld;
    if (!v.datum || !v.omschrijving || !v.bedrag) return toast.error("Vul minstens datum, omschrijving en bedrag in.");
    const res = await fetch("/api/kampkosten", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: bewerkId,
        datum: v.datum,
        omschrijving: v.omschrijving,
        typeGeldstroom: v.typeGeldstroom,
        hoofdcategorie: v.hoofdcategorie || null,
        bedrag: v.bedrag,
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
    const res = await fetch("/api/kampkosten/categorieen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ werkjaarId, naam: naam.trim() }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    zetIn(naam.trim());
    laden();
    toast.success(`Categorie "${naam.trim()}" toegevoegd`);
  };

  const { categorieen, transacties, nogTerugTeBetalen } = overzicht;

  return (
    <div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
        Zet je bij een kost een afdeling als categorie, dan telt het bedrag mee in hun kampbudget.
      </p>

      {gekoppeldeTransacties?.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 15 }}>Gekoppelde kasboektransacties</div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Deze banktransacties staan al in het Kasboek en zijn hieraan getagd, puur ter referentie. Ze tellen niet mee in de balans hierboven.
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

      {nogTerugTeBetalen.length > 0 && (
        <div className="card card-warning" style={{ marginBottom: 20 }}>
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div className="eyebrow">Transacties</div>
        {magBewerken && (
          <button onClick={() => setToonForm(!toonForm)}>{toonForm ? "Annuleren" : "+ Transactie toevoegen"}</button>
        )}
      </div>

      {toonForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="grid-3" style={{ marginBottom: 8 }}>
            <input type="date" value={nieuweTransactie.datum} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, datum: e.target.value })} />
            <input placeholder="Omschrijving" value={nieuweTransactie.omschrijving} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, omschrijving: e.target.value })} style={{ gridColumn: "span 2" }} />
            <select value={nieuweTransactie.typeGeldstroom} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, typeGeldstroom: e.target.value })}>
              <option value="uitgave">Uitgave</option>
              <option value="inkomst">Inkomst</option>
            </select>
            <div style={{ display: "flex", gap: 4 }}>
              <select value={nieuweTransactie.hoofdcategorie} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, hoofdcategorie: e.target.value })} style={{ flex: 1 }}>
                <option value="">Hoofdcategorie...</option>
                <optgroup label="Afdeling (telt mee voor kampbudget)">
                  {AFDELINGEN_VOLGORDE.map((a) => <option key={a} value={a}>{a}</option>)}
                </optgroup>
                <optgroup label="Algemeen">
                  {categorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                </optgroup>
              </select>
              <button type="button" onClick={() => categorieToevoegen((naam) => setNieuweTransactie((prev) => ({ ...prev, hoofdcategorie: naam })))} title="Nieuwe categorie">+</button>
            </div>
            <input type="number" step="0.01" placeholder="Bedrag" value={nieuweTransactie.bedrag} onChange={(e) => setNieuweTransactie({ ...nieuweTransactie, bedrag: e.target.value })} />
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {t.omschrijving}
                    {t.bewijsstuk_url && <> · <a href={t.bewijsstuk_url} target="_blank" rel="noreferrer" className="link" onClick={(e) => e.stopPropagation()}>bonnetje</a></>}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{t.transactie_code} · {t.datum}{t.hoofdcategorie ? ` · ${t.hoofdcategorie}` : ""}</div>
                </div>
                <span className={`badge ${STATUS_BADGE[t.status] || "badge-neutral"}`}>{t.status}</span>
                <div className={`money ${t.type_geldstroom === "uitgave" ? "amount-neg" : ""}`} style={{ width: 90, textAlign: "right", fontWeight: 700, color: t.type_geldstroom !== "uitgave" ? "var(--success-text)" : undefined }}>
                  {t.type_geldstroom === "uitgave" ? "-" : "+"}{euro(t.bedrag)}
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
                    <div style={{ display: "flex", gap: 4 }}>
                      <select value={bewerkVeld.hoofdcategorie} onChange={(e) => setBewerkVeld({ ...bewerkVeld, hoofdcategorie: e.target.value })} style={{ flex: 1 }}>
                        <option value="">Hoofdcategorie...</option>
                        <optgroup label="Afdeling (telt mee voor kampbudget)">
                          {AFDELINGEN_VOLGORDE.map((a) => <option key={a} value={a}>{a}</option>)}
                        </optgroup>
                        <optgroup label="Algemeen">
                          {categorieen.map((c) => <option key={c.id} value={c.naam}>{c.naam}</option>)}
                        </optgroup>
                      </select>
                      <button type="button" onClick={() => categorieToevoegen((naam) => setBewerkVeld((prev) => ({ ...prev, hoofdcategorie: naam })))} title="Nieuwe categorie">+</button>
                    </div>
                    <input type="number" step="0.01" placeholder="Bedrag" value={bewerkVeld.bedrag} onChange={(e) => setBewerkVeld({ ...bewerkVeld, bedrag: e.target.value })} />
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
