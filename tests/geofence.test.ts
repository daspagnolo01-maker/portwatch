import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_GEOFENCE,
  etaChangeExceeds,
  exitRadiusM,
  shouldConfirmExitFromClock,
  shouldEmitSignalLoss,
  stepGeofence,
  type GeofenceConfig,
  type GeofenceState,
} from "../src/lib/domain/geofence.ts";

const CONFIG: GeofenceConfig = {
  portRadiusM: 1200,
  hysteresisPct: 15,
  entryConfirmSamples: 2,
  departureConfirmMinutes: 10,
};

const T0 = Date.UTC(2026, 10, 6, 12, 0, 0);

function at(minutes: number): string {
  return new Date(T0 + minutes * 60_000).toISOString();
}

function enterPort(): GeofenceState {
  const first = stepGeofence(EMPTY_GEOFENCE, 400, at(0), CONFIG);
  const second = stepGeofence(first.state, 380, at(1), CONFIG);
  assert.equal(second.event, "ENTRY");
  return second.state;
}

test("un solo campione dentro il raggio non genera un ingresso", () => {
  const step = stepGeofence(EMPTY_GEOFENCE, 500, at(0), CONFIG);
  assert.equal(step.event, null);
  assert.equal(step.state.inside, false);
  assert.equal(step.state.entrySamples, 1);
});

test("l'ingresso viene confermato dopo i campioni consecutivi richiesti", () => {
  const state = enterPort();
  assert.equal(state.inside, true);
  assert.equal(state.entrySamples, 0);
  assert.equal(state.insideSince, at(0), "l'ATA usa il primo campione dentro l'area");
});

test("un rimbalzo GPS non produce un ingresso", () => {
  const first = stepGeofence(EMPTY_GEOFENCE, 300, at(0), CONFIG);
  const second = stepGeofence(first.state, 4000, at(1), CONFIG);
  assert.equal(second.event, null);
  assert.equal(second.state.entrySamples, 0);
  assert.equal(second.state.insideSince, null);
});

test("l'uscita rispetta isteresi e tempo di conferma", () => {
  const inside = enterPort();
  const hysteresisRadius = exitRadiusM(CONFIG);
  assert.ok(hysteresisRadius > CONFIG.portRadiusM);

  // Appena fuori dal raggio di ingresso ma dentro l'isteresi: nessuna uscita.
  const withinHysteresis = stepGeofence(inside, 1300, at(2), CONFIG);
  assert.equal(withinHysteresis.event, null);
  assert.equal(withinHysteresis.state.inside, true);

  // Oltre il raggio di uscita: parte il conteggio, ma serve il tempo minimo.
  const outsideStart = stepGeofence(withinHysteresis.state, 1500, at(3), CONFIG);
  assert.equal(outsideStart.event, null);
  assert.equal(outsideStart.state.inside, true);
  assert.equal(outsideStart.state.outsideSince, at(3));

  const stillWaiting = stepGeofence(outsideStart.state, 1600, at(9), CONFIG);
  assert.equal(stillWaiting.event, null);

  const confirmed = stepGeofence(stillWaiting.state, 1700, at(14), CONFIG);
  assert.equal(confirmed.event, "EXIT");
  assert.equal(confirmed.state.inside, false);
  assert.equal(confirmed.state.outsideSince, null);
});

test("rientro in area annulla una uscita in sospeso", () => {
  const inside = enterPort();
  const outside = stepGeofence(inside, 2000, at(2), CONFIG);
  assert.equal(outside.state.inside, true);
  assert.notEqual(outside.state.outsideSince, null);

  const back = stepGeofence(outside.state, 600, at(5), CONFIG);
  assert.equal(back.event, null);
  assert.equal(back.state.inside, true);
  assert.equal(back.state.outsideSince, null);
  assert.equal(back.state.lastInsideTs, at(5));
});

test("il ticker conferma l'uscita quando la nave smette di trasmettere", () => {
  const state = { inside: true, outsideSince: at(0) };
  assert.equal(shouldConfirmExitFromClock(state, T0 + 5 * 60_000, 10), false);
  assert.equal(shouldConfirmExitFromClock(state, T0 + 10 * 60_000, 10), true);
  assert.equal(shouldConfirmExitFromClock({ inside: false, outsideSince: at(0) }, T0 + 60 * 60_000, 10), false);
  assert.equal(shouldConfirmExitFromClock({ inside: true, outsideSince: null }, T0, 10), false);
});

test("la perdita di segnale viene segnalata una sola volta oltre soglia", () => {
  const now = T0 + 30 * 60_000; // "adesso" = 12:30
  assert.equal(shouldEmitSignalLoss(false, at(25), now, 20), false, "5 minuti di silenzio: sotto soglia");
  assert.equal(shouldEmitSignalLoss(false, at(0), now, 20), true, "30 minuti di silenzio: oltre soglia");
  assert.equal(shouldEmitSignalLoss(true, at(0), now, 20), false, "già segnalata");
  assert.equal(shouldEmitSignalLoss(false, null, now, 20), false);
});

test("la variazione ETA supera la soglia solo oltre i minuti configurati", () => {
  const etaA = at(0);
  const etaB = at(30);
  const etaC = at(95);
  assert.equal(etaChangeExceeds(etaA, etaB, 60), false);
  assert.equal(etaChangeExceeds(etaA, etaC, 60), true);
  assert.equal(etaChangeExceeds(etaA, etaC, 120), false);
  assert.equal(etaChangeExceeds(null, etaC, 60), false);
});
