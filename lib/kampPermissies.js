import { supabaseAdmin } from "@/lib/supabase";

// Mag deze sessie dit groepsbudget (en de uitgaven/wisselgeld-aanvragen van
// die afdeling) bewerken? Admin/financieel_verantwoordelijke mogen altijd.
// Daarnaast mag de leiding van de afdeling zelf (user.groep) hun eigen
// kampbudget en wisselgeld beheren, zonder dat ze apart financieel
// verantwoordelijke gemaakt moeten worden.
export async function magAfdelingBewerken(session, afdeling) {
  if (!session) return false;
  if (["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) return true;
  if (!session.user.userId || !afdeling) return false;

  const { data: user } = await supabaseAdmin.from("users").select("groep").eq("id", session.user.userId).maybeSingle();
  return user?.groep === afdeling;
}

export async function afdelingVanGroepsbudget(groepsbudgetId) {
  const { data } = await supabaseAdmin.from("groepsbudgetten").select("afdeling").eq("id", groepsbudgetId).maybeSingle();
  return data?.afdeling || null;
}

export async function groepsbudgetIdVanUitgave(uitgaveId) {
  const { data } = await supabaseAdmin.from("groepsbudget_uitgaven").select("groepsbudget_id").eq("id", uitgaveId).maybeSingle();
  return data?.groepsbudget_id || null;
}

export async function afdelingVanWisselgeld(aanvraagId) {
  const { data } = await supabaseAdmin.from("wisselgeld_aanvragen").select("afdeling").eq("id", aanvraagId).maybeSingle();
  return data?.afdeling || null;
}
