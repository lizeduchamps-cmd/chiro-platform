import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Lichte samenvatting van de winst/verlies van elk afgerond evenement binnen
// een werkjaar — voor op het Jaaroverzicht. Zelfde optelling als
// /api/evenementen/overzicht, maar in bulk voor alle afgeronde evenementen
// tegelijk (geen N losse aanvragen nodig).
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const werkjaarId = new URL(req.url).searchParams.get("werkjaarId");
  if (!werkjaarId) return NextResponse.json({ error: "werkjaarId ontbreekt" }, { status: 400 });

  const { data: evenementen, error: evenementenError } = await supabaseAdmin
    .from("evenementen")
    .select("id, naam, datum")
    .eq("werkjaar_id", werkjaarId)
    .eq("status", "afgerond");
  if (evenementenError) return NextResponse.json({ error: evenementenError.message }, { status: 500 });
  if (!evenementen?.length) return NextResponse.json({ evenementen: [] });

  const ids = evenementen.map((e) => e.id);
  const [{ data: kassas, error: kassasError }, { data: transacties, error: transactiesError }] = await Promise.all([
    supabaseAdmin.from("evenement_kassas").select("evenement_id, type, wisselgeld_start, inhoud_einde").in("evenement_id", ids),
    supabaseAdmin.from("evenement_transacties").select("evenement_id, type_geldstroom, bedrag_totaal").in("evenement_id", ids),
  ]);
  if (kassasError) return NextResponse.json({ error: kassasError.message }, { status: 500 });
  if (transactiesError) return NextResponse.json({ error: transactiesError.message }, { status: 500 });

  const resultaat = evenementen.map((e) => {
    const kassaOmzet = (kassas || [])
      .filter((k) => k.evenement_id === e.id)
      .reduce((s, k) => {
        const eind = Number(k.inhoud_einde || 0);
        return s + (k.type === "cash" ? eind - Number(k.wisselgeld_start || 0) : eind);
      }, 0);
    const eigenTransacties = (transacties || []).filter((t) => t.evenement_id === e.id);
    const inkomsten = eigenTransacties.filter((t) => t.type_geldstroom === "inkomst").reduce((s, t) => s + Number(t.bedrag_totaal), 0);
    const uitgaven = eigenTransacties.filter((t) => t.type_geldstroom === "uitgave").reduce((s, t) => s + Number(t.bedrag_totaal), 0);
    return {
      id: e.id,
      naam: e.naam,
      datum: e.datum,
      nettoWinst: Math.round((kassaOmzet + inkomsten - uitgaven) * 100) / 100,
    };
  });

  return NextResponse.json({ evenementen: resultaat });
}
