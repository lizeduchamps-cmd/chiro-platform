import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { aggregaten } = await req.json();
  if (!aggregaten) return NextResponse.json({ error: "Geen data ontvangen" }, { status: 400 });

  const { data: users, error } = await supabaseAdmin.from("users").select("id, discord_username");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let matchCount = 0;
  const nietGematcht = [];

  for (const [discordUsername, bedrag] of Object.entries(aggregaten)) {
    const user = users.find((u) => u.discord_username?.toLowerCase() === discordUsername.toLowerCase());
    if (user) {
      await supabaseAdmin.from("users").update({ online_streepjes_bedrag: bedrag }).eq("id", user.id);
      matchCount++;
    } else {
      nietGematcht.push(discordUsername);
    }
  }

  const gematchteNamen = Object.keys(aggregaten).map((n) => n.toLowerCase());
  const nietInCsv = users.filter((u) => !gematchteNamen.includes(u.discord_username?.toLowerCase()));
  for (const u of nietInCsv) {
    await supabaseAdmin.from("users").update({ online_streepjes_bedrag: 0 }).eq("id", u.id);
  }

  return NextResponse.json({ ok: true, matchCount, nietGematcht });
}
