import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { haalDocument, magDocumentBewerken } from "@/lib/documentPermissies";
import { verdeelNaarFv } from "@/lib/fvVerdeling";
import { vindOfMaakKampEvenement } from "@/lib/kampEvenement";

// Zet elke bon_regel om in een echte transactie op zijn bestemming — daarna
// is het document "Verwerkt" en staan de bedragen mee in Kampkosten,
// Evenementkosten of het Financieel Verslag, net zoals wanneer je ze daar
// rechtstreeks had ingegeven.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  const { documentId } = await req.json();
  if (!documentId) return NextResponse.json({ error: "documentId ontbreekt" }, { status: 400 });

  const document = await haalDocument(documentId);
  if (!document) return NextResponse.json({ error: "Document niet gevonden" }, { status: 404 });
  if (document.status === "Verwerkt") return NextResponse.json({ error: "Dit document is al verwerkt" }, { status: 400 });
  if (!(await magDocumentBewerken(session, document))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const [{ data: volledig }, { data: regels, error: regelsError }] = await Promise.all([
    supabaseAdmin.from("documenten").select("totaalbedrag").eq("id", documentId).maybeSingle(),
    supabaseAdmin.from("bon_regels").select("*").eq("document_id", documentId),
  ]);
  if (regelsError) return NextResponse.json({ error: regelsError.message }, { status: 500 });
  if (!regels || regels.length === 0) return NextResponse.json({ error: "Nog geen regels om te verwerken" }, { status: 400 });

  const som = Math.round(regels.reduce((s, r) => s + Number(r.bedrag), 0) * 100) / 100;
  const totaal = Math.round(Number(volledig.totaalbedrag) * 100) / 100;
  if (Math.abs(som - totaal) > 0.01) {
    return NextResponse.json({ error: `Som van de regels (${som}) komt niet overeen met het totaalbedrag (${totaal})` }, { status: 400 });
  }

  const datum = new Date().toISOString().slice(0, 10);
  const status = document.geupload_door_user_id ? "Te vergoeden" : "Gepland";

  const kampEvenementId = regels.some((r) => r.bestemming === "kamp") ? await vindOfMaakKampEvenement(document.werkjaar_id) : null;

  for (const regel of regels) {
    if (regel.bestemming === "kamp") {
      const { count } = await supabaseAdmin.from("kamp_transacties").select("id", { count: "exact", head: true });
      await supabaseAdmin.from("kamp_transacties").insert({
        evenement_id: kampEvenementId,
        transactie_code: `KAMP-${1001 + (count || 0)}`,
        datum,
        omschrijving: regel.omschrijving,
        type_geldstroom: "uitgave",
        hoofdcategorie: regel.kamp_hoofdcategorie,
        bedrag: Number(regel.bedrag),
        status,
        medewerker_user_id: document.geupload_door_user_id,
      });
    } else if (regel.bestemming === "evenement" && regel.evenement_id) {
      const { count } = await supabaseAdmin.from("evenement_transacties").select("id", { count: "exact", head: true });
      await supabaseAdmin.from("evenement_transacties").insert({
        evenement_id: regel.evenement_id,
        transactie_code: `TRX-${1001 + (count || 0)}`,
        datum,
        omschrijving: regel.omschrijving,
        type_geldstroom: "uitgave",
        hoofdcategorie: regel.evenement_hoofdcategorie,
        bedrag_excl_btw: Number(regel.bedrag),
        btw_tarief: 0,
        bedrag_totaal: Number(regel.bedrag),
        status,
        medewerker_user_id: document.geupload_door_user_id,
      });
    } else if (regel.bestemming === "fv" && regel.fv_user_id && regel.fv_maand_id) {
      await verdeelNaarFv([
        {
          fvMaandId: regel.fv_maand_id,
          userId: regel.fv_user_id,
          omschrijving: regel.omschrijving,
          bedrag: Number(regel.bedrag),
          bron: "document",
        },
      ]);
    }
  }

  await supabaseAdmin.from("documenten").update({ status: "Verwerkt" }).eq("id", documentId);

  return NextResponse.json({ ok: true, aantal: regels.length });
}
