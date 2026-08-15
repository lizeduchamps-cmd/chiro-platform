"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { parseNaamRegels, vindGebruiker, haalKmEruit } from "@/lib/smartPaste";
import { useToast } from "@/components/NotifyProvider";
import { SkeletonCard } from "@/components/Skeleton";

function euro(n) {
  return Number(n || 0).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

function maandLabel(maand) {
  const namen = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const [j, m] = maand.split("-");
  return `${namen[parseInt(m, 10) - 1]} ${j}`;
}

function huidigeMaandString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// FV-groepering op basis van type (niet groep!): groep is enkel de afdeling
// die iemand leidt (bv. een Leiding-lid dat de Aspi's leidt heeft groep='Aspi'
// maar hoort wel degelijk bij "Leiding"). Enkel wie zelf type='Aspi' is,
// hoort in de Aspi-groep.
const GROEP_VOLGORDE = ["Leiding", "Logistiek", "Aspi"];
function fvGroep(user) {
  if (user.type === "Aspi") return "Aspi";
  if (user.type === "Logistiek") return "Logistiek";
  return "Leiding";
}

// De 4 soorten regels — vaste volgorde, elk met een eigen sneltoevoegknop.
const SOORTEN = [
  { bron: "bestelling", label: "Bestellingen", knop: "+ Bestelling" },
  { bron: "kilometers", label: "Kilometers", knop: "+ Kilometers" },
  { bron: "streepjes_bot", label: "Streepjes", knop: "+ Streepjes" },
  { bron: "handmatig", label: "Handmatig", knop: "+ Handmatig" },
];

// Eén persoonskaart: regels ingeklapt achter "Details (N)", gegroepeerd per
// soort. Enkel wie mag bewerken ziet de 4 sneltoevoegknoppen.
function PersoonKaart({
  p, jezelf, magBewerken, open, onToggleOpen, groot,
  veldOpen, onVeldOpen,
  nieuweRegel, setNieuweRegel, onRegelToevoegen,
  nieuweKm, setNieuweKm, onKmToevoegen,
  streepjesInfo, streepjesBewerk, setStreepjesBewerk, onStreepjesToevoegen,
  onRegelVerwijderen, onStatusToggle,
}) {
  const terugTeKrijgen = p.totaal < 0;
  const klaar = p.status === "betaald";
  const kleur = klaar ? "success" : terugTeKrijgen ? "success" : "danger";
  const perSoort = SOORTEN.map((s) => ({ ...s, regels: p.regels.filter((r) => r.bron === s.bron) })).filter((s) => s.regels.length > 0);
  const open4 = veldOpen === "bestelling" ? "bestelling" : veldOpen;

  return (
    <div className={`card ${groot ? `card-lg card-${kleur}` : ""}`} style={{ pageBreakInside: "avoid", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: groot ? 17 : 15 }}>
            {p.user.naam}{jezelf && <span className="muted" style={{ fontWeight: 600, fontSize: 14 }}> — jij</span>}
          </div>
          <div className="subtle" style={{ fontSize: 13 }}>{p.user.type}{p.user.groep ? ` · ${p.user.groep}` : ""}</div>
          {terugTeKrijgen && (
            <div className="subtle" style={{ fontSize: 13 }}>
              {p.user.iban ? `Terug te storten naar ${p.user.iban}` : "Geen IBAN bekend voor terugbetaling"}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "right" }}>
            <div className="muted" style={{ fontSize: 13 }}>{terugTeKrijgen ? "Terug te krijgen" : "Te betalen"}</div>
            <div className="money" style={{ fontSize: groot ? 26 : 18, fontWeight: 700, color: klaar ? undefined : terugTeKrijgen ? "var(--success-text)" : "var(--danger-deep)" }}>
              {euro(Math.abs(p.totaal))}
            </div>
          </div>
          <button
            className={`no-print badge ${klaar ? "badge-success" : "badge-danger"}`}
            onClick={() => magBewerken && onStatusToggle(p.user.id, p.status)}
            disabled={!magBewerken}
            style={{ border: "none", cursor: magBewerken ? "pointer" : "default" }}
          >
            {klaar ? "Betaald" : "Openstaand"}
          </button>
        </div>
      </div>

      <button className="no-print btn-plain link" style={{ fontSize: 14, alignSelf: "flex-start" }} onClick={onToggleOpen}>
        {open ? "Details verbergen" : `Details (${p.regels.length})`}
      </button>

      {open && (
        <>
          <div style={{ borderTop: "1px solid var(--border-soft)" }}>
            {p.regels.length === 0 && (
              <p className="muted" style={{ padding: "10px 0", fontStyle: "italic", fontSize: 14 }}>Nog geen regels.</p>
            )}
            {perSoort.map((s) => (
              <div key={s.bron} style={{ paddingTop: 10 }}>
                <div className="subtle" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{s.label}</div>
                {s.regels.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--border-soft)", fontSize: 15 }}>
                    <div className="muted">{r.omschrijving}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="money" style={{ fontWeight: 700, color: r.bedrag < 0 ? "var(--success-text)" : undefined }}>
                        {r.bedrag < 0 ? "−" : ""}{euro(Math.abs(r.bedrag))}
                      </div>
                      {magBewerken && (
                        <button className="no-print btn-danger" onClick={() => onRegelVerwijderen(p.user.id, r)} title="Verwijderen">🗑️</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {magBewerken && (
            <div className="no-print" style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SOORTEN.map((s) => (
                  <button key={s.bron} onClick={() => onVeldOpen(p.user.id, veldOpen === s.bron ? null : s.bron)} style={veldOpen === s.bron ? { borderColor: "var(--accent)", color: "var(--text)" } : undefined}>
                    {s.knop}
                  </button>
                ))}
              </div>

              {veldOpen === "handmatig" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    placeholder="Omschrijving, bv. Vergoeding materiaal"
                    value={nieuweRegel[p.user.id]?.omschrijving || ""}
                    onChange={(e) => setNieuweRegel((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], omschrijving: e.target.value } }))}
                    style={{ flex: 1, minWidth: 160 }}
                  />
                  <input
                    type="number" step="0.01" placeholder="Bedrag"
                    value={nieuweRegel[p.user.id]?.bedrag || ""}
                    onChange={(e) => setNieuweRegel((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], bedrag: e.target.value } }))}
                    style={{ width: 100 }}
                  />
                  <button className="btn-primary" onClick={() => onRegelToevoegen(p.user.id, "handmatig")}>Toevoegen</button>
                </div>
              )}

              {open4 === "bestelling" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      placeholder="Wat, bv. Frituur 16/05 — mini + cola"
                      value={nieuweRegel[p.user.id]?.omschrijving || ""}
                      onChange={(e) => setNieuweRegel((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], omschrijving: e.target.value } }))}
                      style={{ flex: 1, minWidth: 160 }}
                    />
                    <input
                      type="number" step="0.01" placeholder="Bedrag"
                      value={nieuweRegel[p.user.id]?.bedrag || ""}
                      onChange={(e) => setNieuweRegel((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], bedrag: e.target.value } }))}
                      style={{ width: 100 }}
                    />
                    <button className="btn-primary" onClick={() => onRegelToevoegen(p.user.id, "bestelling")}>Toevoegen</button>
                  </div>
                  <p className="subtle" style={{ fontSize: 12 }}>
                    Voor een bestelling met meerdere producten/personen tegelijk: <Link href="/bestellingen" className="link">volledige bestellingen-tool →</Link>
                  </p>
                </div>
              )}

              {veldOpen === "kilometers" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    type="number" step="1" placeholder="Km gereden"
                    value={nieuweKm[p.user.id]?.km || ""}
                    onChange={(e) => setNieuweKm((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], km: e.target.value } }))}
                    style={{ width: 100 }}
                  />
                  <input
                    placeholder="Waarvoor? bv. Weekend"
                    value={nieuweKm[p.user.id]?.reden || ""}
                    onChange={(e) => setNieuweKm((prev) => ({ ...prev, [p.user.id]: { ...prev[p.user.id], reden: e.target.value } }))}
                    style={{ width: 140 }}
                  />
                  <button className="btn-primary" onClick={() => onKmToevoegen(p.user.id)}>Toevoegen</button>
                </div>
              )}

              {veldOpen === "streepjes_bot" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                      Fysieke streepjes
                      <input
                        type="number" step="1"
                        value={streepjesBewerk[p.user.id] ?? String(streepjesInfo?.fysieke_streepjes ?? 0)}
                        onChange={(e) => setStreepjesBewerk((prev) => ({ ...prev, [p.user.id]: e.target.value }))}
                        style={{ width: 70 }}
                      />
                    </label>
                    <span className="subtle" style={{ fontSize: 12 }}>+ €{euro(streepjesInfo?.online_streepjes_bedrag || 0)} online</span>
                    <button className="btn-primary" onClick={() => onStreepjesToevoegen(p.user.id)}>Toevoegen aan dit verslag</button>
                  </div>
                  <p className="subtle" style={{ fontSize: 12 }}>
                    Online-bedrag komt uit de Discord-bot-CSV: <Link href="/streepjes" className="link">CSV uploaden →</Link>
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function FinancieelVerslag() {
  const { data: session } = useSession();
  const toast = useToast();
  const [werkjaren, setWerkjaren] = useState([]);
  const [werkjaarId, setWerkjaarId] = useState(null);
  const [fvMaanden, setFvMaanden] = useState([]);
  const [fvMaandId, setFvMaandId] = useState(null);
  const [overzicht, setOverzicht] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nieuweMaandOpen, setNieuweMaandOpen] = useState(false);
  const [nieuweMaand, setNieuweMaand] = useState({
    maand: huidigeMaandString(),
    dieselprijs: "",
    verbruik: "7",
    betaaldeadline: "",
  });
  const [kmBewerkOpen, setKmBewerkOpen] = useState(false);
  const [kmBewerk, setKmBewerk] = useState({ dieselprijs: "", verbruik: "7" });
  const [nieuweRegel, setNieuweRegel] = useState({});
  const [nieuweKm, setNieuweKm] = useState({});
  const [streepjesData, setStreepjesData] = useState({});
  const [streepjesBewerk, setStreepjesBewerk] = useState({});
  const [plakOpen, setPlakOpen] = useState(false);
  const [plakTekst, setPlakTekst] = useState("");
  const [plakReden, setPlakReden] = useState("");
  const [plakPreview, setPlakPreview] = useState(null);
  const [plakBezig, setPlakBezig] = useState(false);
  const [openKaarten, setOpenKaarten] = useState(new Set());
  const [veldOpenPerPersoon, setVeldOpenPerPersoon] = useState({});
  const [alleenOpenstaand, setAlleenOpenstaand] = useState(false);

  const magBewerken = session?.user?.platformRecht === "admin" || session?.user?.platformRecht === "financieel_verantwoordelijke";

  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      if (d.werkjaren?.length) { setWerkjaren(d.werkjaren); setWerkjaarId(d.werkjaren[0].id); }
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

  useEffect(() => {
    if (!fvMaandId) { setOverzicht(null); return; }
    ladenOverzicht(fvMaandId);
  }, [fvMaandId]);

  useEffect(() => {
    if (!magBewerken) return;
    streepjesLaden();
  }, [magBewerken]);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 1100 }}>
        <SkeletonCard lines={2} />
      </div>
    );
  }

  const ladenOverzicht = (id) => {
    fetch(`/api/fv/overzicht?fvMaandId=${id}`).then((r) => r.json()).then((d) => setOverzicht(d));
  };

  const streepjesLaden = () => {
    fetch("/api/streepjes").then((r) => r.json()).then((d) => {
      const map = {};
      (d.users || []).forEach((u) => { map[u.id] = u; });
      setStreepjesData(map);
    });
  };

  const toggleKaart = (userId) => {
    setOpenKaarten((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const veldOpenZetten = (userId, veld) => setVeldOpenPerPersoon((prev) => ({ ...prev, [userId]: veld }));

  // Eén gedeeld km-tarief voor iedereen: dieselprijs (€/L) x verbruik (L/100km) / 100.
  const berekendKmTarief = () => {
    const diesel = parseFloat(nieuweMaand.dieselprijs);
    const verbruik = parseFloat(nieuweMaand.verbruik);
    if (!diesel || !verbruik) return null;
    return Math.round(((diesel * verbruik) / 100) * 1000) / 1000;
  };

  const nieuweMaandAanmaken = async () => {
    if (!/^\d{4}-\d{2}$/.test(nieuweMaand.maand)) return toast.error("Vul de maand in als JJJJ-MM, bv. 2026-05.");
    const kmTarief = berekendKmTarief();
    const res = await fetch("/api/fv/maanden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        werkjaarId,
        maand: nieuweMaand.maand,
        dieselprijs: nieuweMaand.dieselprijs ? parseFloat(nieuweMaand.dieselprijs) : null,
        kmTariefLeiding: kmTarief,
        kmTariefLogistiek: kmTarief,
        betaaldeadline: nieuweMaand.betaaldeadline || null,
      }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    const bijgewerkt = [data.fvMaand, ...fvMaanden].sort((a, b) => b.maand.localeCompare(a.maand));
    setFvMaanden(bijgewerkt);
    setFvMaandId(data.fvMaand.id);
    setNieuweMaandOpen(false);
    toast.success(`FV-maand ${maandLabel(data.fvMaand.maand)} aangemaakt`);
  };

  // Dieselprijs verandert soms tijdens het jaar — laat toe de km-vergoeding
  // van een bestaande FV-maand achteraf te herberekenen, niet enkel bij aanmaken.
  const kmBewerkOpenen = () => {
    const huidigeDiesel = overzicht?.fvMaand?.dieselprijs;
    const huidigTarief = overzicht?.fvMaand?.km_tarief_leiding;
    // Verbruik zelf wordt niet opgeslagen (enkel het resultaat), dus reken
    // het terug uit tarief = diesel × verbruik ÷ 100 als beide gekend zijn.
    const verbruik = huidigeDiesel && huidigTarief ? Math.round(((huidigTarief * 100) / huidigeDiesel) * 10) / 10 : 7;
    setKmBewerk({ dieselprijs: huidigeDiesel ? String(huidigeDiesel) : "", verbruik: String(verbruik) });
    setKmBewerkOpen(true);
  };

  const kmVergoedingOpslaan = async () => {
    const diesel = parseFloat(kmBewerk.dieselprijs);
    const verbruik = parseFloat(kmBewerk.verbruik);
    if (!diesel || !verbruik) return toast.error("Vul dieselprijs en verbruik in.");
    const tarief = Math.round(((diesel * verbruik) / 100) * 1000) / 1000;
    const res = await fetch("/api/fv/maanden", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fvMaandId, dieselprijs: diesel, kmTariefLeiding: tarief, kmTariefLogistiek: tarief }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setKmBewerkOpen(false);
    ladenOverzicht(fvMaandId);
    toast.success(`Km-vergoeding bijgewerkt naar €${tarief}/km`);
  };

  const regelToevoegen = async (userId, bron) => {
    const regel = nieuweRegel[userId];
    if (!regel?.omschrijving || !regel?.bedrag) return toast.error("Vul zowel een omschrijving als een bedrag in.");
    const res = await fetch("/api/fv/regels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId, userId, omschrijving: regel.omschrijving, bedrag: regel.bedrag, bron }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweRegel((prev) => ({ ...prev, [userId]: { omschrijving: "", bedrag: "" } }));
    veldOpenZetten(userId, null);
    ladenOverzicht(fvMaandId);
  };

  const kmToevoegen = async (userId) => {
    const veld = nieuweKm[userId] || {};
    const km = parseFloat(veld.km);
    if (!km) return toast.error("Vul een aantal kilometer in.");
    const res = await fetch("/api/kilometers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId, userId, km, activiteit: veld.reden || null }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setNieuweKm((prev) => ({ ...prev, [userId]: { km: "", reden: "" } }));
    veldOpenZetten(userId, null);
    ladenOverzicht(fvMaandId);
  };

  // Bumpt eventueel eerst de fysieke telling, en zet dan de volledige
  // streepjes-stand (fysiek + online) van deze ene persoon om in een fv_regel
  // — zelfde onderliggende actie als "Alleen deze doorzetten" op /streepjes.
  const streepjesToevoegen = async (userId) => {
    const huidig = streepjesData[userId];
    const nieuweWaarde = streepjesBewerk[userId];
    if (nieuweWaarde !== undefined && Number(nieuweWaarde) !== Number(huidig?.fysieke_streepjes || 0)) {
      await fetch("/api/streepjes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fysiekeStreepjes: Number(nieuweWaarde) || 0 }),
      });
    }
    const res = await fetch("/api/fv/streepjes-toevoegen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId, userIds: [userId] }),
    });
    const data = await res.json();
    if (data.error) return toast.error(data.error);
    setStreepjesBewerk((prev) => { const next = { ...prev }; delete next[userId]; return next; });
    veldOpenZetten(userId, null);
    streepjesLaden();
    ladenOverzicht(fvMaandId);
    toast.success(data.aantal > 0 ? "Streepjes toegevoegd" : "Geen streepjes om toe te voegen");
  };

  // Zet geplakte tekst ("Naam: NNNkm" per regel) om in een bewerkbare preview
  // met gematchte persoon en herkend aantal kilometer.
  const plakVerwerken = () => {
    const gebruikersLijst = overzicht?.personen.map((p) => p.user) || [];
    const regels = parseNaamRegels(plakTekst);
    if (regels.length === 0) return toast.error("Geen regels herkend. Verwacht formaat: 'Naam: 250km' (één per regel).");
    const rijen = regels.map(({ naam, rest }) => {
      const gebruiker = vindGebruiker(gebruikersLijst, naam);
      const km = haalKmEruit(rest);
      return { naam, userId: gebruiker?.id || "", km: km !== null ? String(km) : "" };
    });
    setPlakPreview(rijen);
  };

  const plakRijWijzigen = (index, veld, waarde) => {
    setPlakPreview((prev) => prev.map((r, i) => (i === index ? { ...r, [veld]: waarde } : r)));
  };

  const plakRijVerwijderen = (index) => {
    setPlakPreview((prev) => prev.filter((_, i) => i !== index));
  };

  const plakBevestigen = async () => {
    const onvolledig = plakPreview.filter((r) => !r.userId || !r.km);
    if (onvolledig.length > 0) return toast.error("Vul voor elke regel een persoon en aantal kilometer in (of verwijder de regel).");
    setPlakBezig(true);
    const resultaten = await Promise.all(
      plakPreview.map((r) =>
        fetch("/api/kilometers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fvMaandId, userId: r.userId, km: r.km, activiteit: plakReden || null }),
        }).then((res) => res.json())
      )
    );
    setPlakBezig(false);
    const fout = resultaten.find((r) => r.error);
    if (fout) return toast.error(fout.error);
    setPlakTekst("");
    setPlakReden("");
    setPlakPreview(null);
    setPlakOpen(false);
    ladenOverzicht(fvMaandId);
    toast.success("Kilometers toegevoegd");
  };

  // Optimistisch: de regel verdwijnt meteen uit het overzicht (en het totaal
  // wordt meteen herberekend), de echte DELETE gebeurt pas na de undo-periode.
  const regelVerwijderen = (userId, regel) => {
    setOverzicht((prev) => ({
      ...prev,
      personen: prev.personen.map((p) =>
        p.user.id === userId
          ? { ...p, regels: p.regels.filter((x) => x.id !== regel.id), totaal: Math.round((p.totaal - Number(regel.bedrag)) * 100) / 100 }
          : p
      ),
    }));
    toast.undoable({
      message: "Regel verwijderd",
      onUndo: () => ladenOverzicht(fvMaandId),
      onCommit: async () => {
        await fetch(`/api/fv/regels?id=${regel.id}`, { method: "DELETE" });
      },
    });
  };

  const statusToggle = async (userId, huidigeStatus) => {
    const nieuw = huidigeStatus === "betaald" ? "openstaand" : "betaald";
    await fetch("/api/fv/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fvMaandId, userId, status: nieuw }),
    });
    ladenOverzicht(fvMaandId);
  };

  const eigenPersoon = overzicht?.personen.find((p) => p.user.id === session?.user?.userId);
  const totaalNogNietBetaald = overzicht?.personen.filter((p) => p.status !== "betaald").length || 0;

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800 }}>Financieel Verslag</h1>
          <p className="muted" style={{ fontSize: 15, marginTop: 6 }}>Wat je deze maand moet betalen of terugkrijgt. Details staan onder elk bedrag.</p>
        </div>
        {overzicht && <button onClick={() => window.print()}>Afdrukken / PDF</button>}
      </div>

      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", margin: "16px 0 20px", flexWrap: "wrap" }}>
        <select value={werkjaarId || ""} onChange={(e) => setWerkjaarId(e.target.value)} style={{ fontWeight: 600 }}>
          {werkjaren.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
        </select>
        <select value={fvMaandId || ""} onChange={(e) => setFvMaandId(e.target.value)} style={{ fontWeight: 600 }}>
          {fvMaanden.length === 0 && <option value="">Nog geen FV-maand</option>}
          {fvMaanden.map((m) => <option key={m.id} value={m.id}>{maandLabel(m.maand)}</option>)}
        </select>
        {magBewerken && (
          <button onClick={() => setNieuweMaandOpen(!nieuweMaandOpen)}>{nieuweMaandOpen ? "Annuleren" : "+ Nieuwe FV-maand"}</button>
        )}
      </div>

      {nieuweMaandOpen && (
        <div className="no-print card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Nieuwe FV-maand</div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Iedereen krijgt meteen een lege plaats op dit FV. Streepjes voeg je bewust toe via de "+ Streepjes"-knop bij elke persoon.
          </p>
          <div className="grid-2" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Maand (JJJJ-MM)
              <input value={nieuweMaand.maand} onChange={(e) => setNieuweMaand({ ...nieuweMaand, maand: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Betaaldeadline
              <input type="date" value={nieuweMaand.betaaldeadline} onChange={(e) => setNieuweMaand({ ...nieuweMaand, betaaldeadline: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Dieselprijs (€/L)
              <input type="number" step="0.01" value={nieuweMaand.dieselprijs} onChange={(e) => setNieuweMaand({ ...nieuweMaand, dieselprijs: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Gem. verbruik (L/100km)
              <input type="number" step="0.1" value={nieuweMaand.verbruik} onChange={(e) => setNieuweMaand({ ...nieuweMaand, verbruik: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
            </label>
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Km-vergoeding voor iedereen: {berekendKmTarief() ? `€${berekendKmTarief()}/km` : "vul dieselprijs en verbruik in"}
            {" "}(dieselprijs × verbruik ÷ 100)
          </p>
          <button className="btn-primary" onClick={nieuweMaandAanmaken}>Aanmaken</button>
        </div>
      )}

      {!overzicht ? (
        fvMaanden.length === 0 ? (
          <p className="muted" style={{ fontStyle: "italic" }}>Nog geen FV-maand aangemaakt voor dit werkjaar.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
        )
      ) : (
        <>
          {eigenPersoon && (
            <PersoonKaart
              p={eigenPersoon}
              jezelf={false}
              groot
              magBewerken={false}
              open={openKaarten.has(eigenPersoon.user.id)}
              onToggleOpen={() => toggleKaart(eigenPersoon.user.id)}
              veldOpen={veldOpenPerPersoon[eigenPersoon.user.id] || null}
              onVeldOpen={veldOpenZetten}
              nieuweRegel={nieuweRegel}
              setNieuweRegel={setNieuweRegel}
              onRegelToevoegen={regelToevoegen}
              nieuweKm={nieuweKm}
              setNieuweKm={setNieuweKm}
              onKmToevoegen={kmToevoegen}
              streepjesInfo={streepjesData[eigenPersoon.user.id]}
              streepjesBewerk={streepjesBewerk}
              setStreepjesBewerk={setStreepjesBewerk}
              onStreepjesToevoegen={streepjesToevoegen}
              onRegelVerwijderen={regelVerwijderen}
              onStatusToggle={statusToggle}
            />
          )}

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, margin: eigenPersoon ? "20px 0 20px" : "0 0 20px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{maandLabel(overzicht.fvMaand.maand)}</div>
              {overzicht.fvMaand.betaaldeadline && <div className="muted" style={{ fontSize: 14 }}>Betaaldeadline {overzicht.fvMaand.betaaldeadline}</div>}
              {overzicht.fvMaand.km_tarief_leiding && <div className="muted" style={{ fontSize: 14 }}>Km-vergoeding €{overzicht.fvMaand.km_tarief_leiding}/km</div>}
              {magBewerken && !kmBewerkOpen && (
                <button className="no-print btn-plain link" style={{ fontSize: 14 }} onClick={kmBewerkOpenen}>
                  {overzicht.fvMaand.km_tarief_leiding ? "Aanpassen" : "Km-vergoeding instellen"}
                </button>
              )}
            </div>
          </div>

          {kmBewerkOpen && (
            <div className="no-print card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>Km-vergoeding aanpassen</div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                Geldt voor deze FV-maand (dieselprijs verandert soms tijdens het jaar). Nieuw tarief telt enkel voor kilometers die je vanaf nu toevoegt.
              </p>
              <div className="grid-2" style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>
                  Dieselprijs (€/L)
                  <input type="number" step="0.01" value={kmBewerk.dieselprijs} onChange={(e) => setKmBewerk({ ...kmBewerk, dieselprijs: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
                </label>
                <label style={{ fontSize: 13, fontWeight: 600 }}>
                  Gem. verbruik (L/100km)
                  <input type="number" step="0.1" value={kmBewerk.verbruik} onChange={(e) => setKmBewerk({ ...kmBewerk, verbruik: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }} />
                </label>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                {parseFloat(kmBewerk.dieselprijs) && parseFloat(kmBewerk.verbruik)
                  ? `Nieuwe km-vergoeding: €${Math.round(((parseFloat(kmBewerk.dieselprijs) * parseFloat(kmBewerk.verbruik)) / 100) * 1000) / 1000}/km`
                  : "vul dieselprijs en verbruik in"}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-primary" onClick={kmVergoedingOpslaan}>Opslaan</button>
                <button onClick={() => setKmBewerkOpen(false)}>Annuleren</button>
              </div>
            </div>
          )}

          {overzicht.personen.length === 0 && (
            <p className="muted" style={{ fontStyle: "italic" }}>Nog niemand op dit FV-overzicht.</p>
          )}

          {totaalNogNietBetaald > 0 && (
            <div className="no-print card card-warning" style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="badge badge-warning" style={{ alignSelf: "flex-start" }}>Nog na te kijken</span>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{totaalNogNietBetaald} perso{totaalNogNietBetaald > 1 ? "nen hebben" : "on heeft"} nog niet betaald</div>
              <button onClick={() => setAlleenOpenstaand((v) => !v)} style={{ alignSelf: "flex-start" }}>
                {alleenOpenstaand ? "✕ Toon iedereen" : "Toon enkel wie nog niet betaalde"}
              </button>
            </div>
          )}

          {magBewerken && (
            <div className="no-print card" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: plakOpen ? 10 : 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Slim plakken: kilometers</div>
                <button onClick={() => setPlakOpen(!plakOpen)}>{plakOpen ? "Annuleren" : "Lijst plakken"}</button>
              </div>
              {plakOpen && (
                <>
                  <p className="subtle" style={{ fontSize: 12, marginBottom: 8 }}>
                    Plak een lijst zoals "Lize: 250km" (één persoon per regel). Vul eventueel hieronder in waarvoor de kilometers waren — dat komt in de omschrijving van elke regel.
                  </p>
                  <input
                    placeholder="Waarvoor? bv. Ledenweekend (optioneel)"
                    value={plakReden}
                    onChange={(e) => setPlakReden(e.target.value)}
                    style={{ width: "100%", marginBottom: 8 }}
                  />
                  <textarea
                    value={plakTekst}
                    onChange={(e) => setPlakTekst(e.target.value)}
                    placeholder={"Lize: 250km\nLucas: 300km\nDries: 150km"}
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
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
                              <select value={r.userId} onChange={(e) => plakRijWijzigen(i, "userId", e.target.value)} style={{ flex: 1, borderColor: r.userId ? undefined : "var(--danger)" }}>
                                <option value="">{r.naam} (niet gevonden)</option>
                                {overzicht.personen.map((p) => <option key={p.user.id} value={p.user.id}>{p.user.naam}</option>)}
                              </select>
                              <input type="number" step="1" value={r.km} onChange={(e) => plakRijWijzigen(i, "km", e.target.value)} style={{ width: 80 }} />
                              <button className="btn-danger" onClick={() => plakRijVerwijderen(i)}>🗑️</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        {plakPreview.length > 0 && (
                          <button className="btn-primary" disabled={plakBezig} onClick={plakBevestigen}>Alles toevoegen ({plakPreview.length})</button>
                        )}
                        <button onClick={() => setPlakPreview(null)}>Opnieuw verwerken</button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {GROEP_VOLGORDE.filter((g) => overzicht.personen.some((p) => fvGroep(p.user) === g)).map((groep) => {
            const personenInGroep = overzicht.personen.filter((p) => fvGroep(p.user) === groep && (!alleenOpenstaand || p.status !== "betaald"));
            if (personenInGroep.length === 0) return null;
            const subtotaal = personenInGroep.reduce((s, p) => s + p.totaal, 0);
            const nogNietBetaald = personenInGroep.filter((p) => p.status !== "betaald").length;
            return (
              <div key={groep} style={{ marginBottom: 24, pageBreakBefore: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--border)", paddingBottom: 8, marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <div className="eyebrow">{groep} · {personenInGroep.length} personen</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    {nogNietBetaald > 0 && <span className="badge badge-danger">{nogNietBetaald} nog niet betaald</span>}
                    <span className="muted" style={{ fontSize: 14 }}>
                      Subtotaal <span className="money" style={{ fontWeight: 700, color: "var(--text)" }}>{subtotaal < 0 ? "terug " : ""}{euro(Math.abs(subtotaal))}</span>
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {personenInGroep.map((p) => (
                    <PersoonKaart
                      key={p.user.id}
                      p={p}
                      jezelf={p.user.id === session?.user?.userId}
                      magBewerken={magBewerken}
                      open={openKaarten.has(p.user.id)}
                      onToggleOpen={() => toggleKaart(p.user.id)}
                      veldOpen={veldOpenPerPersoon[p.user.id] || null}
                      onVeldOpen={veldOpenZetten}
                      nieuweRegel={nieuweRegel}
                      setNieuweRegel={setNieuweRegel}
                      onRegelToevoegen={regelToevoegen}
                      nieuweKm={nieuweKm}
                      setNieuweKm={setNieuweKm}
                      onKmToevoegen={kmToevoegen}
                      streepjesInfo={streepjesData[p.user.id]}
                      streepjesBewerk={streepjesBewerk}
                      setStreepjesBewerk={setStreepjesBewerk}
                      onStreepjesToevoegen={streepjesToevoegen}
                      onRegelVerwijderen={regelVerwijderen}
                      onStatusToggle={statusToggle}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
