/** Costanti e funzioni geodetiche (distanze in metri/miglia nautiche). */

export const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Alias con cui gli equipaggi dichiarano Termini Imerese nel campo AIS
 * `Destination`. Il riconoscimento è volutamente permissivo ("TERMINI" copre
 * anche "TERMINI IMERESE (PA)"), ma non deve produrre falsi positivi.
 */
export const PORT_DESTINATION_ALIASES = [
  "TERMINI IMERESE",
  "TERMINI-IMERESE",
  "TERMINI IMERESE PA",
  "TERMINI IMERESE (PA)",
  "TERMINI",
  "ITTRI",
  "TERMINI IMERESE IT",
] as const;

export function destinationMatchesPort(destination: string | null | undefined): boolean {
  if (!destination) return false;
  const normalized = destination
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;
  if (normalized.includes("TERMINI") || normalized.includes("ITTRI")) return true;
  return PORT_DESTINATION_ALIASES.some((alias) =>
    normalized.includes(alias.toUpperCase().replace(/[^A-Z0-9]/g, " ").replace(/\s+/g, " ").trim()),
  );
}
export const METERS_PER_NM = 1852;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Distanza great-circle in metri. */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function distanceNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return distanceMeters(lat1, lon1, lat2, lon2) / METERS_PER_NM;
}

/** Rotta iniziale (bearing) dal punto 1 al punto 2, in gradi 0-360. */
export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Differenza angolare assoluta tra due rotte (0-180). */
export function angleDifference(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function isValidLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

/** Le coordinate AIS "non disponibili" sono 91/181: vanno scartate. */
export function hasUsablePosition(lat: unknown, lon: unknown): boolean {
  if (!isValidLatitude(lat) || !isValidLongitude(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  if (Math.abs(lat) >= 90 || Math.abs(lon) >= 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

export interface BoundingBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/**
 * Rettangolo geografico che contiene un cerchio di raggio dato.
 * Formato AISStream: [[[lat1, lon1], [lat2, lon2]]].
 */
export function boundingBoxFromCircle(
  lat: number,
  lon: number,
  radiusNm: number,
): BoundingBox {
  const latDelta = radiusNm / 60;
  const cosLat = Math.max(0.15, Math.cos(toRad(lat)));
  const lonDelta = radiusNm / (60 * cosLat);
  return {
    minLat: Math.max(-89, lat - latDelta),
    maxLat: Math.min(89, lat + latDelta),
    minLon: Math.max(-180, lon - lonDelta),
    maxLon: Math.min(180, lon + lonDelta),
  };
}

export function aisStreamBox(box: BoundingBox): [[number, number], [number, number]] {
  return [
    [box.minLat, box.minLon],
    [box.maxLat, box.maxLon],
  ];
}

export function cardinal(deg: number | null | undefined): string {
  if (deg === null || deg === undefined || !Number.isFinite(deg)) return "—";
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

export function formatDistanceNm(nm: number | null | undefined): string {
  if (nm === null || nm === undefined || !Number.isFinite(nm)) return "—";
  if (nm < 0.1) return "< 0,1 mn";
  if (nm < 10) return `${nm.toFixed(1).replace(".", ",")} mn`;
  return `${Math.round(nm)} mn`;
}

export function formatMeters(m: number): string {
  return m >= 1000 ? `${(m / METERS_PER_NM / 1000).toFixed(0)} k` : `${m} m`;
}

/**
 * Stima dell'arrivo: distanza residua / velocità fondata.
 * Restituisce null se la nave è ferma o i dati non sono utili.
 */
export function estimateArrival(
  distanceToPortNm: number,
  sogKts: number | null | undefined,
  now: Date = new Date(),
): { eta: string; hoursRemaining: number } | null {
  if (sogKts === null || sogKts === undefined || !Number.isFinite(sogKts)) return null;
  if (sogKts < 0.5) return null;
  if (!Number.isFinite(distanceToPortNm) || distanceToPortNm < 0.1) return null;
  const hours = distanceToPortNm / sogKts;
  if (hours > 24 * 30) return null;
  return {
    eta: new Date(now.getTime() + hours * 3600_000).toISOString(),
    hoursRemaining: hours,
  };
}
