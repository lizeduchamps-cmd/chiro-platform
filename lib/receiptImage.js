// Klassieke, deterministische beeldbewerking (geen AI/ML) om een foto van
// een kassabon leesbaarder te maken voor OCR: opschalen (kleine tekst wordt
// anders niet herkend), naar grijswaarden, en zwart/wit maken via Otsu's
// methode (een standaardalgoritme uit de jaren '70 om automatisch de beste
// drempelwaarde te bepalen). Vooral bij vaal thermisch bonpapier of een foto
// met schaduw maakt dit vaak het verschil tussen wel/niet leesbare tekst.
export async function preprocessKassabon(imageUrl) {
  const img = await laadAfbeelding(imageUrl);

  const minBreedte = 1400;
  const schaal = img.width < minBreedte ? minBreedte / img.width : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * schaal);
  canvas.height = Math.round(img.height * schaal);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const aantalPixels = canvas.width * canvas.height;

  const grijswaarden = new Uint8ClampedArray(aantalPixels);
  for (let i = 0; i < aantalPixels; i++) {
    const p = i * 4;
    grijswaarden[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  const drempel = otsuDrempel(grijswaarden);

  for (let i = 0; i < aantalPixels; i++) {
    const v = grijswaarden[i] > drempel ? 255 : 0;
    const p = i * 4;
    data[p] = data[p + 1] = data[p + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function laadAfbeelding(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function otsuDrempel(grijswaarden) {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < grijswaarden.length; i++) histogram[grijswaarden[i]]++;

  const totaal = grijswaarden.length;
  let som = 0;
  for (let i = 0; i < 256; i++) som += i * histogram[i];

  let somAchtergrond = 0;
  let gewichtAchtergrond = 0;
  let besteVariantie = 0;
  let besteDrempel = 127;

  for (let i = 0; i < 256; i++) {
    gewichtAchtergrond += histogram[i];
    if (gewichtAchtergrond === 0) continue;
    const gewichtVoorgrond = totaal - gewichtAchtergrond;
    if (gewichtVoorgrond === 0) break;

    somAchtergrond += i * histogram[i];
    const gemAchtergrond = somAchtergrond / gewichtAchtergrond;
    const gemVoorgrond = (som - somAchtergrond) / gewichtVoorgrond;
    const tussenklasseVariantie = gewichtAchtergrond * gewichtVoorgrond * (gemAchtergrond - gemVoorgrond) ** 2;

    if (tussenklasseVariantie > besteVariantie) {
      besteVariantie = tussenklasseVariantie;
      besteDrempel = i;
    }
  }
  return besteDrempel;
}
