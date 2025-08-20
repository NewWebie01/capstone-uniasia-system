// src/utils/formatPH.ts
export function formatPH(input?: string | number | Date) {
  // Accepts a Date, a timestamp string (e.g. "2025-08-20T03:27:00.000Z"),
  // a millis number, or nothing (-> now)
  const d =
    input instanceof Date
      ? input
      : input === undefined
      ? new Date()
      : new Date(input);

  // Guard: invalid dates become a dash
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",     // ⬅️ force PH time
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}
