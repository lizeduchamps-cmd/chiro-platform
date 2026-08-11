import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";
import { verdeelNaarFv } from "@/lib/fvVerdeling";

// Verdeelt een bestelling over de FV's van iedereen die er iets van besteld
// heeft: per persoon één regel met het subtotaal van die bestelling.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
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

  const { fvRegels, error: verdeelError } = await verdeelNaarFv(
    Object.entries(perPersoon).map(([userId, totaal]) => ({
      fvMaandId,
      userId,
      omschrijving: `${bestelling.titel} (${bestelling.datum})`,
      bedrag: totaal,
      bron: "bestelling",
    }))
  );
  if (verdeelError) return NextResponse.json({ error: verdeelError }, { status: 500 });

  const { error: updateError } = await supabaseAdmin
    .from("bestellingen")
    .update({ verdeeld_naar_fv_maand_id: fvMaandId })
    .eq("id", bestellingId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, aantal: fvRegels.length });
}
