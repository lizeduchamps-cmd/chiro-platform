import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const [{ data: users, error: usersError }, { data: verantwoordelijkheden, error: verantError }, { data: toewijzingen, error: toewijzingenError }] = await Promise.all([
    supabaseAdmin.from("users").select("id, naam, discord_username, type, groep, platform_recht, iban").order("naam"),
    supabaseAdmin.from("verantwoordelijkheden").select("id, naam").order("naam"),
    supabaseAdmin.from("user_verantwoordelijkheden").select("id, user_id, verantwoordelijkheid_id, is_hoofdverantwoordelijke, users(naam), verantwoordelijkheden(naam)"),
  ]);
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });
  if (verantError) return NextResponse.json({ error: verantError.message }, { status: 500 });
  if (toewijzingenError) return NextResponse.json({ error: toewijzingenError.message }, { status: 500 });

  const usersMetVerant = (users || []).map((u) => ({
    ...u,
    verantwoordelijkheden: (toewijzingen || [])
      .filter((t) => t.user_id === u.id)
      .map((t) => ({ id: t.verantwoordelijkheid_id, naam: t.verantwoordelijkheden?.naam, isHoofdverantwoordelijke: t.is_hoofdverantwoordelijke })),
  }));

  const verantMetToewijzingen = (verantwoordelijkheden || []).map((v) => {
    const rijen = (toewijzingen || []).filter((t) => t.verantwoordelijkheid_id === v.id);
    const hoofdRij = rijen.find((r) => r.is_hoofdverantwoordelijke);
    return {
      ...v,
      hoofdverantwoordelijke: hoofdRij ? { id: hoofdRij.user_id, naam: hoofdRij.users?.naam } : null,
      medeverantwoordelijken: rijen.filter((r) => !r.is_hoofdverantwoordelijke).map((r) => ({ id: r.user_id, naam: r.users?.naam })),
    };
  });

  return NextResponse.json({ users: usersMetVerant, verantwoordelijkheden: verantMetToewijzingen });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { discordUsername, naam } = await req.json();
  // Discordnaam is enkel verplicht voor iemand die ooit gaat inloggen. Een
  // "Naam (geen login)" — puur om te kunnen kiezen bij FV/streepjes — heeft
  // geen Discord-account en dus geen discordUsername nodig.
  if (!discordUsername && !naam) return NextResponse.json({ error: "Naam is verplicht" }, { status: 400 });

  if (discordUsername) {
    const { data: bestaat } = await supabaseAdmin
      .from("users")
      .select("id")
      .ilike("discord_username", discordUsername)
      .maybeSingle();
    if (bestaat) return NextResponse.json({ error: "Er bestaat al een gebruiker met deze Discordnaam" }, { status: 400 });
  }

  const placeholderId = `handmatig_${crypto.randomUUID()}`;
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      discord_id: placeholderId,
      discord_username: discordUsername || null,
      naam: naam || discordUsername,
    })
    .select("id, naam, discord_username, type, groep, platform_recht, iban")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: { ...data, verantwoordelijkheden: [] } });
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const body = await req.json();
  const { id, type, groep, platform_recht, iban } = body;
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const updateFields = { updated_at: new Date().toISOString() };
  if (type !== undefined) updateFields.type = type;
  if (groep !== undefined) updateFields.groep = groep || null;
  if (platform_recht !== undefined) updateFields.platform_recht = platform_recht;
  if (iban !== undefined) updateFields.iban = iban || null;

  const { error } = await supabaseAdmin.from("users").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
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
