import { all, one, run, jsonParse } from "../db";
import { getSettings } from "../settings";
import { nowIso } from "../time";
import { sendEventEmail } from "../notify/email";
import type { Severity } from "../port";

export type EventType =
  | "ENTRY"
  | "EXIT"
  | "APPROACH"
  | "ETA_CHANGE"
  | "SIGNAL_LOST"
  | "SIGNAL_RESTORED"
  | "CALL_OPENED";

export interface EventRow {
  id: number;
  type: EventType;
  severity: Severity;
  vessel_id: number | null;
  vessel_name: string | null;
  mmsi: string | null;
  title: string;
  details: string | null;
  ts: string;
  email_status: string | null;
  email_error: string | null;
  acknowledged: number;
  created_at: string;
}

export interface NewEventInput {
  type: EventType;
  severity?: Severity;
  vesselId: number | null;
  vesselName?: string | null;
  mmsi?: string | null;
  title: string;
  details?: Record<string, unknown>;
  ts?: string;
}

/**
 * Crea un evento applicando la deduplica: lo stesso tipo di evento sulla stessa
 * nave entro la finestra configurata non viene registrato due volte.
 */
export async function createEvent(
  input: NewEventInput,
): Promise<{ created: boolean; event?: EventRow; reason?: string }> {
  const settings = await getSettings();
  const ts = input.ts ?? nowIso();

  if (settings.eventDedupeMinutes > 0) {
    const since = new Date(Date.parse(ts) - settings.eventDedupeMinutes * 60_000).toISOString();
    const duplicate = input.vesselId
      ? await one<{ id: number }>(
          "SELECT id FROM events WHERE type = ? AND vessel_id = ? AND ts >= ? LIMIT 1",
          input.type,
          input.vesselId,
          since,
        )
      : await one<{ id: number }>(
          "SELECT id FROM events WHERE type = ? AND mmsi IS ? AND ts >= ? LIMIT 1",
          input.type,
          input.mmsi ?? null,
          since,
        );
    if (duplicate) return { created: false, reason: "duplicato" };
  }

  const severity = input.severity ?? "info";
  const { lastId } = await run(
    `INSERT INTO events (type, severity, vessel_id, vessel_name, mmsi, title, details, ts, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.type,
    severity,
    input.vesselId,
    input.vesselName ?? null,
    input.mmsi ?? null,
    input.title,
    input.details ? JSON.stringify(input.details) : null,
    ts,
    nowIso(),
  );

  const event = await one<EventRow>("SELECT * FROM events WHERE id = ?", lastId);
  if (event && settings.notificationsEnabled) {
    // Invio email non bloccante: l'evento è già persistito e visibile in dashboard.
    void sendEventEmail(event);
  }
  return { created: true, event };
}

export interface EventFilters {
  type?: string;
  vesselId?: number;
  from?: string;
  to?: string;
  limit?: number;
  acknowledged?: boolean;
  query?: string;
}

export async function listEvents(filters: EventFilters = {}): Promise<EventRow[]> {
  const where: string[] = ["1 = 1"];
  const params: (string | number | null)[] = [];

  if (filters.type) {
    where.push("type = ?");
    params.push(filters.type);
  }
  if (filters.vesselId) {
    where.push("vessel_id = ?");
    params.push(filters.vesselId);
  }
  if (filters.from) {
    where.push("ts >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("ts <= ?");
    params.push(filters.to);
  }
  if (filters.acknowledged !== undefined) {
    where.push("acknowledged = ?");
    params.push(filters.acknowledged ? 1 : 0);
  }
  if (filters.query) {
    where.push("(vessel_name LIKE ? OR mmsi LIKE ? OR title LIKE ?)");
    const like = `%${filters.query}%`;
    params.push(like, like, like);
  }

  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 2000);
  return all<EventRow>(
    `SELECT * FROM events WHERE ${where.join(" AND ")} ORDER BY ts DESC LIMIT ${limit}`,
    ...params,
  );
}

export async function acknowledgeEvents(ids: number[]): Promise<number> {
  let updated = 0;
  for (const id of ids) {
    if (!Number.isInteger(id)) continue;
    updated += (await run("UPDATE events SET acknowledged = 1 WHERE id = ? AND acknowledged = 0", id)).changes;
  }
  return updated;
}

export async function unacknowledgedCount(): Promise<number> {
  return (await one<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE acknowledged = 0"))?.n ?? 0;
}

export function eventDetails(event: EventRow): Record<string, unknown> {
  return jsonParse<Record<string, unknown>>(event.details, {});
}
