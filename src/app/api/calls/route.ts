import { NextResponse } from "next/server";
import { listCalls, type CallKind } from "@/lib/repo/calls";

export const dynamic = "force-dynamic";

const KINDS: CallKind[] = ["expected", "arrivals", "departures", "inport", "all"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = (url.searchParams.get("kind") ?? "expected") as CallKind;
  const kind: CallKind = KINDS.includes(requested) ? requested : "expected";

  const calls = await listCalls(kind, {
    query: url.searchParams.get("query") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    origin: url.searchParams.get("origin") ?? undefined,
    destination: url.searchParams.get("destination") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 500),
  });

  return NextResponse.json({ kind, count: calls.length, calls });
}
