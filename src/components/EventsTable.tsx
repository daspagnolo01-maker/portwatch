"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EventRow } from "@/lib/repo/events";
import { EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from "@/lib/port";

const TYPES = Object.keys(EVENT_TYPE_LABELS);

export function EventsTable({ initialEvents }: { initialEvents: EventRow[] }) {
  const [events, setEvents] = useState<EventRow[]>(initialEvents);
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ limit: "500" });
    if (type) params.set("type", type);
    if (query) params.set("query", query);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
    if (onlyUnread) params.set("acknowledged", "0");
    return params.toString();
  }, [type, query, from, to, onlyUnread]);

  useEffect(() => {
    if (!type && !query && !from && !to && !onlyUnread) {
      setEvents(initialEvents);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/events?${queryString}`, { cache: "no-store" });
        const payload = (await response.json()) as { events: EventRow[]; error?: string };
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error ?? "Errore di caricamento");
        setEvents(payload.events);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [queryString, initialEvents, type, query, from, to, onlyUnread]);

  const acknowledge = async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      const response = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error("Aggiornamento non riuscito");
      setEvents((current) =>
        current.map((event) => (ids.includes(event.id) ? { ...event, acknowledged: 1 } : event)),
      );
      setSelected([]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="card">
      <div className="filters">
        <div className="field grow">
          <label className="field-label" htmlFor="ev-query">
            Cerca
          </label>
          <input
            id="ev-query"
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nave, MMSI o descrizione…"
          />
        </div>
        <div className="field compact">
          <label className="field-label" htmlFor="ev-type">
            Tipo evento
          </label>
          <select id="ev-type" className="select" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Tutti</option>
            {TYPES.map((key) => (
              <option key={key} value={key}>
                {EVENT_TYPE_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <div className="field compact">
          <label className="field-label" htmlFor="ev-from">
            Dal
          </label>
          <input id="ev-from" className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="field compact">
          <label className="field-label" htmlFor="ev-to">
            Al
          </label>
          <input id="ev-to" className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <label className="row" style={{ fontSize: 11.5, color: "var(--muted)", gap: 6 }}>
          <input type="checkbox" checked={onlyUnread} onChange={(event) => setOnlyUnread(event.target.checked)} />
          solo non letti
        </label>
        <button className="btn" onClick={() => acknowledge(selected)} disabled={selected.length === 0}>
          Segna letti ({selected.length})
        </button>
        <button className="btn" onClick={() => acknowledge(events.filter((event) => !event.acknowledged).map((event) => event.id))}>
          Segna tutti letti
        </button>
      </div>

      <div className="row" style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--muted)" }}>
        <span>{events.length} eventi</span>
        {loading && <span>· aggiornamento…</span>}
        {error && <span style={{ color: "var(--red)" }}>· {error}</span>}
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="no-sort" style={{ width: 30 }}></th>
              <th className="no-sort">Data e ora</th>
              <th className="no-sort">Tipo</th>
              <th className="no-sort">Nave</th>
              <th className="no-sort">Descrizione</th>
              <th className="no-sort">Dettagli</th>
              <th className="no-sort">Email</th>
              <th className="no-sort">Letto</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty">
                    Nessun evento registrato. Gli eventi vengono generati esclusivamente da segnali AIS reali.
                  </div>
                </td>
              </tr>
            )}
            {events.map((event) => (
              <tr key={event.id} className={selected.includes(event.id) ? "is-active" : undefined}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(event.id)}
                    onChange={(changeEvent) =>
                      setSelected((current) =>
                        changeEvent.target.checked
                          ? [...current, event.id]
                          : current.filter((id) => id !== event.id),
                      )
                    }
                    aria-label={`Seleziona evento ${event.id}`}
                  />
                </td>
                <td className="mono">{formatStamp(event.ts)}</td>
                <td>
                  <span className={`chip chip-${severityChip(event.severity)}`}>
                    {EVENT_TYPE_ICONS[event.type] ?? "•"} {EVENT_TYPE_LABELS[event.type] ?? event.type}
                  </span>
                </td>
                <td>
                  {event.vessel_id ? (
                    <Link className="cell-name" href={`/navi/${event.vessel_id}`}>
                      {event.vessel_name ?? event.mmsi}
                    </Link>
                  ) : (
                    event.vessel_name ?? "—"
                  )}
                  <div className="cell-sub">{event.mmsi ?? ""}</div>
                </td>
                <td className="wrap">{event.title}</td>
                <td className="wrap" style={{ maxWidth: 340 }}>
                  <span className="cell-sub" style={{ whiteSpace: "normal" }}>
                    {detailsText(event.details)}
                  </span>
                </td>
                <td>
                  {event.email_status === "sent" ? (
                    <span className="chip chip-ok">inviata</span>
                  ) : event.email_status === "failed" ? (
                    <span className="chip chip-critical" title={event.email_error ?? ""}>
                      errore
                    </span>
                  ) : event.email_status === "skipped" ? (
                    <span className="chip chip-muted" title={event.email_error ?? ""}>
                      non inviata
                    </span>
                  ) : (
                    <span style={{ color: "var(--dim)" }}>—</span>
                  )}
                </td>
                <td>{event.acknowledged ? <span className="chip chip-muted">letto</span> : <span style={{ color: "var(--amber)" }}>nuovo</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function severityChip(severity: string): string {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "info";
}

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function detailsText(raw: string | null): string {
  if (!raw) return "—";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed).filter(([, value]) => value !== null && value !== undefined);
    if (entries.length === 0) return "—";
    return entries
      .slice(0, 5)
      .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
      .join(" · ");
  } catch {
    return raw.slice(0, 160);
  }
}
