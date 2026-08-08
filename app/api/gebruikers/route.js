import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.platformRecht !== "admin") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, naam, discord_username, type, groep, verantwoordelijkheden, platform_recht")
    .order("naam");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.platformRecht !== "admin") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }
  const body = await req.json();
  const { id, type, groep, verantwoordelijkheden, platform_recht } = body;
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const updateFields = { updated_at: new Date().toISOString() };
  if (type !== undefined) updateFields.type = type;
  if (groep !== undefined) updateFields.groep = groep || null;
  if (verantwoordelijkheden !== undefined) updateFields.verantwoordelijkheden = verantwoordelijkheden;
  if (platform_recht !== undefined) updateFields.platform_recht = platform_recht;

  const { error } = await supabaseAdmin.from("users").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
