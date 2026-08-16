import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Lijst evenementen die al kassa's hebben — bruikbaar als bron om de
// kassa-samenstelling (vooraf) van over te nemen naar een ander evenement,
// zodat je niet elk jaar van nul moet beginnen.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const exclude = new URL(req.url).searchParams.get("exclude");

  const { data: kassaRows, error: kassaError } = await supabaseAdmin.from("evenement_kassas").select("evenement_id");
  if (kassaError) return NextResponse.json({ error: kassaError.message }, { status: 500 });

  const evenementIds = [...new Set((kassaRows || []).map((k) => k.evenement_id))].filter((id) => id !== exclude);
  if (evenementIds.length === 0) return NextResponse.json({ evenementen: [] });

  const { data, error } = await supabaseAdmin
    .from("evenementen")
    .select("id, naam, datum")
    .in("id", evenementIds)
    .order("datum", { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ evenementen: data });
}
