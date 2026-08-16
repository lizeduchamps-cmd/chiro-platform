import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magEvenementBewerken } from "@/lib/evenementPermissies";

// Neemt de kassa's (naam, type, wisselgeld-start + samenstelling) van een
// ander evenement over als startpunt. Enkel toegelaten als het doel-evenement
// nog geen kassa's heeft, zodat er nooit ongewild dubbels ontstaan. Het
// "achteraf"-gedeelte (inhoud_einde, verwacht_bedrag) telt niet mee — dat is
// de werkelijkheid van dít evenement en moet altijd opnieuw geteld worden.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  const { evenementId, bronEvenementId } = await req.json();
  if (!evenementId || !bronEvenementId) {
    return NextResponse.json({ error: "evenementId en bronEvenementId zijn verplicht" }, { status: 400 });
  }
  if (!(await magEvenementBewerken(session, evenementId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { count, error: countError } = await supabaseAdmin
    .from("evenement_kassas")
    .select("id", { count: "exact", head: true })
    .eq("evenement_id", evenementId);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if (count > 0) {
    return NextResponse.json({ error: "Dit evenement heeft al kassa's — verwijder ze eerst om opnieuw te starten vanaf vorig jaar." }, { status: 400 });
  }

  const { data: bronKassas, error: bronError } = await supabaseAdmin
    .from("evenement_kassas")
    .select("naam, type, wisselgeld_start, wisselgeld_start_samenstelling")
    .eq("evenement_id", bronEvenementId);
  if (bronError) return NextResponse.json({ error: bronError.message }, { status: 500 });
  if (!bronKassas?.length) return NextResponse.json({ error: "Bronevenement heeft geen kassa's" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("evenement_kassas")
    .insert(bronKassas.map((k) => ({
      evenement_id: evenementId,
      naam: k.naam,
      type: k.type,
      wisselgeld_start: k.wisselgeld_start,
      wisselgeld_start_samenstelling: k.wisselgeld_start_samenstelling,
    })))
    .select("id, naam, type, wisselgeld_start, inhoud_einde");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ kassas: data });
}
