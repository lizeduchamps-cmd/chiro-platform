import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { AFDELINGEN_OUD } from "@/lib/kampAfdelingen";

function berekenTotaalToegewezen(afdeling, aantalLeden, tarieven) {
  if (AFDELINGEN_OUD.includes(afdeling)) {
    return aantalLeden * (Number(tarieven.winkelen_oud) + Number(tarieven.dropping_per_lid) + Number(tarieven.weekend_per_lid)) + Number(tarieven.weekendplaats_vast);
  }
  return aantalLeden * Number(tarieven.winkelen_jong);
}

// Detailoverzicht van één afdeling: het groepsbudget zelf, de kampkosten-
// transacties die aan deze afdeling getagd zijn (hoofdcategorie = afdeling —
// die worden dus rechtstreeks bij Kampkosten ingegeven, niet hier apart) en
// de wisselgeld-aanvragen van diezelfde afdeling in hetzelfde werkjaar.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { data: groepsbudget, error: budgetError } = await supabaseAdmin
    .from("groepsbudgetten")
    .select("id, werkjaar_id, afdeling, aantal_leden")
    .eq("id", id)
    .maybeSingle();
  if (budgetError) return NextResponse.json({ error: budgetError.message }, { status: 500 });
  if (!groepsbudget) return NextResponse.json({ error: "Groepsbudget niet gevonden" }, { status: 404 });

  const [{ data: tarieven }, { data: transacties, error: txError }, { data: wisselgeldAanvragen, error: wisselgeldError }] = await Promise.all([
    supabaseAdmin.from("kamp_tarieven").select("*").eq("werkjaar_id", groepsbudget.werkjaar_id).maybeSingle(),
    supabaseAdmin
      .from("kamp_transacties")
      .select("id, transactie_code, datum, omschrijving, bedrag, status, bewijsstuk_url, users(naam)")
      .eq("werkjaar_id", groepsbudget.werkjaar_id)
      .eq("hoofdcategorie", groepsbudget.afdeling)
      .eq("type_geldstroom", "uitgave")
      .order("datum", { ascending: false }),
    supabaseAdmin
      .from("wisselgeld_aanvragen")
      .select("id, aanvraag_code, datum_nodig, bedrag_gevraagd, doel_activiteit, status, aanvrager_user_id, users(naam)")
      .eq("werkjaar_id", groepsbudget.werkjaar_id)
      .eq("afdeling", groepsbudget.afdeling)
      .order("datum_nodig", { ascending: false }),
  ]);
  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 });
  if (wisselgeldError) return NextResponse.json({ error: wisselgeldError.message }, { status: 500 });

  const tarievenOfDefault = tarieven || { winkelen_jong: 0, winkelen_oud: 0, dropping_per_lid: 0, weekend_per_lid: 0, weekendplaats_vast: 50 };
  const totaalToegewezen = Math.round(berekenTotaalToegewezen(groepsbudget.afdeling, groepsbudget.aantal_leden, tarievenOfDefault) * 100) / 100;
  const uitgegeven = Math.round((transacties || []).reduce((s, t) => s + Number(t.bedrag), 0) * 100) / 100;
  const resterend = Math.round((totaalToegewezen - uitgegeven) * 100) / 100;

  return NextResponse.json({
    groepsbudget,
    transacties,
    wisselgeldAanvragen,
    balans: {
      totaalToegewezen,
      uitgegeven,
      resterend,
      statusBudget: resterend < 0 ? "Overschreden" : "Binnen Budget",
    },
  });
}
