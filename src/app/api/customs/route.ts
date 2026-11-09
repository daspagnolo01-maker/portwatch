import { NextResponse } from "next/server";
import {
  createOperation,
  listOperations,
  listTemplates,
  type CustomsStatus,
} from "@/lib/repo/customs";
import { getVessel, getProfile, profileCargoTypes } from "@/lib/repo/vessels";
import { getOpenCall } from "@/lib/repo/calls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") as CustomsStatus | null;
  return NextResponse.json({
    templates: await listTemplates(),
    operations: await listOperations({
      ...(status ? { status } : {}),
      ...(url.searchParams.get("vesselId")
        ? { vesselId: Number(url.searchParams.get("vesselId")) }
        : {}),
    }),
  });
}

export async function POST(request: Request) {
  let body: {
    vesselId?: number;
    templateKey?: string;
    cargoTypes?: string[];
    title?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const vesselId = Number(body.vesselId);
  const vessel = Number.isInteger(vesselId) ? await getVessel(vesselId) : undefined;
  if (!vessel) return NextResponse.json({ error: "Nave non trovata." }, { status: 404 });

  const profile = await getProfile(vessel.id);
  const cargoTypes =
    Array.isArray(body.cargoTypes) && body.cargoTypes.length > 0
      ? body.cargoTypes.map(String)
      : profileCargoTypes(profile);

  const call = (await getOpenCall(vessel.id)) ?? null;
  const operation = await createOperation({
    vesselId: vessel.id,
    portCallId: call?.id ?? null,
    templateKey: body.templateKey ?? null,
    cargoTypes,
    title: body.title,
    notes: body.notes ?? null,
  });

  return NextResponse.json({ ok: true, operation }, { status: 201 });
}
