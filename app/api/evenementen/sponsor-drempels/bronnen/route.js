import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Andere evenementen die al drempels hebben — bruikbaar om als startpunt te
// dupliceren naar dit jaar i.p.v. elk jaar van nul te beginnen. Geeft meteen
// de drempel-rijen mee, zodat de frontend ze lokaal kan overnemen (los van
// het bronevenement, net als bij "kopieer kassa van vorig jaar").
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const excludeEvenementId = new URL(req.url).searchParams.get("exclude");

  const { data, error } = await supabaseAdmin
    .from("sponsor_drempels")
    .select("evenement_id, drempelbedrag, gratis_tickets, drankbonnetjes, evenementen(naam, datum)")
    .order("drempelbedrag");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const perEvenement = {};
  (data || []).forEach((d) => {
    if (!d.evenementen || d.evenement_id === excludeEvenementId) return;
    if (!perEvenement[d.evenement_id]) {
      perEvenement[d.evenement_id] = { evenementId: d.evenement_id, evenementNaam: d.evenementen.naam, evenementDatum: d.evenementen.datum, drempels: [] };
    }
    perEvenement[d.evenement_id].drempels.push({ drempelbedrag: d.drempelbedrag, gratisTickets: d.gratis_tickets, drankbonnetjes: d.drankbonnetjes });
  });

  return NextResponse.json({ bronnen: Object.values(perEvenement) });
}
