import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/port";
import { scheduleAreaRefresh } from "@/lib/ais/status";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ settings: await getSettings() });
}

export async function PUT(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const before = await getSettings();
  const patch: Partial<AppSettings> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    if (!(key in body)) continue;
    const value = body[key];
    if (typeof DEFAULT_SETTINGS[key] === "boolean") {
      (patch as Record<string, unknown>)[key] = value === true || value === "true";
    } else if (key === "minSeverity") {
      if (value === "info" || value === "warning" || value === "critical") patch.minSeverity = value;
    } else {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) (patch as Record<string, unknown>)[key] = numeric;
    }
  }

  if (patch.centerLat !== undefined) {
    if (!Number.isFinite(patch.centerLat) || patch.centerLat < -85 || patch.centerLat > 85) {
      return NextResponse.json({ error: "Latitudine fuori range (-85 / 85)." }, { status: 400 });
    }
  }
  if (patch.centerLon !== undefined) {
    if (!Number.isFinite(patch.centerLon) || patch.centerLon < -180 || patch.centerLon > 180) {
      return NextResponse.json({ error: "Longitudine fuori range (-180 / 180)." }, { status: 400 });
    }
  }

  const settings = await updateSettings(patch);

  const areaChanged =
    settings.centerLat !== before.centerLat ||
    settings.centerLon !== before.centerLon ||
    settings.monitorRadiusNm !== before.monitorRadiusNm;

  if (areaChanged) {
    // Nuova area: il prossimo polling la usa subito (nessun throttle).
    await scheduleAreaRefresh({ force: true });
  }

  return NextResponse.json({ ok: true, settings, resubscribed: areaChanged });
}
