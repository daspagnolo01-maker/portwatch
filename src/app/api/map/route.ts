import { NextResponse } from "next/server";
import { listLiveVessels } from "@/lib/repo/live";
import { getSettings } from "@/lib/settings";
import { getAisStatus } from "@/lib/ais/status";
import { PORT } from "@/lib/port";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const windowMinutes = Math.min(
    Math.max(Number(url.searchParams.get("window") ?? 90), 5),
    24 * 60,
  );

  const [settings, vessels, connection] = await Promise.all([
    getSettings(),
    listLiveVessels(windowMinutes),
    getAisStatus(),
  ]);

  return NextResponse.json({
    vessels,
    area: {
      centerLat: settings.centerLat,
      centerLon: settings.centerLon,
      monitorRadiusNm: settings.monitorRadiusNm,
      portRadiusM: settings.portRadiusM,
      approachRadiusNm: settings.approachRadiusNm,
      signalLossMinutes: settings.signalLossMinutes,
    },
    port: {
      name: PORT.name,
      shortName: PORT.shortName,
      locode: PORT.locode,
      lat: PORT.lat,
      lon: PORT.lon,
    },
    connection,
    serverTime: new Date().toISOString(),
  });
}
