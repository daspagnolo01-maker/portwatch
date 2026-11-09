"use client";

import { useEffect, useState } from "react";
import type { AppSettings, Severity } from "@/lib/port";
import { DEFAULT_SETTINGS } from "@/lib/port";
import type { Recipient } from "@/lib/settings";

interface StatusPayload {
  status: {
    state: string;
    lastMessageAt: string | null;
    error: string | null;
    messages: number;
    positionReports: number;
    staticReports: number;
    compression: boolean | null;
    attempts: number;
    apiKeyConfigured: boolean;
    subscription: { minLat: number; minLon: number; maxLat: number; maxLon: number } | null;
    nextRetryAt: string | null;
    activeSource: string | null;
    activeSourceLabel: string | null;
    sources: {
      id: string;
      label: string;
      state: string;
      messages: number;
      positionReports: number;
      lastMessageAt: string | null;
      error: string | null;
    }[];
    lastTickAt: string | null;
    lastTickSummary: string | null;
  };
  logs: { ts: string; message: string; level: string }[];
  email: {
    configured: boolean;
    host: string | null;
    from: string | null;
    recipients: number;
    available: boolean;
    transport: string;
    reason: string | null;
  };
}

interface Props {
  initialSettings: AppSettings;
  initialRecipients: Recipient[];
  initialEmail: {
    configured: boolean;
    host: string | null;
    from: string | null;
    recipients: number;
    available: boolean;
    transport: string;
    reason: string | null;
  };
  database: { ok: boolean; file: string; error?: string };
}

type NumericKey = {
  [K in keyof AppSettings]: AppSettings[K] extends number ? K : never;
}[keyof AppSettings];

const NUMERIC_FIELDS: { key: NumericKey; label: string; hint?: string; step?: number }[] = [
  { key: "centerLat", label: "Latitudine centro", step: 0.0001, hint: "Default: 37.9861 (porto)" },
  { key: "centerLon", label: "Longitudine centro", step: 0.0001, hint: "Default: 13.7042 (porto)" },
  { key: "monitorRadiusNm", label: "Raggio monitoraggio (mn)", hint: "Area richiesta al servizio AIS" },
  { key: "portRadiusM", label: "Raggio area portuale (m)", step: 50, hint: "Geofence arrivi/partenze" },
  { key: "approachRadiusNm", label: "Raggio avvicinamento (mn)" },
  { key: "signalLossMinutes", label: "Soglia perdita segnale (min)" },
  { key: "departureConfirmMinutes", label: "Conferma partenza dopo (min)" },
  { key: "entryConfirmSamples", label: "Campioni conferma ingresso" },
  { key: "exitHysteresisPct", label: "Isteresi uscita (%)" },
  { key: "etaChangeMinutes", label: "Variazione ETA avviso (min)" },
  { key: "eventDedupeMinutes", label: "Deduplica eventi (min)" },
  { key: "positionRetentionDays", label: "Conservazione posizioni (giorni)" },
];

const STATE_LABEL: Record<string, string> = {
  connected: "Connesso",
  connecting: "Connessione…",
  reconnecting: "Riconnessione…",
  error: "Errore",
  no_key: "Chiave API assente",
  idle: "Inattivo",
  stopped: "Fermo",
};

export function SettingsPanel({
  initialSettings,
  initialRecipients,
  initialEmail,
  database,
}: Props) {
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [recipients, setRecipients] = useState<Recipient[]>(initialRecipients);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [testTo, setTestTo] = useState(initialRecipients[0]?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailInfo, setEmailInfo] = useState(initialEmail);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/ais/status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as StatusPayload;
        if (alive) {
          setStatus(payload);
          setEmailInfo(payload.email);
        }
      } catch {
        /* lo stato viene mostrato come non disponibile */
      }
    };
    load();
    const id = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const setValue = (key: keyof AppSettings, value: string | number | boolean) =>
    setSettings((current) => ({ ...current, [key]: value }) as AppSettings);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = (await response.json()) as { error?: string; settings?: AppSettings; resubscribed?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "Salvataggio non riuscito");
      if (payload.settings) setSettings(payload.settings);
      setMessage(
        payload.resubscribed
          ? "Impostazioni salvate. Nuovo ciclo AIS avviato sull'area aggiornata."
          : "Impostazioni salvate.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const addRecipient = async () => {
    setError(null);
    try {
      const response = await fetch("/api/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      const payload = (await response.json()) as { error?: string; recipients?: Recipient[] };
      if (!response.ok) throw new Error(payload.error ?? "Inserimento non riuscito");
      if (payload.recipients) setRecipients(payload.recipients);
      setNewEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeRecipient = async (id: number) => {
    const response = await fetch(`/api/recipients?id=${id}`, { method: "DELETE" });
    const payload = (await response.json()) as { recipients?: Recipient[] };
    if (payload.recipients) setRecipients(payload.recipients);
  };

  const toggleRecipient = async (id: number, active: boolean) => {
    const response = await fetch("/api/recipients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    const payload = (await response.json()) as { recipients?: Recipient[] };
    if (payload.recipients) setRecipients(payload.recipients);
  };

  const sendTest = async () => {
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Invio non riuscito");
      setMessage("Email di prova inviata.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const currentStatus = status?.status;

  return (
    <div className="stack">
      {(message || error) && (
        <div className={`notice ${error ? "notice-warn" : "notice-accent"}`}>
          {error ?? message}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <span className="card-title">Collegamento AIS (multi-fonte)</span>
          <span className="spacer" />
          <span className={`chip ${currentStatus?.state === "connected" ? "chip-ok" : "chip-warning"}`}>
            {STATE_LABEL[currentStatus?.state ?? "idle"] ?? currentStatus?.state}
          </span>
          <button
            className="btn btn-sm"
            onClick={async () => {
              await fetch("/api/ais/reconnect", { method: "POST" });
            }}
          >
            Riconnetti
          </button>
        </div>
        <div className="card-body">
          <div className="cols-even">
            <dl className="kv">
              <dt>Chiave API</dt>
              <dd>{currentStatus?.apiKeyConfigured ? "configurata (server-side)" : "assente"}</dd>
              <dt>Fonte attiva</dt>
              <dd>{currentStatus?.activeSourceLabel ?? "— (in attesa di dati)"}</dd>
              <dt>Messaggi</dt>
              <dd className="mono">{currentStatus?.messages ?? 0}</dd>
              <dt>Posizioni / statici</dt>
              <dd className="mono">
                {currentStatus?.positionReports ?? 0} / {currentStatus?.staticReports ?? 0}
              </dd>
              <dt>Ultimo messaggio</dt>
              <dd className="mono">{currentStatus?.lastMessageAt ? formatStamp(currentStatus.lastMessageAt) : "—"}</dd>
              <dt>Cadenza</dt>
              <dd>polling dell&apos;area ogni 15 minuti</dd>
              <dt>Tentativi</dt>
              <dd className="mono">{currentStatus?.attempts ?? 0}</dd>
              <dt>Prossimo retry</dt>
              <dd className="mono">{currentStatus?.nextRetryAt ? formatStamp(currentStatus.nextRetryAt) : "—"}</dd>
              <dt>Ultimo ciclo</dt>
              <dd className="mono">{currentStatus?.lastTickAt ? formatStamp(currentStatus.lastTickAt) : "—"}</dd>
            </dl>
            <div>
              <div className="field-label" style={{ marginBottom: 6 }}>
                Sottoscrizione attiva
              </div>
              {currentStatus?.subscription ? (
                <div className="notice mono" style={{ fontSize: 11 }}>
                  bbox lat {currentStatus.subscription.minLat.toFixed(3)} →{" "}
                  {currentStatus.subscription.maxLat.toFixed(3)}
                  <br />
                  bbox lon {currentStatus.subscription.minLon.toFixed(3)} →{" "}
                  {currentStatus.subscription.maxLon.toFixed(3)}
                </div>
              ) : (
                <div className="notice" style={{ fontSize: 11.5 }}>
                  Nessuna sottoscrizione attiva.
                </div>
              )}
              {currentStatus?.error && (
                <div className="notice notice-warn" style={{ marginTop: 8, fontSize: 11.5 }}>
                  {currentStatus.error}
                </div>
              )}
              <div className="field-label" style={{ marginTop: 12, marginBottom: 6 }}>
                Fonti AIS
              </div>
              {(currentStatus?.sources ?? []).map((source) => (
                <div key={source.id} className="notice mono" style={{ fontSize: 11, marginTop: 4 }}>
                  {source.label} · {STATE_LABEL[source.state] ?? source.state} · {source.messages} msg
                  {source.error ? ` · ${source.error}` : ""}
                </div>
              ))}
              {(currentStatus?.sources ?? []).length === 0 && (
                <div className="notice" style={{ fontSize: 11.5 }}>
                  Nessuna fonte inizializzata.
                </div>
              )}
              <div className="field-hint" style={{ marginTop: 10 }}>
                La fonte aiscast non richiede chiavi: nessuna credenziale AIS è esposta al browser.
              </div>
            </div>
          </div>

          {status?.logs && status.logs.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", fontSize: 11.5, color: "var(--muted)" }}>
                Log di connessione recenti ({status.logs.length})
              </summary>
              <div className="mono" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.7, maxHeight: 220, overflowY: "auto" }}>
                {status.logs.map((log, index) => (
                  <div
                    key={`${log.ts}-${index}`}
                    style={{ color: log.level === "error" ? "var(--red)" : log.level === "warning" ? "var(--amber)" : "var(--muted)" }}
                  >
                    {formatStamp(log.ts)} — {log.message}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Area monitorata e soglie di rilevamento</span>
        </div>
        <div className="card-body">
          <div className="cols-even">
            {NUMERIC_FIELDS.map((field) => (
              <div className="field" key={field.key}>
                <label className="field-label" htmlFor={`s-${field.key}`}>
                  {field.label}
                </label>
                <input
                  id={`s-${field.key}`}
                  className="input mono"
                  type="number"
                  step={field.step ?? 1}
                  value={settings[field.key]}
                  onChange={(event) => setValue(field.key, Number(event.target.value))}
                />
                {field.hint && <span className="field-hint">{field.hint}</span>}
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Salvataggio…" : "Salva impostazioni"}
            </button>
            <button
              className="btn"
              onClick={() =>
                setSettings((current) => ({
                  ...DEFAULT_SETTINGS,
                  notificationsEnabled: current.notificationsEnabled,
                  emailEnabled: current.emailEnabled,
                  minSeverity: current.minSeverity,
                }))
              }
            >
              Ripristina default (porto)
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Notifiche</span>
          <span className="spacer" />                  <span className={`chip ${emailInfo.available ? "chip-ok" : "chip-warning"}`}>
            Email {emailInfo.available ? "operativa" : "non configurata"}
          </span>
        </div>
        <div className="card-body">
          <div className="cols-even">
            <div className="stack">
              <label className="row" style={{ gap: 8, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={settings.notificationsEnabled}
                  onChange={(event) => setValue("notificationsEnabled", event.target.checked)}
                />
                Notifiche eventi abilitate (dashboard + email)
              </label>
              <label className="row" style={{ gap: 8, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={settings.emailEnabled}
                  onChange={(event) => setValue("emailEnabled", event.target.checked)}
                />
                Invio email abilitato
              </label>
              <div className="field">
                <label className="field-label" htmlFor="min-severity">
                  Severità minima per l&apos;email
                </label>
                <select
                  id="min-severity"
                  className="select"
                  value={settings.minSeverity}
                  onChange={(event) => setValue("minSeverity", event.target.value as Severity)}
                >
                  <option value="info">Tutti gli eventi</option>
                  <option value="warning">Solo warning e critici</option>
                  <option value="critical">Solo critici</option>
                </select>
              </div>
              <div className="row">
                <button className="btn" onClick={save} disabled={saving}>
                  Salva notifiche
                </button>
              </div>
            </div>

            <div className="stack">
              <div className="field">
                <label className="field-label" htmlFor="new-recipient">
                  Destinatari delle notifiche
                </label>
                <div className="row">
                  <input
                    id="new-recipient"
                    className="input"
                    placeholder="operatore@dogana.it"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn" onClick={addRecipient} disabled={!newEmail.trim()}>
                    Aggiungi
                  </button>
                </div>
              </div>

              {recipients.length === 0 ? (
                <div className="notice" style={{ fontSize: 11.5 }}>
                  Nessun destinatario: le notifiche restano solo in dashboard.
                </div>
              ) : (
                <div className="stack" style={{ gap: 4 }}>
                  {recipients.map((recipient) => (
                    <div className="row" key={recipient.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
                      <input
                        type="checkbox"
                        checked={recipient.active === 1}
                        onChange={(event) => toggleRecipient(recipient.id, event.target.checked)}
                        aria-label={`Attiva ${recipient.email}`}
                      />
                      <span className="mono" style={{ flex: 1, fontSize: 11.5 }}>
                        {recipient.email}
                      </span>
                      <button className="btn btn-sm btn-danger" onClick={() => removeRecipient(recipient.id)}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="field">
                <label className="field-label" htmlFor="test-email">
                  Invia email di prova
                </label>
                <div className="row">
                  <input
                    id="test-email"
                    className="input"
                    value={testTo}
                    onChange={(event) => setTestTo(event.target.value)}
                    placeholder="indirizzo@example.it"
                    style={{ flex: 1 }}
                  />
                  <button className="btn" onClick={sendTest} disabled={!testTo.trim()}>
                    Invia
                  </button>
                </div>
                <span className="field-hint">
                  {emailInfo.available
                    ? `${emailInfo.transport} · mittente ${emailInfo.from}`
                    : (emailInfo.reason ?? "aggiungere EMAIL_API_KEY nei secret del sito")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Database e sicurezza</span>
        </div>
        <div className="card-body">
          <dl className="kv">
            <dt>Stato DB</dt>
            <dd>{database.ok ? "operativo" : `errore: ${database.error ?? "sconosciuto"}`}</dd>
            <dt>File</dt>
            <dd className="mono" style={{ fontSize: 11 }}>
              {database.file}
            </dd>
            <dt>Persistenza</dt>
            <dd>D1 (Cloudflare): navi, posizioni, scali, eventi, merci e pratiche restano anche dopo i redeploy.</dd>
          </dl>
          <div className="notice notice-accent" style={{ marginTop: 12, fontSize: 11.5 }}>
            <strong>Credenziali.</strong> La chiave di invio email <code>EMAIL_API_KEY</code> vive solo nei secret del
            sito (Sites → Secrets) o in <code>.env.local</code> in sviluppo. Non viene mai inviata al browser né
            salvata nel database.
          </div>
        </div>
      </div>
    </div>
  );
}

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
