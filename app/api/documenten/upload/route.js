import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magEvenementBewerken } from "@/lib/evenementPermissies";
import { isFinancieel } from "@/lib/permissies";
import crypto from "crypto";

// Multipart upload i.p.v. JSON: het bestand gaat rechtstreeks naar de
// private Storage-bucket 'documenten', enkel het pad (niet het bestand zelf)
// komt in de databaserij terecht. Bekijken gebeurt altijd via een tijdelijke
// signed URL (zie /api/documenten/overzicht), nooit via een permanente link.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const formData = await req.formData();
  const bestand = formData.get("bestand");
  const titel = formData.get("titel");
  const totaalbedrag = formData.get("totaalbedrag");
  const werkjaarId = formData.get("werkjaarId");
  const gekoppeldAan = formData.get("gekoppeldAan") || null;
  const evenementId = formData.get("evenementId") || null;

  if (!bestand || typeof bestand === "string" || !titel || !werkjaarId || !totaalbedrag) {
    return NextResponse.json({ error: "Bestand, titel, totaalbedrag en werkjaar zijn verplicht" }, { status: 400 });
  }

  const magAdmin = isFinancieel(session);
  if (gekoppeldAan === "evenement" && evenementId) {
    if (!magAdmin && !(await magEvenementBewerken(session, evenementId))) {
      return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
    }
  } else if (!magAdmin) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const buffer = Buffer.from(await bestand.arrayBuffer());
  const pad = `${werkjaarId}/${crypto.randomUUID()}-${bestand.name}`;
  const { error: uploadError } = await supabaseAdmin.storage.from("documenten").upload(pad, buffer, { contentType: bestand.type });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data, error } = await supabaseAdmin
    .from("documenten")
    .insert({
      werkjaar_id: werkjaarId,
      titel,
      bestand_pad: pad,
      bestand_type: bestand.type,
      totaalbedrag: Number(totaalbedrag),
      gekoppeld_aan: gekoppeldAan || null,
      evenement_id: gekoppeldAan === "evenement" ? evenementId || null : null,
      geupload_door_user_id: session.user.userId || null,
    })
    .select("id, titel, totaalbedrag, gekoppeld_aan, evenement_id, status, created_at")
    .single();

  if (error) {
    await supabaseAdmin.storage.from("documenten").remove([pad]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ document: data });
}
