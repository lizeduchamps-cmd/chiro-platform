import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Productnamen die ooit al eens besteld zijn, met hun laatst gebruikte prijs
// per stuk. Als er een winkel is meegegeven, enkel binnen bestellingen bij
// diezelfde winkel — "frietjes" of "kebap" kosten niet overal hetzelfde.
// Zonder winkel (of voor bestellingen zonder winkel ingevuld) blijft het
// gewoon over alles heen zoeken, zoals voorheen.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const winkel = new URL(req.url).searchParams.get("winkel");

  let bestellingIds = null;
  if (winkel) {
    const { data: bestellingen, error: bestellingenError } = await supabaseAdmin
      .from("bestellingen")
      .select("id")
      .ilike("winkel", winkel);
    if (bestellingenError) return NextResponse.json({ error: bestellingenError.message }, { status: 500 });
    bestellingIds = (bestellingen || []).map((b) => b.id);
    if (bestellingIds.length === 0) return NextResponse.json({ producten: [] });
  }

  let query = supabaseAdmin.from("bestelling_regels").select("product, prijs_per_stuk, created_at").order("created_at", { ascending: false });
  if (bestellingIds) query = query.in("bestelling_id", bestellingIds);
  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const producten = {};
  (data || []).forEach((r) => {
    const key = r.product.trim().toLowerCase();
    if (!(key in producten)) producten[key] = { naam: r.product.trim(), prijs: r.prijs_per_stuk };
  });

  return NextResponse.json({ producten: Object.values(producten) });
}
