import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// De kalender toont alles wat een datum heeft (behalve transacties) door
// elkaar: handmatige kalender_items (opgeslagen) plus live berekende items
// vanuit FV-betaaldeadlines, wisselgeld-aanvragen en evenementen — die drie
// staan nergens dubbel opgeslagen, zodat de kalender nooit uit sync kan
// raken (bv. als een wisselgeld-status wijzigt) en ook de volledige
// geschiedenis toont (niet enkel de eerstvolgende deadline).
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  const [{ data: handmatig, error: handmatigError }, { data: fvMaanden, error: fvError }, { data: wisselgeld, error: wisselgeldError }, { data: evenementen, error: evenementenError }] = await Promise.all([
    supabaseAdmin
      .from("kalender_items")
      .select("id, titel, type, datum_deadline, toegewezen_aan, is_voltooid")
      .eq("werkjaar_id", werkjaarId),
    supabaseAdmin
      .from("fv_maanden")
      .select("id, maand, betaaldeadline, fv_status(status)")
      .eq("werkjaar_id", werkjaarId)
      .not("betaaldeadline", "is", null),
    supabaseAdmin
      .from("wisselgeld_aanvragen")
      .select("id, aanvraag_code, afdeling, datum_nodig, bedrag_gevraagd, status")
      .eq("werkjaar_id", werkjaarId),
    supabaseAdmin
      .from("evenementen")
      .select("id, naam, datum, status")
      .eq("werkjaar_id", werkjaarId)
      .not("datum", "is", null),
  ]);
  if (handmatigError) return NextResponse.json({ error: handmatigError.message }, { status: 500 });
  if (fvError) return NextResponse.json({ error: fvError.message }, { status: 500 });
  if (wisselgeldError) return NextResponse.json({ error: wisselgeldError.message }, { status: 500 });
  if (evenementenError) return NextResponse.json({ error: evenementenError.message }, { status: 500 });

  const fvItems = (fvMaanden || []).map((m) => ({
    id: `fv-${m.id}`,
    virtueel: true,
    titel: `FV-betaaldeadline (${m.maand})`,
    type: "FV Betaaldeadline",
    datum_deadline: m.betaaldeadline,
    toegewezen_aan: null,
    is_voltooid: (m.fv_status || []).every((s) => s.status === "betaald"),
    link: "/fv",
  }));

  const wisselgeldItems = (wisselgeld || []).map((w) => ({
    id: `wg-${w.id}`,
    virtueel: true,
    titel: `Wisselgeld ${w.afdeling} · ${w.aanvraag_code} (${w.status})`,
    type: "Wisselgeld Deadline",
    datum_deadline: w.datum_nodig,
    toegewezen_aan: "Financieel verantwoordelijke",
    is_voltooid: w.status === "Klaargezet" || w.status === "Opgehaald",
    link: "/wisselgeld",
  }));

  const evenementItems = (evenementen || []).map((e) => ({
    id: `ev-${e.id}`,
    virtueel: true,
    titel: e.naam,
    type: "Evenement",
    datum_deadline: e.datum,
    toegewezen_aan: null,
    is_voltooid: e.status === "afgerond",
    link: `/evenementen/${e.id}`,
  }));

  const kalenderItems = [...(handmatig || []), ...fvItems, ...wisselgeldItems, ...evenementItems].sort((a, b) => a.datum_deadline.localeCompare(b.datum_deadline));

  return NextResponse.json({ kalenderItems });
}

// Handmatige items (bv. "Waarborg kampplaats storten") blijven voorbehouden
// aan admin/financieel_verantwoordelijke — wisselgeld/FV-deadlines hoeven
// hier nooit aangemaakt te worden, die berekent GET hierboven live.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { werkjaarId, titel, type, datumDeadline, toegewezenAan } = await req.json();
  if (!werkjaarId || !titel || !type || !datumDeadline) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("kalender_items")
    .insert({ werkjaar_id: werkjaarId, titel, type, datum_deadline: datumDeadline, toegewezen_aan: toegewezenAan || null })
    .select("id, titel, type, datum_deadline, toegewezen_aan, is_voltooid")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const updateFields = {};
  if (body.titel !== undefined) updateFields.titel = body.titel;
  if (body.datumDeadline !== undefined) updateFields.datum_deadline = body.datumDeadline;
  if (body.toegewezenAan !== undefined) updateFields.toegewezen_aan = body.toegewezenAan || null;
  if (body.isVoltooid !== undefined) updateFields.is_voltooid = body.isVoltooid;

  const { error } = await supabaseAdmin.from("kalender_items").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin.from("kalender_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
