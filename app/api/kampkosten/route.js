import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";
import { vindOfMaakKampEvenement } from "@/lib/kampEvenement";

// Categorieën die overeenkomen met de vaste rubrieken uit het kamp-
// afrekeningsbestand die niet al door Kampbudgetten (winkelen/dropping/
// weekend per afdeling) of het Financieel Verslag (kilometers) gedekt zijn.
const STANDAARD_CATEGORIEEN = ["Leden", "Leiding", "Logistiek", "Tenten", "Kampplaats", "Keuken", "Algemeen", "Busvervoer", "Etentje na kamp"];

async function zorgCategorieenBestaan(evenementId) {
  await supabaseAdmin
    .from("kamp_categorieen")
    .upsert(
      STANDAARD_CATEGORIEEN.map((naam) => ({ evenement_id: evenementId, naam })),
      { onConflict: "evenement_id,naam", ignoreDuplicates: true }
    );
}

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  const evenementId = await vindOfMaakKampEvenement(werkjaarId);
  await zorgCategorieenBestaan(evenementId);

  const [{ data: categorieen, error: catError }, { data: transacties, error: txError }] = await Promise.all([
    supabaseAdmin.from("kamp_categorieen").select("id, naam").eq("evenement_id", evenementId).order("naam"),
    supabaseAdmin
      .from("kamp_transacties")
      .select("id, transactie_code, datum, omschrijving, type_geldstroom, hoofdcategorie, bedrag, status, bewijsstuk_url, medewerker_user_id, users(id, naam, iban)")
      .eq("evenement_id", evenementId)
      .order("datum", { ascending: false }),
  ]);
  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 });
  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 });

  const totaalInkomsten = (transacties || []).filter((t) => t.type_geldstroom === "inkomst").reduce((s, t) => s + Number(t.bedrag), 0);
  const totaalUitgaven = (transacties || []).filter((t) => t.type_geldstroom === "uitgave").reduce((s, t) => s + Number(t.bedrag), 0);

  const perCategorie = {};
  (transacties || []).forEach((t) => {
    const key = t.hoofdcategorie || "Onbekend";
    perCategorie[key] = perCategorie[key] || { inkomsten: 0, uitgaven: 0 };
    perCategorie[key][t.type_geldstroom === "inkomst" ? "inkomsten" : "uitgaven"] += Number(t.bedrag);
  });

  const nogTerugTeBetalen = (transacties || [])
    .filter((t) => t.status === "Te vergoeden")
    .map((t) => ({
      id: t.id,
      transactieCode: t.transactie_code,
      omschrijving: t.omschrijving,
      bedrag: t.bedrag,
      datum: t.datum,
      wie: t.users ? { naam: t.users.naam, iban: t.users.iban } : null,
    }));

  return NextResponse.json({
    categorieen,
    transacties,
    nogTerugTeBetalen,
    balans: {
      totaalInkomsten: Math.round(totaalInkomsten * 100) / 100,
      totaalUitgaven: Math.round(totaalUitgaven * 100) / 100,
      netto: Math.round((totaalInkomsten - totaalUitgaven) * 100) / 100,
      perCategorie,
    },
  });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const { werkjaarId, datum, omschrijving, typeGeldstroom, hoofdcategorie, bedrag, medewerkerUserId, bewijsstukUrl } = await req.json();
  if (!werkjaarId || !datum || !omschrijving || !typeGeldstroom || bedrag === undefined) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }

  const evenementId = await vindOfMaakKampEvenement(werkjaarId);
  const { count } = await supabaseAdmin.from("kamp_transacties").select("id", { count: "exact", head: true });
  const transactieCode = `KAMP-${1001 + (count || 0)}`;

  const { data, error } = await supabaseAdmin
    .from("kamp_transacties")
    .insert({
      evenement_id: evenementId,
      transactie_code: transactieCode,
      datum,
      omschrijving,
      type_geldstroom: typeGeldstroom,
      hoofdcategorie: hoofdcategorie || null,
      bedrag: Number(bedrag),
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
  if (!isFinancieel(session)) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const updateFields = {};
  if (body.datum !== undefined) updateFields.datum = body.datum;
  if (body.omschrijving !== undefined) updateFields.omschrijving = body.omschrijving;
  if (body.typeGeldstroom !== undefined) updateFields.type_geldstroom = body.typeGeldstroom;
  if (body.hoofdcategorie !== undefined) updateFields.hoofdcategorie = body.hoofdcategorie || null;
  if (body.bedrag !== undefined) updateFields.bedrag = Number(body.bedrag);
  if (body.status !== undefined) updateFields.status = body.status;
  if (body.medewerkerUserId !== undefined) updateFields.medewerker_user_id = body.medewerkerUserId || null;
  if (body.bewijsstukUrl !== undefined) updateFields.bewijsstuk_url = body.bewijsstukUrl || null;

  const { error } = await supabaseAdmin.from("kamp_transacties").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin.from("kamp_transacties").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
