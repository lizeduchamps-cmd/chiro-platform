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
    .from("evenement_categorieen")
    .select("id, naam")
    .eq("evenement_id", evenementId)
    .order("naam");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categorieen: data });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { evenementId, naam } = await req.json();
  if (!evenementId || !naam?.trim()) return NextResponse.json({ error: "evenementId en naam zijn verplicht" }, { status: 400 });

  const magBewerken = await magEvenementBewerken(session, evenementId);
  if (!magBewerken) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("evenement_categorieen")
    .insert({ evenement_id: evenementId, naam: naam.trim() })
    .select("id, naam")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categorie: data });
}
