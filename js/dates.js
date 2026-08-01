// Dates, in the user's own timezone.
//
// Everything here deliberately avoids `toISOString()`. That method is UTC, and
// this is an app you open in the evening after training: at 7:30pm in Los
// Angeles UTC has already rolled over, so a class logged on the drive home was
// filed on *tomorrow*; east of UTC a morning class landed on *yesterday*. The
// date reaches the markdown filename and every query the map and the calendar
// run, so it has to be the date on the user's wall clock, not Greenwich's.
//
// Dates are handled as 'YYYY-MM-DD' strings throughout. They sort correctly as
// strings, which is why `date >= cutoff` works all over store.js.

/** A Date → 'YYYY-MM-DD', read off local time. */
export const localISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayISO = () => localISO();

/** 'YYYY-MM-DD' → a Date at local midnight (never UTC midnight). */
export const parseISO = iso => new Date(iso + 'T00:00:00');

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return localISO(d);
}

/** Whole days from `a` to `b`. Uses local noon, so a DST shift can't round to 0. */
export function daysBetween(a, b) {
  const at = new Date(a + 'T12:00:00'), bt = new Date(b + 'T12:00:00');
  return Math.round((bt - at) / 864e5);
}

/** 0 = Monday … 6 = Sunday. Weeks start Monday; the gym week does too. */
export const dayOfWeek = iso => (parseISO(iso).getDay() + 6) % 7;

/** The Monday of the week `iso` falls in — a stable key for "which week". */
export const weekOf = iso => addDays(iso, -dayOfWeek(iso));

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY-MM' → 'March 2026'. */
export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** The 'YYYY-MM' months ending at `today`, oldest first. */
export function recentMonths(n, today = todayISO()) {
  const [y, m] = today.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** 'YYYY-MM' ± n months. Rolls the year over, so December + 1 is January. */
export function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The month a date falls in. */
export const monthOf = iso => iso.slice(0, 7);

/**
 * The day cells of a month, padded so the first row starts on a Monday.
 * Leading blanks are null, which is what the grid renders as an empty cell.
 */
export function monthGrid(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const cells = new Array((first.getDay() + 6) % 7).fill(null);
  for (let day = 1; day <= days; day++) cells.push(localISO(new Date(y, m - 1, day)));
  return cells;
}
