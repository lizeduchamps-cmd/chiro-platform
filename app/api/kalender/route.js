import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("kalender_items")
    .select("id, titel, type, datum_deadline, toegewezen_aan, gerelateerd_type, gerelateerd_id, is_voltooid")
    .eq("werkjaar_id", werkjaarId)
    .order("datum_deadline");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kalenderItems: data });
}

// Handmatige items (bv. "Waarborg kampplaats storten") blijven voorbehouden
// aan admin/financieel_verantwoordelijke — auto-gegenereerde wisselgeld-items
// ontstaan via /api/wisselgeld en hoeven hier niet apart aangemaakt te worden.
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
    .select("id, titel, type, datum_deadline, toegewezen_aan, gerelateerd_type, gerelateerd_id, is_voltooid")
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
