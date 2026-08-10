import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magAfdelingBewerken, afdelingVanGroepsbudget } from "@/lib/kampPermissies";
import { AFDELINGEN_VOLGORDE, AFDELINGEN_OUD, sorteerOpAfdeling } from "@/lib/kampAfdelingen";

// Alle 6 afdelingen horen altijd een rij te hebben voor het gekozen werkjaar
// (ook al is het budget nog niet ingevuld) — zo hoeft niemand een afdeling
// apart "aan te maken", je vult gewoon het aantal leden in.
async function zorgAfdelingenBestaan(werkjaarId) {
  await supabaseAdmin
    .from("groepsbudgetten")
    .upsert(
      AFDELINGEN_VOLGORDE.map((afdeling) => ({ werkjaar_id: werkjaarId, afdeling })),
      { onConflict: "werkjaar_id,afdeling", ignoreDuplicates: true }
    );
}

async function haalTarieven(werkjaarId) {
  const { data } = await supabaseAdmin.from("kamp_tarieven").select("*").eq("werkjaar_id", werkjaarId).maybeSingle();
  return data || { winkelen_jong: 0, winkelen_oud: 0, dropping_per_lid: 0, weekend_per_lid: 0, weekendplaats_vast: 50 };
}

function berekenTotaalToegewezen(afdeling, aantalLeden, tarieven) {
  if (AFDELINGEN_OUD.includes(afdeling)) {
    return aantalLeden * (Number(tarieven.winkelen_oud) + Number(tarieven.dropping_per_lid) + Number(tarieven.weekend_per_lid)) + Number(tarieven.weekendplaats_vast);
  }
  return aantalLeden * Number(tarieven.winkelen_jong);
}

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  await zorgAfdelingenBestaan(werkjaarId);

  const [{ data: groepsbudgetten, error }, tarieven, { data: kampTransacties, error: txError }] = await Promise.all([
    supabaseAdmin.from("groepsbudgetten").select("id, afdeling, aantal_leden").eq("werkjaar_id", werkjaarId),
    haalTarieven(werkjaarId),
    supabaseAdmin
      .from("kamp_transacties")
      .select("hoofdcategorie, bedrag, status")
      .eq("werkjaar_id", werkjaarId)
      .eq("type_geldstroom", "uitgave")
      .in("hoofdcategorie", AFDELINGEN_VOLGORDE),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 });

  const groepsbudgettenMetTotalen = sorteerOpAfdeling(groepsbudgetten).map((g) => {
    const totaalToegewezen = Math.round(berekenTotaalToegewezen(g.afdeling, g.aantal_leden, tarieven) * 100) / 100;
    const uitgegeven = Math.round((kampTransacties || []).filter((t) => t.hoofdcategorie === g.afdeling).reduce((s, t) => s + Number(t.bedrag), 0) * 100) / 100;
    const resterend = Math.round((totaalToegewezen - uitgegeven) * 100) / 100;
    return {
      id: g.id,
      afdeling: g.afdeling,
      aantalLeden: g.aantal_leden,
      totaalToegewezen,
      uitgegeven,
      resterend,
      statusBudget: resterend < 0 ? "Overschreden" : "Binnen Budget",
    };
  });

  return NextResponse.json({ groepsbudgetten: groepsbudgettenMetTotalen, tarieven });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const afdeling = await afdelingVanGroepsbudget(id);
  if (!(await magAfdelingBewerken(session, afdeling))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const updateFields = {};
  if (body.aantalLeden !== undefined) updateFields.aantal_leden = Number(body.aantalLeden) || 0;

  const { error } = await supabaseAdmin.from("groepsbudgetten").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
