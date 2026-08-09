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
    .from("fv_maanden")
    .select("id, maand, dieselprijs, km_tarief_leiding, km_tarief_logistiek, betaaldeadline")
    .eq("werkjaar_id", werkjaarId)
    .order("maand", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fvMaanden: data });
}

// Nieuwe FV-maand aanmaken. Neemt de huidige streepjes-stand van iedereen over
// als een "Streepjes"-regel op hun FV, en zet de tellers nadien terug op 0 —
// zodat de volgende maand weer vanaf nul begint (zoals dit nu ook handmatig gaat).
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { werkjaarId, maand, dieselprijs, kmTariefLeiding, kmTariefLogistiek, betaaldeadline } = await req.json();
  if (!werkjaarId || !maand || !/^\d{4}-\d{2}$/.test(maand)) {
    return NextResponse.json({ error: "Ongeldige of ontbrekende maand (formaat JJJJ-MM)" }, { status: 400 });
  }

  const { data: fvMaand, error } = await supabaseAdmin
    .from("fv_maanden")
    .insert({
      werkjaar_id: werkjaarId,
      maand,
      dieselprijs: dieselprijs || null,
      km_tarief_leiding: kmTariefLeiding || null,
      km_tarief_logistiek: kmTariefLogistiek || null,
      betaaldeadline: betaaldeadline || null,
    })
    .select("id, maand, dieselprijs, km_tarief_leiding, km_tarief_logistiek, betaaldeadline")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id, type, fysieke_streepjes, online_streepjes_bedrag")
    .in("type", ["Hoofdleiding", "Leiding", "Logistiek"]);

  const { data: instellingen } = await supabaseAdmin.from("instellingen").select("key, waarde");
  const prijsPerStreepje = Number(instellingen?.find((i) => i.key === "prijs_per_streepje")?.waarde ?? 0.25);

  const statusRows = [];
  const regelRows = [];
  (users || []).forEach((u) => {
    statusRows.push({ fv_maand_id: fvMaand.id, user_id: u.id, status: "openstaand" });

    const fysiekBedrag = Number(u.fysieke_streepjes || 0) * prijsPerStreepje;
    const onlineBedrag = Number(u.online_streepjes_bedrag || 0);
    const streepjesTotaal = fysiekBedrag + onlineBedrag;
    if (streepjesTotaal > 0) {
      regelRows.push({
        fv_maand_id: fvMaand.id,
        user_id: u.id,
        omschrijving: "Streepjes",
        bedrag: Math.round(streepjesTotaal * 100) / 100,
        bron: "streepjes_bot",
      });
    }
  });

  if (statusRows.length) await supabaseAdmin.from("fv_status").insert(statusRows);
  if (regelRows.length) await supabaseAdmin.from("fv_regels").insert(regelRows);

  await supabaseAdmin
    .from("users")
    .update({ fysieke_streepjes: 0, online_streepjes_bedrag: 0 })
    .in("type", ["Hoofdleiding", "Leiding", "Logistiek"]);

  return NextResponse.json({ fvMaand });
}
