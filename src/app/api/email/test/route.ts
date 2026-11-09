import { NextResponse } from "next/server";
import { sendTestEmail } from "@/lib/notify/email";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { to?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }
  const result = await sendTestEmail(String(body.to ?? ""));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
