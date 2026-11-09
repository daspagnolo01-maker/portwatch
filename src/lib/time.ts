/** Fuso orario di riferimento del porto (coerente con PORT.timezone). */
export const TZ = "Europe/Rome";

export function nowIso(): string {
  return new Date().toISOString();
}

export function isoIn(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString();
}

export function minutesBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return (tb - ta) / 60_000;
}

export function minutesSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return (now - ts) / 60_000;
}

const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: TZ,
  day: "2-digit",
  month: "short",
});

const weekdayFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: TZ,
  weekday: "short",
  day: "2-digit",
  month: "short",
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return dateTimeFormatter.format(new Date(ts)).replace(",", "");
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return timeFormatter.format(new Date(ts));
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return dayFormatter.format(new Date(ts));
}

export function formatWeekday(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return weekdayFormatter.format(new Date(ts));
}

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, dateStyle: "short" }).format(new Date(ts));
}

/** "tra 12 min", "2 h 15 min fa" — solo per uso client-side. */
export function relativeFromNow(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const diff = ts - now;
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "" : " fa";
  const prefix = diff >= 0 ? "tra " : "";
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${prefix}${minutes} min${suffix}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return `${prefix}${hours} h${rest ? ` ${rest} min` : ""}${suffix}`;
  const days = Math.floor(hours / 24);
  return `${prefix}${days} g${suffix}`;
}

/**
 * L'ETA AIS è priva dell'anno: si ricostruisce prendendo l'occorrenza più vicina
 * al momento di ricezione. Valori fuori range (mese 0, ora 24, ...) = non valido.
 */
export function parseAisEta(
  eta: { Month?: number; Day?: number; Hour?: number; Minute?: number } | null | undefined,
  reference: Date = new Date(),
): string | null {
  if (!eta) return null;
  const month = Number(eta.Month);
  const day = Number(eta.Day);
  const hour = Number(eta.Hour);
  const minute = Number(eta.Minute);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  // L'ETA AIS è espressa in UTC e indica sempre un arrivo previsto: se la data
  // ricostruita è già passata da più di due giorni, appartiene all'anno seguente.
  const year = reference.getUTCFullYear();
  let candidate = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(candidate)) return null;
  if (candidate < reference.getTime() - 2 * 24 * 3600_000) {
    candidate = Date.UTC(year + 1, month - 1, day, hour, minute);
  }
  return new Date(candidate).toISOString();
}

export function startOfDayIso(daysAgo = 0): string {
  const now = new Date();
  const shifted = new Date(now.getTime() - daysAgo * 24 * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return shifted.toISOString();
}
