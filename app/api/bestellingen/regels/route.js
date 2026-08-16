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

  await prijsOnthouden(bestellingId, product, Number(prijsPerStuk));

  return NextResponse.json({ regel: data });
}

// Prijsgeheugen (product_prijzen) bijwerken — los van bestelling_regels, zodat
// het verwijderen van een oude bestelling deze prijssuggestie niet meeneemt.
// Zonder winkel op de bestelling wordt niets onthouden: dat is meestal een
// eenmalige aankoop (geen vaste leverancier), en zou de suggesties enkel
// vervuilen. Een hapering hier mag het toevoegen van de regel zelf niet
// laten mislukken.
async function prijsOnthouden(bestellingId, product, prijs) {
  try {
    const { data: bestelling } = await supabaseAdmin.from("bestellingen").select("winkel").eq("id", bestellingId).maybeSingle();
    const winkelKey = (bestelling?.winkel || "").trim().toLowerCase();
    if (!winkelKey) return;
    await supabaseAdmin.from("product_prijzen").upsert(
      { product: product.trim(), product_key: product.trim().toLowerCase(), winkel_key: winkelKey, prijs, bijgewerkt_op: new Date().toISOString() },
      { onConflict: "product_key,winkel_key" }
    );
  } catch {
    // Prijsgeheugen is een comfort-feature, geen kritieke data — negeren.
  }
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
