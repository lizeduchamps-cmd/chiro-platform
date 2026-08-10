import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Maakt een kilometers-rij én de bijhorende fv_regel in één keer aan — het
// bedrag wordt hier berekend (nooit door de client meegegeven) zodat het
// altijd km × het tarief van de gekozen FV-maand is.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { fvMaandId, userId, km, activiteit, datum } = await req.json();
  const kmGetal = parseFloat(km);
  if (!fvMaandId || !userId || !kmGetal) {
    return NextResponse.json({ error: "fvMaandId, userId en km zijn verplicht" }, { status: 400 });
  }

  const { data: fvMaand, error: maandError } = await supabaseAdmin
    .from("fv_maanden")
    .select("km_tarief_leiding")
    .eq("id", fvMaandId)
    .maybeSingle();
  if (maandError) return NextResponse.json({ error: maandError.message }, { status: 500 });
  const tarief = fvMaand?.km_tarief_leiding;
  if (!tarief) return NextResponse.json({ error: "Er is nog geen km-tarief ingesteld voor deze FV-maand." }, { status: 400 });

  const bedrag = -(Math.round(kmGetal * tarief * 100) / 100);
  const omschrijving = activiteit ? `Kilometervergoeding ${activiteit} (${kmGetal} km)` : `Kilometervergoeding (${kmGetal} km)`;

  await supabaseAdmin
    .from("fv_status")
    .upsert({ fv_maand_id: fvMaandId, user_id: userId, status: "openstaand" }, { onConflict: "fv_maand_id,user_id", ignoreDuplicates: true });

  const { data: fvRegel, error: regelError } = await supabaseAdmin
    .from("fv_regels")
    .insert({ fv_maand_id: fvMaandId, user_id: userId, omschrijving, bedrag, bron: "kilometers" })
    .select("id")
    .single();
  if (regelError) return NextResponse.json({ error: regelError.message }, { status: 500 });

  const { data: kilometerRij, error: kmError } = await supabaseAdmin
    .from("kilometers")
    .insert({
      user_id: userId,
      fv_maand_id: fvMaandId,
      datum: datum || new Date().toISOString().slice(0, 10),
      km: kmGetal,
      activiteit: activiteit || null,
      tarief,
      bedrag,
      fv_regel_id: fvRegel.id,
    })
    .select("id, datum, km, activiteit, tarief, bedrag")
    .single();
  if (kmError) {
    // Rij in fv_regels weer opruimen als de kilometers-rij niet lukt, anders
    // blijft er een fv_regel zonder kilometers-onderbouwing achter.
    await supabaseAdmin.from("fv_regels").delete().eq("id", fvRegel.id);
    return NextResponse.json({ error: kmError.message }, { status: 500 });
  }

  return NextResponse.json({ kilometers: kilometerRij, fvRegelId: fvRegel.id });
}
