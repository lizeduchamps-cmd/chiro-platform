import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { haalFvOverzicht } from "@/lib/fvOverzicht";
import { GROEP_VOLGORDE, fvGroep } from "@/lib/fvGroep";
import { soortLabel } from "@/lib/fvSoorten";

const MAAND_NAMEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function maandLabel(maand) {
  const [j, m] = maand.split("-");
  return `${MAAND_NAMEN[parseInt(m, 10) - 1]} ${j}`;
}

// "2026-06-15" -> "15/06", zoals in het bestaande handmatige sjabloon.
function deadlineKort(datum) {
  if (!datum) return "";
  const [, m, d] = datum.split("-");
  return `${d}/${m}`;
}

// Belgisch decimaalteken (komma i.p.v. punt), zonder kunstmatig op te vullen
// met nullen — zelfde weergave als in het bestaande sjabloon ("0,13", "1,9").
function komma(n) {
  return String(n).replace(".", ",");
}

const NAVY = { type: "pattern", pattern: "solid", fgColor: { argb: "FF073763" } };
const GROEN = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6AA84F" } };
const BLAUW = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA3C8E9" } };
const DUN = { style: "thin", color: { argb: "FF000000" } };
const KADER = { top: DUN, bottom: DUN, left: DUN, right: DUN };
const EUROFMT = '_ "€" * #,##0.00_ ;_ "€" * -#,##0.00_ ;_ "€" * "-"??_ ;_ @_ ';

// Bouwt het Excel-bestand rechtstreeks uit de databasegegevens (nooit een
// schermafdruk) — één bestand met een tabblad per groep (Leiding/Logistiek/
// Aspi), in exact dezelfde layout als het jarenlang manueel bijgehouden
// sjabloon (zie FV_leeg.xlsx): kopband met deadline/rekeningnummer/
// km-vergoeding bovenaan, daaronder per persoon een blokje met naam+IBAN,
// kolomkoppen, alle losse regels en een echte SOM-formule.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fvMaandId = searchParams.get("fvMaandId");
  if (!fvMaandId) return NextResponse.json({ error: "fvMaandId ontbreekt" }, { status: 400 });

  const [resultaat, instellingenData] = await Promise.all([
    haalFvOverzicht(fvMaandId),
    haalRekeningnummer(),
  ]);
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
    sheet.columns = [{ width: 27 }, { width: 31 }, { width: 24 }, { width: 9 }, { width: 9 }, { width: 41 }];

    // Rij 1-4: kopband (groepsnaam/deadline/rekeningnummer + km-vergoeding).
    setCel(sheet, "A1", groep, { font: { bold: true }, fill: NAVY });
    setCel(sheet, "B1", `DEADLINE: ${deadlineKort(fvMaand.betaaldeadline)}`, { font: { bold: true }, fill: NAVY });
    setCel(sheet, "C1", `BE: ${instellingenData}`, { font: { bold: true }, fill: NAVY });

    const kmTarief = Number(groep === "Logistiek" ? fvMaand.km_tarief_logistiek : fvMaand.km_tarief_leiding) || 0;
    const diesel = Number(fvMaand.dieselprijs) || 0;
    if (groep !== "Aspi" && kmTarief > 0 && diesel > 0) {
      const verbruik = Math.round(((kmTarief * 100) / diesel) * 10) / 10;
      setCel(sheet, "F1", `🚘  Kilometervergoeding = ${komma(kmTarief)} euro  🚘`, { font: { bold: true }, fill: GROEN });
      setCel(sheet, "F2", `Diesel kost gem € ${komma(diesel)}`, {});
      setCel(sheet, "F3", `Gem verbruik van de wagen is ${komma(verbruik)} liter / 100 km`, {});
      setCel(sheet, "F4", `${komma(verbruik)} X € ${komma(diesel)}/ 100 = € ${komma(kmTarief)} per km`, {});
    }

    // Per persoon een blokje, startend op rij 3 (net als het sjabloon).
    let rij = 3;
    personen
      .filter((p) => fvGroep(p.user) === groep)
      .forEach((p) => {
        setCel(sheet, `A${rij}`, p.user.naam, { font: { bold: true } });
        setCel(sheet, `B${rij}`, p.user.iban || "", { numFmt: "@" });
        rij++;

        setCel(sheet, `A${rij}`, "Omschrijving", { font: { bold: true }, fill: NAVY, border: KADER, numFmt: "@" });
        setCel(sheet, `B${rij}`, "Betalen", { font: { bold: true }, fill: NAVY, border: KADER, numFmt: EUROFMT });
        setCel(sheet, `C${rij}`, "Opmerking", { font: { bold: true }, fill: NAVY, border: KADER });
        rij++;

        const eersteRegelRij = rij;
        p.regels.forEach((r) => {
          setCel(sheet, `A${rij}`, soortLabel(r.bron), { border: KADER, numFmt: "@" });
          setCel(sheet, `B${rij}`, Number(r.bedrag), { border: KADER, numFmt: EUROFMT });
          setCel(sheet, `C${rij}`, r.omschrijving, { border: KADER });
          rij++;
        });
        const laatsteRegelRij = rij - 1;

        const somWaarde = p.regels.length > 0 ? { formula: `SUM(B${eersteRegelRij}:B${laatsteRegelRij})` } : 0;
        setCel(sheet, `A${rij}`, "", { fill: BLAUW, border: KADER });
        setCel(sheet, `B${rij}`, somWaarde, { font: { bold: true }, fill: BLAUW, border: KADER, numFmt: EUROFMT });
        setCel(sheet, `C${rij}`, "", { fill: BLAUW, border: KADER });
        rij += 2; // som-rij + 1 lege rij tussen personen
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

function setCel(sheet, adres, waarde, { font, fill, border, numFmt } = {}) {
  const cell = sheet.getCell(adres);
  cell.value = waarde;
  if (font) cell.font = font;
  if (fill) cell.fill = fill;
  if (border) cell.border = border;
  if (numFmt) cell.numFmt = numFmt;
}

async function haalRekeningnummer() {
  const { data } = await supabaseAdmin.from("instellingen").select("waarde").eq("key", "chiro_rekeningnummer").maybeSingle();
  return data?.waarde || "";
}
