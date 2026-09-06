/**
 * Money helpers. Contract: every money value is { amount: <integer>, currency: "KES" },
 * amount is whole Kenyan shillings (no subunit).
 */

export function formatMoney(money) {
  if (money == null) return '';
  const amount = typeof money === 'number' ? money : money.amount;
  const currency = typeof money === 'number' ? 'KES' : money.currency || 'KES';
  if (amount == null || Number.isNaN(Number(amount))) return '';
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-KE', { maximumFractionDigits: 0 });
  const sign = amount < 0 ? '−' : '';
  return `${sign}${currency} ${formatted}`;
}

/** "Save KES X" amount from a price + compareAtPrice pair. */
export function saving(price, compareAt) {
  if (!price || !compareAt) return null;
  const diff = compareAt.amount - price.amount;
  if (diff <= 0) return null;
  return { amount: diff, currency: price.currency || 'KES' };
}
