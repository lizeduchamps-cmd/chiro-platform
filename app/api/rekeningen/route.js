import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("rekeningen")
    .select("id, type, startsaldo")
    .eq("werkjaar_id", werkjaarId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rekeningen: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { werkjaarId, type, startsaldo } = await req.json();
  if (!werkjaarId || !type) return NextResponse.json({ error: "werkjaarId of type ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("rekeningen")
    .update({ startsaldo })
    .eq("werkjaar_id", werkjaarId)
    .eq("type", type);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
