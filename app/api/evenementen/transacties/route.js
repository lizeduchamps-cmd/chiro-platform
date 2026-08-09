import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magEvenementBewerken, evenementIdVanTransactie } from "@/lib/evenementPermissies";

// Geen btw-splitsing meer in de UI — 'bedrag' is het volledige bedrag.
// bedrag_excl_btw/btw_tarief blijven in de database (0% default) voor wie dit
// later toch wil verfijnen, zonder dat het dagelijkse invoerformulier daarmee
// belast wordt.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  const body = await req.json();
  const {
    evenementId, datum, omschrijving, typeGeldstroom, typeKostenpost, hoofdcategorie, waar, hoeveelheid,
    bedrag, betaalmethode, status, medewerkerUserId, bewijsstukUrl,
  } = body;

  if (!evenementId || !datum || !omschrijving || !typeGeldstroom || bedrag === undefined) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }
  if (!(await magEvenementBewerken(session, evenementId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { count } = await supabaseAdmin.from("evenement_transacties").select("id", { count: "exact", head: true });
  const transactieCode = `TRX-${1001 + (count || 0)}`;

  const { data, error } = await supabaseAdmin
    .from("evenement_transacties")
    .insert({
      evenement_id: evenementId,
      transactie_code: transactieCode,
      datum,
      omschrijving,
      type_geldstroom: typeGeldstroom,
      type_kostenpost: typeGeldstroom === "uitgave" ? typeKostenpost || null : null,
      hoofdcategorie: hoofdcategorie || null,
      waar: waar || null,
      hoeveelheid: hoeveelheid === "" || hoeveelheid === undefined ? null : Number(hoeveelheid),
      bedrag_excl_btw: Number(bedrag),
      btw_tarief: 0,
      bedrag_totaal: Number(bedrag),
      betaalmethode: betaalmethode || null,
      status: status || "Gepland",
      medewerker_user_id: medewerkerUserId || null,
      bewijsstuk_url: bewijsstukUrl || null,
    })
    .select("id, transactie_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactie: data });
}

// Volledig bewerkbaar: enkel de meegegeven velden worden aangepast, de rest
// blijft ongewijzigd — zo kan je later een bonnetje-URL of leverancier
// aanvullen zonder de rest opnieuw te moeten intypen.
export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const evenementId = await evenementIdVanTransactie(id);
  if (!(await magEvenementBewerken(session, evenementId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const updateFields = {};
  if (body.datum !== undefined) updateFields.datum = body.datum;
  if (body.omschrijving !== undefined) updateFields.omschrijving = body.omschrijving;
  if (body.typeGeldstroom !== undefined) updateFields.type_geldstroom = body.typeGeldstroom;
  if (body.typeKostenpost !== undefined) updateFields.type_kostenpost = body.typeKostenpost || null;
  if (body.hoofdcategorie !== undefined) updateFields.hoofdcategorie = body.hoofdcategorie || null;
  if (body.waar !== undefined) updateFields.waar = body.waar || null;
  if (body.hoeveelheid !== undefined) updateFields.hoeveelheid = body.hoeveelheid === "" ? null : Number(body.hoeveelheid);
  if (body.bedrag !== undefined) {
    updateFields.bedrag_excl_btw = Number(body.bedrag);
    updateFields.btw_tarief = 0;
    updateFields.bedrag_totaal = Number(body.bedrag);
  }
  if (body.betaalmethode !== undefined) updateFields.betaalmethode = body.betaalmethode || null;
  if (body.status !== undefined) updateFields.status = body.status;
  if (body.medewerkerUserId !== undefined) updateFields.medewerker_user_id = body.medewerkerUserId || null;
  if (body.bewijsstukUrl !== undefined) updateFields.bewijsstuk_url = body.bewijsstukUrl || null;

  const { error } = await supabaseAdmin.from("evenement_transacties").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const evenementId = await evenementIdVanTransactie(id);
  if (!(await magEvenementBewerken(session, evenementId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("evenement_transacties").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
