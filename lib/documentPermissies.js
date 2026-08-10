import { supabaseAdmin } from "@/lib/supabase";
import { magEvenementBewerken } from "@/lib/evenementPermissies";

export async function haalDocument(documentId) {
  const { data } = await supabaseAdmin
    .from("documenten")
    .select("id, werkjaar_id, gekoppeld_aan, evenement_id, status, geupload_door_user_id")
    .eq("id", documentId)
    .maybeSingle();
  return data;
}

// Admin/financieel_verantwoordelijke mogen altijd; is het document aan een
// evenement gekoppeld, dan mag ook wie dat evenement zelf mag bewerken
// (verantwoordelijkheid-match) — net als bij evenement_transacties.
export async function magDocumentBewerken(session, document) {
  if (!session || !document) return false;
  const magAdmin = ["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht);
  if (document.gekoppeld_aan === "evenement" && document.evenement_id) {
    return magAdmin || (await magEvenementBewerken(session, document.evenement_id));
  }
  return magAdmin;
}

export async function documentIdVanRegel(regelId) {
  const { data } = await supabaseAdmin.from("bon_regels").select("document_id").eq("id", regelId).maybeSingle();
  return data?.document_id || null;
}
