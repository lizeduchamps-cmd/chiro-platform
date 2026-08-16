import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Lijst cash-kassa's van andere evenementen — bruikbaar om de coupure-
// samenstelling (vooraf) van over te nemen bij het tellen van een kassa,
// zodat je niet elk jaar van nul moet beginnen.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const excludeEvenementId = new URL(req.url).searchParams.get("exclude");

  const { data, error } = await supabaseAdmin
    .from("evenement_kassas")
    .select("id, evenement_id, naam, wisselgeld_start, wisselgeld_start_samenstelling, evenementen(naam, datum)")
    .eq("type", "cash")
    .not("wisselgeld_start_samenstelling", "is", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const kassas = (data || [])
    .filter((k) => k.evenementen && (!excludeEvenementId || k.evenement_id !== excludeEvenementId))
    .map((k) => ({
      id: k.id,
      naam: k.naam,
      wisselgeld_start: k.wisselgeld_start,
      wisselgeld_start_samenstelling: k.wisselgeld_start_samenstelling,
      evenementNaam: k.evenementen.naam,
      evenementDatum: k.evenementen.datum,
    }));

  return NextResponse.json({ kassas });
}
