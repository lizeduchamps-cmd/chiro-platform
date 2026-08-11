import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("bestellingen")
    .select("id, titel, datum, winkel, verdeeld_naar_fv_maand_id")
    .order("datum", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bestellingen: data });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { titel, datum, winkel } = await req.json();
  if (!titel) return NextResponse.json({ error: "Titel is verplicht" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("bestellingen")
    .insert({ titel, datum: datum || new Date().toISOString().slice(0, 10), winkel: winkel || null })
    .select("id, titel, datum, winkel, verdeeld_naar_fv_maand_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bestelling: data });
}

// Enkel bedoeld om de winkel achteraf te corrigeren (bv. typfout) — titel/datum
// zijn bewust niet aanpasbaar via dit endpoint, dat blijft bij aanmaken vastliggen.
export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { id, winkel } = await req.json();
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin.from("bestellingen").update({ winkel: winkel || null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin.from("bestellingen").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
