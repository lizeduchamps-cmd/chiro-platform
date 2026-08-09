import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { evenementMatchTag } from "@/lib/evenementMatch";

// Vingerafdruk voor duplicaatdetectie: rekening + datum + bedrag + tegenpartij
// + mededeling, genormaliseerd. Dezelfde CSV twee keer opladen maakt zo geen
// dubbele transacties aan — de tweede keer wordt gewoon overgeslagen.
function berekenFingerprint({ rekeningType, datum, bedrag, tegenpartij, vrijeMededeling }) {
  const norm = (v) => (v || "").toString().trim().toLowerCase();
  return [rekeningType, datum, Math.abs(Number(bedrag)).toFixed(2), norm(tegenpartij), norm(vrijeMededeling)].join("|");
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "financieel_verantwoordelijke"].includes(session.user.platformRecht)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { werkjaarId, transacties, bestandsnaam } = await req.json();
  if (!werkjaarId || !Array.isArray(transacties) || transacties.length === 0) {
    return NextResponse.json({ error: "Geen transacties om toe te voegen" }, { status: 400 });
  }

  const { data: categorieen } = await supabaseAdmin.from("categorieen").select("id, naam");
  const naarId = (naam) => categorieen?.find((c) => c.naam === naam)?.id || null;

  // Categorienaam komt overeen met een evenement dit werkjaar (bv. "Fuif" ->
  // "Fuif 2026")? Dan meteen koppelen, zonder dat iemand dat handmatig per
  // rij moet aanduiden.
  const { data: evenementenDitWerkjaar } = await supabaseAdmin.from("evenementen").select("id, naam").eq("werkjaar_id", werkjaarId);
  const evenementVoorCategorie = (categorieNaam) => {
    const matches = (evenementenDitWerkjaar || []).filter((e) => evenementMatchTag([categorieNaam], e.naam));
    return matches.length === 1 ? matches[0].id : null;
  };

  const kandidaten = transacties.map((t) => {
    const rekeningType = "zicht";
    return {
      row: {
        werkjaar_id: werkjaarId,
        rekening_type: rekeningType,
        datum: t.datum,
        soort: t.bedrag < 0 ? "uitgave" : "inkomst",
        tegenpartij: t.tegenpartij || null,
        iban_tegenpartij: t.iban || null,
        vrije_mededeling: t.vrijeMededeling || null,
        omschrijving: t.omschrijving || null,
        bedrag: Math.abs(Number(t.bedrag)),
        categorie_id: naarId(t.categorie),
        evenement_id: evenementVoorCategorie(t.categorie),
        bron: "kbc_csv",
      },
      fingerprint: berekenFingerprint({ rekeningType, datum: t.datum, bedrag: t.bedrag, tegenpartij: t.tegenpartij, vrijeMededeling: t.vrijeMededeling }),
    };
  });

  const { data: bestaande, error: bestaandeError } = await supabaseAdmin
    .from("transacties")
    .select("import_fingerprint")
    .eq("werkjaar_id", werkjaarId)
    .not("import_fingerprint", "is", null);
  if (bestaandeError) return NextResponse.json({ error: bestaandeError.message }, { status: 500 });
  const bestaandeFingerprints = new Set((bestaande || []).map((r) => r.import_fingerprint));

  const nieuwRows = [];
  let aantalDuplicaten = 0;
  const gezienInDezeUpload = new Set();
  for (const { row, fingerprint } of kandidaten) {
    if (bestaandeFingerprints.has(fingerprint) || gezienInDezeUpload.has(fingerprint)) {
      aantalDuplicaten++;
      continue;
    }
    gezienInDezeUpload.add(fingerprint);
    nieuwRows.push({ ...row, import_fingerprint: fingerprint });
  }

  if (nieuwRows.length > 0) {
    const { error } = await supabaseAdmin.from("transacties").insert(nieuwRows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from("csv_imports").insert({
    werkjaar_id: werkjaarId,
    bestandsnaam: bestandsnaam || null,
    geimporteerd_door: session.user.userId,
    aantal_in_bestand: transacties.length,
    aantal_nieuw: nieuwRows.length,
    aantal_duplicaten: aantalDuplicaten,
  });

  return NextResponse.json({ ok: true, aantal: nieuwRows.length, aantalDuplicaten });
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
