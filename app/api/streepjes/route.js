import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select("id, naam, discord_username, fysieke_streepjes, online_streepjes_bedrag")
    .order("naam");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: instellingen } = await supabaseAdmin.from("instellingen").select("key, waarde");
  const prijsPerStreepje = Number(instellingen?.find((i) => i.key === "prijs_per_streepje")?.waarde ?? 0.25);

  return NextResponse.json({ users, prijsPerStreepje });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const body = await req.json();

  if (body.prijsPerStreepje !== undefined) {
    await supabaseAdmin.from("instellingen").upsert({ key: "prijs_per_streepje", waarde: body.prijsPerStreepje });
    return NextResponse.json({ ok: true });
  }

  const { userId, fysiekeStreepjes } = body;
  if (!userId) return NextResponse.json({ error: "userId ontbreekt" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("users")
    .update({ fysieke_streepjes: fysiekeStreepjes })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
