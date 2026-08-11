import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("categorisatie_regels")
    .select("id, bevat_tekst, prioriteit, categorie_id, categorieen(naam)")
    .order("prioriteit");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regels: data });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { bevatTekst, categorieId } = await req.json();
  if (!bevatTekst || !categorieId) return NextResponse.json({ error: "Tekst en categorie zijn verplicht" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("categorisatie_regels")
    .insert({ veld: "vrije_mededeling", bevat_tekst: bevatTekst.toLowerCase().trim(), categorie_id: categorieId, prioriteit: 100 })
    .select("id, bevat_tekst, categorie_id, categorieen(naam)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regel: data });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin.from("categorisatie_regels").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
