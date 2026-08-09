import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const HOOFDCATEGORIEEN = [
  "Infrastructuur & Materiaal",
  "Drank & Food",
  "Programmatie & Entertainment",
  "Marketing & Promo",
  "Veiligheid & Logistiek",
  "Organisatie & Medewerkers",
];

// Volledig rapportage-overzicht van één evenement: kassa-omzet, budget-burn-rate
// per hoofdcategorie, kosten vs. investeringen, "nog terug te betalen"-lijst en
// de globale winst/verliesbalans. Alles hieronder is afgeleid — niets wordt
// apart opgeslagen, zodat het altijd in sync is met de ruwe transacties/kassa's.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const evenementId = new URL(req.url).searchParams.get("evenementId");
  if (!evenementId) return NextResponse.json({ error: "evenementId ontbreekt" }, { status: 400 });

  const { data: evenement, error: evenementError } = await supabaseAdmin
    .from("evenementen")
    .select("id, naam, datum, status")
    .eq("id", evenementId)
    .maybeSingle();
  if (evenementError) return NextResponse.json({ error: evenementError.message }, { status: 500 });
  if (!evenement) return NextResponse.json({ error: "Evenement niet gevonden" }, { status: 404 });

  const [{ data: kassas, error: kassasError }, { data: budgetten, error: budgettenError }, { data: transacties, error: transactiesError }] =
    await Promise.all([
      supabaseAdmin.from("evenement_kassas").select("id, naam, type, wisselgeld_start, inhoud_einde").eq("evenement_id", evenementId),
      supabaseAdmin.from("evenement_budgetten").select("id, hoofdcategorie, budget_toegewezen").eq("evenement_id", evenementId),
      supabaseAdmin
        .from("evenement_transacties")
        .select(
          "id, transactie_code, datum, omschrijving, type_geldstroom, type_kostenpost, hoofdcategorie, subcategorie, bedrag_excl_btw, btw_tarief, bedrag_totaal, betaalmethode, status, bewijsstuk_url, partij_id, medewerker_user_id, partijen(id, naam, rol, iban), users(id, naam, iban)"
        )
        .eq("evenement_id", evenementId)
        .order("datum", { ascending: false }),
    ]);
  if (kassasError) return NextResponse.json({ error: kassasError.message }, { status: 500 });
  if (budgettenError) return NextResponse.json({ error: budgettenError.message }, { status: 500 });
  if (transactiesError) return NextResponse.json({ error: transactiesError.message }, { status: 500 });

  // Kassa-omzet: cash = geteld eindbedrag - klaargezet wisselgeld; digitaal = volledig eindbedrag.
  const kassasMetOmzet = (kassas || []).map((k) => {
    const eind = Number(k.inhoud_einde || 0);
    const omzet = k.type === "cash" ? eind - Number(k.wisselgeld_start || 0) : eind;
    return { ...k, omzet: Math.round(omzet * 100) / 100 };
  });
  const kassaOmzetTotaal = kassasMetOmzet.reduce((s, k) => s + k.omzet, 0);

  const inkomstenTransacties = (transacties || []).filter((t) => t.type_geldstroom === "inkomst");
  const uitgaveTransacties = (transacties || []).filter((t) => t.type_geldstroom === "uitgave");

  const totaalInkomsten = kassaOmzetTotaal + inkomstenTransacties.reduce((s, t) => s + Number(t.bedrag_totaal), 0);
  const totaalUitgaven = uitgaveTransacties.reduce((s, t) => s + Number(t.bedrag_totaal), 0);

  const kostenTotaal = uitgaveTransacties.filter((t) => t.type_kostenpost !== "investering").reduce((s, t) => s + Number(t.bedrag_totaal), 0);
  const investeringenTotaal = uitgaveTransacties.filter((t) => t.type_kostenpost === "investering").reduce((s, t) => s + Number(t.bedrag_totaal), 0);

  const budgetBurnRate = HOOFDCATEGORIEEN.map((cat) => {
    const budgetRij = (budgetten || []).find((b) => b.hoofdcategorie === cat);
    const uitgegeven = uitgaveTransacties.filter((t) => t.hoofdcategorie === cat).reduce((s, t) => s + Number(t.bedrag_totaal), 0);
    const budget = budgetRij ? Number(budgetRij.budget_toegewezen) : null;
    return {
      hoofdcategorie: cat,
      budget,
      uitgegeven: Math.round(uitgegeven * 100) / 100,
      resterend: budget !== null ? Math.round((budget - uitgegeven) * 100) / 100 : null,
    };
  }).filter((b) => b.budget !== null || b.uitgegeven > 0);

  const nogTerugTeBetalen = (transacties || [])
    .filter((t) => t.status === "Te vergoeden")
    .map((t) => ({
      id: t.id,
      transactieCode: t.transactie_code,
      omschrijving: t.omschrijving,
      bedrag: t.bedrag_totaal,
      datum: t.datum,
      wie: t.users ? { naam: t.users.naam, iban: t.users.iban, type: "intern" } : t.partijen ? { naam: t.partijen.naam, iban: t.partijen.iban, type: "extern" } : null,
    }));

  return NextResponse.json({
    evenement,
    kassas: kassasMetOmzet,
    kassaOmzetTotaal: Math.round(kassaOmzetTotaal * 100) / 100,
    transacties,
    budgetBurnRate,
    nogTerugTeBetalen,
    balans: {
      totaalInkomsten: Math.round(totaalInkomsten * 100) / 100,
      totaalUitgaven: Math.round(totaalUitgaven * 100) / 100,
      nettoWinst: Math.round((totaalInkomsten - totaalUitgaven) * 100) / 100,
      kostenTotaal: Math.round(kostenTotaal * 100) / 100,
      investeringenTotaal: Math.round(investeringenTotaal * 100) / 100,
    },
  });
}
