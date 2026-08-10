import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { haalDocument, magDocumentBewerken, documentIdVanRegel } from "@/lib/documentPermissies";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  const body = await req.json();
  const { documentId, omschrijving, bedrag, bestemming, kampHoofdcategorie, evenementId, evenementHoofdcategorie, fvUserId, fvMaandId } = body;
  if (!documentId || !omschrijving || !bedrag || !bestemming) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }

  const document = await haalDocument(documentId);
  if (!document) return NextResponse.json({ error: "Document niet gevonden" }, { status: 404 });
  if (document.status === "Verwerkt") return NextResponse.json({ error: "Dit document is al verwerkt" }, { status: 400 });
  if (!(await magDocumentBewerken(session, document))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("bon_regels")
    .insert({
      document_id: documentId,
      omschrijving,
      bedrag: Number(bedrag),
      bestemming,
      kamp_hoofdcategorie: bestemming === "kamp" ? kampHoofdcategorie || null : null,
      evenement_id: bestemming === "evenement" ? evenementId || null : null,
      evenement_hoofdcategorie: bestemming === "evenement" ? evenementHoofdcategorie || null : null,
      fv_user_id: bestemming === "fv" ? fvUserId || null : null,
      fv_maand_id: bestemming === "fv" ? fvMaandId || null : null,
    })
    .select("id, omschrijving, bedrag, bestemming, kamp_hoofdcategorie, evenement_id, evenement_hoofdcategorie, fv_user_id, fv_maand_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regel: data });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const documentId = await documentIdVanRegel(id);
  const document = await haalDocument(documentId);
  if (!document) return NextResponse.json({ error: "Document niet gevonden" }, { status: 404 });
  if (document.status === "Verwerkt") return NextResponse.json({ error: "Dit document is al verwerkt" }, { status: 400 });
  if (!(await magDocumentBewerken(session, document))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("bon_regels").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
