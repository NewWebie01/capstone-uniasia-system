// lib/datetimePH.ts
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
