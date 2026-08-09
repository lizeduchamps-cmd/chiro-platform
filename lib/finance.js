import { supabaseAdmin } from "@/lib/supabase";

// Berekent het lopend saldo per rekening voor een werkjaar, op basis van het
// startsaldo + alle transacties. Interne transacties verplaatsen geld tussen
// zicht en spaar zonder het totaal te veranderen.
export async function computeSaldos(werkjaarId) {
  const { data: rekeningen } = await supabaseAdmin
    .from("rekeningen")
    .select("type, startsaldo")
    .eq("werkjaar_id", werkjaarId);

  const { data: transacties } = await supabaseAdmin
    .from("transacties")
    .select("rekening_type, bedrag, soort, interne_bestemming_rekening")
    .eq("werkjaar_id", werkjaarId);

  const zichtStart = Number(rekeningen?.find((r) => r.type === "zicht")?.startsaldo || 0);
  const spaarStart = Number(rekeningen?.find((r) => r.type === "spaar")?.startsaldo || 0);

  let zicht = zichtStart;
  let spaar = spaarStart;

  (transacties || []).forEach((t) => {
    const bedrag = Number(t.bedrag);
    if (t.soort === "interne_transactie") {
      if (t.rekening_type === "zicht") zicht -= bedrag;
      else spaar -= bedrag;
      if (t.interne_bestemming_rekening === "zicht") zicht += bedrag;
      else spaar += bedrag;
    } else {
      const teken = t.soort === "uitgave" ? -1 : 1;
      if (t.rekening_type === "zicht") zicht += teken * bedrag;
      else spaar += teken * bedrag;
    }
  });

  return { zichtStart, spaarStart, zichtLopend: zicht, spaarLopend: spaar, totaal: zicht + spaar };
}

// Berekent categorie-totalen en maandtotalen voor het jaaroverzicht, plus een
// vergelijking met het vorige werkjaar (dynamisch bepaald op basis van de naam,
// bv. '2025-2026' -> '2024-2025' — niet meer hardcoded).
export async function computeJaaroverzicht(werkjaarId) {
  const { data: werkjaar } = await supabaseAdmin.from("werkjaren").select("naam").eq("id", werkjaarId).maybeSingle();

  const { data: transacties } = await supabaseAdmin
    .from("transacties")
    .select("datum, bedrag, soort, categorie_id, categorieen(naam)")
    .eq("werkjaar_id", werkjaarId);

  const perCategorie = {};
  const perMaand = {};
  let totaalInkomsten = 0;
  let totaalUitgaven = 0;

  (transacties || []).forEach((t) => {
    if (t.soort === "interne_transactie") return; // telt niet als echte inkomst/uitgave
    const bedrag = Number(t.bedrag);
    const catNaam = t.categorieen?.naam || "Onduidelijk/Nog in te vullen";
    const maand = t.datum ? t.datum.slice(0, 7) : "onbekend";

    if (!perCategorie[catNaam]) perCategorie[catNaam] = { inkomsten: 0, uitgaven: 0 };
    if (!perMaand[maand]) perMaand[maand] = { inkomsten: 0, uitgaven: 0 };

    if (t.soort === "inkomst") {
      perCategorie[catNaam].inkomsten += bedrag;
      perMaand[maand].inkomsten += bedrag;
      totaalInkomsten += bedrag;
    } else {
      perCategorie[catNaam].uitgaven += bedrag;
      perMaand[maand].uitgaven += bedrag;
      totaalUitgaven += bedrag;
    }
  });

  // Vorig werkjaar dynamisch bepalen: '2025-2026' -> '2024-2025'
  let vorigJaarTotalen = null;
  const match = werkjaar?.naam?.match(/^(\d{4})-(\d{4})$/);
  if (match) {
    const vorigeNaam = `${Number(match[1]) - 1}-${Number(match[2]) - 1}`;
    const { data: vorigWerkjaar } = await supabaseAdmin.from("werkjaren").select("id").eq("naam", vorigeNaam).maybeSingle();
    if (vorigWerkjaar) {
      const { data: vorigeTx } = await supabaseAdmin
        .from("transacties")
        .select("bedrag, soort")
        .eq("werkjaar_id", vorigWerkjaar.id);
      let vi = 0, vu = 0;
      (vorigeTx || []).forEach((t) => {
        if (t.soort === "inkomst") vi += Number(t.bedrag);
        else if (t.soort === "uitgave") vu += Number(t.bedrag);
      });
      vorigJaarTotalen = { naam: vorigeNaam, inkomsten: vi, uitgaven: vu };
    }
  }

  return { perCategorie, perMaand, totaalInkomsten, totaalUitgaven, netto: totaalInkomsten - totaalUitgaven, vorigJaarTotalen };
}
