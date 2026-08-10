import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { verdeelNaarFv } from "@/lib/fvVerdeling";

// Verdeelt in één keer alle nog niet-verdeelde bestellingen (die minstens één
// regel hebben) over een gekozen FV-maand. Elke bestelling blijft een eigen
// regel per persoon op het FV (bv. "Frituur 16/05" naast "Pizza 23/05"),
// enkel het klikwerk wordt gebundeld.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { fvMaandId } = await req.json();
  if (!fvMaandId) return NextResponse.json({ error: "fvMaandId is verplicht" }, { status: 400 });

  const { data: openstaand, error: bestellingenError } = await supabaseAdmin
    .from("bestellingen")
    .select("id, titel, datum")
    .is("verdeeld_naar_fv_maand_id", null);
  if (bestellingenError) return NextResponse.json({ error: bestellingenError.message }, { status: 500 });
  if (!openstaand?.length) return NextResponse.json({ ok: true, aantalBestellingen: 0, aantalRegels: 0 });

  const { data: alleRegels, error: regelsError } = await supabaseAdmin
    .from("bestelling_regels")
    .select("bestelling_id, user_id, aantal, prijs_per_stuk")
    .in("bestelling_id", openstaand.map((b) => b.id));
  if (regelsError) return NextResponse.json({ error: regelsError.message }, { status: 500 });

  const teVerdelen = [];
  const verdeeldeBestellingIds = [];

  for (const bestelling of openstaand) {
    const eigenRegels = (alleRegels || []).filter((r) => r.bestelling_id === bestelling.id);
    if (eigenRegels.length === 0) continue; // lege bestelling, sla over

    const perPersoon = {};
    eigenRegels.forEach((r) => {
      perPersoon[r.user_id] = (perPersoon[r.user_id] || 0) + Number(r.aantal) * Number(r.prijs_per_stuk);
    });

    Object.entries(perPersoon).forEach(([userId, totaal]) => {
      teVerdelen.push({
        fvMaandId,
        userId,
        omschrijving: `${bestelling.titel} (${bestelling.datum})`,
        bedrag: totaal,
        bron: "bestelling",
      });
    });
    verdeeldeBestellingIds.push(bestelling.id);
  }

  if (verdeeldeBestellingIds.length === 0) {
    return NextResponse.json({ ok: true, aantalBestellingen: 0, aantalRegels: 0 });
  }

  const { fvRegels, error: verdeelError } = await verdeelNaarFv(teVerdelen);
  if (verdeelError) return NextResponse.json({ error: verdeelError }, { status: 500 });

  const { error: updateError } = await supabaseAdmin
    .from("bestellingen")
    .update({ verdeeld_naar_fv_maand_id: fvMaandId })
    .in("id", verdeeldeBestellingIds);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, aantalBestellingen: verdeeldeBestellingIds.length, aantalRegels: fvRegels.length });
}
