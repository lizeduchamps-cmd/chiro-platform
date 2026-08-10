import { supabaseAdmin } from "@/lib/supabase";

// Gedeelde stap voor elke 'verdeel naar FV'-actie (bestellingen, kilometers,
// documenten, ...): zet fv_status op openstaand voor wie dat nog niet had,
// en voegt de fv_regels toe. De aanroeper blijft zelf verantwoordelijk voor
// het markeren van zijn eigen bron als verdeeld (bv. bestellingen.verdeeld_naar_fv_maand_id).
//
// regels: [{ fvMaandId, userId, omschrijving, bedrag, bron }]
// bedrag: positief = te betalen, negatief = terug te krijgen (zie fv_regels-schema)
export async function verdeelNaarFv(regels) {
  if (!regels?.length) return { fvRegels: [] };

  const statusRows = regels.map((r) => ({ fv_maand_id: r.fvMaandId, user_id: r.userId, status: "openstaand" }));
  const fvRegelRows = regels.map((r) => ({
    fv_maand_id: r.fvMaandId,
    user_id: r.userId,
    omschrijving: r.omschrijving,
    bedrag: Math.round(Number(r.bedrag) * 100) / 100,
    bron: r.bron,
  }));

  const { error: statusError } = await supabaseAdmin
    .from("fv_status")
    .upsert(statusRows, { onConflict: "fv_maand_id,user_id", ignoreDuplicates: true });
  if (statusError) return { error: statusError.message };

  const { data, error } = await supabaseAdmin.from("fv_regels").insert(fvRegelRows).select("id");
  if (error) return { error: error.message };

  return { fvRegels: data };
}
