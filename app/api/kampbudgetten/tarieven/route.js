import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("kamp_tarieven").select("*").eq("werkjaar_id", werkjaarId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tarieven: data || { winkelen_jong: 0, winkelen_oud: 0, dropping_per_lid: 0, weekend_per_lid: 0, weekendplaats_vast: 50 } });
}

// Eén upsert-endpoint: bestaat de rij nog niet voor dit werkjaar, dan wordt
// ze meteen aangemaakt met de meegegeven waarden.
export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const { werkjaarId, winkelenJong, winkelenOud, droppingPerLid, weekendPerLid, weekendplaatsVast } = await req.json();
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("kamp_tarieven")
    .upsert(
      {
        werkjaar_id: werkjaarId,
        winkelen_jong: Number(winkelenJong) || 0,
        winkelen_oud: Number(winkelenOud) || 0,
        dropping_per_lid: Number(droppingPerLid) || 0,
        weekend_per_lid: Number(weekendPerLid) || 0,
        weekendplaats_vast: Number(weekendplaatsVast) || 0,
      },
      { onConflict: "werkjaar_id" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tarieven: data });
}
