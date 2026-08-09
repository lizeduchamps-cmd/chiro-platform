import { supabaseAdmin } from "@/lib/supabase";
import { evenementMatchTag } from "@/lib/evenementMatch";

// Zoekt (binnen hetzelfde werkjaar) het ene evenement waarvan de naam
// overeenkomt met een categorienaam (bv. categorie "Fuif" -> evenement
// "Fuif 2026"). Bij nul of meerdere treffers wordt niets gekoppeld — beter
// geen gok dan een verkeerde.
export async function vindEvenementVoorCategorie(werkjaarId, categorieNaam) {
  if (!werkjaarId || !categorieNaam) return null;
  const { data: evenementen } = await supabaseAdmin.from("evenementen").select("id, naam").eq("werkjaar_id", werkjaarId);
  if (!evenementen?.length) return null;
  const matches = evenementen.filter((e) => evenementMatchTag([categorieNaam], e.naam));
  return matches.length === 1 ? matches[0].id : null;
}
