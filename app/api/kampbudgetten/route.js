import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magAfdelingBewerken, afdelingVanGroepsbudget } from "@/lib/kampPermissies";

const AFDELINGEN = ["Sloebers", "Speelclub", "Rakwi", "Tito", "Keti", "Aspi", "Algemeen/Keuken"];

// Alle 7 afdelingen horen altijd een rij te hebben voor het gekozen werkjaar
// (ook al is het budget nog niet ingevuld) — zo hoeft niemand een afdeling
// apart "aan te maken", je vult gewoon het aantal leden en de tarieven in.
async function zorgAfdelingenBestaan(werkjaarId) {
  await supabaseAdmin
    .from("groepsbudgetten")
    .upsert(
      AFDELINGEN.map((afdeling) => ({ werkjaar_id: werkjaarId, afdeling })),
      { onConflict: "werkjaar_id,afdeling", ignoreDuplicates: true }
    );
}

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  await zorgAfdelingenBestaan(werkjaarId);

  const { data, error } = await supabaseAdmin
    .from("groepsbudgetten")
    .select("id, afdeling, aantal_leden, budget_per_lid_winkelen, budget_per_lid_dropping, budget_per_lid_weekend, groepsbudget_uitgaven(bedrag, status)")
    .eq("werkjaar_id", werkjaarId)
    .order("afdeling");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groepsbudgetten = data.map((g) => {
    const totaalToegewezen = Math.round(g.aantal_leden * (Number(g.budget_per_lid_winkelen) + Number(g.budget_per_lid_dropping) + Number(g.budget_per_lid_weekend)) * 100) / 100;
    const uitgegeven = Math.round((g.groepsbudget_uitgaven || []).filter((u) => u.status === "Goedgekeurd").reduce((s, u) => s + Number(u.bedrag), 0) * 100) / 100;
    const wachtOpGoedkeuring = Math.round((g.groepsbudget_uitgaven || []).filter((u) => u.status === "Ingediend").reduce((s, u) => s + Number(u.bedrag), 0) * 100) / 100;
    const resterend = Math.round((totaalToegewezen - uitgegeven) * 100) / 100;
    return {
      id: g.id,
      afdeling: g.afdeling,
      aantalLeden: g.aantal_leden,
      budgetPerLidWinkelen: g.budget_per_lid_winkelen,
      budgetPerLidDropping: g.budget_per_lid_dropping,
      budgetPerLidWeekend: g.budget_per_lid_weekend,
      totaalToegewezen,
      uitgegeven,
      wachtOpGoedkeuring,
      resterend,
      statusBudget: resterend < 0 ? "Overschreden" : "Binnen Budget",
    };
  });

  return NextResponse.json({ groepsbudgetten });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const afdeling = await afdelingVanGroepsbudget(id);
  if (!(await magAfdelingBewerken(session, afdeling))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const updateFields = {};
  if (body.aantalLeden !== undefined) updateFields.aantal_leden = Number(body.aantalLeden) || 0;
  if (body.budgetPerLidWinkelen !== undefined) updateFields.budget_per_lid_winkelen = Number(body.budgetPerLidWinkelen) || 0;
  if (body.budgetPerLidDropping !== undefined) updateFields.budget_per_lid_dropping = Number(body.budgetPerLidDropping) || 0;
  if (body.budgetPerLidWeekend !== undefined) updateFields.budget_per_lid_weekend = Number(body.budgetPerLidWeekend) || 0;

  const { error } = await supabaseAdmin.from("groepsbudgetten").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
