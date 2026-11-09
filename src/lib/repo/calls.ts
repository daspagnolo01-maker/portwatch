import { all, one, run } from "../db";
import { nowIso } from "../time";
import { estimateArrival, distanceNm } from "../geo";
import { getSettings } from "../settings";

export type CallStatus = "EXPECTED" | "IN_PORT" | "DEPARTED" | "CANCELLED";

export interface PortCallRow {
  id: number;
  vessel_id: number;
  status: CallStatus;
  eta_declared: string | null;
  eta_estimated: string | null;
  arrival_ts: string | null;
  ata: string | null;
  departure_ts: string | null;
  last_port: string | null;
  destination: string | null;
  expected_source: string | null;
  declared_draught: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallFilters {
  query?: string;
  category?: string;
  origin?: string;
  destination?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export type CallKind = "expected" | "arrivals" | "departures" | "inport" | "all";

export interface CallRow extends PortCallRow {
  name: string | null;
  mmsi: string;
  imo: string | null;
  callsign: string | null;
  flag_country: string | null;
  flag_code: string | null;
  ship_type_code: number | null;
  ship_type_label: string | null;
  ship_category: string | null;
  length_m: number | null;
  beam_m: number | null;
  gt: number | null;
  dwt: number | null;
  year_built: number | null;
  draught_m: number | null;
  last_sog: number | null;
  last_lat: number | null;
  last_lon: number | null;
  last_seen: string | null;
  nav_status: number | null;
  vessel_destination: string | null;
  profile_cargo_types: string | null;
  customs_operation_id: number | null;
  customs_status: string | null;
  /** Distanza residua dal porto in mn (calcolata). */
  distance_nm: number | null;
  /** ETA effettiva: dichiarata se presente, altrimenti stimata. */
  effective_eta: string | null;
  eta_source: "declared" | "estimated" | null;
}

export async function getOpenCall(vesselId: number): Promise<PortCallRow | undefined> {
  return one<PortCallRow>(
    "SELECT * FROM port_calls WHERE vessel_id = ? AND status IN ('EXPECTED','IN_PORT') ORDER BY id DESC LIMIT 1",
    vesselId,
  );
}

/** Destinazione dell'ultimo viaggio concluso: usata come provenienza dedotta. */
export async function previousDestination(vesselId: number): Promise<string | null> {
  const row = await one<{ destination: string | null }>(
    `SELECT destination FROM port_calls
     WHERE vessel_id = ? AND status = 'DEPARTED' AND destination IS NOT NULL
     ORDER BY departure_ts DESC LIMIT 1`,
    vesselId,
  );
  return row?.destination ?? null;
}

export interface CreateCallInput {
  vesselId: number;
  status: CallStatus;
  etaDeclared?: string | null;
  etaEstimated?: string | null;
  arrivalTs?: string | null;
  departureTs?: string | null;
  lastPort?: string | null;
  destination?: string | null;
  expectedSource?: string | null;
  declaredDraught?: number | null;
  note?: string | null;
}

export async function createCall(input: CreateCallInput): Promise<PortCallRow> {
  const timestamp = nowIso();
  const { lastId } = await run(
    `INSERT INTO port_calls
      (vessel_id, status, eta_declared, eta_estimated, arrival_ts, ata, departure_ts,
       last_port, destination, expected_source, declared_draught, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.vesselId,
    input.status,
    input.etaDeclared ?? null,
    input.etaEstimated ?? null,
    input.arrivalTs ?? null,
    input.arrivalTs ?? null,
    input.departureTs ?? null,
    input.lastPort ?? null,
    input.destination ?? null,
    input.expectedSource ?? null,
    input.declaredDraught ?? null,
    input.note ?? null,
    timestamp,
    timestamp,
  );
  const created = await one<PortCallRow>("SELECT * FROM port_calls WHERE id = ?", lastId);
  if (!created) throw new Error("Creazione scalo non riuscita");
  return created;
}

const CALL_COLUMNS = [
  "status",
  "eta_declared",
  "eta_estimated",
  "arrival_ts",
  "ata",
  "departure_ts",
  "last_port",
  "destination",
  "expected_source",
  "declared_draught",
  "note",
] as const;

export async function updateCall(
  id: number,
  patch: Partial<Record<(typeof CALL_COLUMNS)[number], string | number | null>>,
): Promise<void> {
  const entries = Object.entries(patch).filter(([key]) => CALL_COLUMNS.includes(key as (typeof CALL_COLUMNS)[number]));
  if (entries.length === 0) return;
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => value as string | number | null);
  await run(`UPDATE port_calls SET ${assignments}, updated_at = ? WHERE id = ?`, ...values, nowIso(), id);
}

export async function closeOpenCall(vesselId: number, departureTs: string): Promise<PortCallRow | null> {
  const open = await getOpenCall(vesselId);
  if (!open) return null;
  await updateCall(open.id, { status: "DEPARTED", departure_ts: departureTs });
  return (await one<PortCallRow>("SELECT * FROM port_calls WHERE id = ?", open.id)) ?? null;
}

export async function markCallArrived(
  callId: number,
  arrivalTs: string,
  lastPort: string | null,
): Promise<void> {
  await updateCall(callId, {
    status: "IN_PORT",
    arrival_ts: arrivalTs,
    ata: arrivalTs,
    ...(lastPort ? { last_port: lastPort } : {}),
  });
}

export async function deleteCall(id: number): Promise<void> {
  await run("DELETE FROM port_calls WHERE id = ?", id);
}

/**
 * Elenco scali arricchito con i dati nave, la scheda merceologica,
 * lo stato della pratica doganale e la distanza residua dal porto.
 */
export async function listCalls(kind: CallKind, filters: CallFilters = {}): Promise<CallRow[]> {
  const where: string[] = ["1 = 1"];
  const params: (string | number)[] = [];

  switch (kind) {
    case "expected":
      where.push("pc.status = 'EXPECTED'");
      break;
    case "inport":
      where.push("pc.status = 'IN_PORT'");
      break;
    case "arrivals":
      where.push("pc.arrival_ts IS NOT NULL");
      break;
    case "departures":
      where.push("pc.departure_ts IS NOT NULL");
      break;
    default:
      break;
  }

  if (filters.query) {
    where.push("(v.name LIKE ? OR v.mmsi LIKE ? OR v.imo LIKE ?)");
    const like = `%${filters.query}%`;
    params.push(like, like, like);
  }
  if (filters.category) {
    where.push("v.ship_category = ?");
    params.push(filters.category);
  }
  if (filters.origin) {
    where.push("pc.last_port LIKE ?");
    params.push(`%${filters.origin}%`);
  }
  if (filters.destination) {
    where.push("(pc.destination LIKE ? OR v.destination_declared LIKE ?)");
    params.push(`%${filters.destination}%`, `%${filters.destination}%`);
  }

  const periodColumn =
    kind === "departures" ? "pc.departure_ts" : kind === "arrivals" ? "pc.arrival_ts" : "pc.created_at";
  if (filters.from) {
    where.push(`${periodColumn} >= ?`);
    params.push(filters.from);
  }
  if (filters.to) {
    where.push(`${periodColumn} <= ?`);
    params.push(filters.to);
  }

  const orderBy =
    kind === "expected"
      ? "COALESCE(pc.eta_declared, pc.eta_estimated) IS NULL, COALESCE(pc.eta_declared, pc.eta_estimated) ASC"
      : kind === "departures"
        ? "pc.departure_ts DESC"
        : kind === "inport"
          ? "pc.arrival_ts ASC"
          : "COALESCE(pc.arrival_ts, pc.updated_at) DESC";

  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 5000);

  const rows = await all<CallRow>(
    `SELECT pc.*,
            v.name, v.mmsi, v.imo, v.callsign, v.flag_country, v.flag_code,
            v.ship_type_code, v.ship_type_label, v.ship_category,
            v.length_m, v.beam_m, v.gt, v.dwt, v.year_built, v.draught_m,
            v.last_sog, v.last_lat, v.last_lon, v.last_seen, v.nav_status,
            v.destination_declared AS vessel_destination,
            p.cargo_types AS profile_cargo_types,
            (SELECT co.id FROM customs_operations co WHERE co.vessel_id = v.id
              ORDER BY CASE co.status WHEN 'closed' THEN 1 ELSE 0 END, co.updated_at DESC LIMIT 1) AS customs_operation_id,
            (SELECT co.status FROM customs_operations co WHERE co.vessel_id = v.id
              ORDER BY CASE co.status WHEN 'closed' THEN 1 ELSE 0 END, co.updated_at DESC LIMIT 1) AS customs_status
     FROM port_calls pc
     JOIN vessels v ON v.id = pc.vessel_id
     LEFT JOIN vessel_profiles p ON p.vessel_id = v.id
     WHERE ${where.join(" AND ")}
     ORDER BY ${orderBy}
     LIMIT ${limit}`,
    ...params,
  );

  const settings = await getSettings();
  return rows.map((row) => {
    const hasPosition =
      typeof row.last_lat === "number" &&
      typeof row.last_lon === "number" &&
      Number.isFinite(row.last_lat) &&
      Number.isFinite(row.last_lon);
    const distance = hasPosition
      ? distanceNm(row.last_lat as number, row.last_lon as number, settings.centerLat, settings.centerLon)
      : null;

    const outside = row.status !== "IN_PORT";
    let estimated: string | null = null;
    if (outside && distance !== null) {
      const estimate = estimateArrival(distance, row.last_sog);
      estimated = estimate?.eta ?? null;
    }

    const effective = row.eta_declared ?? row.eta_estimated ?? estimated;
    return {
      ...row,
      distance_nm: distance,
      effective_eta: effective,
      eta_source: row.eta_declared ? "declared" : effective ? "estimated" : null,
    };
  });
}

/** Aggiorna l'ETA stimata degli scali attesi in base all'ultima posizione nota. */
export async function refreshExpectedEstimates(): Promise<number> {
  const settings = await getSettings();
  const openCalls = await all<{
    id: number;
    vessel_id: number;
    last_lat: number | null;
    last_lon: number | null;
    last_sog: number | null;
    eta_estimated: string | null;
  }>(
    `SELECT pc.id, pc.vessel_id, pc.eta_estimated, v.last_lat, v.last_lon, v.last_sog
     FROM port_calls pc JOIN vessels v ON v.id = pc.vessel_id
     WHERE pc.status = 'EXPECTED'`,
  );

  let updated = 0;
  for (const call of openCalls) {
    if (typeof call.last_lat !== "number" || typeof call.last_lon !== "number") continue;
    const distance = distanceNm(call.last_lat, call.last_lon, settings.centerLat, settings.centerLon);
    const estimate = estimateArrival(distance, call.last_sog);
    if (!estimate) continue;
    if (call.eta_estimated === estimate.eta) continue;
    await updateCall(call.id, { eta_estimated: estimate.eta });
    updated += 1;
  }
  return updated;
}

export async function expectedWithinHours(hours: number): Promise<number> {
  const limit = Date.now() + hours * 3600_000;
  const rows = await all<{ eta_declared: string | null; eta_estimated: string | null }>(
    "SELECT eta_declared, eta_estimated FROM port_calls WHERE status = 'EXPECTED'",
  );
  return rows.filter((row) => {
    const eta = Date.parse(row.eta_declared ?? row.eta_estimated ?? "");
    return Number.isFinite(eta) && eta <= limit;
  }).length;
}

export async function callCounts(): Promise<{
  inPort: number;
  expected: number;
  expected24: number;
  expected48: number;
  expected72: number;
}> {
  return {
    inPort: (await one<{ n: number }>("SELECT COUNT(*) AS n FROM port_calls WHERE status = 'IN_PORT'"))?.n ?? 0,
    expected:
      (await one<{ n: number }>("SELECT COUNT(*) AS n FROM port_calls WHERE status = 'EXPECTED'"))?.n ?? 0,
    expected24: await expectedWithinHours(24),
    expected48: await expectedWithinHours(48),
    expected72: await expectedWithinHours(72),
  };
}

export async function recentArrivals(limit = 6): Promise<CallRow[]> {
  return (await listCalls("arrivals", { limit })).slice(0, limit);
}

export async function recentDepartures(limit = 6): Promise<CallRow[]> {
  return (await listCalls("departures", { limit })).slice(0, limit);
}

export async function openCallsForVessel(vesselId: number): Promise<PortCallRow[]> {
  return all<PortCallRow>(
    "SELECT * FROM port_calls WHERE vessel_id = ? AND status IN ('EXPECTED','IN_PORT') ORDER BY id DESC",
    vesselId,
  );
}

export async function callsForVessel(vesselId: number, limit = 20): Promise<PortCallRow[]> {
  return all<PortCallRow>(
    "SELECT * FROM port_calls WHERE vessel_id = ? ORDER BY COALESCE(arrival_ts, created_at) DESC LIMIT ?",
    vesselId,
    limit,
  );
}
