import { NextResponse } from "next/server";
import { ensureVessel, listVesselCards, updateVessel, getProfile } from "@/lib/repo/vessels";
import { shipTypeInfo } from "@/lib/shipTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const vessels = await listVesselCards({
    query: url.searchParams.get("query") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    hasProfile: url.searchParams.get("hasProfile") === "1",
    limit: Number(url.searchParams.get("limit") ?? 500),
  });
  return NextResponse.json({ count: vessels.length, vessels });
}

export async function POST(request: Request) {
  let body: { mmsi?: string; name?: string; imo?: string; shipTypeCode?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const mmsi = String(body.mmsi ?? "").replace(/\D/g, "");
  if (mmsi.length !== 9) {
    return NextResponse.json({ error: "MMSI non valido: sono richieste 9 cifre." }, { status: 400 });
  }
  const imo = body.imo ? String(body.imo).replace(/\D/g, "") : null;

  const vessel = await ensureVessel(mmsi, body.name ?? null, imo);
  if (body.name || imo) {
    await updateVessel(vessel.id, {
      ...(body.name ? { name: body.name } : {}),
      ...(imo ? { imo } : {}),
    });
  }
  if (typeof body.shipTypeCode === "number") {
    const info = shipTypeInfo(body.shipTypeCode);
    await updateVessel(vessel.id, {
      ship_type_code: body.shipTypeCode,
      ship_type_label: info.label,
      ship_category: info.category,
    });
  }

  return NextResponse.json({ vessel, profile: await getProfile(vessel.id) }, { status: 201 });
}
