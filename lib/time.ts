// Deterministic date labels in IST: the same string on the server and in every browser, whatever their
// locale or time zone, so server-rendered dates never cause a hydration mismatch.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 330 * 60_000;

const ist = (t: string | number | Date) => new Date(new Date(t).getTime() + IST_OFFSET_MS);

/** "30 Nov" */
export function istDayMonth(t: string | number | Date): string {
  const d = ist(t);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** "11 Nov, 09:13 AM" */
export function istStamp(t: string | number | Date): string {
  const d = ist(t);
  const h = d.getUTCHours();
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${String(h % 12 || 12).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
