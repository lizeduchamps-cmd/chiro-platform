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

  let query = supabaseAdmin.from("evenementen").select("id, naam, datum, status, werkjaar_id").order("datum", { ascending: false, nullsFirst: false });
  if (werkjaarId) query = query.eq("werkjaar_id", werkjaarId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evenementen: data });
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

  const { naam, datum, werkjaarId } = await req.json();
  if (!naam) return NextResponse.json({ error: "Naam is verplicht" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("evenementen")
    .insert({ naam, datum: datum || null, werkjaar_id: werkjaarId || null })
    .select("id, naam, datum, status, werkjaar_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evenement: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  const { id, naam, datum, status } = await req.json();
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  if (!(await magEvenementBewerken(session, id))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const updateFields = {};
  if (naam !== undefined) updateFields.naam = naam;
  if (datum !== undefined) updateFields.datum = datum || null;
  if (status !== undefined) updateFields.status = status;

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
