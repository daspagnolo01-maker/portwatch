"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EventRow } from "@/lib/repo/events";
import { EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from "@/lib/port";

interface Props {
  initialEvents: EventRow[];
  limit?: number;
  pollMs?: number;
  compact?: boolean;
}

export function EventFeed({ initialEvents, limit = 8, pollMs = 15_000, compact = false }: Props) {
  const [events, setEvents] = useState<EventRow[]>(initialEvents);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/events?limit=${limit}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { events: EventRow[] };
        if (alive) setEvents(payload.events);
      } catch {
        /* silenzioso: la dashboard continua a mostrare l'ultimo stato noto */
      }
    };
    const id = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [limit, pollMs]);

  const acknowledge = async (id: number) => {
    setPending(id);
    setError(null);
    try {
      const response = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!response.ok) throw new Error("Aggiornamento non riuscito");
      setEvents((current) =>
        current.map((event) => (event.id === id ? { ...event, acknowledged: 1 } : event)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  };

  if (events.length === 0) {
    return (
      <div className="empty">
        Nessun evento registrato.
        <br />
        Gli eventi vengono creati solo da segnali AIS reali (ingressi, uscite, avvicinamenti, ETA, perdita di segnale).
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 0 }}>
      {error && (
        <div className="notice notice-warn" style={{ margin: 12 }}>
          {error}
        </div>
      )}
      <div className="event-list">
        {events.map((event) => {
          const details = safeDetails(event.details);
          return (
            <div className="event-item" key={event.id}>
              <span className={`event-icon ${event.severity}`} aria-hidden="true">
                {EVENT_TYPE_ICONS[event.type] ?? "•"}
              </span>
              <div className="event-body">
                <div className="event-title">
                  {event.vessel_id ? (
                    <Link href={`/navi/${event.vessel_id}`} style={{ color: "inherit" }}>
                      {event.title}
                    </Link>
                  ) : (
                    event.title
                  )}
                </div>
                <div className="event-meta">
                  <span className={`chip chip-${severityClass(event.severity)}`} style={{ fontSize: 9 }}>
                    {EVENT_TYPE_LABELS[event.type] ?? event.type}
                  </span>
                  <span>{formatStamp(event.ts)}</span>
                  {event.mmsi && <span>{event.mmsi}</span>}
                  {details.distanceNm !== undefined && <span>{String(details.distanceNm)} mn</span>}
                  {event.email_status === "sent" && <span style={{ color: "var(--green)" }}>email inviata</span>}
                  {event.email_status === "failed" && <span style={{ color: "var(--red)" }}>email fallita</span>}
                </div>
              </div>
              {event.acknowledged === 0 && !compact && (
                <button
                  className="btn btn-sm"
                  onClick={() => acknowledge(event.id)}
                  disabled={pending === event.id}
                  title="Segna come letto"
                >
                  ✓
                </button>
              )}
              {event.acknowledged === 1 && (
                <span style={{ color: "var(--dim)", fontSize: 10 }}>letto</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function safeDetails(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
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
    hour12: false,
  }).format(date);
}

function severityClass(severity: string): string {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "info";
}
