import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { werkjaarId, transacties } = await req.json();
  if (!werkjaarId || !Array.isArray(transacties) || transacties.length === 0) {
    return NextResponse.json({ error: "Geen transacties om toe te voegen" }, { status: 400 });
  }

  const { data: categorieen } = await supabaseAdmin.from("categorieen").select("id, naam");
  const naarId = (naam) => categorieen?.find((c) => c.naam === naam)?.id || null;

  const rows = transacties.map((t) => ({
    werkjaar_id: werkjaarId,
    rekening_type: "zicht",
    datum: t.datum,
    soort: t.bedrag < 0 ? "uitgave" : "inkomst",
    tegenpartij: t.tegenpartij || null,
    iban_tegenpartij: t.iban || null,
    vrije_mededeling: t.vrijeMededeling || null,
    omschrijving: t.omschrijving || null,
    bedrag: Math.abs(Number(t.bedrag)),
    categorie_id: naarId(t.categorie),
    bron: "kbc_csv",
  }));

  const { error } = await supabaseAdmin.from("transacties").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, aantal: rows.length });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Geen transacties geselecteerd" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("transacties").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, aantal: ids.length });
}
