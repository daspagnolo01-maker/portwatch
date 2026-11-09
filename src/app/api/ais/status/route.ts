import { NextResponse } from "next/server";
import { getAisLogs, getAisStatus, scheduleAreaRefresh } from "@/lib/ais/status";
import { emailStatus } from "@/lib/notify/email";
import { databaseHealth } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { unacknowledgedCount } from "@/lib/repo/events";
import { freebuff } from "@/lib/freebuff";

export const dynamic = "force-dynamic";

export async function GET(_request: Request) {
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

  // Gli indirizzi dei destinatari sono dati personali: il payload completo va
  // solo a chi ha effettuato l'accesso. Questo endpoint resta pubblico perché
  // lo interroga il cron GitHub, che riceve il solo stato sintetico del canale.
  let signedIn = false;
  try {
    signedIn = Boolean(await freebuff().getUser());
  } catch {
    signedIn = false;
  }

  return NextResponse.json({
    status,
    email: signedIn
      ? email
      : { configured: email.configured, transport: email.transport, available: email.available, reason: email.reason },
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
