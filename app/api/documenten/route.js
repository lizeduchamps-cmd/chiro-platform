import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { haalDocument, magDocumentBewerken } from "@/lib/documentPermissies";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const url = new URL(req.url);
  const werkjaarId = url.searchParams.get("werkjaarId");
  const status = url.searchParams.get("status");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  let query = supabaseAdmin
    .from("documenten")
    .select("id, titel, totaalbedrag, gekoppeld_aan, evenement_id, status, created_at, evenementen(naam), users(naam)")
    .eq("werkjaar_id", werkjaarId)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documenten: data });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const document = await haalDocument(id);
  if (!(await magDocumentBewerken(session, document))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { data: volledig } = await supabaseAdmin.from("documenten").select("bestand_pad").eq("id", id).maybeSingle();
  if (volledig?.bestand_pad) await supabaseAdmin.storage.from("documenten").remove([volledig.bestand_pad]);

  const { error } = await supabaseAdmin.from("documenten").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
