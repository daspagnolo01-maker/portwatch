import type { BoundingBox } from "../geo";
import type { NormalizedPosition, NormalizedStatic } from "./types";

/**
 * Fonte AIS dell'istanza ospitata: aiscast (Open Waters AIS), endpoint REST.
 *
 * Su Cloudflare Workers non esiste un processo persistente in cui tenere aperto
 * un WebSocket: si usa quindi il polling di
 *   GET https://ais.openwaters.io/v1/vessels?bbox=minLat,minLon,maxLat,maxLon
 * che restituisce una FeatureCollection GeoJSON delle navi attualmente in vista
 * (nessun token, limite anonimo 120 richieste/minuto e 100 gradi quadri/richiesta).
 *
 * Campi reali verificati sul servizio (2026-11-09):
 *   beam, callsign, cog, destination, draught, eta, flag, heading, imo, kind,
 *   length, mmsi, msg_type, name, nav_status, seen, sog, source, station,
 *   to_bow, to_port, to_starboard, to_stern, type
 * con `geometry.coordinates = [lon, lat]` e `seen` in ISO 8601.
 *
 * Obbligo di licenza: i dati vanno mostrati citando «Open Waters AIS» e, per i
 * messaggi di provenienza AISHub (`source: "aishub"`), i contributori AISHub.
 */
export const AISCAST_LABEL = "aiscast (Open Waters)";

/** Area massima per una singola richiesta anonima (gradi quadri). */
export const AISCAST_MAX_AREA_DEG2 = 100;

export interface AiscastFeature {
  type?: string;
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}

export function areaUrl(box: BoundingBox): string {
  const base = (process.env.AISCAST_REST_URL ?? "").trim() || "https://ais.openwaters.io/v1/vessels";
  const bbox = [box.minLat, box.minLon, box.maxLat, box.maxLon]
    .map((value) => value.toFixed(4))
    .join(",");
  return `${base}?bbox=${bbox}`;
}

/** Area in gradi quadri: serve a restare nel limite anonimo del servizio. */
export function areaDegrees(box: BoundingBox): number {
  return Math.abs(box.maxLat - box.minLat) * Math.abs(box.maxLon - box.minLon);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/@/g, " ").replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function digits(value: unknown, length?: number): string | null {
  const text = String(value ?? "").replace(/\D/g, "");
  if (!text) return null;
  if (length !== undefined && text.length !== length) return null;
  return text;
}

/**
 * Converte una feature GeoJSON di aiscast in posizione + dati statici.
 * Funzione pura: usata dal polling e dai test, senza rete né database.
 */
export function vesselFromFeature(feature: AiscastFeature): {
  position: NormalizedPosition;
  statics: NormalizedStatic;
} | null {
  const props = feature.properties ?? {};
  if (typeof props.kind === "string" && props.kind !== "vessel") return null;

  const mmsi = digits(props.mmsi, 9);
  if (!mmsi) return null;

  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const [lon, lat] = coordinates;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (lat === 0 && lon === 0) return null;

  const sogRaw = numberOrNull(props.sog);
  // 102.3 kn = "non disponibile" nel protocollo AIS.
  const sog = sogRaw !== null && sogRaw >= 0 && sogRaw < 102.2 ? sogRaw : null;
  const cogRaw = numberOrNull(props.cog);
  const cog = cogRaw !== null && cogRaw >= 0 && cogRaw < 360 ? cogRaw : null;
  const headingRaw = numberOrNull(props.heading);
  const heading = headingRaw !== null && headingRaw >= 0 && headingRaw < 360 ? headingRaw : null;
  const navStatus = numberOrNull(props.nav_status);

  const seen = typeof props.seen === "string" && Number.isFinite(Date.parse(props.seen))
    ? new Date(props.seen).toISOString()
    : new Date().toISOString();

  const toBow = numberOrNull(props.to_bow);
  const toStern = numberOrNull(props.to_stern);
  const toPort = numberOrNull(props.to_port);
  const toStarboard = numberOrNull(props.to_starboard);
  const lengthM =
    numberOrNull(props.length) ?? (toBow !== null && toStern !== null ? toBow + toStern : null);
  const beamM =
    numberOrNull(props.beam) ?? (toPort !== null && toStarboard !== null ? toPort + toStarboard : null);

  return {
    position: {
      mmsi,
      name: textOrNull(props.name),
      lat,
      lon,
      sog,
      cog,
      heading,
      navStatus,
      ts: seen,
      messageType: typeof props.msg_type === "string" ? props.msg_type : "PositionReport",
    },
    statics: {
      mmsi,
      imo: digits(props.imo),
      name: textOrNull(props.name),
      callsign: textOrNull(props.callsign),
      shipTypeCode: numberOrNull(props.type),
      lengthM: lengthM !== null && lengthM > 5 ? lengthM : null,
      beamM: beamM !== null && beamM > 2 ? beamM : null,
      draughtM: numberOrNull(props.draught),
      destination: textOrNull(props.destination),
      // aiscast espone l'ETA come stringa "MM-DD HH:mm": non è convertibile con
      // certezza in un istante ISO, quindi non viene inventata.
      eta: null,
      aisClass: "",
    },
  };
}

/** Etichetta di provenienza da mostrare in UI (attribuzione dei dati). */
export function sourceLabel(source: unknown): string {
  if (source === "aishub") return "AISHub";
  if (typeof source === "string" && source.length > 0) return source;
  return "Open Waters AIS";
}

export interface FetchAreaResult {
  ok: boolean;
  vessels: AiscastFeature[];
  error?: string;
  status?: number;
}

/** Legge le navi attualmente nell'area. Nessun token, nessun WebSocket. */
export async function fetchArea(box: BoundingBox, timeoutMs = 12_000): Promise<FetchAreaResult> {
  try {
    const response = await fetch(areaUrl(box), {
      headers: { Accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        vessels: [],
        status: response.status,
        error: `aiscast ha risposto ${response.status}`,
      };
    }
    const payload = (await response.json()) as { features?: AiscastFeature[]; error?: string };
    if (payload.error) return { ok: false, vessels: [], error: String(payload.error) };
    return { ok: true, vessels: Array.isArray(payload.features) ? payload.features : [] };
  } catch (error) {
    return {
      ok: false,
      vessels: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
