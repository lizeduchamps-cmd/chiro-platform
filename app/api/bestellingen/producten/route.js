import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Productnamen die ooit al eens besteld zijn, met hun laatst gebruikte prijs
// per stuk — uit het losstaande prijsgeheugen (product_prijzen), niet uit
// oude bestelling_regels, zodat een verwijderde bestelling deze suggesties
// niet laat verdwijnen. Als er een winkel is meegegeven, eerst enkel prijzen
// die bij diezelfde winkel zijn opgeslagen — "frietjes" of "kebap" kosten
// niet overal hetzelfde. Levert dat niets op (typfout in de winkelnaam, of
// deze winkel heeft nog geen eigen prijzen), val dan terug op alle winkels
// heen i.p.v. stilzwijgend niets te tonen. Zonder winkel wordt meteen over
// alles heen gezocht (meest recent bijgewerkte prijs per product wint).
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const winkel = new URL(req.url).searchParams.get("winkel");
  const winkelKey = winkel ? winkel.trim().toLowerCase() : null;

  let data, error;
  if (winkelKey) {
    ({ data, error } = await supabaseAdmin
      .from("product_prijzen")
      .select("product, prijs, bijgewerkt_op")
      .eq("winkel_key", winkelKey)
      .order("bijgewerkt_op", { ascending: false }));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!winkelKey || data.length === 0) {
    ({ data, error } = await supabaseAdmin
      .from("product_prijzen")
      .select("product, prijs, bijgewerkt_op")
      .order("bijgewerkt_op", { ascending: false }));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const producten = {};
  (data || []).forEach((r) => {
    const key = r.product.trim().toLowerCase();
    if (!(key in producten)) producten[key] = { naam: r.product.trim(), prijs: r.prijs };
  });

  return NextResponse.json({ producten: Object.values(producten) });
}
