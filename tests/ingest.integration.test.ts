/**
 * Test di integrazione della pipeline AIS sul data layer asincrono (D1).
 *
 * I messaggi qui sotto sono FIXTURE DI TEST con MMSI fittizio (247999xxx):
 * servono solo a verificare che parsing, upsert, geofence, scali ed eventi
 * funzionino insieme. Il database è un D1 in memoria (adattatore su node:sqlite)
 * e non contiene mai dati dell'applicazione.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { D1Sqlite } from "./d1-sqlite.ts";

const PORT_LAT = 37.9860726;
const PORT_LON = 13.7041999;
const MMSI = 247999001;

function staticEnvelope() {
  return {
    MessageType: "ShipStaticData",
    MetaData: { MMSI, ShipName: "FIXTURE TEST" },
    Message: {
      ShipStaticData: {
        MessageID: 5,
        RepeatIndicator: 0,
        UserID: MMSI,
        Valid: true,
        AisVersion: 0,
        ImoNumber: 9999001,
        CallSign: "FIXT1",
        Name: "FIXTURE TEST",
        Type: 70,
        Dimension: { A: 100, B: 50, C: 10, D: 10 },
        FixType: 1,
        Eta: { Month: 11, Day: 6, Hour: 23, Minute: 0 },
        MaximumStaticDraught: 6.5,
        Destination: "TERMINI IMERESE",
        Dte: false,
        Spare: false,
      },
    },
  };
}

function positionEnvelope(lat: number, lon: number, sog: number, navStatus = 0) {
  return {
    MessageType: "PositionReport",
    MetaData: { MMSI, ShipName: "FIXTURE TEST", Latitude: lat, Longitude: lon },
    Message: {
      PositionReport: {
        MessageID: 1,
        RepeatIndicator: 0,
        UserID: MMSI,
        Valid: true,
        NavigationalStatus: navStatus,
        RateOfTurn: 0,
        Sog: sog,
        PositionAccuracy: true,
        Longitude: lon,
        Latitude: lat,
        Cog: 180,
        TrueHeading: 180,
        Timestamp: 10,
        SpecialManoeuvreIndicator: 0,
        Spare: 0,
        Raim: false,
        CommunicationState: 0,
      },
    },
  };
}

test("pipeline AIS: anagrafica, attesa, ingresso e uscita registrati su DB", async (t) => {
  const { setDatabaseBindingForTests, all, one } = await import("../src/lib/db.ts");
  const binding = new D1Sqlite();
  setDatabaseBindingForTests(binding);
  t.after(() => {
    setDatabaseBindingForTests(null);
    binding.close();
  });

  const { handleAisMessage, processPendingExits } = await import("../src/lib/ais/ingest.ts");

  // 1. Dati statici: la nave viene censita e riconosciuta per MMSI/IMO.
  await handleAisMessage(staticEnvelope() as never);
  const vessel = await one<{
    id: number;
    name: string;
    imo: string;
    ship_category: string;
    length_m: number;
    beam_m: number;
  }>("SELECT * FROM vessels WHERE mmsi = ?", String(MMSI));
  assert.ok(vessel, "nave creata dai dati statici");
  assert.equal(vessel.name, "FIXTURE TEST");
  assert.equal(vessel.imo, "9999001");
  assert.equal(vessel.ship_category, "cargo");
  assert.equal(vessel.length_m, 150);
  assert.equal(vessel.beam_m, 20);

  // La destinazione dichiarata apre l'attesa senza duplicare la scheda.
  const expected = await one<{ id: number; status: string }>(
    "SELECT * FROM port_calls WHERE vessel_id = ? AND status = 'EXPECTED'",
    vessel.id,
  );
  assert.ok(expected, "attesa creata dalla destinazione TERMINI IMERESE");
  assert.equal((await one<{ n: number }>("SELECT COUNT(*) AS n FROM vessels"))?.n, 1);

  // 2. Avvicinamento (≈1,8 mn dal centro): evento APPROACH, nessun ingresso.
  await handleAisMessage(positionEnvelope(PORT_LAT + 0.03, PORT_LON, 8) as never);
  assert.equal((await one<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE type = 'APPROACH'"))?.n, 1);
  assert.equal(
    (await one<{ inside: number }>("SELECT inside_port AS inside FROM vessel_states WHERE vessel_id = ?", vessel.id))
      ?.inside,
    0,
  );

  // 3. Ingresso: servono due campioni consecutivi dentro il raggio portuale.
  await handleAisMessage(positionEnvelope(PORT_LAT + 0.002, PORT_LON, 3) as never);
  assert.equal(
    (await one<{ status: string }>("SELECT status FROM port_calls WHERE id = ?", expected.id))?.status,
    "EXPECTED",
    "un solo campione non basta",
  );
  await handleAisMessage(positionEnvelope(PORT_LAT + 0.002, PORT_LON, 1, 5) as never);

  const inPort = await one<{ id: number; status: string; ata: string | null; arrival_ts: string | null }>(
    "SELECT * FROM port_calls WHERE id = ?",
    expected.id,
  );
  assert.equal(inPort?.status, "IN_PORT");
  assert.ok(inPort?.ata, "ATA valorizzato dall'ingresso");
  assert.equal((await one<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE type = 'ENTRY'"))?.n, 1);
  assert.equal(
    (await one<{ n: number }>("SELECT COUNT(*) AS n FROM port_calls WHERE vessel_id = ?", vessel.id))?.n,
    1,
    "lo scalo atteso viene promosso, non duplicato",
  );

  // Campioni aggiuntivi in porto: nessun evento duplicato.
  await handleAisMessage(positionEnvelope(PORT_LAT + 0.0019, PORT_LON, 0.5, 5) as never);
  assert.equal((await one<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE type = 'ENTRY'"))?.n, 1);

  // 4. Uscita: oltre il raggio con isteresi, ma senza il tempo di conferma
  //    lo scalo resta aperto.
  await handleAisMessage(positionEnvelope(PORT_LAT + 0.04, PORT_LON, 9) as never);
  assert.equal(
    (await one<{ status: string }>("SELECT status FROM port_calls WHERE id = ?", inPort!.id))?.status,
    "IN_PORT",
    "l'uscita non è immediata",
  );

  // 5. Il ciclo di manutenzione conferma l'uscita dopo il tempo configurato.
  const exits = await processPendingExits(Date.now() + 11 * 60_000);
  assert.ok(exits >= 1);
  const departed = await one<{ status: string; departure_ts: string | null; last_inside_ts: string | null }>(
    "SELECT * FROM port_calls WHERE id = ?",
    inPort!.id,
  );
  assert.equal(departed?.status, "DEPARTED");
  assert.ok(departed?.departure_ts, "orario di partenza registrato");
  assert.equal((await one<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE type = 'EXIT'"))?.n, 1);

  // 6. Traccia posizioni conservata.
  const positions =
    (await one<{ n: number }>("SELECT COUNT(*) AS n FROM positions WHERE vessel_id = ?", vessel.id))?.n ?? 0;
  assert.ok(positions >= 1, "almeno una posizione persistita");

  // 7. Il riconoscimento per IMO evita duplicati anche con MMSI diverso.
  const aliasEnvelope = staticEnvelope();
  aliasEnvelope.Message.ShipStaticData.UserID = 247999002;
  aliasEnvelope.MetaData.MMSI = 247999002;
  await handleAisMessage(aliasEnvelope as never);
  assert.equal(
    (await one<{ n: number }>("SELECT COUNT(*) AS n FROM vessels"))?.n,
    1,
    "nessun duplicato per IMO",
  );
  assert.equal(
    (await one<{ n: number }>("SELECT COUNT(*) AS n FROM vessel_aliases WHERE vessel_id = ?", vessel.id))?.n,
    1,
    "MMSI alternativo registrato come alias",
  );

  // 8. Storico eventi coerente.
  const types = (await all<{ type: string }>("SELECT type FROM events ORDER BY id")).map((row) => row.type);
  assert.deepEqual(types, ["CALL_OPENED", "APPROACH", "ENTRY", "EXIT"]);
});
