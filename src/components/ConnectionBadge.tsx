"use client";

import { useEffect, useState } from "react";

interface StatusResponse {
  status: {
    state: string;
    lastMessageAt: string | null;
    error: string | null;
    messages: number;
    apiKeyConfigured: boolean;
    nextRetryAt: string | null;
    activeSource: string | null;
    activeSourceLabel: string | null;
    sources: { id: string; label: string; state: string; messages: number; lastMessageAt: string | null }[];
  };
}

const LABELS: Record<string, { text: string; chip: string }> = {
  connected: { text: "AIS AGGIORNATO", chip: "chip-ok" },
  connecting: { text: "CONNESSIONE…", chip: "chip-warning" },
  reconnecting: { text: "RICONNESSIONE", chip: "chip-warning" },
  error: { text: "AIS OFFLINE", chip: "chip-critical" },
  no_key: { text: "CHIAVE ASSENTE", chip: "chip-critical" },
  idle: { text: "IN ATTESA", chip: "chip-muted" },
  stopped: { text: "FERMO", chip: "chip-muted" },
};

export function ConnectionBadge() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/ais/status", { cache: "no-store" });
        if (!response.ok) throw new Error("status");
        const payload = (await response.json()) as StatusResponse;
        if (alive) {
          setData(payload);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const state = failed ? "error" : data?.status.state ?? "idle";
  // Connessione attiva ma nessun messaggio ricevuto: può essere una zona senza
  // ricevitori AIS. Va detto esplicitamente, senza far credere che i dati
  // stiano arrivando solo perché la connessione è verde.
  const hasData = (data?.status.messages ?? 0) > 0;
  const connectedNoData = state === "connected" && !hasData;
  const silenceMinutes = data?.status.lastMessageAt
    ? Math.floor((Date.now() - new Date(data.status.lastMessageAt).getTime()) / 60000)
    : null;
  const meta = connectedNoData
    ? { text: "AIS CONNESSO · NESSUN DATO", chip: "chip-warning" }
    : (LABELS[state] ?? LABELS.idle);
  const sourceDetail = (data?.status.sources ?? [])
    .map((source) => `${source.label}: ${source.messages} msg`)
    .join(" · ");
  const tooltipBase = failed
    ? "Impossibile contattare lo stato del server."
    : data?.status.error ??
      (connectedNoData
        ? "Connessione al servizio AIS attiva, ma nessun messaggio ricevuto per quest'area: probabile assenza di ricevitori AIS nella zona. Navi ed eventi verranno registrati automaticamente appena arriveranno dati."
        : data?.status.lastMessageAt
          ? `Ultimo messaggio AIS: ${new Date(data.status.lastMessageAt).toLocaleTimeString("it-IT")}${
              silenceMinutes !== null && silenceMinutes >= 3 ? ` (${silenceMinutes} min fa)` : ""
            }`
          : "Nessun messaggio AIS ricevuto finora.");
  const tooltip = sourceDetail ? `${tooltipBase} — Fonti: ${sourceDetail}` : tooltipBase;

  return (
    <span className={`chip ${meta.chip}`} title={tooltip}>
      <span className={`dot ${state === "connected" && hasData ? "dot-live" : ""}`} style={{ background: state === "connected" && hasData ? undefined : "currentColor" }} />
      {meta.text}
      {state === "connected" && hasData && data?.status.activeSource && (
        <span style={{ opacity: 0.75 }}>
          · {data.status.activeSource === "aiscast" ? "aiscast" : "AISStream"}
        </span>
      )}
      {data && state === "connected" && hasData && (
        <span style={{ fontFamily: "var(--mono)", opacity: 0.8 }}>{data.status.messages}</span>
      )}
    </span>
  );
}
