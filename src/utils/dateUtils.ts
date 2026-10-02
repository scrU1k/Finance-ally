/**
 * dateUtils.ts
 * Timezone-safe local calendar date utilities.
 * Avoids UTC day-shift bugs caused by new Date().toISOString() in non-UTC time zones.
 */

/**
 * Returns a 'YYYY-MM-DD' string for the given date in local device calendar time.
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns a 'YYYY-MM' string for the given date in local device calendar time.
 */
export function getLocalMonthKey(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Calculates local Monday and Sunday calendar date strings for the week containing targetDateStr ('YYYY-MM-DD').
 * Operates purely on local year, month, and day to prevent any UTC boundary drift.
 */
export function getWeekDateBounds(targetDateStr: string): { monStr: string; sunStr: string; weekNo: number } {
  const [y, m, d] = targetDateStr.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  const dayOfWeek = targetDate.getDay(); // 0 is Sunday, 1 is Monday
  const diffToMonday = targetDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);

  const monday = new Date(y, m - 1, diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

  // Compute ISO Week number using local calendar math
  const tempDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
  const yearStart = new Date(tempDate.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return {
    monStr: getLocalDateString(monday),
    sunStr: getLocalDateString(sunday),
    weekNo,
  };
}

/**
 * Safely parses a 'YYYY-MM-DD' string into a local Date instance set at 00:00:00 local time.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
