import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { vindEvenementVoorCategorie } from "@/lib/evenementAutoLink";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("transacties")
    .select(
      "id, datum, soort, tegenpartij, iban_tegenpartij, vrije_mededeling, omschrijving, bedrag, rekening_type, interne_bestemming_rekening, categorie_id, categorieen(naam), evenement_id, evenementen(naam)"
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
    evenementId,
  } = body;

  if (!werkjaarId || !rekeningType || !datum || !soort || bedrag === undefined) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }
  if (soort === "interne_transactie" && !interneBestemmingRekening) {
    return NextResponse.json({ error: "Bestemmingsrekening ontbreekt voor interne transactie" }, { status: 400 });
  }

  // Geen evenement expliciet gekozen? Kijk of de categorienaam overeenkomt
  // met een evenement dit werkjaar (bv. categorie "Fuif" -> evenement
  // "Fuif 2026") en koppel dan automatisch.
  let uiteindelijkEvenementId = evenementId || null;
  if (!uiteindelijkEvenementId && categorieId) {
    const { data: categorie } = await supabaseAdmin.from("categorieen").select("naam").eq("id", categorieId).maybeSingle();
    if (categorie?.naam) uiteindelijkEvenementId = await vindEvenementVoorCategorie(werkjaarId, categorie.naam);
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
      evenement_id: uiteindelijkEvenementId,
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

  const { id, categorieId, evenementId } = await req.json();
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const updateFields = {};
  if (categorieId !== undefined) {
    updateFields.categorie_id = categorieId || null;
    updateFields.categorie_handmatig_aangepast = true;
  }
  if (evenementId !== undefined) {
    updateFields.evenement_id = evenementId || null;
  } else if (categorieId) {
    // Categorie wijzigt maar evenement niet expliciet meegegeven: enkel
    // automatisch koppelen als er nog geen evenement aan hangt (nooit een
    // bewuste, eerder gezette koppeling overschrijven).
    const { data: huidig } = await supabaseAdmin.from("transacties").select("werkjaar_id, evenement_id").eq("id", id).maybeSingle();
    if (huidig && !huidig.evenement_id) {
      const { data: categorie } = await supabaseAdmin.from("categorieen").select("naam").eq("id", categorieId).maybeSingle();
      if (categorie?.naam) {
        const gevonden = await vindEvenementVoorCategorie(huidig.werkjaar_id, categorie.naam);
        if (gevonden) updateFields.evenement_id = gevonden;
      }
    }
  }

  const { error } = await supabaseAdmin.from("transacties").update(updateFields).eq("id", id);

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
