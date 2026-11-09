import { all } from "../db";
import { getSettings } from "../settings";
import { distanceNm, estimateArrival } from "../geo";

export interface LiveVessel {
  id: number;
  mmsi: string;
  imo: string | null;
  name: string | null;
  flag_country: string | null;
  flag_code: string | null;
  ship_type_code: number | null;
  ship_type_label: string | null;
  ship_category: string | null;
  length_m: number | null;
  beam_m: number | null;
  destination_declared: string | null;
  eta_declared: string | null;
  last_seen: string | null;
  last_lat: number;
  last_lon: number;
  last_sog: number | null;
  last_cog: number | null;
  last_heading: number | null;
  nav_status: number | null;
  inside_port: number | null;
  approached: number | null;
  signal_lost: number | null;
  call_status: string | null;
  call_id: number | null;
  call_eta: string | null;
  profile_cargo_types: string | null;
  distance_nm: number;
  estimated_eta: string | null;
  age_seconds: number;
  stale: boolean;
}

/**
 * Navi con una posizione recente nell'area monitorata.
 * `windowMinutes` definisce da quanto tempo un'ultima posizione è considerata valida.
 */
export async function listLiveVessels(windowMinutes = 90): Promise<LiveVessel[]> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const rows = await all<Omit<LiveVessel, "distance_nm" | "estimated_eta" | "age_seconds" | "stale">>(
    `SELECT v.id, v.mmsi, v.imo, v.name, v.flag_country, v.flag_code,
            v.ship_type_code, v.ship_type_label, v.ship_category, v.length_m, v.beam_m,
            v.destination_declared, v.eta_declared, v.last_seen,
            v.last_lat, v.last_lon, v.last_sog, v.last_cog, v.last_heading, v.nav_status,
            s.inside_port, s.approached, s.signal_lost,
            pc.status AS call_status, pc.id AS call_id,
            COALESCE(pc.eta_declared, pc.eta_estimated) AS call_eta,
            p.cargo_types AS profile_cargo_types
     FROM vessels v
     LEFT JOIN vessel_states s ON s.vessel_id = v.id
     LEFT JOIN vessel_profiles p ON p.vessel_id = v.id
     LEFT JOIN port_calls pc ON pc.id = (
       SELECT id FROM port_calls WHERE vessel_id = v.id AND status IN ('EXPECTED','IN_PORT')
       ORDER BY id DESC LIMIT 1
     )
     WHERE v.last_lat IS NOT NULL AND v.last_lon IS NOT NULL AND v.last_seen >= ?
     ORDER BY v.name COLLATE NOCASE`,
    cutoff,
  );

  const now = Date.now();
  return rows.map((row) => {
    const distance = distanceNm(row.last_lat, row.last_lon, settings.centerLat, settings.centerLon);
    const estimate = estimateArrival(distance, row.last_sog);
    const ageSeconds = row.last_seen ? Math.max(0, Math.round((now - Date.parse(row.last_seen)) / 1000)) : 0;
    return {
      ...row,
      distance_nm: Number(distance.toFixed(2)),
      estimated_eta: estimate?.eta ?? null,
      age_seconds: ageSeconds,
      stale: ageSeconds > settings.signalLossMinutes * 60,
    };
  });
}

export async function vesselTrack(vesselId: number, hours = 24): Promise<{
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  ts: string;
}[]> {
  const sql = `
    SELECT lat, lon, sog, cog, ts FROM positions
    WHERE vessel_id = ? AND ts >= ?
    ORDER BY ts ASC
    LIMIT 2000
  `;
  return all(sql, vesselId, new Date(Date.now() - hours * 3600_000).toISOString());
}
