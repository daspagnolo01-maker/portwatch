import { NextResponse } from "next/server";
import { getAisLogs, getAisStatus, scheduleAreaRefresh } from "@/lib/ais/status";
import { emailStatus } from "@/lib/notify/email";
import { databaseHealth } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { unacknowledgedCount } from "@/lib/repo/events";

export const dynamic = "force-dynamic";

export async function GET() {
  // Polling dell'area AIS in background (throttlato): la risposta non attende
  // i tempi di rete e di scrittura su D1.
  await scheduleAreaRefresh();

  const [status, settings, email, database, unacknowledged, logs] = await Promise.all([
    getAisStatus(),
    getSettings(),
    emailStatus(),
    databaseHealth(),
    unacknowledgedCount(),
    getAisLogs(20),
  ]);

  return NextResponse.json({
    status,
    email,
    database,
    area: {
      centerLat: settings.centerLat,
      centerLon: settings.centerLon,
      monitorRadiusNm: settings.monitorRadiusNm,
      portRadiusM: settings.portRadiusM,
      approachRadiusNm: settings.approachRadiusNm,
    },
    unacknowledged,
    logs,
  });
}
