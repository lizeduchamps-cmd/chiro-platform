import { supabaseAdmin } from "@/lib/supabase";
import { evenementMatchTag } from "@/lib/evenementMatch";

// Mag deze ingelogde sessie dit evenement (en alles eronder: kassa's,
// budgetten, categorieën, transacties) bewerken? Admin/financieel_verantwoordelijke
// mogen altijd. Daarnaast mag iemand van wie een verantwoordelijkheid-tag
// (bv. "Taartenslag") overeenkomt met de naam van dit evenement ook bewerken —
// zo hoeft de taartenslag-verantwoordelijke niet apart financieel verantwoordelijke
// gemaakt te worden om hun eigen kostenoverzicht te kunnen bijhouden.
export async function magEvenementBewerken(session, evenementId) {
  if (!session) return false;
  if (["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) return true;
  if (!session.user.userId || !evenementId) return false;

  const [{ data: user }, { data: evenement }] = await Promise.all([
    supabaseAdmin.from("users").select("verantwoordelijkheden").eq("id", session.user.userId).maybeSingle(),
    supabaseAdmin.from("evenementen").select("naam").eq("id", evenementId).maybeSingle(),
  ]);
  if (!evenement) return false;
  return evenementMatchTag(user?.verantwoordelijkheden, evenement.naam);
}

export async function evenementIdVanKassa(kassaId) {
  const { data } = await supabaseAdmin.from("evenement_kassas").select("evenement_id").eq("id", kassaId).maybeSingle();
  return data?.evenement_id || null;
}

export async function evenementIdVanTransactie(transactieId) {
  const { data } = await supabaseAdmin.from("evenement_transacties").select("evenement_id").eq("id", transactieId).maybeSingle();
  return data?.evenement_id || null;
}
