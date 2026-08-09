import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Verdeelt een bestelling over de FV's van iedereen die er iets van besteld
// heeft: per persoon één regel met het subtotaal van die bestelling.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { bestellingId, fvMaandId } = await req.json();
  if (!bestellingId || !fvMaandId) {
    return NextResponse.json({ error: "bestellingId en fvMaandId zijn verplicht" }, { status: 400 });
  }

  const { data: bestelling, error: bestellingError } = await supabaseAdmin
    .from("bestellingen")
    .select("id, titel, datum, verdeeld_naar_fv_maand_id")
    .eq("id", bestellingId)
    .maybeSingle();
  if (bestellingError) return NextResponse.json({ error: bestellingError.message }, { status: 500 });
  if (!bestelling) return NextResponse.json({ error: "Bestelling niet gevonden" }, { status: 404 });
  if (bestelling.verdeeld_naar_fv_maand_id) {
    return NextResponse.json({ error: "Deze bestelling is al verdeeld over een FV." }, { status: 400 });
  }

  const { data: regels, error: regelsError } = await supabaseAdmin
    .from("bestelling_regels")
    .select("user_id, aantal, prijs_per_stuk")
    .eq("bestelling_id", bestellingId);
  if (regelsError) return NextResponse.json({ error: regelsError.message }, { status: 500 });
  if (!regels?.length) return NextResponse.json({ error: "Deze bestelling heeft nog geen regels." }, { status: 400 });

  const perPersoon = {};
  regels.forEach((r) => {
    perPersoon[r.user_id] = (perPersoon[r.user_id] || 0) + Number(r.aantal) * Number(r.prijs_per_stuk);
  });

  const statusRows = Object.keys(perPersoon).map((userId) => ({ fv_maand_id: fvMaandId, user_id: userId, status: "openstaand" }));
  const fvRegelRows = Object.entries(perPersoon).map(([userId, totaal]) => ({
    fv_maand_id: fvMaandId,
    user_id: userId,
    omschrijving: `${bestelling.titel} (${bestelling.datum})`,
    bedrag: Math.round(totaal * 100) / 100,
    bron: "bestelling",
  }));

  await supabaseAdmin.from("fv_status").upsert(statusRows, { onConflict: "fv_maand_id,user_id", ignoreDuplicates: true });

  const { error: insertError } = await supabaseAdmin.from("fv_regels").insert(fvRegelRows);
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { error: updateError } = await supabaseAdmin
    .from("bestellingen")
    .update({ verdeeld_naar_fv_maand_id: fvMaandId })
    .eq("id", bestellingId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, aantal: fvRegelRows.length });
}
