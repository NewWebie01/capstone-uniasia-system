// lib/datetimePH.ts

// ----- KEEPING YOUR ORIGINALS (unchanged) -----
export function parseDbDate(s: string) {
  if (!s) return new Date(NaN);
  if (/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) return new Date(s);

  const m = s
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, yy, MM, dd, hh, mm, ss] = m;
    const y = Number(yy);
    const mo = Number(MM) - 1;
    const d = Number(dd);
    const H = Number(hh);
    const M = Number(mm);
    const S = Number(ss || "0");
    const PH_OFFSET_MS = 8 * 3600 * 1000;
    return new Date(Date.UTC(y, mo, d, H, M, S) - PH_OFFSET_MS);
  }
  return new Date(s);
}

export function formatPHDate(dateString: string): string {
  const d = parseDbDate(dateString);
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(d);
}

export function formatPHTime(dateString: string): string {
  const d = parseDbDate(dateString);
  return new Intl.DateTimeFormat("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  }).format(d);
}

// ----- NEW HELPERS -----

export function getPHISOString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const Y = get("year");
  const M = get("month");
  const D = get("day");
  const h = get("hour");
  const m = get("minute");
  const s = get("second");

  // Manila is always UTC+08:00 (no DST)
  return `${Y}-${M}-${D}T${h}:${m}:${s}+08:00`;
}

export function formatPHISODate(input: string | Date): string {
  const d = input instanceof Date ? input : parseDbDate(input);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const Y = get("year");
  const M = get("month");
  const D = get("day");
  return `${Y}-${M}-${D}`;
}
