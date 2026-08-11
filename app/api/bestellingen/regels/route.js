import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { bestellingId, userId, product, aantal, prijsPerStuk } = await req.json();
  if (!bestellingId || !userId || !product || !aantal || prijsPerStuk === undefined) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("bestelling_regels")
    .insert({
      bestelling_id: bestellingId,
      user_id: userId,
      product,
      aantal: Number(aantal),
      prijs_per_stuk: Number(prijsPerStuk),
    })
    .select("id, user_id, product, aantal, prijs_per_stuk")
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

  const { error } = await supabaseAdmin.from("bestelling_regels").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
