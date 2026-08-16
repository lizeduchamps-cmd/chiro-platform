import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Productnamen die ooit al eens besteld zijn, met hun laatst gebruikte prijs
// per stuk — uit het losstaande prijsgeheugen (product_prijzen), niet uit
// oude bestelling_regels, zodat een verwijderde bestelling deze suggesties
// niet laat verdwijnen. Als er een winkel is meegegeven, enkel prijzen die
// bij diezelfde winkel zijn opgeslagen — "frietjes" of "kebap" kosten niet
// overal hetzelfde. Zonder winkel blijft het over alles heen zoeken, zoals
// voorheen (meest recent bijgewerkte prijs per product wint).
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const winkel = new URL(req.url).searchParams.get("winkel");

  let query = supabaseAdmin.from("product_prijzen").select("product, prijs, bijgewerkt_op").order("bijgewerkt_op", { ascending: false });
  if (winkel) query = query.eq("winkel_key", winkel.trim().toLowerCase());
  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const producten = {};
  (data || []).forEach((r) => {
    const key = r.product.trim().toLowerCase();
    if (!(key in producten)) producten[key] = { naam: r.product.trim(), prijs: r.prijs };
  });

  return NextResponse.json({ producten: Object.values(producten) });
}
