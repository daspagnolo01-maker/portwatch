import test from "node:test";
import assert from "node:assert/strict";
import {
  angleDifference,
  bearingDeg,
  boundingBoxFromCircle,
  cardinal,
  destinationMatchesPort,
  distanceMeters,
  distanceNm,
  estimateArrival,
  hasUsablePosition,
  METERS_PER_NM,
} from "../src/lib/geo.ts";
import { parseAisEta } from "../src/lib/time.ts";

const PORT = { lat: 37.9860726, lon: 13.7041999 };

test("la distanza dal porto di Palermo è coerente con i valori reali", () => {
  // Palermo (porto): ~38.1265 N, 13.3686 E — circa 35 km da Termini Imerese.
  const km = distanceMeters(PORT.lat, PORT.lon, 38.1265, 13.3686) / 1000;
  assert.ok(km > 28 && km < 40, `distanza inattesa: ${km.toFixed(1)} km`);
  assert.ok(Math.abs(distanceNm(PORT.lat, PORT.lon, 38.1265, 13.3686) * METERS_PER_NM - km * 1000) < 1);
});

test("il bearing verso nord e la cardinalità sono corretti", () => {
  const north = bearingDeg(37.9, 13.7, 38.9, 13.7);
  assert.ok(Math.abs(north - 0) < 0.5 || Math.abs(north - 360) < 0.5);
  assert.equal(cardinal(0), "N");
  assert.equal(cardinal(359), "N");
  assert.equal(cardinal(90), "E");
  assert.equal(cardinal(180), "S");
  assert.equal(angleDifference(350, 10), 20);
});

test("il bounding box AIS contiene il cerchio richiesto", () => {
  const box = boundingBoxFromCircle(PORT.lat, PORT.lon, 40);
  assert.ok(box.minLat < PORT.lat && box.maxLat > PORT.lat);
  assert.ok(box.minLon < PORT.lon && box.maxLon > PORT.lon);
  const latSpanNm = (box.maxLat - box.minLat) * 60;
  assert.ok(Math.abs(latSpanNm - 80) < 0.01, `span lat: ${latSpanNm}`);
});

test("le coordinate AIS non valide vengono scartate", () => {
  assert.equal(hasUsablePosition(37.9, 13.7), true);
  assert.equal(hasUsablePosition(91, 13.7), false);
  assert.equal(hasUsablePosition(37.9, 181), false);
  assert.equal(hasUsablePosition(0, 0), false);
  assert.equal(hasUsablePosition(null, 13.7), false);
  assert.equal(hasUsablePosition(Number.NaN, 13.7), false);
});

test("l'ETA AIS (senza anno) viene ricostruita sull'occorrenza più vicina", () => {
  const reference = new Date(Date.UTC(2026, 5, 15, 10, 0, 0));
  const sameYear = parseAisEta({ Month: 6, Day: 16, Hour: 8, Minute: 30 }, reference);
  assert.equal(sameYear, "2026-06-16T08:30:00.000Z");

  // Dicembre con riferimento a gennaio: deve cadere nell'anno corrente.
  const december = parseAisEta({ Month: 12, Day: 24, Hour: 6, Minute: 0 }, new Date(Date.UTC(2026, 0, 10)));
  assert.equal(december, "2026-12-24T06:00:00.000Z");

  // Gennaio con riferimento a dicembre: l'ETA è futura, quindi anno successivo.
  const january = parseAisEta({ Month: 1, Day: 5, Hour: 6, Minute: 0 }, new Date(Date.UTC(2026, 11, 20)));
  assert.equal(january, "2027-01-05T06:00:00.000Z");

  // Un ETA di poche ore prima resta nell'anno corrente (dato in ritardo).
  const recent = parseAisEta({ Month: 6, Day: 15, Hour: 6, Minute: 0 }, reference);
  assert.equal(recent, "2026-06-15T06:00:00.000Z");

  assert.equal(parseAisEta({ Month: 0, Day: 5, Hour: 6, Minute: 0 }, reference), null);
  assert.equal(parseAisEta({ Month: 6, Day: 5, Hour: 24, Minute: 0 }, reference), null);
  assert.equal(parseAisEta({ Month: 6, Day: 32, Hour: 4, Minute: 0 }, reference), null);
  assert.equal(parseAisEta(null, reference), null);
});

test("la destinazione dichiarata riconosce Termini Imerese in tutte le forme", () => {
  for (const value of [
    "TERMINI IMERESE",
    "TERMINI-IMERESE",
    "TERMINI IMERESE (PA)",
    "TERMINI",
    "ITTRI",
    "  termini imerese  ",
  ]) {
    assert.equal(destinationMatchesPort(value), true, `non riconosciuta: ${value}`);
  }
  for (const value of ["PALERMO", "CIVITAVECCHIA", "GENOVA", "", null]) {
    assert.equal(destinationMatchesPort(value), false, `falso positivo: ${value}`);
  }
});

test("la stima di arrivo usa distanza e velocità fondata", () => {
  const now = new Date(Date.UTC(2026, 10, 6, 12, 0, 0));
  const estimate = estimateArrival(24, 12, now);
  assert.ok(estimate);
  assert.equal(estimate.hoursRemaining, 2);
  assert.equal(estimate.eta, "2026-11-06T14:00:00.000Z");
  assert.equal(estimateArrival(24, 0.1, now), null, "nave ferma");
  assert.equal(estimateArrival(0.01, 12, now), null, "già in porto");
  assert.equal(estimateArrival(24, null, now), null);
});
