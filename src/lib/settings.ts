import { all, run, one } from "./db";
import { DEFAULT_SETTINGS, SETTING_LIMITS, type AppSettings, type Severity } from "./port";
import { nowIso } from "./time";

type NumericSettingKey = keyof typeof SETTING_LIMITS;

function clampNumber(value: unknown, fallback: number, key: NumericSettingKey): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const limits = SETTING_LIMITS[key];
  return Math.min(limits.max, Math.max(limits.min, numeric));
}

function normalize(raw: Partial<Record<keyof AppSettings, unknown>>): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...raw } as Record<string, unknown>;

  const settings: AppSettings = {
    centerLat: Number(merged.centerLat),
    centerLon: Number(merged.centerLon),
    monitorRadiusNm: clampNumber(merged.monitorRadiusNm, DEFAULT_SETTINGS.monitorRadiusNm, "monitorRadiusNm"),
    portRadiusM: clampNumber(merged.portRadiusM, DEFAULT_SETTINGS.portRadiusM, "portRadiusM"),
    approachRadiusNm: clampNumber(merged.approachRadiusNm, DEFAULT_SETTINGS.approachRadiusNm, "approachRadiusNm"),
    signalLossMinutes: Math.round(
      clampNumber(merged.signalLossMinutes, DEFAULT_SETTINGS.signalLossMinutes, "signalLossMinutes"),
    ),
    departureConfirmMinutes: Math.round(
      clampNumber(
        merged.departureConfirmMinutes,
        DEFAULT_SETTINGS.departureConfirmMinutes,
        "departureConfirmMinutes",
      ),
    ),
    entryConfirmSamples: Math.round(
      clampNumber(merged.entryConfirmSamples, DEFAULT_SETTINGS.entryConfirmSamples, "entryConfirmSamples"),
    ),
    exitHysteresisPct: Math.round(
      clampNumber(merged.exitHysteresisPct, DEFAULT_SETTINGS.exitHysteresisPct, "exitHysteresisPct"),
    ),
    etaChangeMinutes: Math.round(
      clampNumber(merged.etaChangeMinutes, DEFAULT_SETTINGS.etaChangeMinutes, "etaChangeMinutes"),
    ),
    eventDedupeMinutes: Math.round(
      clampNumber(merged.eventDedupeMinutes, DEFAULT_SETTINGS.eventDedupeMinutes, "eventDedupeMinutes"),
    ),
    positionRetentionDays: Math.round(
      clampNumber(merged.positionRetentionDays, DEFAULT_SETTINGS.positionRetentionDays, "positionRetentionDays"),
    ),
    notificationsEnabled: merged.notificationsEnabled !== false,
    emailEnabled: merged.emailEnabled !== false,
    minSeverity: (["info", "warning", "critical"] as const).includes(merged.minSeverity as Severity)
      ? (merged.minSeverity as Severity)
      : DEFAULT_SETTINGS.minSeverity,
  };

  if (!Number.isFinite(settings.centerLat) || settings.centerLat < -85 || settings.centerLat > 85) {
    settings.centerLat = DEFAULT_SETTINGS.centerLat;
  }
  if (!Number.isFinite(settings.centerLon) || settings.centerLon < -180 || settings.centerLon > 180) {
    settings.centerLon = DEFAULT_SETTINGS.centerLon;
  }
  if (settings.approachRadiusNm > settings.monitorRadiusNm) {
    settings.approachRadiusNm = settings.monitorRadiusNm;
  }
  return settings;
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      raw[row.key] = JSON.parse(row.value);
    } catch {
      raw[row.key] = row.value;
    }
  }
  return normalize(raw as Partial<Record<keyof AppSettings, unknown>>);
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  const timestamp = nowIso();
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    if (value === undefined) continue;
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      JSON.stringify(value),
      timestamp,
    );
  }
  return getSettings();
}

export interface Recipient {
  id: number;
  email: string;
  name: string | null;
  active: number;
  created_at: string;
}

export async function listRecipients(): Promise<Recipient[]> {
  return all<Recipient>("SELECT * FROM notification_recipients ORDER BY email");
}

export async function activeRecipientEmails(): Promise<string[]> {
  return (
    await all<{ email: string }>(
      "SELECT email FROM notification_recipients WHERE active = 1 ORDER BY email",
    )
  ).map((row) => row.email);
}

export async function addRecipient(email: string, name?: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "Indirizzo email non valido." };
  }
  await run(
    `INSERT INTO notification_recipients (email, name, active, created_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(email) DO UPDATE SET name = excluded.name, active = 1`,
    trimmed,
    name?.trim() || null,
    nowIso(),
  );
  return { ok: true };
}

export async function removeRecipient(id: number): Promise<void> {
  await run("DELETE FROM notification_recipients WHERE id = ?", id);
}

export async function toggleRecipient(id: number, active: boolean): Promise<void> {
  await run("UPDATE notification_recipients SET active = ? WHERE id = ?", active, id);
}

export async function ensureSeedRecipients(): Promise<void> {
  const seeded = await one<{ value: string }>("SELECT value FROM app_meta WHERE key = 'recipients_seeded'");
  if (seeded) return;
  const fromEnv = (process.env.NOTIFY_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const email of fromEnv) await addRecipient(email);
  await run(
    "INSERT INTO app_meta (key, value) VALUES ('recipients_seeded', ?) ON CONFLICT(key) DO NOTHING",
    nowIso(),
  );
}
