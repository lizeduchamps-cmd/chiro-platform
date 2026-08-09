import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// Voegt de huidige streepjes-stand van de gekozen personen toe als een
// "Streepjes"-regel op een gekozen FV-maand, en zet hun tellers nadien terug
// op 0. Wordt bewust vanaf de Streepjes-pagina getriggerd (per persoon of in
// bulk), niet automatisch bij het aanmaken van een FV-maand.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { fvMaandId, userIds } = await req.json();
  if (!fvMaandId || !Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: "fvMaandId en userIds zijn verplicht" }, { status: 400 });
  }

  const { data: users, error: usersError } = await supabaseAdmin
    .from("users")
    .select("id, fysieke_streepjes, online_streepjes_bedrag")
    .in("id", userIds);
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const { data: instellingen } = await supabaseAdmin.from("instellingen").select("key, waarde");
  const prijsPerStreepje = Number(instellingen?.find((i) => i.key === "prijs_per_streepje")?.waarde ?? 0.25);

  const statusRows = [];
  const regelRows = [];
  (users || []).forEach((u) => {
    statusRows.push({ fv_maand_id: fvMaandId, user_id: u.id, status: "openstaand" });
    const fysiekBedrag = Number(u.fysieke_streepjes || 0) * prijsPerStreepje;
    const onlineBedrag = Number(u.online_streepjes_bedrag || 0);
    const totaal = fysiekBedrag + onlineBedrag;
    if (totaal > 0) {
      regelRows.push({
        fv_maand_id: fvMaandId,
        user_id: u.id,
        omschrijving: "Streepjes",
        bedrag: Math.round(totaal * 100) / 100,
        bron: "streepjes_bot",
      });
    }
  });

  if (statusRows.length) {
    await supabaseAdmin.from("fv_status").upsert(statusRows, { onConflict: "fv_maand_id,user_id", ignoreDuplicates: true });
  }
  if (regelRows.length) {
    const { error: regelsError } = await supabaseAdmin.from("fv_regels").insert(regelRows);
    if (regelsError) return NextResponse.json({ error: regelsError.message }, { status: 500 });
  }

  const { error: resetError } = await supabaseAdmin
    .from("users")
    .update({ fysieke_streepjes: 0, online_streepjes_bedrag: 0 })
    .in("id", userIds);
  if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 });

  return NextResponse.json({ ok: true, aantal: regelRows.length });
}
