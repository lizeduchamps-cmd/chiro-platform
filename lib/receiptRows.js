// Reconstrueert bon-regels op basis van de fysieke positie van elk herkend
// woord (bounding box), i.p.v. Tesseract's eigen lineaire leesvolgorde te
// vertrouwen. Op een kassabon staat de prijs in een aparte kolom, ver naar
// rechts — Tesseract's ingebouwde reading-order-logica raakt daardoor in de
// war (leest de prijs als los 'woord' i.p.v. getal, of laat die kolom
// gewoon helemaal weg). Hier groeperen we elk woord bij zijn fysieke rij
// (zelfde hoogte op de foto) en zetten we ze zelf links-naar-rechts samen —
// puur meetkunde op de bbox-data die Tesseract toch al meegeeft, geen AI.
export function reconstrueerRijen(blocks) {
  const woorden = [];
  for (const block of blocks || []) {
    for (const paragraaf of block.paragraphs || []) {
      for (const regel of paragraaf.lines || []) {
        for (const woord of regel.words || []) {
          const tekst = woord.text?.trim();
          if (tekst && woord.bbox) woorden.push({ tekst, bbox: woord.bbox });
        }
      }
    }
  }
  if (woorden.length === 0) return [];

  const gemHoogte = woorden.reduce((s, w) => s + (w.bbox.y1 - w.bbox.y0), 0) / woorden.length;
  const drempel = Math.max(gemHoogte * 0.6, 5);

  const gesorteerd = [...woorden].sort((a, b) => middenY(a) - middenY(b));

  const rijen = [];
  let huidigeRij = [];
  let huidigeY = null;
  for (const woord of gesorteerd) {
    const y = middenY(woord);
    if (huidigeY === null || Math.abs(y - huidigeY) <= drempel) {
      huidigeRij.push(woord);
      huidigeY = huidigeRij.reduce((s, w) => s + middenY(w), 0) / huidigeRij.length;
    } else {
      rijen.push(huidigeRij);
      huidigeRij = [woord];
      huidigeY = y;
    }
  }
  if (huidigeRij.length) rijen.push(huidigeRij);

  return rijen.map((rij) =>
    [...rij]
      .sort((a, b) => a.bbox.x0 - b.bbox.x0)
      .map((w) => w.tekst)
      .join(" ")
  );
}

function middenY(woord) {
  return (woord.bbox.y0 + woord.bbox.y1) / 2;
}
