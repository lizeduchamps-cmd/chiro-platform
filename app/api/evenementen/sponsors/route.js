import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magEvenementBewerken } from "@/lib/evenementPermissies";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const evenementId = new URL(req.url).searchParams.get("evenementId");
  if (!evenementId) return NextResponse.json({ error: "evenementId ontbreekt" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("evenement_sponsors")
    .select("id, naam, bedrag, opmerking")
    .eq("evenement_id", evenementId)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sponsors: data });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  const { evenementId, naam, bedrag, opmerking } = await req.json();
  if (!evenementId || !naam || bedrag === undefined) return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  if (!(await magEvenementBewerken(session, evenementId))) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("evenement_sponsors")
    .insert({ evenement_id: evenementId, naam, bedrag: Number(bedrag), opmerking: opmerking || null })
    .select("id, naam, bedrag, opmerking")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sponsor: data });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const evenementId = searchParams.get("evenementId");
  if (!id || !evenementId) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });
  if (!(await magEvenementBewerken(session, evenementId))) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const { error } = await supabaseAdmin.from("evenement_sponsors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
