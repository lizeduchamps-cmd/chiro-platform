// Kleurindicatie voor budgetgebruik: groen onder 80%, oranje tot 100%, rood erboven.
// Puur weergave — geen eigen data, enkel afgeleid van bestaande uitgegeven/budget-cijfers.
export function budgetKleurEmoji(uitgegeven, budget) {
  if (budget === null || budget === undefined || Number(budget) === 0) return null;
  const percentage = (Number(uitgegeven) / Number(budget)) * 100;
  if (percentage > 100) return "🔴";
  if (percentage >= 80) return "🟠";
  return "🟢";
}
