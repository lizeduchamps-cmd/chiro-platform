import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { fvMaandId, userId, omschrijving, bedrag, opmerking, bron } = await req.json();
  if (!fvMaandId || !userId || !omschrijving || bedrag === undefined || bedrag === "") {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }
  // Enkel 'handmatig' en 'bestelling' gaan via deze algemene weg — kilometers
  // en streepjes hebben elk hun eigen route (met eigen berekeningslogica).
  const toegestaneBronnen = ["handmatig", "bestelling"];
  const gekozenBron = toegestaneBronnen.includes(bron) ? bron : "handmatig";

  // Zorg dat de persoon zichtbaar is op het overzicht, ook als er nog geen
  // fv_status-rij voor hen bestond (bv. pas nadien toegevoegde gebruiker).
  await supabaseAdmin
    .from("fv_status")
    .upsert({ fv_maand_id: fvMaandId, user_id: userId, status: "openstaand" }, { onConflict: "fv_maand_id,user_id", ignoreDuplicates: true });

  const { data, error } = await supabaseAdmin
    .from("fv_regels")
    .insert({
      fv_maand_id: fvMaandId,
      user_id: userId,
      omschrijving,
      bedrag: Number(bedrag),
      opmerking: opmerking || null,
      bron: gekozenBron,
    })
    .select("id, user_id, omschrijving, bedrag, opmerking, bron")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regel: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { id, omschrijving, bedrag, opmerking } = await req.json();
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const updateFields = {};
  if (omschrijving !== undefined) updateFields.omschrijving = omschrijving;
  if (bedrag !== undefined) updateFields.bedrag = Number(bedrag);
  if (opmerking !== undefined) updateFields.opmerking = opmerking || null;

  const { error } = await supabaseAdmin.from("fv_regels").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin.from("fv_regels").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
