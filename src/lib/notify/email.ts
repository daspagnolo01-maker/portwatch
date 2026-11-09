import { run } from "../db";
import { getSettings, activeRecipientEmails, ensureSeedRecipients } from "../settings";
import { SEVERITY_RANK, type Severity } from "../port";
import type { EventRow } from "../repo/events";

/**
 * Notifiche email.
 *
 * L'istanza è ospitata su Cloudflare Workers, dove non esiste un socket SMTP:
 * l'invio passa da un'API HTTP esterna (Brevo, piano gratuito 300 email/giorno,
 * endpoint `POST https://api.brevo.com/v3/smtp/email`, header `api-key`).
 *
 * La chiave arriva dai secret del sito (`EMAIL_API_KEY`) e non è mai esposta al
 * browser. Se la chiave manca, l'evento resta registrato con `email_status =
 * 'skipped'` e il motivo esplicito: nessun invio viene simulato.
 */
const API_URL = "https://api.brevo.com/v3/smtp/email";
const PROVIDER_LABEL = "Brevo (API HTTP)";
const NO_KEY_REASON =
  "invio email non configurato: aggiungere EMAIL_API_KEY nei secret del sito (Sites → Secrets) per attivare Brevo";

const FROM_NAME = "PortWatch Termini Imerese";

export interface EmailStatus {
  configured: boolean;
  host: string | null;
  from: string | null;
  recipients: number;
  transport: string;
  available: boolean;
  reason: string | null;
}

type EnvLike = Record<string, unknown>;

/** Legge l'ambiente del Worker; nei test e in build il contesto non esiste. */
async function workerEnv(): Promise<EnvLike> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    return (context.env ?? {}) as EnvLike;
  } catch {
    return {};
  }
}

function readEnv(name: string, source: EnvLike): string {
  const raw = source[name] ?? process.env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

interface Config {
  key: string;
  from: string | null;
  recipients: string[];
}

async function config(): Promise<Config> {
  await ensureSeedRecipients();
  const [env, recipients] = await Promise.all([workerEnv(), activeRecipientEmails()]);
  const from = readEnv("EMAIL_FROM", env) || recipients[0] || null;
  return { key: readEnv("EMAIL_API_KEY", env), from, recipients };
}

export async function emailStatus(): Promise<EmailStatus> {
  const cfg = await config();
  const available = cfg.key.length > 0;
  return {
    configured: available,
    host: available ? "api.brevo.com" : null,
    from: cfg.from,
    recipients: cfg.recipients.length,
    transport: available ? PROVIDER_LABEL : "non configurato",
    available,
    reason: available ? null : NO_KEY_REASON,
  };
}

interface SendResult {
  ok: boolean;
  error?: string;
}

/** Invio effettivo tramite l'API HTTP del provider. */
async function deliver(
  cfg: Config,
  to: string[],
  subject: string,
  html: string,
  text: string,
): Promise<SendResult> {
  if (!cfg.key) return { ok: false, error: NO_KEY_REASON };
  if (!cfg.from) return { ok: false, error: "mittente non configurato: impostare EMAIL_FROM o un destinatario" };
  if (to.length === 0) return { ok: false, error: "nessun destinatario configurato" };

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "api-key": cfg.key,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: cfg.from },
        to: to.map((email) => ({ email })),
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
  } catch (error) {
    return { ok: false, error: `rete: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (response.ok) return { ok: true };

  let detail = "";
  try {
    const payload = (await response.json()) as { message?: string; code?: string };
    detail = payload.message ?? payload.code ?? "";
  } catch {
    detail = (await response.text().catch(() => "")).slice(0, 200);
  }
  return {
    ok: false,
    error: `Brevo HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Invio della notifica email per un evento; aggiorna lo stato sul record evento. */
export async function sendEventEmail(event: EventRow): Promise<void> {
  const settings = await getSettings();
  const cfg = await config();

  const record = async (status: "sent" | "failed" | "skipped", error: string | null) => {
    await run("UPDATE events SET email_status = ?, email_error = ? WHERE id = ?", status, error, event.id);
  };

  if (!settings.notificationsEnabled) return record("skipped", "notifiche disabilitate");
  if (!settings.emailEnabled) return record("skipped", "invio email disabilitato");
  if (SEVERITY_RANK[event.severity] < SEVERITY_RANK[settings.minSeverity as Severity]) {
    return record("skipped", `severità sotto la soglia (${settings.minSeverity})`);
  }
  if (cfg.recipients.length === 0) return record("skipped", "nessun destinatario configurato");
  if (!cfg.key) return record("skipped", NO_KEY_REASON);

  const when = new Date(event.ts).toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  const text = [
    event.title,
    `Tipo: ${event.type} · Severità: ${event.severity}`,
    event.vessel_name ? `Nave: ${event.vessel_name}${event.mmsi ? ` (MMSI ${event.mmsi})` : ""}` : null,
    `Rilevato: ${when}`,
    event.details ? `\n${event.details}` : null,
    "\nPortWatch — porto di Termini Imerese (ITTRI)",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<h2 style="font-family:system-ui,sans-serif;margin:0 0 8px">${escapeHtml(event.title)}</h2>
<p style="font-family:system-ui,sans-serif;color:#475569;margin:0 0 12px">
${escapeHtml(event.type)} · severità ${escapeHtml(event.severity)}${event.vessel_name ? ` · ${escapeHtml(event.vessel_name)}` : ""}
</p>
<p style="font-family:system-ui,sans-serif;margin:0 0 8px"><strong>Rilevato:</strong> ${escapeHtml(when)}</p>
${event.details ? `<p style="font-family:system-ui,sans-serif;white-space:pre-line">${escapeHtml(event.details)}</p>` : ""}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
<p style="font-family:system-ui,sans-serif;font-size:12px;color:#64748b">
PortWatch — porto di Termini Imerese (ITTRI). Orari di rilevamento AIS, non dati ufficiali dell'Autorità Portuale.
</p>`;

  const result = await deliver(cfg, cfg.recipients, `[PortWatch] ${event.title}`, html, text);
  return record(result.ok ? "sent" : "failed", result.ok ? null : result.error ?? "errore sconosciuto");
}

export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: "Indirizzo email non valido." };
  const cfg = await config();
  if (!cfg.key) return { ok: false, error: `${NO_KEY_REASON}.` };

  const when = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  return deliver(
    cfg,
    [to],
    "[PortWatch] Email di prova",
    `<p style="font-family:system-ui,sans-serif">Canale email operativo. Invio di prova del ${escapeHtml(when)}.</p>`,
    `Canale email operativo. Invio di prova del ${when}.`,
  );
}
