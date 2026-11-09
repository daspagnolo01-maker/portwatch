import { NextResponse } from "next/server";
import {
  getVessel,
  getProfile,
  updateVessel,
  updateProfile,
  type ProfilePatch,
  type VesselPatch,
} from "@/lib/repo/vessels";
import { callsForVessel } from "@/lib/repo/calls";
import { listEvents } from "@/lib/repo/events";
import { listOperations } from "@/lib/repo/customs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const vesselId = Number(id);
  if (!Number.isInteger(vesselId)) {
    return NextResponse.json({ error: "Identificativo nave non valido." }, { status: 400 });
  }
  const vessel = await getVessel(vesselId);
  if (!vessel) return NextResponse.json({ error: "Nave non trovata." }, { status: 404 });

  return NextResponse.json({
    vessel,
    profile: await getProfile(vesselId),
    calls: await callsForVessel(vesselId, 25),
    events: await listEvents({ vesselId, limit: 40 }),
    operations: await listOperations({ vesselId }),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const vesselId = Number(id);
  if (!Number.isInteger(vesselId)) {
    return NextResponse.json({ error: "Identificativo nave non valido." }, { status: 400 });
  }
  const vessel = await getVessel(vesselId);
  if (!vessel) return NextResponse.json({ error: "Nave non trovata." }, { status: 404 });

  let body: { vessel?: Record<string, unknown>; profile?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const vesselPatch: VesselPatch = {};
  if (body.vessel) {
    const numericKeys = ["gt", "dwt", "year_built", "length_m", "beam_m"];
    const allowed = [
      "imo",
      "name",
      "callsign",
      "owner",
      "operator",
      "company",
      "gt",
      "dwt",
      "year_built",
      "length_m",
      "beam_m",
      "note",
      "flag_country",
    ] as const;
    for (const key of allowed) {
      if (!(key in body.vessel)) continue;
      const value = body.vessel[key];
      if (value === null || value === "") {
        vesselPatch[key] = null;
        continue;
      }
      if (numericKeys.includes(key)) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) vesselPatch[key] = numeric;
      } else {
        vesselPatch[key] = String(value).slice(0, 400);
      }
    }
    // IMO: solo cifre, se presente.
    if (typeof vesselPatch.imo === "string") {
      const digits = vesselPatch.imo.replace(/\D/g, "");
      vesselPatch.imo = digits.length > 0 ? digits : null;
    }
    if (Object.keys(vesselPatch).length > 0) await updateVessel(vesselId, vesselPatch);
  }

  if (body.profile) {
    const profilePatch: ProfilePatch = {};
    const keys: (keyof ProfilePatch)[] = [
      "cargo_types",
      "cargo_description",
      "hs_codes",
      "transport_mode",
      "cargo_particulars",
      "usual_routes",
      "frequent_ports",
      "usual_origins",
      "usual_destinations",
      "call_frequency",
      "operator_notes",
    ];
    for (const key of keys) {
      if (!(key in body.profile)) continue;
      const value = body.profile[key];
      if (value === null || value === "") {
        profilePatch[key] = null;
      } else if (Array.isArray(value)) {
        profilePatch[key] = JSON.stringify(value);
      } else {
        profilePatch[key] = String(value).slice(0, 4000);
      }
    }
    if (Object.keys(profilePatch).length > 0) await updateProfile(vesselId, profilePatch);
  }

  return NextResponse.json({
    ok: true,
    vessel: await getVessel(vesselId),
    profile: await getProfile(vesselId),
  });
}
