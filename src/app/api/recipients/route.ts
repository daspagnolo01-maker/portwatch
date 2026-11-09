import { NextResponse } from "next/server";
import {
  addRecipient,
  listRecipients,
  removeRecipient,
  toggleRecipient,
} from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ recipients: await listRecipients() });
}

export async function POST(request: Request) {
  let body: { email?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }
  const result = await addRecipient(String(body.email ?? ""), body.name);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, recipients: await listRecipients() }, { status: 201 });
}

export async function PATCH(request: Request) {
  let body: { id?: number; active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "ID non valido." }, { status: 400 });
  await toggleRecipient(id, body.active !== false);
  return NextResponse.json({ ok: true, recipients: await listRecipients() });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "ID non valido." }, { status: 400 });
  await removeRecipient(id);
  return NextResponse.json({ ok: true, recipients: await listRecipients() });
}
