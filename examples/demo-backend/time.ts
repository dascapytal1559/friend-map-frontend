// Local days and times in the backend's time zone, the one its handshake names: the contract's days (YYYY-MM-DD) and
// times of day (HH:MM) are that zone's, and its moments are milliseconds since the epoch.

const QUARTER = 15 * 60_000;

/**
 * A moment's local day (YYYY-MM-DD) in `timeZone`. Every zone's offset is a whole number of quarter hours, so the day
 * is worked out once per quarter hour and kept.
 */
export function localDays(timeZone: string): (at: number) => string {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const kept = new Map<number, string>();
  return (at) => {
    const quarter = Math.floor(at / QUARTER);
    let day = kept.get(quarter);
    if (day === undefined) kept.set(quarter, (day = format.format(quarter * QUARTER)));
    return day;
  };
}

/** The moment of a local day and time (HH:MM; the day's start without one) in `timeZone`. */
export function localMoment(day: string, time: string | null, timeZone: string): number {
  const format = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  // How far `timeZone`'s clock is ahead of UTC at a moment.
  const offset = (at: number) => {
    const part = Object.fromEntries(format.formatToParts(at).map((p) => [p.type, Number(p.value)]));
    return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute) - Math.floor(at / 60_000) * 60_000;
  };
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = (time ?? "00:00").split(":").map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  // The offset at the wall time read as UTC, then at the moment that gives, which is right across a change of clocks.
  return wall - offset(wall - offset(wall));
}
