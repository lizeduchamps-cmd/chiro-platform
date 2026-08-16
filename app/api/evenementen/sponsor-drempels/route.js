import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magEvenementBewerken } from "@/lib/evenementPermissies";

// Sponsordrempels (bv. €50/€100/€200 -> bijhorende tegenprestatie). De
// tegenprestatie van een sponsor is de som van alle drempels die zijn
// bedrag haalt, niet enkel de hoogste — die optelling gebeurt in
// /api/evenementen/overzicht, hier enkel de ruwe drempel-rijen.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const evenementId = new URL(req.url).searchParams.get("evenementId");
  if (!evenementId) return NextResponse.json({ error: "evenementId ontbreekt" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("sponsor_drempels")
    .select("id, drempelbedrag, gratis_tickets, drankbonnetjes")
    .eq("evenement_id", evenementId)
    .order("drempelbedrag");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drempels: data });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  const { evenementId, drempelbedrag, gratisTickets, drankbonnetjes } = await req.json();
  if (!evenementId || drempelbedrag === undefined) return NextResponse.json({ error: "Drempelbedrag is verplicht" }, { status: 400 });
  if (!(await magEvenementBewerken(session, evenementId))) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("sponsor_drempels")
    .insert({
      evenement_id: evenementId,
      drempelbedrag: Number(drempelbedrag),
      gratis_tickets: Number(gratisTickets) || 0,
      drankbonnetjes: Number(drankbonnetjes) || 0,
    })
    .select("id, drempelbedrag, gratis_tickets, drankbonnetjes")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drempel: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  const { id, evenementId, drempelbedrag, gratisTickets, drankbonnetjes } = await req.json();
  if (!id || !evenementId) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });
  if (!(await magEvenementBewerken(session, evenementId))) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const updateFields = {};
  if (drempelbedrag !== undefined) updateFields.drempelbedrag = Number(drempelbedrag);
  if (gratisTickets !== undefined) updateFields.gratis_tickets = Number(gratisTickets) || 0;
  if (drankbonnetjes !== undefined) updateFields.drankbonnetjes = Number(drankbonnetjes) || 0;

  const { error } = await supabaseAdmin.from("sponsor_drempels").update(updateFields).eq("id", id);
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

  const { error } = await supabaseAdmin.from("sponsor_drempels").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
