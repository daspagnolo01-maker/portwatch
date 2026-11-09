import { NextResponse } from "next/server";
import { vesselTrack } from "@/lib/repo/live";
import { getVessel } from "@/lib/repo/vessels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vesselId = Number(id);
  if (!Number.isInteger(vesselId) || !(await getVessel(vesselId))) {
    return NextResponse.json({ error: "Nave non trovata." }, { status: 404 });
  }
  const url = new URL(request.url);
  const hours = Math.min(Math.max(Number(url.searchParams.get("hours") ?? 24), 1), 24 * 30);
  const track = await vesselTrack(vesselId, hours);
  return NextResponse.json({ hours, count: track.length, track });
}
