import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";

// Generieke key/waarde-instellingen (zelfde tabel als prijs_per_streepje) —
// hier ontsloten als klein herbruikbaar eindpunt i.p.v. per feature een
// eigen kopie van dezelfde ophaal-/upsert-logica te schrijven.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { data, error } = await supabaseAdmin.from("instellingen").select("key, waarde");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const instellingen = {};
  (data || []).forEach((i) => { instellingen[i.key] = i.waarde; });
  return NextResponse.json({ instellingen });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { key, waarde } = await req.json();
  if (!key) return NextResponse.json({ error: "key ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin.from("instellingen").upsert({ key, waarde: waarde ?? "" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
