import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magAfdelingBewerken, afdelingVanWisselgeld } from "@/lib/kampPermissies";
import { isFinancieel } from "@/lib/permissies";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const url = new URL(req.url);
  const werkjaarId = url.searchParams.get("werkjaarId");
  const afdeling = url.searchParams.get("afdeling");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  let query = supabaseAdmin
    .from("wisselgeld_aanvragen")
    .select("id, aanvraag_code, afdeling, datum_nodig, bedrag_gevraagd, samenstelling_cash, verkoopprijzen, samenstelling_voorstel, doel_activiteit, status, aanvrager_user_id, users(naam)")
    .eq("werkjaar_id", werkjaarId)
    .order("datum_nodig", { ascending: true });
  if (afdeling) query = query.eq("afdeling", afdeling);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ wisselgeldAanvragen: data });
}

// Verschijnt automatisch (live, niet als aparte kopie) op de Kalender via
// /api/kalender zodra datum_nodig gezet is — geen aparte kalender-rij nodig.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  const { werkjaarId, afdeling, datumNodig, bedragGevraagd, samenstellingCash, doelActiviteit, verkoopprijzen, samenstellingVoorstel } = await req.json();
  if (!werkjaarId || !afdeling || !datumNodig) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }
  if (!(await magAfdelingBewerken(session, afdeling))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { count } = await supabaseAdmin.from("wisselgeld_aanvragen").select("id", { count: "exact", head: true });
  const aanvraagCode = `WS-${1001 + (count || 0)}`;

  const { data: aanvraag, error } = await supabaseAdmin
    .from("wisselgeld_aanvragen")
    .insert({
      werkjaar_id: werkjaarId,
      aanvraag_code: aanvraagCode,
      afdeling,
      aanvrager_user_id: session.user.userId || null,
      datum_nodig: datumNodig,
      bedrag_gevraagd: bedragGevraagd ? Number(bedragGevraagd) : null,
      samenstelling_cash: samenstellingCash || null,
      doel_activiteit: doelActiviteit || null,
      verkoopprijzen: verkoopprijzen || null,
      samenstelling_voorstel: samenstellingVoorstel || null,
    })
    .select("id, aanvraag_code, afdeling, datum_nodig, bedrag_gevraagd, samenstelling_cash, verkoopprijzen, samenstelling_voorstel, doel_activiteit, status")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ aanvraag });
}

// Statuswijziging: financiën mag alles zetten (goedkeuren/klaarzetten); de
// aanvragende afdeling zelf mag enkel bevestigen dat ze het opgehaald hebben.
export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  const { id, status, samenstellingVoorstel } = await req.json();
  if (!id || (!status && samenstellingVoorstel === undefined)) {
    return NextResponse.json({ error: "id en status (of samenstellingVoorstel) zijn verplicht" }, { status: 400 });
  }

  // Het coupure-voorstel bijstellen (bv. bij het klaarzetten) is voorbehouden
  // aan financiën — de aanvragende afdeling mag enkel hun eigen status naar
  // 'Opgehaald' zetten, niet aan het voorstel zelf sleutelen.
  if (samenstellingVoorstel !== undefined && !isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }
  if (status !== undefined && !isFinancieel(session)) {
    const afdeling = await afdelingVanWisselgeld(id);
    const magEigenAfdeling = await magAfdelingBewerken(session, afdeling);
    if (!magEigenAfdeling || status !== "Opgehaald") {
      return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
    }
  }

  const updateFields = {};
  if (status !== undefined) updateFields.status = status;
  if (samenstellingVoorstel !== undefined) updateFields.samenstelling_voorstel = samenstellingVoorstel;

  const { error } = await supabaseAdmin.from("wisselgeld_aanvragen").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const afdeling = await afdelingVanWisselgeld(id);
  if (!(await magAfdelingBewerken(session, afdeling))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("wisselgeld_aanvragen").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
