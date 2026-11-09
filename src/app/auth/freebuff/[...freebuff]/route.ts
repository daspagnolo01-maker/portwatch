import type { NextRequest } from "next/server";
import { freebuff } from "@/lib/freebuff";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return freebuff().handlers.GET(request);
}

export function POST(request: NextRequest) {
  return freebuff().handlers.POST(request);
}
