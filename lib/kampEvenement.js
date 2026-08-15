import { supabaseAdmin } from "@/lib/supabase";

// Kamp is een gewoon evenement (heeft_groepsbudgetten = true), maar de
// bestaande Kampbudgetten/Kampkosten-pagina's werken nog met werkjaarId —
// deze helper vertaalt dat naar het bijhorende Kamp-evenement, en maakt er
// automatisch één aan voor werkjaren die er nog geen hebben (bv. omdat het
// werkjaar al bestond vóór deze koppeling er was).
export async function vindOfMaakKampEvenement(werkjaarId) {
  if (!werkjaarId) return null;

  const { data: bestaand } = await supabaseAdmin
    .from("evenementen")
    .select("id")
    .eq("werkjaar_id", werkjaarId)
    .eq("heeft_groepsbudgetten", true)
    .maybeSingle();
  if (bestaand) return bestaand.id;

  const { data: nieuw, error } = await supabaseAdmin
    .from("evenementen")
    .insert({ naam: "Kamp", werkjaar_id: werkjaarId, heeft_groepsbudgetten: true, heeft_rekening_scan: true })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return nieuw.id;
}
