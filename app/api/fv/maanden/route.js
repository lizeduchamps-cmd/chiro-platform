import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("fv_maanden")
    .select("id, maand, dieselprijs, km_tarief_leiding, km_tarief_logistiek, betaaldeadline")
    .eq("werkjaar_id", werkjaarId)
    .order("maand", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fvMaanden: data });
}

// Nieuwe FV-maand aanmaken. Iedereen krijgt meteen een (lege) plaats op het
// overzicht; streepjes worden er bewust vanaf de Streepjes-pagina aan
// toegevoegd (zie /api/fv/streepjes-toevoegen), niet automatisch hier.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { werkjaarId, maand, dieselprijs, kmTariefLeiding, kmTariefLogistiek, betaaldeadline } = await req.json();
  if (!werkjaarId || !maand || !/^\d{4}-\d{2}$/.test(maand)) {
    return NextResponse.json({ error: "Ongeldige of ontbrekende maand (formaat JJJJ-MM)" }, { status: 400 });
  }

  const { data: fvMaand, error } = await supabaseAdmin
    .from("fv_maanden")
    .insert({
      werkjaar_id: werkjaarId,
      maand,
      dieselprijs: dieselprijs || null,
      km_tarief_leiding: kmTariefLeiding || null,
      km_tarief_logistiek: kmTariefLogistiek || null,
      betaaldeadline: betaaldeadline || null,
    })
    .select("id, maand, dieselprijs, km_tarief_leiding, km_tarief_logistiek, betaaldeadline")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id")
    .in("type", ["Hoofdleiding", "Leiding", "Logistiek"]);

  const statusRows = (users || []).map((u) => ({ fv_maand_id: fvMaand.id, user_id: u.id, status: "openstaand" }));
  if (statusRows.length) await supabaseAdmin.from("fv_status").insert(statusRows);

  return NextResponse.json({ fvMaand });
}

// Achteraf aanpassen van een bestaande FV-maand — vooral bedoeld voor de
// km-vergoeding (dieselprijs verandert soms tijdens het jaar) en de deadline.
export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { id, dieselprijs, kmTariefLeiding, kmTariefLogistiek, betaaldeadline } = await req.json();
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const updateFields = {};
  if (dieselprijs !== undefined) updateFields.dieselprijs = dieselprijs === "" ? null : dieselprijs;
  if (kmTariefLeiding !== undefined) updateFields.km_tarief_leiding = kmTariefLeiding === "" ? null : kmTariefLeiding;
  if (kmTariefLogistiek !== undefined) updateFields.km_tarief_logistiek = kmTariefLogistiek === "" ? null : kmTariefLogistiek;
  if (betaaldeadline !== undefined) updateFields.betaaldeadline = betaaldeadline === "" ? null : betaaldeadline;

  const { error } = await supabaseAdmin.from("fv_maanden").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
