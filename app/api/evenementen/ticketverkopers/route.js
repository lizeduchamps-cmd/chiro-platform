import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magEvenementBewerken } from "@/lib/evenementPermissies";

// Fysieke ticketverkoop: per verkoper (vrij getypte naam, geen koppeling aan
// Gebruikers & rollen) hoeveel bandjes meegenomen/teruggebracht en wat er
// binnenkwam. Berekening (uitgegeven/verschuldigd/status) gebeurt in
// /api/evenementen/overzicht, hier enkel de ruwe rijen.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const evenementId = new URL(req.url).searchParams.get("evenementId");
  if (!evenementId) return NextResponse.json({ error: "evenementId ontbreekt" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("evenement_ticketverkopers")
    .select("id, naam, jeugd_meegenomen, volwassen_meegenomen, jeugd_teruggebracht, volwassen_teruggebracht, cash_ontvangen, overschrijving_ontvangen")
    .eq("evenement_id", evenementId)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ticketverkopers: data });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  const { evenementId, naam, jeugdMeegenomen, volwassenMeegenomen } = await req.json();
  if (!evenementId || !naam) return NextResponse.json({ error: "Naam is verplicht" }, { status: 400 });
  if (!(await magEvenementBewerken(session, evenementId))) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("evenement_ticketverkopers")
    .insert({
      evenement_id: evenementId,
      naam,
      jeugd_meegenomen: jeugdMeegenomen !== undefined ? Number(jeugdMeegenomen) : 5,
      volwassen_meegenomen: volwassenMeegenomen !== undefined ? Number(volwassenMeegenomen) : 5,
    })
    .select("id, naam, jeugd_meegenomen, volwassen_meegenomen, jeugd_teruggebracht, volwassen_teruggebracht, cash_ontvangen, overschrijving_ontvangen")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ticketverkoper: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  const body = await req.json();
  const { id, evenementId, naam, jeugdMeegenomen, volwassenMeegenomen, jeugdTeruggebracht, volwassenTeruggebracht, cashOntvangen, overschrijvingOntvangen } = body;
  if (!id || !evenementId) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });
  if (!(await magEvenementBewerken(session, evenementId))) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const updateFields = {};
  if (naam !== undefined) updateFields.naam = naam;
  if (jeugdMeegenomen !== undefined) updateFields.jeugd_meegenomen = Number(jeugdMeegenomen);
  if (volwassenMeegenomen !== undefined) updateFields.volwassen_meegenomen = Number(volwassenMeegenomen);
  if (jeugdTeruggebracht !== undefined) updateFields.jeugd_teruggebracht = jeugdTeruggebracht === "" ? null : Number(jeugdTeruggebracht);
  if (volwassenTeruggebracht !== undefined) updateFields.volwassen_teruggebracht = volwassenTeruggebracht === "" ? null : Number(volwassenTeruggebracht);
  if (cashOntvangen !== undefined) updateFields.cash_ontvangen = cashOntvangen === "" ? null : Number(cashOntvangen);
  if (overschrijvingOntvangen !== undefined) updateFields.overschrijving_ontvangen = overschrijvingOntvangen === "" ? null : Number(overschrijvingOntvangen);

  const { error } = await supabaseAdmin.from("evenement_ticketverkopers").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const evenementId = searchParams.get("evenementId");
  if (!id || !evenementId) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });
  if (!(await magEvenementBewerken(session, evenementId))) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const { error } = await supabaseAdmin.from("evenement_ticketverkopers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
