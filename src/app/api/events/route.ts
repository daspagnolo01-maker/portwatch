import { NextResponse } from "next/server";
import { acknowledgeEvents, listEvents } from "@/lib/repo/events";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const events = await listEvents({
    type: url.searchParams.get("type") ?? undefined,
    vesselId: url.searchParams.get("vesselId")
      ? Number(url.searchParams.get("vesselId"))
      : undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    query: url.searchParams.get("query") ?? undefined,
    acknowledged:
      url.searchParams.get("acknowledged") === null
        ? undefined
        : url.searchParams.get("acknowledged") === "1",
    limit: Number(url.searchParams.get("limit") ?? 200),
  });
  return NextResponse.json({ count: events.length, events });
}

export async function PATCH(request: Request) {
  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Nessun evento indicato." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, updated: await acknowledgeEvents(ids) });
}
