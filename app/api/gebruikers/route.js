import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

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

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.platformRecht !== "admin") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { discordUsername, naam } = await req.json();
  if (!discordUsername) return NextResponse.json({ error: "Discordnaam is verplicht" }, { status: 400 });

  const { data: bestaat } = await supabaseAdmin
    .from("users")
    .select("id")
    .ilike("discord_username", discordUsername)
    .maybeSingle();
  if (bestaat) return NextResponse.json({ error: "Er bestaat al een gebruiker met deze Discordnaam" }, { status: 400 });

  const placeholderId = `handmatig_${crypto.randomUUID()}`;
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      discord_id: placeholderId,
      discord_username: discordUsername,
      naam: naam || discordUsername,
    })
    .select("id, naam, discord_username, type, groep, verantwoordelijkheden, platform_recht")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
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

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.platformRecht !== "admin") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  if (id === session.user.userId) {
    return NextResponse.json({ error: "Je kan jezelf niet verwijderen" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("users").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
