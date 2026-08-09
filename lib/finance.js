import { supabaseAdmin } from "@/lib/supabase";

export async function computeSaldos(werkjaarId) {
  const { data: rekeningen } = await supabaseAdmin
    .from("rekeningen")
    .select("type, startsaldo")
    .eq("werkjaar_id", werkjaarId);

  const { data: transacties } = await supabaseAdmin
    .from("transacties")
    .select("rekening_type, bedrag, soort, interne_bestemming_rekening")
    .eq("werkjaar_id", werkjaarId);

  const zichtStart = Number(rekeningen?.find((r) => r.type === "zicht")?.startsaldo || 0);
  const spaarStart = Number(rekeningen?.find((r) => r.type === "spaar")?.startsaldo || 0);

  let zicht = zichtStart;
  let spaar = spaarStart;

  (transacties || []).forEach((t) => {
    const bedrag = Number(t.bedrag);
    if (t.soort === "interne_transactie") {
      if (t.rekening_type === "zicht") zicht -= bedrag;
      else spaar -= bedrag;
      if (t.interne_bestemming_rekening === "zicht") zicht += bedrag;
      else spaar += bedrag;
    } else {
      const teken = t.soort === "uitgave" ? -1 : 1;
      if (t.rekening_type === "zicht") zicht += teken * bedrag;
      else spaar += teken * bedrag;
    }
  });

  return { zichtStart, spaarStart, zichtLopend: zicht, spaarLopend: spaar, totaal: zicht + spaar };
}
