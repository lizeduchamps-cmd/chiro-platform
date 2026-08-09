import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Volledig FV-overzicht voor één maand: alle personen met hun regels, totaal en status.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const fvMaandId = new URL(req.url).searchParams.get("fvMaandId");
  if (!fvMaandId) return NextResponse.json({ error: "fvMaandId ontbreekt" }, { status: 400 });

  const { data: fvMaand, error: maandError } = await supabaseAdmin
    .from("fv_maanden")
    .select("id, maand, dieselprijs, km_tarief_leiding, km_tarief_logistiek, betaaldeadline")
    .eq("id", fvMaandId)
    .maybeSingle();
  if (maandError) return NextResponse.json({ error: maandError.message }, { status: 500 });
  if (!fvMaand) return NextResponse.json({ error: "FV-maand niet gevonden" }, { status: 404 });

  const { data: statusRows, error: statusError } = await supabaseAdmin
    .from("fv_status")
    .select("user_id, status, users(id, naam, discord_username, type, groep, iban)")
    .eq("fv_maand_id", fvMaandId);
  if (statusError) return NextResponse.json({ error: statusError.message }, { status: 500 });

  const { data: regels, error: regelsError } = await supabaseAdmin
    .from("fv_regels")
    .select("id, user_id, omschrijving, bedrag, opmerking, bron")
    .eq("fv_maand_id", fvMaandId);
  if (regelsError) return NextResponse.json({ error: regelsError.message }, { status: 500 });

  const personen = (statusRows || [])
    .filter((s) => s.users)
    .map((s) => {
      const eigenRegels = (regels || []).filter((r) => r.user_id === s.user_id);
      const totaal = eigenRegels.reduce((sum, r) => sum + Number(r.bedrag), 0);
      return {
        user: s.users,
        status: s.status,
        regels: eigenRegels,
        totaal: Math.round(totaal * 100) / 100,
      };
    })
    .sort((a, b) => a.user.naam.localeCompare(b.user.naam));

  return NextResponse.json({ fvMaand, personen });
}
