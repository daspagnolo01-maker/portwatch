import { all, one, run } from "../db";
import { getSettings } from "../settings";
import { boundingBoxFromCircle, type BoundingBox } from "../geo";
import { nowIso } from "../time";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AISCAST_LABEL, areaDegrees, fetchArea, vesselFromFeature } from "./aiscast";
import { ingestPosition, ingestStatic, processPendingExits, processSignalLosses, prunePositions } from "./ingest";

/**
 * Stato e ciclo di aggiornamento AIS dell'istanza ospitata.
 *
 * Non esiste un processo persistente: `refreshArea()` viene eseguito su richiesta
 * (in background con `waitUntil`) al massimo una volta ogni `POLL_MIN_SECONDS`, cioè
 * ogni 15 minuti: la prima visita dopo la finestra avvia un nuovo ciclo.
 * I contatori e l'esito dell'ultimo ciclo sono persistiti in `app_meta`, così
 * sopravvivono al riavvio degli isolate.
 */
export type AisState =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "error"
  | "no_key"
  | "idle"
  | "stopped";

export interface AisSourceStatus {
  id: string;
  label: string;
  state: AisState;
  messages: number;
  positionReports: number;
  staticReports: number;
  lastMessageAt: string | null;
  error: string | null;
}

export interface AisStatus {
  state: AisState;
  since: string;
  lastMessageAt: string | null;
  messages: number;
  positionReports: number;
  staticReports: number;
  compression: boolean | null;
  error: string | null;
  attempts: number;
  subscription: BoundingBox | null;
  subscriptionAt: string | null;
  apiKeyConfigured: boolean;
  nextRetryAt: string | null;
  connectedForSeconds: number | null;
  activeSource: string | null;
  activeSourceLabel: string | null;
  sources: AisSourceStatus[];
  lastPollAt: string | null;
  lastTickAt: string | null;
  lastTickSummary: string | null;
}

export interface AisLogEntry {
  ts: string;
  message: string;
  level: "info" | "warning" | "error";
}

const META_KEY = "ais_runtime_state";
const LOG_KEY = "ais_runtime_logs";
/** Cadenza del polling dell'area: 15 minuti (impostata su richiesta dell'operatore). */
export const POLL_MIN_SECONDS = 900;
/** Oltre questa età dell'ultimo ciclo lo stato non è più considerato aggiornato. */
const STALE_SECONDS = POLL_MIN_SECONDS * 3;
const PRUNE_EVERY_MS = 3600_000;
const MAX_VESSELS_PER_POLL = 150;
const LOG_LIMIT = 40;

interface PersistedState {
  startedAt: string;
  polls: number;
  messages: number;
  positionReports: number;
  staticReports: number;
  lastMessageAt: string | null;
  lastPollAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastTickAt: string | null;
  lastTickSummary: string | null;
  lastPruneAt: string | null;
}

const EMPTY_STATE: PersistedState = {
  startedAt: "",
  polls: 0,
  messages: 0,
  positionReports: 0,
  staticReports: 0,
  lastMessageAt: null,
  lastPollAt: null,
  lastError: null,
  lastErrorAt: null,
  lastTickAt: null,
  lastTickSummary: null,
  lastPruneAt: null,
};

async function loadState(): Promise<PersistedState> {
  const row = await one<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", META_KEY);
  if (!row) return { ...EMPTY_STATE };
  try {
    const parsed = JSON.parse(row.value) as Partial<PersistedState>;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return { ...EMPTY_STATE };
  }
}

async function saveState(state: PersistedState): Promise<void> {
  await run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    META_KEY,
    JSON.stringify(state),
  );
}

async function appendLog(entry: AisLogEntry): Promise<void> {
  const row = await one<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", LOG_KEY);
  let entries: AisLogEntry[] = [];
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) entries = parsed as AisLogEntry[];
    } catch {
      entries = [];
    }
  }
  entries.unshift(entry);
  const trimmed = entries.slice(0, LOG_LIMIT);
  await run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    LOG_KEY,
    JSON.stringify(trimmed),
  );
}

export async function getAisLogs(limit = 20): Promise<AisLogEntry[]> {
  const row = await one<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", LOG_KEY);
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as AisLogEntry[]).slice(0, limit) : [];
  } catch {
    return [];
  }
}

function apiKeyConfigured(): boolean {
  return Boolean((process.env.AISSTREAM_API_KEY ?? "").trim());
}

export async function getAisStatus(): Promise<AisStatus> {
  const [state, settings] = await Promise.all([loadState(), getSettings()]);
  const box = boundingBoxFromCircle(settings.centerLat, settings.centerLon, settings.monitorRadiusNm);
  const pollAgeSeconds = state.lastPollAt
    ? Math.round((Date.now() - Date.parse(state.lastPollAt)) / 1000)
    : null;

  const fresh = pollAgeSeconds !== null && pollAgeSeconds <= STALE_SECONDS;
  const state_label: AisState = !state.lastPollAt
    ? "idle"
    : fresh
      ? state.lastError
        ? "error"
        : "connected"
      : "stopped";

  const aiscast: AisSourceStatus = {
    id: "aiscast",
    label: `${AISCAST_LABEL} · REST`,
    state: state_label === "connected" ? "connected" : state_label,
    messages: state.messages,
    positionReports: state.positionReports,
    staticReports: state.staticReports,
    lastMessageAt: state.lastMessageAt,
    error: state.lastError,
  };

  const aisstream: AisSourceStatus = {
    id: "aisstream",
    label: "AISStream (stream WebSocket)",
    // Lo stream persistente non può esistere in un Worker: lo dichiariamo,
    // invece di mostrare una connessione che non c'è.
    state: "idle",
    messages: 0,
    positionReports: 0,
    staticReports: 0,
    lastMessageAt: null,
    error: "non disponibile nell'istanza Workers (richiede un processo persistente)",
  };

  return {
    state: state_label,
    since: state.startedAt || state.lastPollAt || nowIso(),
    lastMessageAt: state.lastMessageAt,
    messages: state.messages,
    positionReports: state.positionReports,
    staticReports: state.staticReports,
    compression: null,
    error: state.lastError,
    attempts: state.polls,
    subscription: box,
    subscriptionAt: state.lastPollAt,
    apiKeyConfigured: apiKeyConfigured(),
    nextRetryAt: null,
    connectedForSeconds: state_label === "connected" ? pollAgeSeconds : null,
    activeSource: state.messages > 0 ? "aiscast" : null,
    activeSourceLabel: state.messages > 0 ? AISCAST_LABEL : null,
    sources: [aiscast, aisstream],
    lastPollAt: state.lastPollAt,
    lastTickAt: state.lastTickAt,
    lastTickSummary: state.lastTickSummary,
  };
}

export interface RefreshResult {
  ok: boolean;
  skipped?: boolean;
  vessels: number;
  positions: number;
  statics: number;
  error?: string;
}

let inFlight: Promise<RefreshResult> | null = null;

/**
 * Un ciclo di aggiornamento dell'area: legge aiscast via REST, applica le navi
 * al database (posizioni, dati statici, geofence, eventi) e salva l'esito.
 */
export async function refreshArea(options: { force?: boolean } = {}): Promise<RefreshResult> {
  if (inFlight) return inFlight;

  inFlight = runRefresh(options.force === true).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runRefresh(force: boolean): Promise<RefreshResult> {
  const settings = await getSettings();
  const state = await loadState();

  const box = boundingBoxFromCircle(settings.centerLat, settings.centerLon, settings.monitorRadiusNm);
  if (areaDegrees(box) > 100) {
    return { ok: false, vessels: 0, positions: 0, statics: 0, error: "area richiesta oltre il limite anonimo (100 gradi²)" };
  }

  if (!force && state.lastPollAt) {
    const age = (Date.now() - Date.parse(state.lastPollAt)) / 1000;
    if (age >= 0 && age < POLL_MIN_SECONDS) {
      return { ok: true, skipped: true, vessels: 0, positions: 0, statics: 0 };
    }
  }

  const fetched = await fetchArea(box);
  const polledAt = nowIso();

  if (!fetched.ok) {
    const next: PersistedState = {
      ...state,
      startedAt: state.startedAt || polledAt,
      polls: state.polls + 1,
      lastPollAt: polledAt,
      lastError: fetched.error ?? "errore sconosciuto aiscast",
      lastErrorAt: polledAt,
    };
    await saveState(next);
    await appendLog({ ts: polledAt, message: `Polling area non riuscito: ${next.lastError}`, level: "error" });
    return { ok: false, vessels: 0, positions: 0, statics: 0, error: next.lastError ?? undefined };
  }

  // Le più recenti prima: se l'area è affollata si aggiornano le navi viste ora.
  const sorted = [...fetched.vessels].sort((a, b) => {
    const aSeen = Date.parse(String(a.properties?.seen ?? "")) || 0;
    const bSeen = Date.parse(String(b.properties?.seen ?? "")) || 0;
    return bSeen - aSeen;
  });

  let positions = 0;
  let statics = 0;
  let seenAt: string | null = null;
  for (const feature of sorted.slice(0, MAX_VESSELS_PER_POLL)) {
    const mapped = vesselFromFeature(feature);
    if (!mapped) continue;
    await ingestStatic(mapped.statics);
    await ingestPosition(mapped.position);
    statics += 1;
    positions += 1;
    if (!seenAt || mapped.position.ts > seenAt) seenAt = mapped.position.ts;
  }

  const lost = await processSignalLosses();
  const exits = await processPendingExits();

  let pruned = 0;
  if (!state.lastPruneAt || Date.now() - Date.parse(state.lastPruneAt) > PRUNE_EVERY_MS) {
    pruned = await prunePositions();
  }

  const summary = `${positions} navi aggiornate · ${exits} uscite · ${lost} perdite segnale${
    pruned > 0 ? ` · ${pruned} posizioni rimosse` : ""
  }`;

  const next: PersistedState = {
    ...state,
    startedAt: state.startedAt || polledAt,
    polls: state.polls + 1,
    messages: state.messages + positions,
    positionReports: state.positionReports + positions,
    staticReports: state.staticReports + statics,
    lastMessageAt: seenAt ?? state.lastMessageAt,
    lastPollAt: polledAt,
    lastError: null,
    lastErrorAt: null,
    lastTickAt: polledAt,
    lastTickSummary: summary,
    lastPruneAt: pruned > 0 ? polledAt : state.lastPruneAt,
  };
  await saveState(next);
  await appendLog({ ts: polledAt, message: `Polling area completato: ${summary}`, level: "info" });

  return { ok: true, vessels: positions, positions, statics };
}

/**
 * Esegue il polling in background senza bloccare la risposta HTTP.
 * `ctx.waitUntil` esiste solo nel runtime Workers; altrove si attende.
 */
export async function scheduleAreaRefresh(options: { force?: boolean } = {}): Promise<void> {
  try {
    const context = await getCloudflareContext({ async: true });
    const waitUntil = (context as { ctx?: { waitUntil?: (promise: Promise<unknown>) => void } }).ctx?.waitUntil;
    if (typeof waitUntil === "function") {
      waitUntil(refreshArea(options));
      return;
    }
  } catch {
    /* contesto non disponibile: si prosegue in modo sincrono */
  }
  await refreshArea(options);
}

/**
 * Primo caricamento dell'istanza: se il database non contiene ancora nessun
 * ciclo AIS, lo esegue subito così la dashboard non parte con i contatori a zero.
 */
export async function ensureInitialPoll(): Promise<void> {
  const state = await loadState();
  if (state.lastPollAt) return;
  await refreshArea();
}

/** Il pulsante "Riconnetti" forza un nuovo polling ignorando la finestra di throttle. */
export async function requestReconnect(): Promise<RefreshResult> {
  return refreshArea({ force: true });
}

/** Solo per diagnostica: numero di posizioni archiviate. */
export async function storedPositions(): Promise<number> {
  const rows = await all<{ n: number }>("SELECT COUNT(*) AS n FROM positions");
  return rows[0]?.n ?? 0;
}
