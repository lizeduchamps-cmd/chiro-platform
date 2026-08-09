import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Volledig overzicht van één bestelling: alle regels, gegroepeerd per persoon met subtotaal.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const bestellingId = new URL(req.url).searchParams.get("bestellingId");
  if (!bestellingId) return NextResponse.json({ error: "bestellingId ontbreekt" }, { status: 400 });

  const { data: bestelling, error: bestellingError } = await supabaseAdmin
    .from("bestellingen")
    .select("id, titel, datum, verdeeld_naar_fv_maand_id")
    .eq("id", bestellingId)
    .maybeSingle();
  if (bestellingError) return NextResponse.json({ error: bestellingError.message }, { status: 500 });
  if (!bestelling) return NextResponse.json({ error: "Bestelling niet gevonden" }, { status: 404 });

  const { data: regels, error: regelsError } = await supabaseAdmin
    .from("bestelling_regels")
    .select("id, product, aantal, prijs_per_stuk, user_id, users(id, naam)")
    .eq("bestelling_id", bestellingId)
    .order("created_at");
  if (regelsError) return NextResponse.json({ error: regelsError.message }, { status: 500 });

  const perPersoonMap = {};
  (regels || []).forEach((r) => {
    const key = r.user_id;
    if (!perPersoonMap[key]) perPersoonMap[key] = { user: r.users, regels: [], totaal: 0 };
    const bedrag = Math.round(Number(r.aantal) * Number(r.prijs_per_stuk) * 100) / 100;
    perPersoonMap[key].regels.push({ id: r.id, product: r.product, aantal: r.aantal, prijsPerStuk: r.prijs_per_stuk, bedrag });
    perPersoonMap[key].totaal += bedrag;
  });

  const personen = Object.values(perPersoonMap)
    .filter((p) => p.user)
    .map((p) => ({ ...p, totaal: Math.round(p.totaal * 100) / 100 }))
    .sort((a, b) => a.user.naam.localeCompare(b.user.naam));

  return NextResponse.json({ bestelling, personen });
}
