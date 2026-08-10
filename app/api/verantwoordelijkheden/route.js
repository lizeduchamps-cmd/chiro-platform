import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Aanmaken/verwijderen van verantwoordelijkheden zelf blijft voorbehouden aan
// admin — het toewijzen van personen eraan gebeurt via /toewijzingen en mag
// (net als de rest van /beheer/gebruikers) ook enkel door een admin.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.platformRecht !== "admin") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { naam } = await req.json();
  if (!naam?.trim()) return NextResponse.json({ error: "Naam is verplicht" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("verantwoordelijkheden")
    .insert({ naam: naam.trim() })
    .select("id, naam")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ verantwoordelijkheid: { ...data, hoofdverantwoordelijke: null, medeverantwoordelijken: [] } });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.platformRecht !== "admin") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin.from("verantwoordelijkheden").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
