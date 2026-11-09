import { NextResponse } from "next/server";
import { getAisStatus, requestReconnect } from "@/lib/ais/status";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await requestReconnect();
  return NextResponse.json({ ok: result.ok, result, status: await getAisStatus() });
}
