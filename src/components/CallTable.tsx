"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CallRow } from "@/lib/repo/calls";
import { CATEGORY_META, shipTypeInfo, type ShipCategory } from "@/lib/shipTypes";
import { formatDistanceNm } from "@/lib/geo";
import { formatDateTime } from "@/lib/time";

export type CallTableKind = "expected" | "arrivals" | "departures" | "inport";

interface Props {
  kind: CallTableKind;
  initialCalls: CallRow[];
}

interface Filters {
  query: string;
  category: string;
  origin: string;
  destination: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  query: "",
  category: "",
  origin: "",
  destination: "",
  from: "",
  to: "",
};

const EXPORT_DATASET: Record<CallTableKind, string> = {
  expected: "attese",
  arrivals: "arrivi",
  departures: "partenze",
  inport: "in-porto",
};

const CATEGORY_KEYS = Object.keys(CATEGORY_META) as ShipCategory[];

function speed(value: number | null): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}`;
}

function number(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(value);
}

function dimensions(length: number | null, beam: number | null): string {
  if (!length && !beam) return "—";
  const l = length ? length.toFixed(0) : "?";
  const b = beam ? beam.toFixed(0) : "?";
  return `${l} × ${b} m`;
}

function statusChip(status: string) {
  switch (status) {
    case "IN_PORT":
      return <span className="chip chip-ok">in porto</span>;
    case "EXPECTED":
      return <span className="chip chip-warning">attesa</span>;
    case "DEPARTED":
      return <span className="chip chip-muted">partita</span>;
    default:
      return <span className="chip chip-muted">{status}</span>;
  }
}

export function CallTable({ kind, initialCalls }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<CallRow[]>(initialCalls);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "", dir: 1 });

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ kind });
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key === "query" ? "query" : key, value);
    }
    if (filters.from) params.set("from", new Date(filters.from).toISOString());
    if (filters.to) params.set("to", new Date(`${filters.to}T23:59:59`).toISOString());
    return params.toString();
  }, [filters, kind]);

  useEffect(() => {
    const params = new URLSearchParams(queryString);
    params.delete("from");
    params.delete("to");
    const hasFilters = [...params.entries()].some(([key, value]) => key !== "kind" && value !== "");
    const hasPeriod = Boolean(filters.from || filters.to);
    if (!hasFilters && !hasPeriod) {
      setRows(initialCalls);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/calls?${queryString}`, { cache: "no-store" });
        const payload = (await response.json()) as { calls: CallRow[]; error?: string };
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error ?? "Errore di caricamento");
        setRows(payload.calls);
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
  }, [queryString, initialCalls, filters.from, filters.to]);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const response = await fetch(`/api/calls?${queryString}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { calls: CallRow[] };
        setRows(payload.calls);
      } catch {
        /* il polling non deve disturbare l'operatore */
      }
    }, 20_000);
    return () => clearInterval(id);
  }, [queryString]);

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const factor = sort.dir;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv), "it") * factor;
    });
  }, [rows, sort]);

  const toggleSort = (key: string) =>
    setSort((current) =>
      current.key === key ? { key, dir: (current.dir * -1) as 1 | -1 } : { key, dir: 1 },
    );

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ dataset: EXPORT_DATASET[kind] });
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      if (key === "from") params.set("from", new Date(value).toISOString());
      else if (key === "to") params.set("to", new Date(`${value}T23:59:59`).toISOString());
      else params.set(key, value);
    }
    return `/api/export?${params.toString()}`;
  }, [filters, kind]);

  const activeFilters =
    Object.values(filters).some((value) => value !== "") || Boolean(sort.key);

  return (
    <div className="card">
      <div className="filters">
        <div className="field grow">
          <label className="field-label" htmlFor={`f-query-${kind}`}>
            Nome / IMO / MMSI
          </label>
          <input
            id={`f-query-${kind}`}
            className="input"
            placeholder="Cerca nave…"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
          />
        </div>
        <div className="field compact">
          <label className="field-label" htmlFor={`f-cat-${kind}`}>
            Tipologia
          </label>
          <select
            id={`f-cat-${kind}`}
            className="select"
            value={filters.category}
            onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
          >
            <option value="">Tutte</option>
            {CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {CATEGORY_META[key].label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`f-origin-${kind}`}>
            Provenienza
          </label>
          <input
            id={`f-origin-${kind}`}
            className="input"
            placeholder="Porto di provenienza"
            value={filters.origin}
            onChange={(event) => setFilters((current) => ({ ...current, origin: event.target.value }))}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`f-dest-${kind}`}>
            Destinazione
          </label>
          <input
            id={`f-dest-${kind}`}
            className="input"
            placeholder="Porto di destinazione"
            value={filters.destination}
            onChange={(event) => setFilters((current) => ({ ...current, destination: event.target.value }))}
          />
        </div>
        <div className="field compact">
          <label className="field-label" htmlFor={`f-from-${kind}`}>
            Dal
          </label>
          <input
            id={`f-from-${kind}`}
            className="input"
            type="date"
            value={filters.from}
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
          />
        </div>
        <div className="field compact">
          <label className="field-label" htmlFor={`f-to-${kind}`}>
            Al
          </label>
          <input
            id={`f-to-${kind}`}
            className="input"
            type="date"
            value={filters.to}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
          />
        </div>
        <button
          className="btn"
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            setSort({ key: "", dir: 1 });
          }}
          disabled={!activeFilters}
        >
          Azzera
        </button>
        <a className="btn btn-primary" href={exportHref}>
          Esporta Excel
        </a>
      </div>

      <div className="row" style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--muted)" }}>
        <span>{sorted.length} record</span>
        {loading && <span>· aggiornamento…</span>}
        {error && <span style={{ color: "var(--red)" }}>· {error}</span>}
        <span className="spacer" />
        <span className="mono" style={{ color: "var(--dim)" }}>
          aggiornamento automatico 20 s
        </span>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th onClick={() => toggleSort("name")}>Nave</th>
              <th onClick={() => toggleSort("ship_type_label")}>Tipologia</th>
              <th onClick={() => toggleSort("last_port")}>Provenienza</th>
              <th onClick={() => toggleSort("destination")}>Destinazione</th>
              <th onClick={() => toggleSort("effective_eta")}>ETA</th>
              <th onClick={() => toggleSort("ata")}>ATA</th>
              <th onClick={() => toggleSort("distance_nm")}>Distanza</th>
              <th onClick={() => toggleSort("last_sog")}>Vel. (kn)</th>
              <th onClick={() => toggleSort("gt")}>GT</th>
              <th onClick={() => toggleSort("dwt")}>DWT</th>
              <th onClick={() => toggleSort("length_m")}>Dimensioni</th>
              <th className="no-sort">Merci storiche</th>
              <th className="no-sort">Stato</th>
              <th className="no-sort">Dogana</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={14}>
                  <div className="empty">
                    Nessuna nave in questa sezione con i filtri correnti.
                    <br />
                    Le navi compaiono solo dopo la ricezione di segnali AIS reali.
                  </div>
                </td>
              </tr>
            )}
            {sorted.map((call) => {
              const category = (call.ship_category as ShipCategory) ?? "other";
              const cargo = parseCargoTypes(call.profile_cargo_types);
              return (
                <tr key={call.id}>
                  <td>
                    <Link href={`/navi/${call.vessel_id}`} className="cell-name">
                      {call.name ?? `MMSI ${call.mmsi}`}
                    </Link>
                    <div className="cell-sub">
                      {call.imo ? `IMO ${call.imo} · ` : ""}
                      {call.mmsi}
                    </div>
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <span
                        className="dot"
                        style={{ background: CATEGORY_META[category]?.color ?? CATEGORY_META.other.color }}
                      />
                      {call.ship_type_label ?? shipTypeInfo(call.ship_type_code).label}
                    </span>
                  </td>
                  <td>{call.last_port ?? "—"}</td>
                  <td>{call.destination ?? call.vessel_destination ?? "—"}</td>
                  <td className="mono">
                    {formatDateTime(call.effective_eta)}
                    {call.eta_source === "estimated" && (
                      <div className="cell-sub" style={{ color: "var(--dim)" }}>
                        stimata
                      </div>
                    )}
                  </td>
                  <td className="mono">{formatDateTime(call.ata ?? call.arrival_ts)}</td>
                  <td className="num">{call.distance_nm !== null ? formatDistanceNm(call.distance_nm) : "—"}</td>
                  <td className="num">{speed(call.last_sog)}</td>
                  <td className="num">{number(call.gt)}</td>
                  <td className="num">{number(call.dwt)}</td>
                  <td className="num">{dimensions(call.length_m, call.beam_m)}</td>
                  <td className="wrap">
                    {cargo.length > 0 ? (
                      <span className="tag-list">
                        {cargo.slice(0, 2).map((value) => (
                          <span className="tag" key={value}>
                            {value}
                          </span>
                        ))}
                        {cargo.length > 2 && <span className="tag">+{cargo.length - 2}</span>}
                      </span>
                    ) : (
                      <span style={{ color: "var(--dim)" }}>scheda da completare</span>
                    )}
                  </td>
                  <td>{statusChip(call.status)}</td>
                  <td>
                    {call.customs_operation_id ? (
                      <Link className="chip chip-violet" href={`/dogana/${call.customs_operation_id}`}>
                        {customsLabel(call.customs_status)}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--dim)" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseCargoTypes(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function customsLabel(status: string | null): string {
  switch (status) {
    case "ready":
      return "pronta";
    case "in_progress":
      return "in corso";
    case "closed":
      return "chiusa";
    default:
      return "bozza";
  }
}

function sortValue(row: CallRow, key: string): string | number | null {
  const value = (row as unknown as Record<string, unknown>)[key];
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  return String(value);
}
