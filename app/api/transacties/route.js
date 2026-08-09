import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("transacties")
    .select(
      "id, datum, soort, tegenpartij, iban_tegenpartij, vrije_mededeling, omschrijving, bedrag, rekening_type, interne_bestemming_rekening, categorie_id, categorieen(naam)"
    )
    .eq("werkjaar_id", werkjaarId)
    .order("datum", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transacties: data });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const body = await req.json();
  const {
    werkjaarId,
    rekeningType,
    datum,
    soort,
    tegenpartij,
    vrijeMededeling,
    omschrijving,
    bedrag,
    categorieId,
    interneBestemmingRekening,
  } = body;

  if (!werkjaarId || !rekeningType || !datum || !soort || bedrag === undefined) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }
  if (soort === "interne_transactie" && !interneBestemmingRekening) {
    return NextResponse.json({ error: "Bestemmingsrekening ontbreekt voor interne transactie" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("transacties")
    .insert({
      werkjaar_id: werkjaarId,
      rekening_type: rekeningType,
      datum,
      soort,
      tegenpartij: tegenpartij || null,
      vrije_mededeling: vrijeMededeling || null,
      omschrijving: omschrijving || null,
      bedrag: Math.abs(Number(bedrag)),
      categorie_id: categorieId || null,
      interne_bestemming_rekening: soort === "interne_transactie" ? interneBestemmingRekening : null,
      bron: "handmatig",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactie: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { id, categorieId } = await req.json();
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("transacties")
    .update({ categorie_id: categorieId || null, categorie_handmatig_aangepast: true })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin.from("transacties").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
