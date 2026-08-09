import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { werkjaarId, naam } = await req.json();
  if (!werkjaarId || !naam) return NextResponse.json({ error: "werkjaarId en naam zijn verplicht" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("kamp_categorieen")
    .insert({ werkjaar_id: werkjaarId, naam })
    .select("id, naam")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categorie: data });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin.from("kamp_categorieen").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
