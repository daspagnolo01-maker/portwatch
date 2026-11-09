import { all, one, run, jsonParse } from "../db";
import { nowIso } from "../time";
import { byKey, templateForCargoTypes, CHECKLIST_TEMPLATES, type ChecklistCategory } from "../customsTemplates";
import { ensureTemplatesSeeded } from "./templatesSeed";

export type CustomsStatus = "draft" | "in_progress" | "ready" | "closed";

export interface CustomsOperationRow {
  id: number;
  vessel_id: number;
  port_call_id: number | null;
  template_key: string | null;
  title: string;
  status: CustomsStatus;
  cargo_types: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomsItemRow {
  id: number;
  operation_id: number;
  label: string;
  category: ChecklistCategory;
  required: number;
  done: number;
  done_at: string | null;
  note: string | null;
  sort: number;
}

export interface CustomsOperationWithItems extends CustomsOperationRow {
  items: CustomsItemRow[];
  vessel_name: string | null;
  mmsi: string;
  imo: string | null;
  flag_country: string | null;
  ship_category: string | null;
  call_status: string | null;
  eta: string | null;
}

export async function listTemplates(): Promise<{
  key: string;
  name: string;
  cargoType: string;
  description: string;
  items: number;
}[]> {
  await ensureTemplatesSeeded();
  return CHECKLIST_TEMPLATES.map((template) => ({
    key: template.key,
    name: template.name,
    cargoType: template.cargoType,
    description: template.description,
    items: template.items.length,
  }));
}

export async function getOperation(id: number): Promise<CustomsOperationWithItems | undefined> {
  const operation = await one<CustomsOperationRow>("SELECT * FROM customs_operations WHERE id = ?", id);
  if (!operation) return undefined;
  const items = await all<CustomsItemRow>(
    "SELECT * FROM customs_items WHERE operation_id = ? ORDER BY category, sort, id",
    id,
  );
  const vessel = await one<{
    name: string | null;
    mmsi: string;
    imo: string | null;
    flag_country: string | null;
    ship_category: string | null;
  }>("SELECT name, mmsi, imo, flag_country, ship_category FROM vessels WHERE id = ?", operation.vessel_id);
  const call = operation.port_call_id
    ? await one<{ status: string | null; eta: string | null }>(
        "SELECT status, COALESCE(eta_declared, eta_estimated) AS eta FROM port_calls WHERE id = ?",
        operation.port_call_id,
      )
    : undefined;

  return {
    ...operation,
    items,
    vessel_name: vessel?.name ?? null,
    mmsi: vessel?.mmsi ?? "",
    imo: vessel?.imo ?? null,
    flag_country: vessel?.flag_country ?? null,
    ship_category: vessel?.ship_category ?? null,
    call_status: call?.status ?? null,
    eta: call?.eta ?? null,
  };
}

export async function listOperations(
  filters: { status?: CustomsStatus; vesselId?: number } = {},
): Promise<CustomsOperationWithItems[]> {
  const where: string[] = ["1 = 1"];
  const params: (string | number)[] = [];
  if (filters.status) {
    where.push("co.status = ?");
    params.push(filters.status);
  }
  if (filters.vesselId) {
    where.push("co.vessel_id = ?");
    params.push(filters.vesselId);
  }
  const rows = await all<{ id: number }>(
    `SELECT co.id FROM customs_operations co
     WHERE ${where.join(" AND ")}
     ORDER BY CASE co.status WHEN 'closed' THEN 2 WHEN 'ready' THEN 1 ELSE 0 END, co.updated_at DESC
     LIMIT 300`,
    ...params,
  );
  const operations: CustomsOperationWithItems[] = [];
  for (const row of rows) {
    const operation = await getOperation(row.id);
    if (operation) operations.push(operation);
  }
  return operations;
}

async function insertItems(
  operationId: number,
  items: { label: string; category: ChecklistCategory; required: boolean; note?: string }[],
): Promise<void> {
  let sort = 0;
  for (const item of items) {
    await run(
      `INSERT INTO customs_items (operation_id, label, category, required, done, note, sort)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      operationId,
      item.label,
      item.category,
      item.required,
      item.note ?? null,
      sort++,
    );
  }
}

export interface CreateOperationInput {
  vesselId: number;
  portCallId?: number | null;
  templateKey?: string | null;
  cargoTypes?: string[];
  status?: CustomsStatus;
  title?: string;
  notes?: string | null;
}

export async function createOperation(input: CreateOperationInput): Promise<CustomsOperationWithItems> {
  await ensureTemplatesSeeded();
  const template = input.templateKey
    ? byKey(input.templateKey)
    : templateForCargoTypes(input.cargoTypes ?? []);

  const timestamp = nowIso();
  const { lastId } = await run(
    `INSERT INTO customs_operations
      (vessel_id, port_call_id, template_key, title, status, cargo_types, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'operatore', ?, ?)`,
    input.vesselId,
    input.portCallId ?? null,
    template.key,
    input.title ?? `Preparazione operazioni — ${template.name}`,
    input.status ?? "draft",
    JSON.stringify(input.cargoTypes ?? [template.cargoType]),
    input.notes ?? null,
    timestamp,
    timestamp,
  );
  await insertItems(lastId, template.items);
  const operation = await getOperation(lastId);
  if (!operation) throw new Error("Creazione pratica doganale non riuscita");
  return operation;
}

const OPERATION_COLUMNS = ["title", "status", "cargo_types", "notes", "template_key", "port_call_id"] as const;

export async function updateOperation(
  id: number,
  patch: Partial<Record<(typeof OPERATION_COLUMNS)[number], string | number | null>>,
): Promise<void> {
  const entries = Object.entries(patch).filter(([key]) => OPERATION_COLUMNS.includes(key as (typeof OPERATION_COLUMNS)[number]));
  if (entries.length === 0) return;
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => value as string | number | null);
  await run(`UPDATE customs_operations SET ${assignments}, updated_at = ? WHERE id = ?`, ...values, nowIso(), id);
}

export async function setItemDone(itemId: number, done: boolean, note?: string | null): Promise<void> {
  await run(
    "UPDATE customs_items SET done = ?, done_at = ?, note = COALESCE(?, note) WHERE id = ?",
    done,
    done ? nowIso() : null,
    note ?? null,
    itemId,
  );
}

export async function addItem(
  operationId: number,
  item: { label: string; category: ChecklistCategory; required: boolean; note?: string | null },
): Promise<void> {
  const maxSort =
    (await one<{ m: number }>("SELECT COALESCE(MAX(sort), 0) AS m FROM customs_items WHERE operation_id = ?", operationId))
      ?.m ?? 0;
  await run(
    `INSERT INTO customs_items (operation_id, label, category, required, done, note, sort)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    operationId,
    item.label,
    item.category,
    item.required,
    item.note ?? null,
    maxSort + 1,
  );
  await touchOperation(operationId);
}

export async function deleteItem(itemId: number, operationId: number): Promise<void> {
  await run("DELETE FROM customs_items WHERE id = ?", itemId);
  await touchOperation(operationId);
}

async function touchOperation(operationId: number): Promise<void> {
  await run("UPDATE customs_operations SET updated_at = ? WHERE id = ?", nowIso(), operationId);
}

export async function deleteOperation(id: number): Promise<void> {
  await run("DELETE FROM customs_operations WHERE id = ?", id);
}

export function operationProgress(operation: CustomsOperationWithItems): {
  total: number;
  done: number;
  requiredTotal: number;
  requiredDone: number;
  percent: number;
} {
  const total = operation.items.length;
  const done = operation.items.filter((item) => item.done === 1).length;
  const requiredItems = operation.items.filter((item) => item.required === 1);
  const requiredDone = requiredItems.filter((item) => item.done === 1).length;
  return {
    total,
    done,
    requiredTotal: requiredItems.length,
    requiredDone,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/**
 * Crea automaticamente la pratica doganale (bozza) quando una nave entra tra le
 * attese e la sua scheda storica contiene tipologie di merce note.
 */
export async function ensureOperationForVessel(input: {
  vesselId: number;
  portCallId: number | null;
  cargoTypes: string[];
  vesselName: string | null;
}): Promise<{ created: boolean; operationId?: number }> {
  if (input.cargoTypes.length === 0) return { created: false };
  const existing = await one<{ id: number }>(
    "SELECT id FROM customs_operations WHERE vessel_id = ? AND status <> 'closed' ORDER BY id DESC LIMIT 1",
    input.vesselId,
  );
  if (existing) return { created: false, operationId: existing.id };

  const operation = await createOperation({
    vesselId: input.vesselId,
    portCallId: input.portCallId,
    cargoTypes: input.cargoTypes,
  });
  return { created: true, operationId: operation.id };
}

export async function openOperationsCount(): Promise<number> {
  return (
    (
      await one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM customs_operations WHERE status IN ('draft','in_progress')",
      )
    )?.n ?? 0
  );
}

export function parseCargoTypes(value: string | null | undefined): string[] {
  return jsonParse<string[]>(value ?? null, []);
}
