import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const { data: document, error: docError } = await supabaseAdmin
    .from("documenten")
    .select("id, werkjaar_id, titel, totaalbedrag, gekoppeld_aan, evenement_id, status, bestand_pad, bestand_type, created_at, evenementen(naam), users(naam)")
    .eq("id", id)
    .maybeSingle();
  if (docError) return NextResponse.json({ error: docError.message }, { status: 500 });
  if (!document) return NextResponse.json({ error: "Document niet gevonden" }, { status: 404 });

  const { data: regels, error: regelsError } = await supabaseAdmin
    .from("bon_regels")
    .select("id, omschrijving, bedrag, bestemming, kamp_hoofdcategorie, evenement_id, evenement_hoofdcategorie, fv_user_id, fv_maand_id, evenementen(naam), users(naam)")
    .eq("document_id", id)
    .order("created_at");
  if (regelsError) return NextResponse.json({ error: regelsError.message }, { status: 500 });

  // Tijdelijke signed URL (1 uur geldig) — nooit een permanente publieke link,
  // de bucket is private.
  let signedUrl = null;
  if (document.bestand_pad) {
    const { data: signed } = await supabaseAdmin.storage.from("documenten").createSignedUrl(document.bestand_pad, 3600);
    signedUrl = signed?.signedUrl || null;
  }

  const toegewezen = Math.round((regels || []).reduce((s, r) => s + Number(r.bedrag), 0) * 100) / 100;
  const resterend = Math.round((Number(document.totaalbedrag) - toegewezen) * 100) / 100;

  return NextResponse.json({ document, regels, signedUrl, toegewezen, resterend });
}
