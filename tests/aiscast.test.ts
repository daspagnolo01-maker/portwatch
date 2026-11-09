import test from "node:test";
import assert from "node:assert/strict";
import {
  areaDegrees,
  areaUrl,
  sourceLabel,
  vesselFromFeature,
  AISCAST_MAX_AREA_DEG2,
  type AiscastFeature,
} from "../src/lib/ais/aiscast.ts";

const BOX = { minLat: 37.31, minLon: 12.85, maxLat: 38.65, maxLon: 14.55 };

/** Feature reale di aiscast (campi verificati sul servizio il 2026-11-09). */
function feature(overrides: Record<string, unknown> = {}): AiscastFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [13.7042, 37.9861] },
    properties: {
      beam: 22,
      callsign: "TEST1",
      cog: 184.5,
      destination: "TERMINI IMERESE",
      draught: 6.5,
      eta: "11-11 07:00",
      flag: "IT",
      heading: 181,
      imo: 9999001,
      kind: "vessel",
      length: 150,
      mmsi: 247999001,
      msg_type: "PositionReport",
      name: "FIXTURE TEST",
      nav_status: 0,
      seen: "2026-11-09T10:12:08Z",
      sog: 8.4,
      source: "aishub",
      station: "aishub",
      to_bow: 100,
      to_port: 10,
      to_starboard: 12,
      to_stern: 50,
      type: 70,
      ...overrides,
    },
  };
}

test("l'URL REST usa il bbox minLat,minLon,maxLat,maxLon", () => {
  const url = areaUrl(BOX);
  assert.match(url, /^https:\/\/ais\.openwaters\.io\/v1\/vessels\?bbox=/);
  assert.ok(url.endsWith("37.3100,12.8500,38.6500,14.5500"), url);
});

test("l'area richiesta è calcolata in gradi quadri", () => {
  const degrees = areaDegrees(BOX);
  assert.ok(Math.abs(degrees - 1.34 * 1.7) < 0.001);
  assert.ok(degrees < AISCAST_MAX_AREA_DEG2, "l'area di monitoraggio rientra nel limite anonimo");
});

test("le coordinate GeoJSON sono [lon, lat] e diventano una posizione normalizzata", () => {
  const mapped = vesselFromFeature(feature());
  assert.ok(mapped);
  assert.equal(mapped.position.mmsi, "247999001");
  assert.equal(mapped.position.lat, 37.9861);
  assert.equal(mapped.position.lon, 13.7042);
  assert.equal(mapped.position.sog, 8.4);
  assert.equal(mapped.position.cog, 184.5);
  assert.equal(mapped.position.heading, 181);
  assert.equal(Date.parse(mapped.position.ts), Date.parse("2026-11-09T10:12:08Z"));
});

test("i dati statici AIS vengono mappati su nave e dimensioni", () => {
  const mapped = vesselFromFeature(feature());
  assert.ok(mapped);
  assert.equal(mapped.statics.name, "FIXTURE TEST");
  assert.equal(mapped.statics.imo, "9999001");
  assert.equal(mapped.statics.callsign, "TEST1");
  assert.equal(mapped.statics.shipTypeCode, 70);
  assert.equal(mapped.statics.lengthM, 150);
  assert.equal(mapped.statics.beamM, 22);
  assert.equal(mapped.statics.destination, "TERMINI IMERESE");
  // L'ETA di aiscast è una stringa "MM-DD HH:mm": non viene inventata una data ISO.
  assert.equal(mapped.statics.eta, null);
});

test("le dimensioni si ricavano dalle distanze di prua/poppa se mancano i campi", () => {
  const mapped = vesselFromFeature(feature({ length: undefined, beam: undefined }));
  assert.ok(mapped);
  assert.equal(mapped.statics.lengthM, 150);
  assert.equal(mapped.statics.beamM, 22);
});

test("i valori AIS di 'non disponibile' non diventano numeri falsi", () => {
  const mapped = vesselFromFeature(feature({ sog: 102.3, cog: 360, heading: 511, draught: 0 }));
  assert.ok(mapped);
  assert.equal(mapped.position.sog, null);
  assert.equal(mapped.position.cog, null);
  assert.equal(mapped.position.heading, null);
  assert.equal(mapped.statics.draughtM, 0, "il pescaggio 0 arriva dal servizio e non viene alterato");
});

test("feature non valide vengono scartate senza creare navi fantasma", () => {
  assert.equal(vesselFromFeature({ geometry: { coordinates: [13.7, 37.9] }, properties: {} }), null);
  assert.equal(
    vesselFromFeature({ geometry: {}, properties: { mmsi: 247999001 } }),
    null,
    "senza coordinate non è una posizione",
  );
  assert.equal(
    vesselFromFeature(feature({ mmsi: 12345 })),
    null,
    "MMSI non a 9 cifre",
  );
  assert.equal(
    vesselFromFeature({ geometry: { coordinates: [0, 0] }, properties: { mmsi: 247999001 } }),
    null,
    "posizione 0,0 = non disponibile",
  );
  assert.equal(
    vesselFromFeature({
      geometry: { coordinates: [13.7, 37.9] },
      properties: { mmsi: 247999001, kind: "station" },
    }),
    null,
    "le stazioni non sono navi",
  );
});

test("l'attribuzione dei dati usa la fonte dichiarata", () => {
  assert.equal(sourceLabel("aishub"), "AISHub");
  assert.equal(sourceLabel("gov_feed"), "gov_feed");
  assert.equal(sourceLabel(undefined), "Open Waters AIS");
});
