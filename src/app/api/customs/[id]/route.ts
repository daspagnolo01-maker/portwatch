import { NextResponse } from "next/server";
import {
  addItem,
  deleteItem,
  deleteOperation,
  getOperation,
  setItemDone,
  updateOperation,
  type CustomsStatus,
} from "@/lib/repo/customs";
import type { ChecklistCategory } from "@/lib/customsTemplates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const STATUSES: CustomsStatus[] = ["draft", "in_progress", "ready", "closed"];
const CATEGORIES: ChecklistCategory[] = ["documento", "merce", "controllo", "operativo"];

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const operation = await getOperation(Number(id));
  if (!operation) return NextResponse.json({ error: "Pratica non trovata." }, { status: 404 });
  return NextResponse.json({ operation });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const operationId = Number(id);
  const operation = await getOperation(operationId);
  if (!operation) return NextResponse.json({ error: "Pratica non trovata." }, { status: 404 });

  let body: {
    status?: string;
    notes?: string | null;
    title?: string;
    item?: { id: number; done: boolean; note?: string | null };
    addItem?: { label: string; category: string; required?: boolean; note?: string | null };
    deleteItemId?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  if (body.status) {
    if (!STATUSES.includes(body.status as CustomsStatus)) {
      return NextResponse.json({ error: "Stato non valido." }, { status: 400 });
    }
    await updateOperation(operationId, { status: body.status });
  }
  if ("notes" in body) await updateOperation(operationId, { notes: body.notes ?? null });
  if (body.title) await updateOperation(operationId, { title: String(body.title).slice(0, 200) });

  if (body.item && Number.isInteger(body.item.id)) {
    await setItemDone(Number(body.item.id), Boolean(body.item.done), body.item.note ?? null);
  }

  if (body.addItem?.label) {
    const category = CATEGORIES.includes(body.addItem.category as ChecklistCategory)
      ? (body.addItem.category as ChecklistCategory)
      : "documento";
    await addItem(operationId, {
      label: String(body.addItem.label).slice(0, 300),
      category,
      required: body.addItem.required !== false,
      note: body.addItem.note ?? null,
    });
  }

  if (body.deleteItemId && Number.isInteger(body.deleteItemId)) {
    await deleteItem(Number(body.deleteItemId), operationId);
  }

  return NextResponse.json({ ok: true, operation: await getOperation(operationId) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const operationId = Number(id);
  if (!(await getOperation(operationId))) {
    return NextResponse.json({ error: "Pratica non trovata." }, { status: 404 });
  }
  await deleteOperation(operationId);
  return NextResponse.json({ ok: true });
}
