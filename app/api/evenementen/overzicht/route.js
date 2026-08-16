import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Volledig rapportage-overzicht van één evenement: kassa-omzet, budget-burn-rate
// per hoofdcategorie, kosten vs. investeringen, "nog terug te betalen"-lijst en
// de globale winst/verliesbalans. Alles hieronder is afgeleid — niets wordt
// apart opgeslagen, zodat het altijd in sync is met de ruwe transacties/kassa's.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const evenementId = new URL(req.url).searchParams.get("evenementId");
  if (!evenementId) return NextResponse.json({ error: "evenementId ontbreekt" }, { status: 400 });

  const { data: evenement, error: evenementError } = await supabaseAdmin
    .from("evenementen")
    .select("id, naam, datum, status, werkjaar_id, heeft_ticketverkoop, heeft_sponsoring, heeft_groepsbudgetten, heeft_rekening_scan, ticketverkoop_online_bedrag, ticket_prijs_jeugd, ticket_prijs_volwassen")
    .eq("id", evenementId)
    .maybeSingle();
  if (evenementError) return NextResponse.json({ error: evenementError.message }, { status: 500 });
  if (!evenement) return NextResponse.json({ error: "Evenement niet gevonden" }, { status: 404 });

  const [
    { data: kassas, error: kassasError },
    { data: budgetten, error: budgettenError },
    { data: categorieen, error: categorieenError },
    { data: transacties, error: transactiesError },
    { data: gekoppeldeTransacties, error: gekoppeldeError },
    { data: ticketverkopers, error: ticketverkopersError },
    { data: sponsors, error: sponsorsError },
    { data: sponsorDrempels, error: drempelsError },
    { data: kampTransacties, error: kampError },
  ] = await Promise.all([
    supabaseAdmin.from("evenement_kassas").select("id, naam, type, wisselgeld_start, inhoud_einde, wisselgeld_start_samenstelling, inhoud_einde_samenstelling, verwacht_bedrag, digitaal_sumup, digitaal_bancontact, digitaal_kbc_qr").eq("evenement_id", evenementId),
    supabaseAdmin.from("evenement_budgetten").select("id, hoofdcategorie, budget_toegewezen").eq("evenement_id", evenementId),
    supabaseAdmin.from("evenement_categorieen").select("id, naam").eq("evenement_id", evenementId).order("naam"),
    supabaseAdmin
      .from("evenement_transacties")
      .select(
        "id, transactie_code, datum, omschrijving, type_geldstroom, type_kostenpost, hoofdcategorie, waar, hoeveelheid, bedrag_totaal, betaalmethode, status, bewijsstuk_url, medewerker_user_id, users(id, naam, iban)"
      )
      .eq("evenement_id", evenementId)
      .order("datum", { ascending: false }),
    // Kasboektransacties die aan dit evenement getagd zijn (bv. de SumUp-
    // uitbetaling na de fuif) — dezelfde euro als in het kasboek, hier enkel
    // ter info/optelling, niet nog eens apart geregistreerd.
    supabaseAdmin
      .from("transacties")
      .select("id, datum, soort, tegenpartij, vrije_mededeling, omschrijving, bedrag, categorieen(naam)")
      .eq("evenement_id", evenementId)
      .order("datum", { ascending: false }),
    supabaseAdmin.from("evenement_ticketverkopers").select("id, naam, jeugd_meegenomen, volwassen_meegenomen, jeugd_teruggebracht, volwassen_teruggebracht, cash_ontvangen, overschrijving_ontvangen").eq("evenement_id", evenementId).order("created_at"),
    supabaseAdmin.from("evenement_sponsors").select("id, naam, bedrag, opmerking, contact").eq("evenement_id", evenementId).order("created_at"),
    supabaseAdmin.from("sponsor_drempels").select("id, drempelbedrag, gratis_tickets, drankbonnetjes").eq("evenement_id", evenementId).order("drempelbedrag"),
    // Kamp houdt zijn kosten/inkomsten nog bij in een eigen tabel (zie
    // Kampkosten) i.p.v. evenement_transacties — hier meetellen zodat de
    // balans klopt als je Kamp via deze algemene evenementpagina bekijkt.
    supabaseAdmin.from("kamp_transacties").select("bedrag, type_geldstroom").eq("evenement_id", evenementId),
  ]);
  if (kassasError) return NextResponse.json({ error: kassasError.message }, { status: 500 });
  if (budgettenError) return NextResponse.json({ error: budgettenError.message }, { status: 500 });
  if (categorieenError) return NextResponse.json({ error: categorieenError.message }, { status: 500 });
  if (transactiesError) return NextResponse.json({ error: transactiesError.message }, { status: 500 });
  if (gekoppeldeError) return NextResponse.json({ error: gekoppeldeError.message }, { status: 500 });
  if (ticketverkopersError) return NextResponse.json({ error: ticketverkopersError.message }, { status: 500 });
  if (sponsorsError) return NextResponse.json({ error: sponsorsError.message }, { status: 500 });
  if (drempelsError) return NextResponse.json({ error: drempelsError.message }, { status: 500 });
  if (kampError) return NextResponse.json({ error: kampError.message }, { status: 500 });

  // Per ticketverkoper: "nog niet afgerekend" zolang niet beide teruggebracht-
  // aantallen zijn ingevuld — het ontvangen bedrag telt intussen al wel mee in
  // de omzet, dat is los van de bandjes-boekhouding. Eens afgerekend: klopt/
  // tekort/teveel op basis van verschuldigd (uitgegeven bandjes × prijs) t.o.v.
  // ontvangen (cash + overschrijving).
  const ticketverkopersMetStatus = (ticketverkopers || []).map((t) => {
    const ontvangen = Math.round((Number(t.cash_ontvangen || 0) + Number(t.overschrijving_ontvangen || 0)) * 100) / 100;
    const afgerekend = t.jeugd_teruggebracht !== null && t.jeugd_teruggebracht !== undefined && t.volwassen_teruggebracht !== null && t.volwassen_teruggebracht !== undefined;
    if (!afgerekend) return { ...t, ontvangen, uitgegevenJeugd: null, uitgegevenVolwassen: null, verschuldigd: null, verschil: null, status: "nogNietAfgerekend" };

    const uitgegevenJeugd = Number(t.jeugd_meegenomen) - Number(t.jeugd_teruggebracht);
    const uitgegevenVolwassen = Number(t.volwassen_meegenomen) - Number(t.volwassen_teruggebracht);
    const verschuldigd = Math.round((uitgegevenJeugd * Number(evenement.ticket_prijs_jeugd || 0) + uitgegevenVolwassen * Number(evenement.ticket_prijs_volwassen || 0)) * 100) / 100;
    const verschil = Math.round((ontvangen - verschuldigd) * 100) / 100;
    const status = Math.abs(verschil) < 0.01 ? "klopt" : verschil < 0 ? "tekort" : "teveel";
    return { ...t, ontvangen, uitgegevenJeugd, uitgegevenVolwassen, verschuldigd, verschil, status };
  });
  const ticketverkoopFysiek = ticketverkopersMetStatus.reduce((s, t) => s + t.ontvangen, 0);
  const ticketOmzet = Number(evenement.ticketverkoop_online_bedrag || 0) + ticketverkoopFysiek;

  // Tegenprestatie van een sponsor = som van alle drempels die zijn bedrag
  // haalt (niet enkel de hoogste) — bv. bij €250 en drempels op €50/€100/€200
  // tellen alle drie mee.
  const sponsorsMetTegenprestatie = (sponsors || []).map((sp) => {
    const gehaald = (sponsorDrempels || []).filter((d) => Number(sp.bedrag) >= Number(d.drempelbedrag));
    return {
      ...sp,
      gratisTickets: gehaald.reduce((s, d) => s + d.gratis_tickets, 0),
      drankbonnetjes: gehaald.reduce((s, d) => s + d.drankbonnetjes, 0),
    };
  });
  const sponsorBedrag = (sponsors || []).reduce((s, sp) => s + Number(sp.bedrag), 0);
  const kampInkomsten = (kampTransacties || []).filter((t) => t.type_geldstroom === "inkomst").reduce((s, t) => s + Number(t.bedrag), 0);
  const kampUitgaven = (kampTransacties || []).filter((t) => t.type_geldstroom === "uitgave").reduce((s, t) => s + Number(t.bedrag), 0);

  // Kassa-omzet: cash = geteld eindbedrag - klaargezet wisselgeld; digitaal = volledig eindbedrag.
  // Daarbovenop tellen digitale betalingen (SumUp/Bancontact/KBC QR) die naast
  // diezelfde kassa binnenkwamen altijd mee, los van het type van de kassa.
  // Tekort/overschot: enkel bepaald als er een verwacht_bedrag is ingevuld (de
  // leiding schat dit zelf in op basis van verkochte drank/tickets/...) en er
  // ook al effectief geteld is — anders is er niets om mee te vergelijken.
  const kassasMetOmzet = (kassas || []).map((k) => {
    const eind = Number(k.inhoud_einde || 0);
    const digitaalExtra = Number(k.digitaal_sumup || 0) + Number(k.digitaal_bancontact || 0) + Number(k.digitaal_kbc_qr || 0);
    const omzet = (k.type === "cash" ? eind - Number(k.wisselgeld_start || 0) : eind) + digitaalExtra;
    const omzetAfgerond = Math.round(omzet * 100) / 100;
    const heeftVergelijking = k.verwacht_bedrag !== null && k.verwacht_bedrag !== undefined && k.inhoud_einde !== null;
    const verschil = heeftVergelijking ? Math.round((omzetAfgerond - Number(k.verwacht_bedrag)) * 100) / 100 : null;
    return {
      ...k,
      omzet: omzetAfgerond,
      verschil,
      heeftTekort: verschil !== null && verschil < -0.01,
    };
  });
  const kassaOmzetTotaal = kassasMetOmzet.reduce((s, k) => s + k.omzet, 0);
  const kassasMetTekort = kassasMetOmzet.filter((k) => k.heeftTekort);

  const inkomstenTransacties = (transacties || []).filter((t) => t.type_geldstroom === "inkomst");
  const uitgaveTransacties = (transacties || []).filter((t) => t.type_geldstroom === "uitgave");

  // Het kasboek is de enige waarheid voor echt geld — gekoppelde
  // kasboektransacties tellen daarom bewust NIET mee in de balans hieronder,
  // die blijft puur wat de groep zelf via kassa's/transacties bijhoudt. Zo
  // niet zou eenzelfde bedrag dubbel meetellen zodra je (bv. na de
  // bankstorting) de kasboektransactie aan het evenement koppelt.
  const totaalInkomsten = kassaOmzetTotaal + ticketOmzet + sponsorBedrag + kampInkomsten + inkomstenTransacties.reduce((s, t) => s + Number(t.bedrag_totaal), 0);
  const totaalUitgaven = kampUitgaven + uitgaveTransacties.reduce((s, t) => s + Number(t.bedrag_totaal), 0);

  const kostenTotaal = uitgaveTransacties.filter((t) => t.type_kostenpost !== "investering").reduce((s, t) => s + Number(t.bedrag_totaal), 0);
  const investeringenTotaal = uitgaveTransacties.filter((t) => t.type_kostenpost === "investering").reduce((s, t) => s + Number(t.bedrag_totaal), 0);

  const budgetBurnRate = (categorieen || []).map((c) => {
    const budgetRij = (budgetten || []).find((b) => b.hoofdcategorie === c.naam);
    const uitgegeven = uitgaveTransacties.filter((t) => t.hoofdcategorie === c.naam).reduce((s, t) => s + Number(t.bedrag_totaal), 0);
    const budget = budgetRij ? Number(budgetRij.budget_toegewezen) : null;
    return {
      hoofdcategorie: c.naam,
      budget,
      uitgegeven: Math.round(uitgegeven * 100) / 100,
      resterend: budget !== null ? Math.round((budget - uitgegeven) * 100) / 100 : null,
    };
  });

  const nogTerugTeBetalen = (transacties || [])
    .filter((t) => t.status === "Te vergoeden")
    .map((t) => ({
      id: t.id,
      transactieCode: t.transactie_code,
      omschrijving: t.omschrijving,
      bedrag: t.bedrag_totaal,
      datum: t.datum,
      wie: t.users ? { naam: t.users.naam, iban: t.users.iban } : null,
    }));

  return NextResponse.json({
    evenement,
    kassas: kassasMetOmzet,
    kassaOmzetTotaal: Math.round(kassaOmzetTotaal * 100) / 100,
    kassasMetTekort: kassasMetTekort.map((k) => ({ id: k.id, naam: k.naam, verschil: k.verschil })),
    categorieen,
    transacties,
    gekoppeldeTransacties: gekoppeldeTransacties || [],
    ticketverkopers: ticketverkopersMetStatus,
    ticketverkoopOnlineBedrag: evenement.ticketverkoop_online_bedrag,
    ticketOmzet: Math.round(ticketOmzet * 100) / 100,
    sponsors: sponsorsMetTegenprestatie,
    sponsorDrempels: sponsorDrempels || [],
    sponsorBedrag: Math.round(sponsorBedrag * 100) / 100,
    budgetBurnRate,
    nogTerugTeBetalen,
    balans: {
      totaalInkomsten: Math.round(totaalInkomsten * 100) / 100,
      totaalUitgaven: Math.round(totaalUitgaven * 100) / 100,
      nettoWinst: Math.round((totaalInkomsten - totaalUitgaven) * 100) / 100,
      kostenTotaal: Math.round(kostenTotaal * 100) / 100,
      investeringenTotaal: Math.round(investeringenTotaal * 100) / 100,
    },
  });
}
