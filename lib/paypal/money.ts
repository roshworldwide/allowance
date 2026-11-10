// Money is integer cents everywhere in ALLOWANCE. PayPal sends and receives decimal strings
// ("12.34"); these two functions are the only place the formats meet. No floating point.

export type Money = { currency_code: string; value: string };

export function centsToValue(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError(`Invalid cents amount: ${cents}`);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return `${whole}.${frac.toString().padStart(2, '0')}`;
}

export function valueToCents(value: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new RangeError(`Invalid PayPal amount: "${value}"`);
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100 + frac;
  if (!Number.isSafeInteger(cents)) throw new RangeError(`Amount out of range: "${value}"`);
  return cents;
}

export const usd = (cents: number): Money => ({ currency_code: 'USD', value: centsToValue(cents) });

/** "$12.34" for UI and logs. */
export function formatUsd(cents: number): string {
  return `$${centsToValue(cents).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}
