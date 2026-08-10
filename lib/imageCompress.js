// Comprimeert een foto in de browser vóór het uploaden — een moderne
// smartphone-foto van een lange kassabon kan makkelijk 5-10MB zijn, wat de
// upload doet vasthangen of mislukken. Verkleint (max. lange zijde) en
// herexporteert als JPEG; laat PDF's en kleine bestanden gewoon ongemoeid.
export async function comprimeerFoto(bestand, maxLangeZijde = 2000, kwaliteit = 0.82) {
  if (!bestand || !bestand.type?.startsWith("image/")) return bestand;
  if (bestand.size < 1_500_000) return bestand; // al klein genoeg, niet nodeloos herpakken

  const img = await laadAfbeelding(bestand);
  const schaal = Math.max(img.width, img.height) > maxLangeZijde ? maxLangeZijde / Math.max(img.width, img.height) : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * schaal);
  canvas.height = Math.round(img.height * schaal);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", kwaliteit));
  if (!blob || blob.size >= bestand.size) return bestand; // geen winst, origineel behouden

  const naam = bestand.name.replace(/\.\w+$/, "") + ".jpg";
  return new File([blob], naam, { type: "image/jpeg" });
}

function laadAfbeelding(bestand) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(bestand);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
    img.src = url;
  });
}
