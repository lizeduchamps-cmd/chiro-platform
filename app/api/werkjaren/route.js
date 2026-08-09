import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { computeSaldos } from "@/lib/finance";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("werkjaren")
    .select("id, naam")
    .order("naam", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ werkjaren: data });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { naam, overnemenVanWerkjaarId } = await req.json();
  if (!naam || !/^\d{4}-\d{4}$/.test(naam)) {
    return NextResponse.json({ error: "Ongeldig werkjaar-formaat, gebruik JJJJ-JJJJ" }, { status: 400 });
  }

  const { data: werkjaar, error } = await supabaseAdmin
    .from("werkjaren")
    .insert({ naam })
    .select("id, naam")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let zichtStart = 0;
  let spaarStart = 0;
  if (overnemenVanWerkjaarId) {
    const saldos = await computeSaldos(overnemenVanWerkjaarId);
    zichtStart = saldos.zichtLopend;
    spaarStart = saldos.spaarLopend;
  }

  await supabaseAdmin.from("rekeningen").insert([
    { werkjaar_id: werkjaar.id, type: "zicht", startsaldo: zichtStart },
    { werkjaar_id: werkjaar.id, type: "spaar", startsaldo: spaarStart },
  ]);

  return NextResponse.json({ werkjaar });
}
