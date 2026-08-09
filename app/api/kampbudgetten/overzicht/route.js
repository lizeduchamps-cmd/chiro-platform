import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Detailoverzicht van één afdeling: het groepsbudget zelf, alle uitgaven
// (bonnetjes) en de wisselgeld-aanvragen van diezelfde afdeling in hetzelfde werkjaar.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { data: groepsbudget, error: budgetError } = await supabaseAdmin
    .from("groepsbudgetten")
    .select("id, werkjaar_id, afdeling, aantal_leden, budget_per_lid_winkelen, budget_per_lid_dropping, budget_per_lid_weekend")
    .eq("id", id)
    .maybeSingle();
  if (budgetError) return NextResponse.json({ error: budgetError.message }, { status: 500 });
  if (!groepsbudget) return NextResponse.json({ error: "Groepsbudget niet gevonden" }, { status: 404 });

  const [{ data: uitgaven, error: uitgavenError }, { data: wisselgeldAanvragen, error: wisselgeldError }] = await Promise.all([
    supabaseAdmin
      .from("groepsbudget_uitgaven")
      .select("id, datum, omschrijving, bedrag, status, bewijsstuk_url, ingediend_door_user_id, users(naam)")
      .eq("groepsbudget_id", id)
      .order("datum", { ascending: false }),
    supabaseAdmin
      .from("wisselgeld_aanvragen")
      .select("id, aanvraag_code, datum_nodig, bedrag_gevraagd, doel_activiteit, status, aanvrager_user_id, users(naam)")
      .eq("werkjaar_id", groepsbudget.werkjaar_id)
      .eq("afdeling", groepsbudget.afdeling)
      .order("datum_nodig", { ascending: false }),
  ]);
  if (uitgavenError) return NextResponse.json({ error: uitgavenError.message }, { status: 500 });
  if (wisselgeldError) return NextResponse.json({ error: wisselgeldError.message }, { status: 500 });

  const totaalToegewezen = Math.round(groepsbudget.aantal_leden * (Number(groepsbudget.budget_per_lid_winkelen) + Number(groepsbudget.budget_per_lid_dropping) + Number(groepsbudget.budget_per_lid_weekend)) * 100) / 100;
  const uitgegeven = Math.round((uitgaven || []).filter((u) => u.status === "Goedgekeurd").reduce((s, u) => s + Number(u.bedrag), 0) * 100) / 100;
  const resterend = Math.round((totaalToegewezen - uitgegeven) * 100) / 100;

  return NextResponse.json({
    groepsbudget,
    uitgaven,
    wisselgeldAanvragen,
    balans: {
      totaalToegewezen,
      uitgegeven,
      resterend,
      statusBudget: resterend < 0 ? "Overschreden" : "Binnen Budget",
    },
  });
}
