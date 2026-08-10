import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Verzamelt alles wat de groep nog aan iemand moet terugbetalen, over de hele
// werking heen: FV met een negatief openstaand saldo (= iemand kreeg een
// kilometervergoeding e.d. die nog niet uitbetaald is), en evenement- of
// kampkosten-transacties met status 'Te vergoeden' (iemand schoot geld voor).
// Puur een overzicht — aanpassen doe je nog steeds op de eigen pagina.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  const [
    { data: evenementen, error: evError },
    { data: kampTransacties, error: kampError },
    { data: fvMaanden, error: fvMaandenError },
  ] = await Promise.all([
    supabaseAdmin.from("evenementen").select("id, naam").eq("werkjaar_id", werkjaarId),
    supabaseAdmin
      .from("kamp_transacties")
      .select("id, omschrijving, bedrag, datum, users(naam, iban)")
      .eq("werkjaar_id", werkjaarId)
      .eq("status", "Te vergoeden"),
    supabaseAdmin.from("fv_maanden").select("id, maand").eq("werkjaar_id", werkjaarId),
  ]);
  if (evError) return NextResponse.json({ error: evError.message }, { status: 500 });
  if (kampError) return NextResponse.json({ error: kampError.message }, { status: 500 });
  if (fvMaandenError) return NextResponse.json({ error: fvMaandenError.message }, { status: 500 });

  const evenementIds = (evenementen || []).map((e) => e.id);
  const evenementNaamById = Object.fromEntries((evenementen || []).map((e) => [e.id, e.naam]));

  const { data: evenementTransacties, error: evTxError } = evenementIds.length
    ? await supabaseAdmin
        .from("evenement_transacties")
        .select("id, omschrijving, bedrag_totaal, datum, evenement_id, users(naam, iban)")
        .in("evenement_id", evenementIds)
        .eq("status", "Te vergoeden")
    : { data: [], error: null };
  if (evTxError) return NextResponse.json({ error: evTxError.message }, { status: 500 });

  const fvMaandIds = (fvMaanden || []).map((m) => m.id);
  const fvMaandNaamById = Object.fromEntries((fvMaanden || []).map((m) => [m.id, m.maand]));

  const fvItems = [];
  if (fvMaandIds.length) {
    const [{ data: statusRows }, { data: regels }, { data: gebruikers }] = await Promise.all([
      supabaseAdmin.from("fv_status").select("fv_maand_id, user_id").in("fv_maand_id", fvMaandIds).eq("status", "openstaand"),
      supabaseAdmin.from("fv_regels").select("fv_maand_id, user_id, bedrag").in("fv_maand_id", fvMaandIds),
      supabaseAdmin.from("users").select("id, naam, iban"),
    ]);
    const gebruikerById = Object.fromEntries((gebruikers || []).map((u) => [u.id, u]));

    (statusRows || []).forEach((s) => {
      const net = (regels || [])
        .filter((r) => r.fv_maand_id === s.fv_maand_id && r.user_id === s.user_id)
        .reduce((sum, r) => sum + Number(r.bedrag), 0);
      if (net < -0.01) {
        const u = gebruikerById[s.user_id];
        fvItems.push({
          id: `fv-${s.fv_maand_id}-${s.user_id}`,
          bron: "FV",
          omschrijving: `Financieel Verslag ${fvMaandNaamById[s.fv_maand_id] || ""}`,
          bedrag: Math.round(Math.abs(net) * 100) / 100,
          datum: null,
          wie: u ? { naam: u.naam, iban: u.iban } : null,
        });
      }
    });
  }

  const evItems = (evenementTransacties || []).map((t) => ({
    id: `ev-${t.id}`,
    bron: "Evenement",
    omschrijving: `${t.omschrijving} (${evenementNaamById[t.evenement_id] || "?"})`,
    bedrag: Math.round(Number(t.bedrag_totaal) * 100) / 100,
    datum: t.datum,
    wie: t.users ? { naam: t.users.naam, iban: t.users.iban } : null,
  }));

  const kampItems = (kampTransacties || []).map((t) => ({
    id: `kamp-${t.id}`,
    bron: "Kampkosten",
    omschrijving: t.omschrijving,
    bedrag: Math.round(Number(t.bedrag) * 100) / 100,
    datum: t.datum,
    wie: t.users ? { naam: t.users.naam, iban: t.users.iban } : null,
  }));

  const alleItems = [...fvItems, ...evItems, ...kampItems];

  const perPersoon = {};
  alleItems.forEach((item) => {
    const naam = item.wie?.naam || "Onbekend";
    perPersoon[naam] = perPersoon[naam] || { naam, iban: item.wie?.iban || null, items: [], totaal: 0 };
    perPersoon[naam].items.push(item);
    perPersoon[naam].totaal += item.bedrag;
  });

  const groepen = Object.values(perPersoon)
    .map((g) => ({ ...g, totaal: Math.round(g.totaal * 100) / 100 }))
    .sort((a, b) => b.totaal - a.totaal);

  return NextResponse.json({
    groepen,
    totaal: Math.round(groepen.reduce((s, g) => s + g.totaal, 0) * 100) / 100,
  });
}
