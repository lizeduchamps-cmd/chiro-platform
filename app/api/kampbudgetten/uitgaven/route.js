import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { magAfdelingBewerken, afdelingVanGroepsbudget, groepsbudgetIdVanUitgave } from "@/lib/kampPermissies";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  const { groepsbudgetId, datum, omschrijving, bedrag, bewijsstukUrl } = await req.json();
  if (!groepsbudgetId || !datum || !omschrijving || !bedrag) {
    return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
  }

  const afdeling = await afdelingVanGroepsbudget(groepsbudgetId);
  if (!(await magAfdelingBewerken(session, afdeling))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("groepsbudget_uitgaven")
    .insert({
      groepsbudget_id: groepsbudgetId,
      datum,
      omschrijving,
      bedrag: Number(bedrag),
      bewijsstuk_url: bewijsstukUrl || null,
      ingediend_door_user_id: session.user.userId || null,
    })
    .select("id, datum, omschrijving, bedrag, status, bewijsstuk_url")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ uitgave: data });
}

// Status wijzigen (goedkeuren/afkeuren) blijft voorbehouden aan admin/financieel
// verantwoordelijke — de afdeling dient in, financiën keurt goed, net als bij
// een echte onkostennota.
export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id en status zijn verplicht" }, { status: 400 });

  const { error } = await supabaseAdmin.from("groepsbudget_uitgaven").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const groepsbudgetId = await groepsbudgetIdVanUitgave(id);
  const afdeling = await afdelingVanGroepsbudget(groepsbudgetId);
  if (!(await magAfdelingBewerken(session, afdeling))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("groepsbudget_uitgaven").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
