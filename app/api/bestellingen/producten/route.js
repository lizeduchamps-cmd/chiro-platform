import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Productnamen die ooit al eens besteld zijn, met hun laatst gebruikte prijs
// per stuk — over alle bestellingen heen (bv. "Pizza salami" bij Anatolia
// kost altijd hetzelfde, ook een maand later).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("bestelling_regels")
    .select("product, prijs_per_stuk, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const producten = {};
  (data || []).forEach((r) => {
    const key = r.product.trim().toLowerCase();
    if (!(key in producten)) producten[key] = { naam: r.product.trim(), prijs: r.prijs_per_stuk };
  });

  return NextResponse.json({ producten: Object.values(producten) });
}
