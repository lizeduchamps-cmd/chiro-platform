import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magEvenementBewerken } from "@/lib/evenementPermissies";

// Eén budgetregel per hoofdcategorie per evenement — upsert zodat je gewoon
// steeds hetzelfde formulier kan indienen om een budget te zetten of te wijzigen.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  const { evenementId, hoofdcategorie, budgetToegewezen } = await req.json();
  if (!evenementId || !hoofdcategorie) return NextResponse.json({ error: "evenementId en hoofdcategorie zijn verplicht" }, { status: 400 });

  if (!(await magEvenementBewerken(session, evenementId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("evenement_budgetten")
    .upsert(
      { evenement_id: evenementId, hoofdcategorie, budget_toegewezen: budgetToegewezen === "" ? null : budgetToegewezen },
      { onConflict: "evenement_id,hoofdcategorie" }
    )
    .select("id, hoofdcategorie, budget_toegewezen")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ budget: data });
}
