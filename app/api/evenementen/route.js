import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";
import { magEvenementBewerken } from "@/lib/evenementPermissies";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");

  let query = supabaseAdmin
    .from("evenementen")
    .select("id, naam, datum, status, werkjaar_id, heeft_ticketverkoop, heeft_sponsoring, heeft_groepsbudgetten, heeft_rekening_scan")
    .order("datum", { ascending: false, nullsFirst: false });
  if (werkjaarId) query = query.eq("werkjaar_id", werkjaarId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const evenementIds = (data || []).map((e) => e.id);
  const evenementen = evenementIds.length ? await metBalansTotalen(data, evenementIds) : data;
  return NextResponse.json({ evenementen });
}

// Lichte versie van de balansberekening uit /api/evenementen/overzicht, in bulk
// voor de lijstweergave: enkel de totalen (geen budget-burn-rate, kassa-detail,
// ...), zodat de lijst niet per evenement een apart request moet doen.
async function metBalansTotalen(evenementen, evenementIds) {
  const [{ data: kassas }, { data: transacties }, { data: tickets }, { data: sponsors }, { data: kampTransacties }] = await Promise.all([
    supabaseAdmin.from("evenement_kassas").select("evenement_id, type, wisselgeld_start, inhoud_einde").in("evenement_id", evenementIds),
    supabaseAdmin.from("evenement_transacties").select("evenement_id, type_geldstroom, bedrag_totaal").in("evenement_id", evenementIds),
    supabaseAdmin.from("evenement_tickets").select("evenement_id, prijs, aantal_verkocht").in("evenement_id", evenementIds),
    supabaseAdmin.from("evenement_sponsors").select("evenement_id, bedrag").in("evenement_id", evenementIds),
    // Kamp (heeft_groepsbudgetten) houdt zijn kosten/inkomsten nog in een
    // eigen tabel bij (zie Kampkosten) i.p.v. evenement_transacties — hier
    // meetellen zodat de balans op deze lijst niet altijd €0 toont voor Kamp.
    supabaseAdmin.from("kamp_transacties").select("evenement_id, type_geldstroom, bedrag").in("evenement_id", evenementIds),
  ]);

  return evenementen.map((e) => {
    const kassaOmzet = (kassas || [])
      .filter((k) => k.evenement_id === e.id)
      .reduce((s, k) => {
        const eind = Number(k.inhoud_einde || 0);
        return s + (k.type === "cash" ? eind - Number(k.wisselgeld_start || 0) : eind);
      }, 0);
    const ticketOmzet = (tickets || []).filter((t) => t.evenement_id === e.id).reduce((s, t) => s + Number(t.prijs) * Number(t.aantal_verkocht), 0);
    const sponsorBedrag = (sponsors || []).filter((sp) => sp.evenement_id === e.id).reduce((s, sp) => s + Number(sp.bedrag), 0);
    const eigenTransacties = (transacties || []).filter((t) => t.evenement_id === e.id);
    const eigenKampTransacties = (kampTransacties || []).filter((t) => t.evenement_id === e.id);
    const inkomsten =
      kassaOmzet + ticketOmzet + sponsorBedrag +
      eigenTransacties.filter((t) => t.type_geldstroom === "inkomst").reduce((s, t) => s + Number(t.bedrag_totaal), 0) +
      eigenKampTransacties.filter((t) => t.type_geldstroom === "inkomst").reduce((s, t) => s + Number(t.bedrag), 0);
    const uitgaven =
      eigenTransacties.filter((t) => t.type_geldstroom === "uitgave").reduce((s, t) => s + Number(t.bedrag_totaal), 0) +
      eigenKampTransacties.filter((t) => t.type_geldstroom === "uitgave").reduce((s, t) => s + Number(t.bedrag), 0);
    return {
      ...e,
      totaalInkomsten: Math.round(inkomsten * 100) / 100,
      totaalUitgaven: Math.round(uitgaven * 100) / 100,
      nettoWinst: Math.round((inkomsten - uitgaven) * 100) / 100,
    };
  });
}

// Aanmaken blijft voorbehouden aan admin/financieel_verantwoordelijke — eens
// aangemaakt kan een verantwoordelijkheid-match (bv. "Taartenslag") de rest
// van het evenement wel zelf beheren, zie magEvenementBewerken. Een nieuw
// evenement start zonder categorieën — die maak je zelf aan waar nodig.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { naam, datum, werkjaarId, heeftTicketverkoop, heeftSponsoring, heeftGroepsbudgetten, heeftRekeningScan } = await req.json();
  if (!naam) return NextResponse.json({ error: "Naam is verplicht" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("evenementen")
    .insert({
      naam,
      datum: datum || null,
      werkjaar_id: werkjaarId || null,
      heeft_ticketverkoop: !!heeftTicketverkoop,
      heeft_sponsoring: !!heeftSponsoring,
      heeft_groepsbudgetten: !!heeftGroepsbudgetten,
      heeft_rekening_scan: !!heeftRekeningScan,
    })
    .select("id, naam, datum, status, werkjaar_id, heeft_ticketverkoop, heeft_sponsoring, heeft_groepsbudgetten, heeft_rekening_scan")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evenement: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  const { id, naam, datum, status, heeftTicketverkoop, heeftSponsoring, heeftGroepsbudgetten, heeftRekeningScan } = await req.json();
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  if (!(await magEvenementBewerken(session, id))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const updateFields = {};
  if (naam !== undefined) updateFields.naam = naam;
  if (datum !== undefined) updateFields.datum = datum || null;
  if (status !== undefined) updateFields.status = status;
  if (heeftTicketverkoop !== undefined) updateFields.heeft_ticketverkoop = !!heeftTicketverkoop;
  if (heeftSponsoring !== undefined) updateFields.heeft_sponsoring = !!heeftSponsoring;
  if (heeftGroepsbudgetten !== undefined) updateFields.heeft_groepsbudgetten = !!heeftGroepsbudgetten;
  if (heeftRekeningScan !== undefined) updateFields.heeft_rekening_scan = !!heeftRekeningScan;

  const { error } = await supabaseAdmin.from("evenementen").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Verwijderen (met cascade naar alle kassa's/transacties) blijft voorbehouden
// aan admin/financieel_verantwoordelijke, gezien de impact.
export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin.from("evenementen").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
