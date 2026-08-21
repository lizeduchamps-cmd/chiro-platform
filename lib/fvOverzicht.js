import { supabaseAdmin } from "@/lib/supabase";

// Gedeelde ophaal-logica voor het FV-overzicht van één maand — gebruikt door
// zowel de scherm-API (/api/fv/overzicht) als de Excel-export
// (/api/fv/export), zodat beide altijd exact dezelfde personen/regels tonen.
export async function haalFvOverzicht(fvMaandId) {
  const { data: fvMaand, error: maandError } = await supabaseAdmin
    .from("fv_maanden")
    .select("id, maand, dieselprijs, km_tarief_leiding, km_tarief_logistiek, betaaldeadline")
    .eq("id", fvMaandId)
    .maybeSingle();
  if (maandError) return { error: maandError.message };
  if (!fvMaand) return { error: "FV-maand niet gevonden" };

  const { data: statusRows, error: statusError } = await supabaseAdmin
    .from("fv_status")
    .select("user_id, status, users(id, naam, discord_username, type, groep, iban)")
    .eq("fv_maand_id", fvMaandId);
  if (statusError) return { error: statusError.message };

  const { data: regels, error: regelsError } = await supabaseAdmin
    .from("fv_regels")
    .select("id, user_id, omschrijving, bedrag, opmerking, bron")
    .eq("fv_maand_id", fvMaandId);
  if (regelsError) return { error: regelsError.message };

  const personen = (statusRows || [])
    .filter((s) => s.users)
    .map((s) => {
      const eigenRegels = (regels || []).filter((r) => r.user_id === s.user_id);
      const totaal = eigenRegels.reduce((sum, r) => sum + Number(r.bedrag), 0);
      return {
        user: s.users,
        status: s.status,
        regels: eigenRegels,
        totaal: Math.round(totaal * 100) / 100,
      };
    })
    .sort((a, b) => a.user.naam.localeCompare(b.user.naam));

  return { fvMaand, personen };
}
