import {
  destinationMatchesPort,
  distanceMeters,
  hasUsablePosition,
  estimateArrival,
} from "../geo";
import { getSettings } from "../settings";
import { PORT } from "../port";
import { nowIso, minutesSince } from "../time";
import { all, run } from "../db";
import {
  applyStaticData,
  ensureVessel,
  getProfile,
  getVessel,
  getVesselState,
  profileCargoTypes,
  saveVesselState,
  touchVesselTelemetry,
  updateVessel,
  type VesselRow,
} from "../repo/vessels";
import {
  closeOpenCall,
  createCall,
  getOpenCall,
  markCallArrived,
  previousDestination,
  updateCall,
} from "../repo/calls";
import { createEvent } from "../repo/events";
import { ensureOperationForVessel } from "../repo/customs";
import { stepGeofence, shouldConfirmExitFromClock, etaChangeExceeds } from "../domain/geofence";
import type {
  AisEnvelope,
  AisPositionMessage,
  AisShipStaticMessage,
  NormalizedPosition,
  NormalizedStatic,
  StaticDataReportFields,
} from "./types";

/** Le posizioni sono registrate solo se la nave si è mossa o è passato abbastanza tempo. */
const POSITION_MIN_SECONDS = 60;
const POSITION_MIN_METERS = 100;

function vesselLabel(vessel: VesselRow): string {
  return vessel.name?.trim() || `MMSI ${vessel.mmsi}`;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function mmsiOf(envelope: AisEnvelope, body: { UserID?: number } | undefined): string | null {
  const raw = body?.UserID ?? envelope.MetaData?.MMSI ?? envelope.MetaData?.MMSI_String;
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length !== 9) return null;
  return digits;
}

export function normalizePosition(
  messageType: string,
  envelope: AisEnvelope,
  body: AisPositionMessage,
  ts?: string,
): NormalizedPosition | null {
  const mmsi = mmsiOf(envelope, body);
  if (!mmsi) return null;

  const lat = body.Latitude ?? envelope.MetaData?.Latitude ?? envelope.MetaData?.latitude;
  const lon = body.Longitude ?? envelope.MetaData?.Longitude ?? envelope.MetaData?.longitude;
  if (!hasUsablePosition(lat, lon)) return null;

  const sogRaw = typeof body.Sog === "number" ? body.Sog : null;
  // 102.3 kn = "non disponibile" nel protocollo AIS.
  const sog = sogRaw !== null && sogRaw >= 0 && sogRaw < 102.2 ? sogRaw : null;
  const cogRaw = typeof body.Cog === "number" ? body.Cog : null;
  const cog = cogRaw !== null && cogRaw >= 0 && cogRaw < 360 ? cogRaw : null;
  const headingRaw = typeof body.TrueHeading === "number" ? body.TrueHeading : null;
  const heading = headingRaw !== null && headingRaw >= 0 && headingRaw < 360 ? headingRaw : null;
  const navStatus = typeof body.NavigationalStatus === "number" ? body.NavigationalStatus : null;

  return {
    mmsi,
    name: toStringOrNull(body.Name ?? envelope.MetaData?.ShipName),
    lat: lat as number,
    lon: lon as number,
    sog,
    cog,
    heading,
    navStatus,
    ts: ts ?? nowIso(),
    messageType,
  };
}

function normalizeStatic(mmsi: string, body: AisShipStaticMessage, aisClass: string): NormalizedStatic {
  const dim = body.Dimension ?? {};
  const lengthM =
    typeof dim.A === "number" && typeof dim.B === "number" && dim.A + dim.B > 0 ? dim.A + dim.B : null;
  const beamM =
    typeof dim.C === "number" && typeof dim.D === "number" && dim.C + dim.D > 0 ? dim.C + dim.D : null;

  return {
    mmsi,
    imo: body.ImoNumber ? String(body.ImoNumber) : null,
    name: toStringOrNull(body.Name),
    callsign: toStringOrNull(body.CallSign),
    shipTypeCode: typeof body.Type === "number" ? body.Type : null,
    lengthM,
    beamM,
    draughtM:
      typeof body.MaximumStaticDraught === "number" && body.MaximumStaticDraught > 0
        ? body.MaximumStaticDraught
        : null,
    destination: toStringOrNull(body.Destination),
    eta: body.Eta ?? null,
    aisClass,
  };
}

/**
 * Ingest di un messaggio AIS grezzo (formato aisstream/aiscast). Usato dai test
 * e come punto unico di instradamento verso `ingestPosition` / `ingestStatic`.
 */
export async function handleAisMessage(envelope: AisEnvelope): Promise<void> {
  const type = envelope.MessageType;
  const message = envelope.Message?.[type];
  if (!message || typeof message !== "object") return;

  switch (type) {
    case "PositionReport":
    case "ExtendedClassBPositionReport":
    case "StandardClassBPositionReport":
    case "LongRangeAisBroadcastMessage": {
      const normalized = normalizePosition(type, envelope, message as AisPositionMessage);
      if (normalized) await ingestPosition(normalized);
      return;
    }
    case "ShipStaticData": {
      const body = message as AisShipStaticMessage;
      const mmsi = mmsiOf(envelope, body);
      if (!mmsi) return;
      await ingestStatic(normalizeStatic(mmsi, body, "A"));
      return;
    }
    case "StaticDataReport": {
      const body = message as StaticDataReportFields;
      const mmsi = mmsiOf(envelope, body);
      if (!mmsi) return;
      const reportA = body.ReportA ?? { Name: body.ShipName };
      const reportB = body.ReportB ?? {
        ShipType: body.ShipType,
        CallSign: body.CallSign,
        Dimension: body.Dimension,
      };
      const dim = reportB.Dimension ?? {};
      await ingestStatic({
        mmsi,
        imo: null,
        name: toStringOrNull(reportA?.Name ?? body.ShipName),
        callsign: toStringOrNull(reportB?.CallSign),
        shipTypeCode: typeof reportB?.ShipType === "number" ? reportB.ShipType : null,
        lengthM:
          typeof dim.A === "number" && typeof dim.B === "number" && dim.A + dim.B > 0 ? dim.A + dim.B : null,
        beamM:
          typeof dim.C === "number" && typeof dim.D === "number" && dim.C + dim.D > 0 ? dim.C + dim.D : null,
        draughtM: null,
        destination: null,
        eta: null,
        aisClass: "B",
      });
      return;
    }
    default:
      return;
  }
}

export async function ingestStatic(data: NormalizedStatic): Promise<void> {
  const vessel = await ensureVessel(data.mmsi, data.name, data.imo);
  const { vessel: updated, etaChange } = await applyStaticData(vessel, {
    imo: data.imo,
    name: data.name,
    callsign: data.callsign,
    shipTypeCode: data.shipTypeCode,
    lengthM: data.lengthM,
    beamM: data.beamM,
    draughtM: data.draughtM,
    destination: data.destination,
    eta: data.eta,
    aisClass: data.aisClass,
  });

  const settings = await getSettings();

  // Variazione significativa dell'ETA dichiarata.
  if (etaChange && etaChangeExceeds(etaChange.previous, etaChange.next, settings.etaChangeMinutes)) {
    await createEvent({
      type: "ETA_CHANGE",
      severity: "warning",
      vesselId: updated.id,
      vesselName: updated.name,
      mmsi: updated.mmsi,
      title: `Variazione ETA — ${vesselLabel(updated)}`,
      details: {
        previousEta: etaChange.previous,
        newEta: etaChange.next,
        deltaMinutes: etaChange.diffMinutes,
        destination: updated.destination_declared,
      },
    });
    const openCall = await getOpenCall(updated.id);
    if (openCall) await updateCall(openCall.id, { eta_declared: etaChange.next });
  }

  if (data.destination && destinationMatchesPort(data.destination)) {
    const openCall = await getOpenCall(updated.id);
    if (openCall && openCall.status === "EXPECTED") {
      await updateCall(openCall.id, { destination: data.destination });
    } else if (!openCall) {
      await ensureExpectedCall(updated, "dichiarata", data.destination);
    }
  }
}

export async function ingestPosition(position: NormalizedPosition): Promise<void> {
  const vessel = await ensureVessel(position.mmsi, position.name);
  await touchVesselTelemetry(vessel.id, {
    lat: position.lat,
    lon: position.lon,
    sog: position.sog,
    cog: position.cog,
    heading: position.heading,
    navStatus: position.navStatus,
    ts: position.ts,
    name: position.name,
  });

  const refreshed = (await getVessel(vessel.id)) ?? vessel;
  await storePositionSample(refreshed, position);

  const state = await getVesselState(refreshed.id);
  if (state.signal_lost === 1) {
    await saveVesselState(refreshed.id, { signal_lost: 0 });
    await createEvent({
      type: "SIGNAL_RESTORED",
      severity: "info",
      vesselId: refreshed.id,
      vesselName: refreshed.name,
      mmsi: refreshed.mmsi,
      title: `Segnale AIS ripristinato — ${vesselLabel(refreshed)}`,
      details: { position: { lat: position.lat, lon: position.lon }, sog: position.sog },
      ts: position.ts,
    });
  }

  await evaluatePortPresence(refreshed, position);
}

async function storePositionSample(vessel: VesselRow, position: NormalizedPosition): Promise<void> {
  const rows = await all<{ ts: string; lat: number; lon: number }>(
    "SELECT ts, lat, lon FROM positions WHERE vessel_id = ? ORDER BY ts DESC LIMIT 1",
    vessel.id,
  );
  const last = rows[0];
  if (last) {
    const seconds = (Date.parse(position.ts) - Date.parse(last.ts)) / 1000;
    const moved = distanceMeters(last.lat, last.lon, position.lat, position.lon);
    if (seconds < POSITION_MIN_SECONDS && moved < POSITION_MIN_METERS) return;
  }
  await run(
    `INSERT INTO positions (vessel_id, mmsi, lat, lon, sog, cog, heading, nav_status, ts, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    vessel.id,
    vessel.mmsi,
    position.lat,
    position.lon,
    position.sog,
    position.cog,
    position.heading,
    position.navStatus,
    position.ts,
    nowIso(),
  );
}

async function evaluatePortPresence(vessel: VesselRow, position: NormalizedPosition): Promise<void> {
  const settings = await getSettings();
  const state = await getVesselState(vessel.id);
  const distance = distanceMeters(position.lat, position.lon, settings.centerLat, settings.centerLon);

  const step = stepGeofence(
    {
      inside: state.inside_port === 1,
      entrySamples: state.entry_samples,
      exitSamples: state.exit_samples,
      insideSince: state.inside_since,
      outsideSince: state.outside_since,
      lastInsideTs: state.last_inside_ts,
    },
    distance,
    position.ts,
    {
      portRadiusM: settings.portRadiusM,
      hysteresisPct: settings.exitHysteresisPct,
      entryConfirmSamples: settings.entryConfirmSamples,
      departureConfirmMinutes: settings.departureConfirmMinutes,
    },
  );

  await saveVesselState(vessel.id, {
    inside_port: step.state.inside ? 1 : 0,
    inside_since: step.state.insideSince,
    outside_since: step.state.outsideSince,
    entry_samples: step.state.entrySamples,
    exit_samples: step.state.exitSamples,
    last_inside_ts: step.state.lastInsideTs,
  });

  if (step.event === "ENTRY") {
    await handleEntry(vessel, position, step.state.insideSince ?? position.ts, distance);
  } else if (step.event === "EXIT") {
    await handleExit(vessel, state.last_inside_ts ?? position.ts, position);
  }

  await handleApproach(vessel, position, distance, step.state.inside);
  await refreshCallEstimate(vessel.id, position, distance);
}

async function handleEntry(
  vessel: VesselRow,
  position: NormalizedPosition,
  insideSince: string,
  distance: number,
): Promise<void> {
  const provenance = await previousDestination(vessel.id);
  const openCall = await getOpenCall(vessel.id);

  let callId: number;
  if (openCall) {
    await markCallArrived(openCall.id, insideSince, provenance);
    callId = openCall.id;
  } else {
    const created = await createCall({
      vesselId: vessel.id,
      status: "IN_PORT",
      arrivalTs: insideSince,
      lastPort: provenance,
      destination: PORT.name,
      expectedSource: "rilevato",
      declaredDraught: vessel.draught_m,
    });
    callId = created.id;
  }

  await createEvent({
    type: "ENTRY",
    severity: "warning",
    vesselId: vessel.id,
    vesselName: vessel.name,
    mmsi: vessel.mmsi,
    title: `Ingresso in area portuale — ${vesselLabel(vessel)}`,
    details: {
      callId,
      distanceFromCenterM: Math.round(distance),
      sog: position.sog,
      position: { lat: position.lat, lon: position.lon },
      provenance,
    },
    ts: position.ts,
  });

  const profile = await getProfile(vessel.id);
  const cargoTypes = profileCargoTypes(profile);
  if (cargoTypes.length > 0) {
    await ensureOperationForVessel({
      vesselId: vessel.id,
      portCallId: callId,
      cargoTypes,
      vesselName: vessel.name,
    });
  }
}

export async function handleExit(
  vessel: VesselRow,
  departureTs: string,
  position?: { lat: number; lon: number; sog: number | null },
): Promise<void> {
  const closed = await closeOpenCall(vessel.id, departureTs);
  await createEvent({
    type: "EXIT",
    severity: "info",
    vesselId: vessel.id,
    vesselName: vessel.name,
    mmsi: vessel.mmsi,
    title: `Uscita dall'area portuale — ${vesselLabel(vessel)}`,
    details: {
      callId: closed?.id ?? null,
      departureTs,
      position: position ? { lat: position.lat, lon: position.lon } : null,
      sog: position?.sog ?? null,
    },
    ts: nowIso(),
  });
  await saveVesselState(vessel.id, { inside_port: 0, inside_since: null, outside_since: null, approached: 0 });
}

async function handleApproach(
  vessel: VesselRow,
  position: NormalizedPosition,
  distanceM: number,
  inside: boolean,
): Promise<void> {
  const settings = await getSettings();
  const distance = distanceM / 1852;
  const state = await getVesselState(vessel.id);

  if (inside) return;

  if (state.approached === 1) {
    if (distance > settings.approachRadiusNm * 1.3) {
      await saveVesselState(vessel.id, { approached: 0 });
    }
    return;
  }

  if (distance > settings.approachRadiusNm) return;

  await saveVesselState(vessel.id, { approached: 1 });
  await createEvent({
    type: "APPROACH",
    severity: "warning",
    vesselId: vessel.id,
    vesselName: vessel.name,
    mmsi: vessel.mmsi,
    title: `Avvicinamento al porto — ${vesselLabel(vessel)}`,
    details: {
      distanceNm: Number(distance.toFixed(2)),
      sog: position.sog,
      destination: vessel.destination_declared,
      position: { lat: position.lat, lon: position.lon },
    },
    ts: position.ts,
  });

  const declared = vessel.destination_declared;
  if (!(await getOpenCall(vessel.id)) && destinationMatchesPort(declared)) {
    await ensureExpectedCall(vessel, "dichiarata", declared);
  }
}

async function ensureExpectedCall(
  vessel: VesselRow,
  source: string,
  destination: string | null,
): Promise<void> {
  const open = await getOpenCall(vessel.id);
  if (open) return;

  const call = await createCall({
    vesselId: vessel.id,
    status: "EXPECTED",
    etaDeclared: vessel.eta_declared,
    etaEstimated: null,
    lastPort: await previousDestination(vessel.id),
    destination: destination ?? PORT.name,
    expectedSource: source,
    declaredDraught: vessel.draught_m,
  });

  await createEvent({
    type: "CALL_OPENED",
    severity: "info",
    vesselId: vessel.id,
    vesselName: vessel.name,
    mmsi: vessel.mmsi,
    title: `Nuova attesa registrata — ${vesselLabel(vessel)}`,
    details: { callId: call.id, destination: call.destination, source },
  });

  const cargoTypes = profileCargoTypes(await getProfile(vessel.id));
  if (cargoTypes.length > 0) {
    await ensureOperationForVessel({
      vesselId: vessel.id,
      portCallId: call.id,
      cargoTypes,
      vesselName: vessel.name,
    });
  }
}

async function refreshCallEstimate(
  vesselId: number,
  position: NormalizedPosition,
  distanceM: number,
): Promise<void> {
  const open = await getOpenCall(vesselId);
  if (!open || open.status !== "EXPECTED") return;
  const estimate = estimateArrival(distanceM / 1852, position.sog);
  if (!estimate) return;
  if (open.eta_estimated === estimate.eta) return;
  await updateCall(open.id, { eta_estimated: estimate.eta });
}

/**
 * Analisi periodica lato server:
 *  - perdita del segnale AIS;
 *  - uscite confermate quando la nave non trasmette più;
 *  - ricalcolo ETA stimate e pulizia delle posizioni.
 * Sull'istanza Workers viene eseguita al poll dell'area (nessun processo persistente).
 */
export async function processSignalLosses(nowMs = Date.now()): Promise<number> {
  const settings = await getSettings();
  const candidates = await all<{
    id: number;
    name: string | null;
    mmsi: string;
    last_seen: string | null;
    signal_lost: number;
  }>(
    `SELECT v.id, v.name, v.mmsi, v.last_seen, s.signal_lost
    FROM vessels v
    JOIN vessel_states s ON s.vessel_id = v.id
    WHERE s.signal_lost = 0
      AND (s.inside_port = 1
        OR EXISTS (SELECT 1 FROM port_calls pc WHERE pc.vessel_id = v.id AND pc.status IN ('EXPECTED','IN_PORT')))`,
  );

  let created = 0;
  for (const row of candidates) {
    const silentMinutes = minutesSince(row.last_seen, nowMs);
    if (silentMinutes === null || silentMinutes < settings.signalLossMinutes) continue;
    const open = await getOpenCall(row.id);
    if (!open && row.signal_lost === 1) continue;
    const event = await createEvent({
      type: "SIGNAL_LOST",
      severity: "warning",
      vesselId: row.id,
      vesselName: row.name,
      mmsi: row.mmsi,
      title: `Perdita segnale AIS — ${row.name || `MMSI ${row.mmsi}`}`,
      details: {
        lastSeen: row.last_seen,
        silentMinutes: Math.round(silentMinutes),
        thresholdMinutes: settings.signalLossMinutes,
        callStatus: open?.status ?? null,
      },
    });
    if (event.created) created += 1;
    await saveVesselState(row.id, { signal_lost: 1 });
  }
  return created;
}

export async function processPendingExits(nowMs = Date.now()): Promise<number> {
  const settings = await getSettings();
  const rows = await all<{ vessel_id: number; outside_since: string | null; last_inside_ts: string | null }>(`
    SELECT s.vessel_id, s.outside_since, s.last_inside_ts
    FROM vessel_states s
    WHERE s.inside_port = 1 AND s.outside_since IS NOT NULL
  `);
  let count = 0;
  for (const row of rows) {
    if (
      !shouldConfirmExitFromClock(
        { inside: true, outsideSince: row.outside_since },
        nowMs,
        settings.departureConfirmMinutes,
      )
    ) {
      continue;
    }
    const vessel = await getVessel(row.vessel_id);
    if (!vessel) continue;
    await handleExit(vessel, row.last_inside_ts ?? row.outside_since ?? nowIso());
    count += 1;
  }
  return count;
}

export async function prunePositions(): Promise<number> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.positionRetentionDays * 24 * 3600_000).toISOString();
  return (await run("DELETE FROM positions WHERE ts < ?", cutoff)).changes;
}

/** Utile ai test: espone il parsing senza passare dal database. */
export function parseStaticForTest(envelope: AisEnvelope): NormalizedStatic | null {
  const type = envelope.MessageType;
  const body = envelope.Message?.[type];
  if (!body || typeof body !== "object") return null;
  if (type !== "ShipStaticData") return null;
  const mmsi = mmsiOf(envelope, body as AisShipStaticMessage);
  if (!mmsi) return null;
  return normalizeStatic(mmsi, body as AisShipStaticMessage, "A");
}
