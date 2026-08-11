import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("categorieen")
    .select("id, naam")
    .order("naam");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categorieen: data });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { naam } = await req.json();
  if (!naam || !naam.trim()) return NextResponse.json({ error: "Naam ontbreekt" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("categorieen")
    .insert({ naam: naam.trim() })
    .select("id, naam")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categorie: data });
}
