import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";

// Wijst een gebruiker toe aan een verantwoordelijkheid (upsert: opnieuw
// aanroepen wijzigt gewoon is_hoofdverantwoordelijke i.p.v. een dubbele rij
// te maken). Een verantwoordelijkheid heeft nooit meer dan één
// hoofdverantwoordelijke — bij het toekennen wordt een eventuele vorige
// hoofdverantwoordelijke automatisch gedegradeerd tot medeverantwoordelijke.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { verantwoordelijkheidId, userId, isHoofdverantwoordelijke } = await req.json();
  if (!verantwoordelijkheidId || !userId) {
    return NextResponse.json({ error: "verantwoordelijkheidId en userId zijn verplicht" }, { status: 400 });
  }

  if (isHoofdverantwoordelijke) {
    await supabaseAdmin
      .from("user_verantwoordelijkheden")
      .update({ is_hoofdverantwoordelijke: false })
      .eq("verantwoordelijkheid_id", verantwoordelijkheidId)
      .eq("is_hoofdverantwoordelijke", true);
  }

  const { data, error } = await supabaseAdmin
    .from("user_verantwoordelijkheden")
    .upsert(
      { verantwoordelijkheid_id: verantwoordelijkheidId, user_id: userId, is_hoofdverantwoordelijke: !!isHoofdverantwoordelijke },
      { onConflict: "user_id,verantwoordelijkheid_id" }
    )
    .select("id, user_id, verantwoordelijkheid_id, is_hoofdverantwoordelijke")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ toewijzing: data });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const url = new URL(req.url);
  const verantwoordelijkheidId = url.searchParams.get("verantwoordelijkheidId");
  const userId = url.searchParams.get("userId");
  if (!verantwoordelijkheidId || !userId) {
    return NextResponse.json({ error: "verantwoordelijkheidId en userId zijn verplicht" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("user_verantwoordelijkheden")
    .delete()
    .eq("verantwoordelijkheid_id", verantwoordelijkheidId)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
