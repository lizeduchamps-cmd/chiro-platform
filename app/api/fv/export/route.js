import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { haalFvOverzicht } from "@/lib/fvOverzicht";
import { GROEP_VOLGORDE, fvGroep } from "@/lib/fvGroep";
import { soortLabel } from "@/lib/fvSoorten";

const MAAND_NAMEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function maandLabel(maand) {
  const [j, m] = maand.split("-");
  return `${MAAND_NAMEN[parseInt(m, 10) - 1]} ${j}`;
}

// Bouwt het Excel-bestand rechtstreeks uit de databasegegevens (nooit een
// schermafdruk) — één bestand met een tabblad per groep (Leiding/Logistiek/
// Aspi), elk met de volledige regel-per-regel afrekening per persoon,
// gevolgd door hun totaal. Vervangt de vroegere print-gebaseerde PDF-export,
// die enkel liet zien wat toevallig op het scherm stond.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fvMaandId = searchParams.get("fvMaandId");
  if (!fvMaandId) return NextResponse.json({ error: "fvMaandId ontbreekt" }, { status: 400 });

  const resultaat = await haalFvOverzicht(fvMaandId);
  if (resultaat.error) {
    return NextResponse.json({ error: resultaat.error }, { status: resultaat.error === "FV-maand niet gevonden" ? 404 : 500 });
  }
  const { fvMaand, personen } = resultaat;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Chiro Hoepertingen — Financiënplatform";
  workbook.created = new Date();

  const gevraagdeTab = GROEP_VOLGORDE.indexOf(searchParams.get("tab"));
  workbook.views = [{ activeTab: Math.max(0, gevraagdeTab) }];

  GROEP_VOLGORDE.forEach((groep) => {
    const sheet = workbook.addWorksheet(groep);
    sheet.columns = [
      { header: "Persoon", key: "persoon", width: 24 },
      { header: "Soort", key: "soort", width: 14 },
      { header: "Omschrijving", key: "omschrijving", width: 44 },
      { header: "Bedrag", key: "bedrag", width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E0D8" } };
    sheet.getColumn("bedrag").numFmt = '€#,##0.00;-€#,##0.00';

    const personenInGroep = personen.filter((p) => fvGroep(p.user) === groep);
    personenInGroep.forEach((p) => {
      if (p.regels.length === 0) {
        sheet.addRow({ persoon: p.user.naam, soort: "", omschrijving: "Geen regels", bedrag: null });
      } else {
        p.regels.forEach((r) => {
          sheet.addRow({ persoon: p.user.naam, soort: soortLabel(r.bron), omschrijving: r.omschrijving, bedrag: Number(r.bedrag) });
        });
      }
      const totaalRow = sheet.addRow({ persoon: p.user.naam, soort: "", omschrijving: "Totaal", bedrag: p.totaal });
      totaalRow.font = { bold: true };
      totaalRow.border = { top: { style: "thin" } };
      sheet.addRow({});
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const bestandsnaam = `Financieel Verslag ${maandLabel(fvMaand.maand)}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${bestandsnaam}"`,
    },
  });
}
