/**
 * Macchina a stati del geofence portuale, isolata per poter essere verificata
 * senza database né socket AIS.
 *
 * Anti-rimbalzo:
 *  - ingresso confermato solo dopo N campioni consecutivi dentro il raggio;
 *  - uscita valutata su un raggio maggiorato (isteresi) e confermata solo dopo
 *    un tempo minimo fuori area, così un glitch GPS non genera eventi.
 */

export interface GeofenceState {
  inside: boolean;
  entrySamples: number;
  exitSamples: number;
  insideSince: string | null;
  outsideSince: string | null;
  lastInsideTs: string | null;
}

export interface GeofenceConfig {
  portRadiusM: number;
  hysteresisPct: number;
  entryConfirmSamples: number;
  departureConfirmMinutes: number;
}

export type GeofenceEvent = "ENTRY" | "EXIT" | null;

export const EMPTY_GEOFENCE: GeofenceState = {
  inside: false,
  entrySamples: 0,
  exitSamples: 0,
  insideSince: null,
  outsideSince: null,
  lastInsideTs: null,
};

export function exitRadiusM(config: GeofenceConfig): number {
  return config.portRadiusM * (1 + config.hysteresisPct / 100);
}

export function stepGeofence(
  state: GeofenceState,
  distanceM: number,
  ts: string,
  config: GeofenceConfig,
): { state: GeofenceState; event: GeofenceEvent } {
  const next: GeofenceState = { ...state };
  const nowMs = Date.parse(ts);
  const entryRadius = config.portRadiusM;
  const exitRadius = exitRadiusM(config);

  if (!state.inside) {
    if (distanceM <= entryRadius) {
      next.entrySamples = state.entrySamples + 1;
      if (!next.insideSince) next.insideSince = ts;
      if (next.entrySamples >= Math.max(1, config.entryConfirmSamples)) {
        return {
          state: {
            inside: true,
            entrySamples: 0,
            exitSamples: 0,
            insideSince: next.insideSince ?? ts,
            outsideSince: null,
            lastInsideTs: ts,
          },
          event: "ENTRY",
        };
      }
      return { state: next, event: null };
    }

    // Fuori dal raggio di ingresso: la sequenza di conferma si interrompe.
    next.entrySamples = 0;
    if (state.insideSince) next.insideSince = null;
    return { state: next, event: null };
  }

  // inside === true
  if (distanceM >= exitRadius) {
    next.exitSamples = state.exitSamples + 1;
    if (!next.outsideSince) next.outsideSince = ts;
    const outsideMs = nowMs - Date.parse(next.outsideSince);
    const requiredMs = Math.max(0, config.departureConfirmMinutes) * 60_000;
    if (outsideMs >= requiredMs) {
      return {
        state: {
          inside: false,
          entrySamples: 0,
          exitSamples: 0,
          insideSince: null,
          outsideSince: null,
          lastInsideTs: state.lastInsideTs,
        },
        event: "EXIT",
      };
    }
    return { state: next, event: null };
  }

  // Rientro nell'area: annulla la procedura di uscita.
  next.exitSamples = 0;
  next.outsideSince = null;
  next.lastInsideTs = ts;
  return { state: next, event: null };
}

/**
 * Uscita confermata dal ticker quando non arrivano più posizioni:
 * la nave ha superato il raggio e il tempo di conferma è trascorso.
 */
export function shouldConfirmExitFromClock(
  state: Pick<GeofenceState, "inside" | "outsideSince">,
  nowMs: number,
  departureConfirmMinutes: number,
): boolean {
  if (!state.inside || !state.outsideSince) return false;
  const outsideMs = nowMs - Date.parse(state.outsideSince);
  if (!Number.isFinite(outsideMs)) return false;
  return outsideMs >= Math.max(0, departureConfirmMinutes) * 60_000;
}

export function shouldEmitSignalLoss(
  alreadyFlagged: boolean,
  lastSeen: string | null,
  nowMs: number,
  thresholdMinutes: number,
): boolean {
  if (alreadyFlagged || !lastSeen) return false;
  const last = Date.parse(lastSeen);
  if (!Number.isFinite(last)) return false;
  return nowMs - last >= thresholdMinutes * 60_000;
}

export function etaChangeExceeds(
  previous: string | null,
  next: string | null,
  thresholdMinutes: number,
): boolean {
  if (!previous || !next) return false;
  const diff = Math.abs(Date.parse(next) - Date.parse(previous));
  if (!Number.isFinite(diff)) return false;
  return diff / 60_000 >= thresholdMinutes;
}
