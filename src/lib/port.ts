import { PORT_DESTINATION_ALIASES } from "./geo";

/**
 * Configurazione del porto di Termini Imerese.
 * Coordinate: 37°59'09.86"N 13°42'15.12"E — 37.9860726 / 13.7041999
 * (Porto commerciale, Autorità di Sistema Portuale del Mare di Sicilia Occidentale)
 * UN/LOCODE: ITTRI
 */
export const PORT = {
  name: "Porto di Termini Imerese",
  shortName: "Termini Imerese",
  locode: "ITTRI",
  lat: 37.9860726,
  lon: 13.7041999,
  timezone: "Europe/Rome",
  country: "Italia",
  /** Alias con cui gli equipaggi dichiarano la destinazione nei messaggi AIS. */
  destinationAliases: [...PORT_DESTINATION_ALIASES],
} as const;

export type Severity = "info" | "warning" | "critical";

/** Ordine di severità usato per la soglia di invio delle notifiche. */
export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export interface AppSettings {
  /** Centro dell'area monitorata (default: porto, modificabile dall'operatore). */
  centerLat: number;
  centerLon: number;
  /** Raggio dell'area monitorata in miglia nautiche (subscription AIS). */
  monitorRadiusNm: number;
  /** Raggio dell'area portuale considerata "in porto" (metri). */
  portRadiusM: number;
  /** Raggio di avvicinamento, in miglia nautiche. */
  approachRadiusNm: number;
  /** Minuti senza messaggi AIS prima di dichiarare la perdita di segnale. */
  signalLossMinutes: number;
  /** Minuti fuori area portuale prima di confermare una partenza. */
  departureConfirmMinutes: number;
  /** Campioni consecutivi dentro l'area richiesti per confermare un ingresso. */
  entryConfirmSamples: number;
  /** Isteresi percentuale sul raggio di uscita (anti rimbalzo GPS). */
  exitHysteresisPct: number;
  /** Variazione minima dell'ETA dichiarata (minuti) per generare un avviso. */
  etaChangeMinutes: number;
  /** Finestra di deduplica per eventi dello stesso tipo sulla stessa nave. */
  eventDedupeMinutes: number;
  /** Giorni di conservazione delle posizioni AIS. */
  positionRetentionDays: number;
  /** Interruttore generale delle notifiche. */
  notificationsEnabled: boolean;
  /** Invio email abilitato (richiede EMAIL_API_KEY configurata). */
  emailEnabled: boolean;
  /** Severità minima per l'invio email. */
  minSeverity: Severity;
}

export const DEFAULT_SETTINGS: AppSettings = {
  centerLat: PORT.lat,
  centerLon: PORT.lon,
  monitorRadiusNm: 40,
  portRadiusM: 1200,
  approachRadiusNm: 12,
  signalLossMinutes: 20,
  departureConfirmMinutes: 10,
  entryConfirmSamples: 2,
  exitHysteresisPct: 15,
  etaChangeMinutes: 60,
  eventDedupeMinutes: 45,
  positionRetentionDays: 90,
  notificationsEnabled: true,
  emailEnabled: true,
  minSeverity: "info",
};

export const SETTING_LIMITS = {
  monitorRadiusNm: { min: 5, max: 200 },
  portRadiusM: { min: 300, max: 10000 },
  approachRadiusNm: { min: 2, max: 100 },
  signalLossMinutes: { min: 5, max: 720 },
  departureConfirmMinutes: { min: 1, max: 240 },
  entryConfirmSamples: { min: 1, max: 6 },
  exitHysteresisPct: { min: 0, max: 100 },
  etaChangeMinutes: { min: 5, max: 1440 },
  eventDedupeMinutes: { min: 0, max: 1440 },
  positionRetentionDays: { min: 1, max: 3650 },
} as const;

export const EVENT_TYPE_LABELS: Record<string, string> = {
  ENTRY: "Ingresso in area portuale",
  EXIT: "Uscita dall'area portuale",
  APPROACH: "Avvicinamento al porto",
  ETA_CHANGE: "Variazione ETA",
  SIGNAL_LOST: "Perdita segnale AIS",
  SIGNAL_RESTORED: "Segnale AIS ripristinato",
  CALL_OPENED: "Nuova attesa registrata",
};

export const EVENT_TYPE_ICONS: Record<string, string> = {
  ENTRY: "▼",
  EXIT: "▲",
  APPROACH: "◎",
  ETA_CHANGE: "⏱",
  SIGNAL_LOST: "⚠",
  SIGNAL_RESTORED: "✓",
  CALL_OPENED: "＋",
};
