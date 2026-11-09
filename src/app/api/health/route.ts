import { NextResponse } from "next/server";
import { databaseHealth } from "@/lib/db";
import { getDashboardStats } from "@/lib/repo/stats";
import { getAisStatus } from "@/lib/ais/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const [database, status] = await Promise.all([databaseHealth(), getAisStatus()]);
  let stats = null;
  try {
    stats = await getDashboardStats();
  } catch {
    stats = null;
  }
  return NextResponse.json(
    {
      ok: database.ok,
      database,
      ais: status.state,
      stats,
      time: new Date().toISOString(),
    },
    { status: database.ok ? 200 : 500 },
  );
}
