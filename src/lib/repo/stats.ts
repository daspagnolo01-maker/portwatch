import { all, one } from "../db";
import { callCounts, expectedWithinHours, listCalls } from "./calls";
import { listEvents, unacknowledgedCount } from "./events";
import { openOperationsCount } from "./customs";
import { getSettings } from "../settings";

export interface DashboardStats {
  inPort: number;
  expected: number;
  expected24: number;
  expected48: number;
  expected72: number;
  arrivals24h: number;
  departures24h: number;
  events24h: number;
  unacknowledged: number;
  customsOpen: number;
  vesselsTotal: number;
  vesselsWithProfile: number;
  vesselsTracked: number;
  lastPositionAt: string | null;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const counts = await callCounts();
  const vesselsTotal = (await one<{ n: number }>("SELECT COUNT(*) AS n FROM vessels"))?.n ?? 0;
  const vesselsWithProfile =
    (
      await one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM vessel_profiles WHERE cargo_types IS NOT NULL AND cargo_types NOT IN ('', '[]')",
      )
    )?.n ?? 0;
  const vesselsTracked =
    (await one<{ n: number }>("SELECT COUNT(*) AS n FROM vessels WHERE last_seen >= ?", since))?.n ?? 0;

  return {
    ...counts,
    expected24: await expectedWithinHours(24),
    arrivals24h:
      (await one<{ n: number }>("SELECT COUNT(*) AS n FROM port_calls WHERE arrival_ts >= ?", since))?.n ?? 0,
    departures24h:
      (await one<{ n: number }>("SELECT COUNT(*) AS n FROM port_calls WHERE departure_ts >= ?", since))?.n ?? 0,
    events24h: (await one<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE ts >= ?", since))?.n ?? 0,
    unacknowledged: await unacknowledgedCount(),
    customsOpen: await openOperationsCount(),
    vesselsTotal,
    vesselsWithProfile,
    vesselsTracked,
    lastPositionAt:
      (await one<{ ts: string | null }>("SELECT MAX(ts) AS ts FROM positions"))?.ts ??
      (await one<{ ts: string | null }>("SELECT MAX(last_seen) AS ts FROM vessels"))?.ts ??
      null,
  };
}

/** Navi attese con la scheda merceologica: base dell'intelligence doganale. */
export async function expectedWithCargoProfile(limit = 8) {
  return (await listCalls("expected", { limit })).slice(0, limit);
}

export async function recentEventFeed(limit = 8) {
  return listEvents({ limit });
}

export async function vesselTypeBreakdown(): Promise<{ category: string; n: number }[]> {
  return all<{ category: string; n: number }>(
    `SELECT COALESCE(ship_category, 'other') AS category, COUNT(*) AS n
     FROM vessels GROUP BY category ORDER BY n DESC`,
  );
}

export async function monitoredArea() {
  const settings = await getSettings();
  return {
    centerLat: settings.centerLat,
    centerLon: settings.centerLon,
    monitorRadiusNm: settings.monitorRadiusNm,
    portRadiusM: settings.portRadiusM,
    approachRadiusNm: settings.approachRadiusNm,
  };
}
