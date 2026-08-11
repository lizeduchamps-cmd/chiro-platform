import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFinancieel } from "@/lib/permissies";
import { supabaseAdmin } from "@/lib/supabase";

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!isFinancieel(session)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { fvMaandId, userId, status } = await req.json();
  if (!fvMaandId || !userId || !["openstaand", "betaald"].includes(status)) {
    return NextResponse.json({ error: "Ongeldige of ontbrekende velden" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("fv_status").upsert(
    {
      fv_maand_id: fvMaandId,
      user_id: userId,
      status,
      betaald_op: status === "betaald" ? new Date().toISOString() : null,
    },
    { onConflict: "fv_maand_id,user_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
