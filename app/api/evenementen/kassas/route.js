import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magEvenementBewerken, evenementIdVanKassa } from "@/lib/evenementPermissies";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  const { evenementId, naam, type, wisselgeldStart } = await req.json();
  if (!evenementId || !naam) return NextResponse.json({ error: "evenementId en naam zijn verplicht" }, { status: 400 });

  if (!(await magEvenementBewerken(session, evenementId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("evenement_kassas")
    .insert({
      evenement_id: evenementId,
      naam,
      type: type === "digitaal" ? "digitaal" : "cash",
      wisselgeld_start: wisselgeldStart || 0,
    })
    .select("id, naam, type, wisselgeld_start, inhoud_einde")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kassa: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  const body = await req.json();
  const { id, naam, wisselgeldStart, inhoudEinde, wisselgeldStartSamenstelling, inhoudEindeSamenstelling } = body;
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const evenementId = await evenementIdVanKassa(id);
  if (!(await magEvenementBewerken(session, evenementId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const updateFields = {};
  if (naam !== undefined) updateFields.naam = naam;
  if (wisselgeldStart !== undefined) updateFields.wisselgeld_start = wisselgeldStart;
  if (inhoudEinde !== undefined) updateFields.inhoud_einde = inhoudEinde === "" ? null : inhoudEinde;
  // Samenstelling (briefjes/muntjes-aantallen) is optioneel: enkel meegegeven
  // als het via de teller is ingevuld, anders blijft een gewoon ingetypt
  // totaalbedrag gewoon werken zonder samenstelling.
  if (wisselgeldStartSamenstelling !== undefined) updateFields.wisselgeld_start_samenstelling = wisselgeldStartSamenstelling;
  if (inhoudEindeSamenstelling !== undefined) updateFields.inhoud_einde_samenstelling = inhoudEindeSamenstelling;

  const { error } = await supabaseAdmin.from("evenement_kassas").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const evenementId = await evenementIdVanKassa(id);
  if (!(await magEvenementBewerken(session, evenementId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("evenement_kassas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
