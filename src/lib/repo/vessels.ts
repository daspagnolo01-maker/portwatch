import { all, one, run, jsonParse } from "../db";
import { nowIso, parseAisEta, minutesBetween } from "../time";
import { flagFromMmsi } from "../flags";
import { shipTypeInfo, type ShipCategory } from "../shipTypes";
import type { AisEtaFields } from "../ais/types";

export interface VesselRow {
  id: number;
  mmsi: string;
  imo: string | null;
  name: string | null;
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
  owner: string | null;
  operator: string | null;
  company: string | null;
  ais_class: string | null;
  draught_m: number | null;
  destination_declared: string | null;
  destination_ts: string | null;
  eta_declared: string | null;
  eta_ts: string | null;
  first_seen: string;
  last_seen: string;
  last_lat: number | null;
  last_lon: number | null;
  last_sog: number | null;
  last_cog: number | null;
  last_heading: number | null;
  nav_status: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface VesselProfileRow {
  vessel_id: number;
  cargo_types: string | null;
  cargo_description: string | null;
  hs_codes: string | null;
  transport_mode: string | null;
  cargo_particulars: string | null;
  usual_routes: string | null;
  frequent_ports: string | null;
  usual_origins: string | null;
  usual_destinations: string | null;
  call_frequency: string | null;
  operator_notes: string | null;
  updated_at: string | null;
}

export interface VesselStateRow {
  vessel_id: number;
  inside_port: number;
  inside_since: string | null;
  outside_since: string | null;
  entry_samples: number;
  exit_samples: number;
  approached: number;
  signal_lost: number;
  last_inside_ts: string | null;
  updated_at: string;
}

const WRITABLE_VESSEL_COLUMNS = [
  "imo",
  "name",
  "callsign",
  "flag_country",
  "flag_code",
  "ship_type_code",
  "ship_type_label",
  "ship_category",
  "length_m",
  "beam_m",
  "gt",
  "dwt",
  "year_built",
  "owner",
  "operator",
  "company",
  "ais_class",
  "draught_m",
  "destination_declared",
  "destination_ts",
  "eta_declared",
  "eta_ts",
  "note",
] as const;

export type VesselPatch = Partial<
  Record<(typeof WRITABLE_VESSEL_COLUMNS)[number], string | number | null>
>;

function cleanName(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/@/g, " ").replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanDestination(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/@/g, " ").replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Riconoscimento automatico: prima MMSI, poi alias MMSI, infine IMO. */
export async function findVessel(mmsi: string, imo?: string | null): Promise<VesselRow | undefined> {
  const normalizedMmsi = String(mmsi).trim();
  if (!normalizedMmsi) return undefined;

  const direct = await one<VesselRow>("SELECT * FROM vessels WHERE mmsi = ?", normalizedMmsi);
  if (direct) return direct;

  const alias = await one<{ vessel_id: number }>(
    "SELECT vessel_id FROM vessel_aliases WHERE mmsi = ?",
    normalizedMmsi,
  );
  if (alias) {
    const vessel = await one<VesselRow>("SELECT * FROM vessels WHERE id = ?", alias.vessel_id);
    if (vessel) return vessel;
  }

  const normalizedImo = (imo ?? "").replace(/\D/g, "");
  if (normalizedImo) {
    const byImo = await one<VesselRow>(
      "SELECT * FROM vessels WHERE imo = ? ORDER BY updated_at DESC LIMIT 1",
      normalizedImo,
    );
    if (byImo) {
      await run(
        `INSERT INTO vessel_aliases (mmsi, vessel_id, created_at) VALUES (?, ?, ?)
         ON CONFLICT(mmsi) DO NOTHING`,
        normalizedMmsi,
        byImo.id,
        nowIso(),
      );
      return byImo;
    }
  }
  return undefined;
}

/**
 * Restituisce la nave censita oppure la crea. Ogni nave ha sempre una riga
 * di stato e una scheda profilo (anche vuota) per semplificare gli aggiornamenti.
 */
export async function ensureVessel(
  mmsi: string,
  name?: string | null,
  imo?: string | null,
): Promise<VesselRow> {
  const existing = await findVessel(mmsi, imo);
  if (existing) return existing;

  const timestamp = nowIso();
  const flag = flagFromMmsi(mmsi);
  const { lastId } = await run(
    `INSERT INTO vessels (mmsi, name, flag_country, flag_code, first_seen, last_seen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    mmsi,
    cleanName(name),
    flag.country,
    flag.iso2,
    timestamp,
    timestamp,
    timestamp,
    timestamp,
  );
  await run(
    "INSERT INTO vessel_states (vessel_id, updated_at) VALUES (?, ?) ON CONFLICT(vessel_id) DO NOTHING",
    lastId,
    timestamp,
  );
  await run(
    "INSERT INTO vessel_profiles (vessel_id, updated_at) VALUES (?, ?) ON CONFLICT(vessel_id) DO NOTHING",
    lastId,
    timestamp,
  );

  const created = await one<VesselRow>("SELECT * FROM vessels WHERE id = ?", lastId);
  if (!created) throw new Error("Creazione nave non riuscita");
  return created;
}

export async function getVessel(id: number): Promise<VesselRow | undefined> {
  return one<VesselRow>("SELECT * FROM vessels WHERE id = ?", id);
}

export async function getVesselByMmsi(mmsi: string): Promise<VesselRow | undefined> {
  return one<VesselRow>("SELECT * FROM vessels WHERE mmsi = ?", mmsi);
}

export async function updateVessel(id: number, patch: VesselPatch): Promise<void> {
  const entries = Object.entries(patch).filter(([key, value]) => {
    if (!WRITABLE_VESSEL_COLUMNS.includes(key as (typeof WRITABLE_VESSEL_COLUMNS)[number])) return false;
    return value !== undefined;
  });
  if (entries.length === 0) return;
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => value as string | number | null);
  await run(`UPDATE vessels SET ${assignments}, updated_at = ? WHERE id = ?`, ...values, nowIso(), id);
}

export interface StaticUpdate {
  imo?: string | null;
  name?: string | null;
  callsign?: string | null;
  shipTypeCode?: number | null;
  lengthM?: number | null;
  beamM?: number | null;
  draughtM?: number | null;
  destination?: string | null;
  eta?: AisEtaFields | null;
  aisClass?: string | null;
}

/**
 * Applica i dati statici AIS (messaggio 5 o 24) senza sovrascrivere con valori
 * vuoti i campi già censiti manualmente dall'operatore.
 * Restituisce la nave aggiornata e l'eventuale variazione di ETA dichiarata.
 */
export async function applyStaticData(
  vessel: VesselRow,
  data: StaticUpdate,
): Promise<{ vessel: VesselRow; etaChange: { previous: string; next: string; diffMinutes: number } | null }> {
  const patch: VesselPatch = {};

  const imo = (data.imo ?? "").replace(/\D/g, "");
  if (imo && imo !== "0" && vessel.imo !== imo) patch.imo = imo;
  if (data.name) {
    const name = cleanName(data.name);
    if (name && name !== vessel.name) patch.name = name;
  }
  if (data.callsign) {
    const callsign = cleanName(data.callsign);
    if (callsign && callsign !== vessel.callsign) patch.callsign = callsign;
  }
  if (data.shipTypeCode !== null && data.shipTypeCode !== undefined && data.shipTypeCode > 0) {
    if (vessel.ship_type_code !== data.shipTypeCode) {
      const info = shipTypeInfo(data.shipTypeCode);
      patch.ship_type_code = data.shipTypeCode;
      patch.ship_type_label = info.label;
      patch.ship_category = info.category;
    }
  }
  if (data.lengthM && data.lengthM > 5) patch.length_m = data.lengthM;
  if (data.beamM && data.beamM > 2) patch.beam_m = data.beamM;
  if (data.draughtM && data.draughtM > 0) patch.draught_m = data.draughtM;
  if (data.aisClass) patch.ais_class = data.aisClass;

  let etaChange: { previous: string; next: string; diffMinutes: number } | null = null;
  const nextEta = parseAisEta(data.eta ?? null);
  if (nextEta) {
    const previous = vessel.eta_declared;
    if (previous) {
      const diff = minutesBetween(previous, nextEta);
      if (diff !== null && Math.abs(diff) >= 1) {
        etaChange = { previous, next: nextEta, diffMinutes: Math.round(diff) };
      }
    }
    if (previous !== nextEta) {
      patch.eta_declared = nextEta;
      patch.eta_ts = nowIso();
    }
  }

  const destination = cleanDestination(data.destination ?? null);
  if (destination && destination !== vessel.destination_declared) {
    patch.destination_declared = destination;
    patch.destination_ts = nowIso();
  }

  if (Object.keys(patch).length > 0) await updateVessel(vessel.id, patch);
  const updated = (await getVessel(vessel.id)) ?? vessel;
  return { vessel: updated, etaChange };
}

export async function touchVesselTelemetry(
  vesselId: number,
  data: {
    lat: number;
    lon: number;
    sog: number | null;
    cog: number | null;
    heading: number | null;
    navStatus: number | null;
    ts: string;
    name?: string | null;
  },
): Promise<void> {
  const vessel = await getVessel(vesselId);
  if (!vessel) return;
  const patch: Record<string, string | number | null> = {
    last_lat: data.lat,
    last_lon: data.lon,
    last_sog: data.sog,
    last_cog: data.cog,
    last_heading: data.heading,
    nav_status: data.navStatus,
  };
  // Il nome AIS in MetaData può colmare un campo vuoto, ma non sostituisce
  // un nome già censito manualmente.
  if (!vessel.name && data.name) {
    const name = cleanName(data.name);
    if (name) patch.name = name;
  }
  const assignments = Object.keys(patch).map((key) => `${key} = ?`).join(", ");
  await run(
    `UPDATE vessels SET ${assignments}, last_seen = ?, updated_at = ? WHERE id = ?`,
    ...Object.values(patch),
    data.ts,
    nowIso(),
    vesselId,
  );
}

export async function getVesselState(vesselId: number): Promise<VesselStateRow> {
  const existing = await one<VesselStateRow>("SELECT * FROM vessel_states WHERE vessel_id = ?", vesselId);
  if (existing) return existing;
  await run("INSERT INTO vessel_states (vessel_id, updated_at) VALUES (?, ?)", vesselId, nowIso());
  const created = await one<VesselStateRow>("SELECT * FROM vessel_states WHERE vessel_id = ?", vesselId);
  if (!created) throw new Error("Stato nave non disponibile");
  return created;
}

export async function saveVesselState(vesselId: number, patch: Partial<VesselStateRow>): Promise<void> {
  const columns = [
    "inside_port",
    "inside_since",
    "outside_since",
    "entry_samples",
    "exit_samples",
    "approached",
    "signal_lost",
    "last_inside_ts",
  ] as const;
  const entries = columns
    .filter((column) => patch[column] !== undefined)
    .map((column) => [column, patch[column]] as const);
  if (entries.length === 0) return;
  const assignments = entries.map(([column]) => `${column} = ?`).join(", ");
  const values = entries.map(([, value]) => value as string | number | null);
  await run(
    `UPDATE vessel_states SET ${assignments}, updated_at = ? WHERE vessel_id = ?`,
    ...values,
    nowIso(),
    vesselId,
  );
}

export async function getProfile(vesselId: number): Promise<VesselProfileRow | undefined> {
  return one<VesselProfileRow>("SELECT * FROM vessel_profiles WHERE vessel_id = ?", vesselId);
}

const PROFILE_COLUMNS = [
  "cargo_types",
  "cargo_description",
  "hs_codes",
  "transport_mode",
  "cargo_particulars",
  "usual_routes",
  "frequent_ports",
  "usual_origins",
  "usual_destinations",
  "call_frequency",
  "operator_notes",
] as const;

export type ProfilePatch = Partial<Record<(typeof PROFILE_COLUMNS)[number], string | null>>;

export async function updateProfile(vesselId: number, patch: ProfilePatch): Promise<VesselProfileRow> {
  const entries = Object.entries(patch).filter(([key]) => PROFILE_COLUMNS.includes(key as (typeof PROFILE_COLUMNS)[number]));
  if (entries.length > 0) {
    const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
    const values = entries.map(([, value]) => value as string | null);
    await run(
      `UPDATE vessel_profiles SET ${assignments}, updated_at = ? WHERE vessel_id = ?`,
      ...values,
      nowIso(),
      vesselId,
    );
  }
  const profile = await one<VesselProfileRow>("SELECT * FROM vessel_profiles WHERE vessel_id = ?", vesselId);
  if (!profile) throw new Error("Profilo nave non disponibile");
  return profile;
}

export function profileCargoTypes(profile: VesselProfileRow | undefined): string[] {
  return jsonParse<string[]>(profile?.cargo_types ?? null, []);
}

export interface VesselListFilters {
  query?: string;
  category?: string;
  hasProfile?: boolean;
  limit?: number;
}

export interface VesselCard extends VesselRow {
  profile_cargo_types: string | null;
  port_call_status: string | null;
  port_call_id: number | null;
  last_port: string | null;
  destination: string | null;
  calls_total: number;
}

export async function listVesselCards(filters: VesselListFilters = {}): Promise<VesselCard[]> {
  const where: string[] = ["1 = 1"];
  const params: (string | number)[] = [];

  if (filters.query) {
    where.push("(v.name LIKE ? OR v.mmsi LIKE ? OR v.imo LIKE ?)");
    const like = `%${filters.query}%`;
    params.push(like, like, like);
  }
  if (filters.category) {
    where.push("v.ship_category = ?");
    params.push(filters.category);
  }
  if (filters.hasProfile) {
    where.push("p.cargo_types IS NOT NULL AND p.cargo_types NOT IN ('', '[]')");
  }

  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 5000);
  return all<VesselCard>(
    `SELECT v.*,
            p.cargo_types AS profile_cargo_types,
            (SELECT pc.status FROM port_calls pc WHERE pc.vessel_id = v.id
              AND pc.status IN ('EXPECTED','IN_PORT') ORDER BY pc.id DESC LIMIT 1) AS port_call_status,
            (SELECT pc.id FROM port_calls pc WHERE pc.vessel_id = v.id
              AND pc.status IN ('EXPECTED','IN_PORT') ORDER BY pc.id DESC LIMIT 1) AS port_call_id,
            (SELECT pc.last_port FROM port_calls pc WHERE pc.vessel_id = v.id
              ORDER BY pc.id DESC LIMIT 1) AS last_port,
            (SELECT pc.destination FROM port_calls pc WHERE pc.vessel_id = v.id
              ORDER BY pc.id DESC LIMIT 1) AS destination,
            (SELECT COUNT(*) FROM port_calls pc WHERE pc.vessel_id = v.id AND pc.arrival_ts IS NOT NULL) AS calls_total
     FROM vessels v
     LEFT JOIN vessel_profiles p ON p.vessel_id = v.id
     WHERE ${where.join(" AND ")}
     ORDER BY v.last_seen DESC
     LIMIT ${limit}`,
    ...params,
  );
}

export async function deleteVessel(vesselId: number): Promise<void> {
  await run("DELETE FROM vessels WHERE id = ?", vesselId);
}

export function vesselCategory(vessel: VesselRow): ShipCategory {
  return (vessel.ship_category as ShipCategory) ?? shipTypeInfo(vessel.ship_type_code).category;
}
