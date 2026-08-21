import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { haalFvOverzicht } from "@/lib/fvOverzicht";

// Volledig FV-overzicht voor één maand: alle personen met hun regels, totaal en status.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const fvMaandId = new URL(req.url).searchParams.get("fvMaandId");
  if (!fvMaandId) return NextResponse.json({ error: "fvMaandId ontbreekt" }, { status: 400 });

  const resultaat = await haalFvOverzicht(fvMaandId);
  if (resultaat.error) {
    return NextResponse.json({ error: resultaat.error }, { status: resultaat.error === "FV-maand niet gevonden" ? 404 : 500 });
  }
  return NextResponse.json(resultaat);
}
