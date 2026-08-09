import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("partijen")
    .select("id, naam, rol, iban, contact")
    .order("naam");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partijen: data });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { naam, rol, iban, contact } = await req.json();
  if (!naam || !rol) return NextResponse.json({ error: "Naam en rol zijn verplicht" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("partijen")
    .insert({ naam, rol, iban: iban || null, contact: contact || null })
    .select("id, naam, rol, iban, contact")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partij: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { id, naam, rol, iban, contact } = await req.json();
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const updateFields = {};
  if (naam !== undefined) updateFields.naam = naam;
  if (rol !== undefined) updateFields.rol = rol;
  if (iban !== undefined) updateFields.iban = iban || null;
  if (contact !== undefined) updateFields.contact = contact || null;

  const { error } = await supabaseAdmin.from("partijen").update(updateFields).eq("id", id);
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

  const { error } = await supabaseAdmin.from("partijen").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
