import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magEvenementBewerken, evenementIdVanTransactie } from "@/lib/evenementPermissies";

function berekenBedragTotaal(exclBtw, btwTarief) {
  return Math.round(Number(exclBtw) * (1 + Number(btwTarief) / 100) * 100) / 100;
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  const body = await req.json();
  const {
    evenementId, datum, omschrijving, typeGeldstroom, typeKostenpost, hoofdcategorie, subcategorie,
    bedragExclBtw, btwTarief, betaalmethode, status, partijId, medewerkerUserId, bewijsstukUrl,
  } = body;

  if (!evenementId || !datum || !omschrijving || !typeGeldstroom || bedragExclBtw === undefined) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }
  if (!(await magEvenementBewerken(session, evenementId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { count } = await supabaseAdmin.from("evenement_transacties").select("id", { count: "exact", head: true });
  const transactieCode = `TRX-${1001 + (count || 0)}`;

  const btw = btwTarief || 0;
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
      subcategorie: subcategorie || null,
      bedrag_excl_btw: Number(bedragExclBtw),
      btw_tarief: btw,
      bedrag_totaal: berekenBedragTotaal(bedragExclBtw, btw),
      betaalmethode: betaalmethode || null,
      status: status || "Gepland",
      partij_id: partijId || null,
      medewerker_user_id: medewerkerUserId || null,
      bewijsstuk_url: bewijsstukUrl || null,
    })
    .select("id, transactie_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactie: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  const body = await req.json();
  const { id, status, bedragExclBtw, btwTarief } = body;
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const evenementId = await evenementIdVanTransactie(id);
  if (!(await magEvenementBewerken(session, evenementId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const updateFields = {};
  if (status !== undefined) updateFields.status = status;
  if (bedragExclBtw !== undefined || btwTarief !== undefined) {
    const { data: huidig } = await supabaseAdmin.from("evenement_transacties").select("bedrag_excl_btw, btw_tarief").eq("id", id).maybeSingle();
    const excl = bedragExclBtw !== undefined ? bedragExclBtw : huidig?.bedrag_excl_btw;
    const btw = btwTarief !== undefined ? btwTarief : huidig?.btw_tarief;
    updateFields.bedrag_excl_btw = Number(excl);
    updateFields.btw_tarief = Number(btw);
    updateFields.bedrag_totaal = berekenBedragTotaal(excl, btw);
  }

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
