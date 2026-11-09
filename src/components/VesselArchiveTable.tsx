"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { VesselCard } from "@/lib/repo/vessels";
import { CATEGORY_META, type ShipCategory } from "@/lib/shipTypes";
import { formatDateTime } from "@/lib/time";

export function VesselArchiveTable({ initialVessels }: { initialVessels: VesselCard[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [hasProfile, setHasProfile] = useState(false);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return initialVessels
      .filter((vessel) => (category ? vessel.ship_category === category : true))
      .filter((vessel) =>
        hasProfile ? Boolean(vessel.profile_cargo_types && vessel.profile_cargo_types !== "[]") : true,
      )
      .filter((vessel) => {
        if (!needle) return true;
        return (
          (vessel.name ?? "").toLowerCase().includes(needle) ||
          vessel.mmsi.includes(needle) ||
          (vessel.imo ?? "").includes(needle)
        );
      });
  }, [initialVessels, query, category, hasProfile]);

  return (
    <div className="card">
      <div className="filters">
        <div className="field grow">
          <label className="field-label" htmlFor="archive-query">
            Cerca nell&apos;archivio
          </label>
          <input
            id="archive-query"
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, IMO o MMSI…"
          />
        </div>
        <div className="field compact">
          <label className="field-label" htmlFor="archive-cat">
            Tipologia
          </label>
          <select
            id="archive-cat"
            className="select"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Tutte</option>
            {(Object.keys(CATEGORY_META) as ShipCategory[]).map((key) => (
              <option key={key} value={key}>
                {CATEGORY_META[key].label}
              </option>
            ))}
          </select>
        </div>
        <label className="row" style={{ fontSize: 11.5, color: "var(--muted)", gap: 6 }}>
          <input type="checkbox" checked={hasProfile} onChange={(event) => setHasProfile(event.target.checked)} />
          solo con scheda merceologica
        </label>
        <span className="spacer" />
        <a className="btn btn-primary" href="/api/export?dataset=navi">
          Esporta Excel
        </a>
      </div>

      <div className="row" style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--muted)" }}>
        <span>{rows.length} navi</span>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="no-sort">Nave</th>
              <th className="no-sort">Bandiera</th>
              <th className="no-sort">Tipologia</th>
              <th className="no-sort">GT</th>
              <th className="no-sort">DWT</th>
              <th className="no-sort">Dimensioni</th>
              <th className="no-sort">Ultimo AIS</th>
              <th className="no-sort">Scali</th>
              <th className="no-sort">Merci abituali</th>
              <th className="no-sort">Stato</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10}>
                  <div className="empty">
                    Nessuna nave censita con questi criteri. Le navi vengono create automaticamente al primo
                    messaggio AIS ricevuto, oppure manualmente dal pannello qui sotto.
                  </div>
                </td>
              </tr>
            )}
            {rows.map((vessel) => {
              const cargo = vessel.profile_cargo_types ? safeList(vessel.profile_cargo_types) : [];
              return (
                <tr key={vessel.id}>
                  <td>
                    <Link className="cell-name" href={`/navi/${vessel.id}`}>
                      {vessel.name ?? `MMSI ${vessel.mmsi}`}
                    </Link>
                    <div className="cell-sub">
                      {vessel.imo ? `IMO ${vessel.imo} · ` : ""}
                      {vessel.mmsi}
                    </div>
                  </td>
                  <td>
                    {vessel.flag_country ?? "—"}
                    {vessel.flag_code ? <span className="cell-sub"> ({vessel.flag_code})</span> : null}
                  </td>
                  <td>{vessel.ship_type_label ?? "—"}</td>
                  <td className="num">{vessel.gt ?? "—"}</td>
                  <td className="num">{vessel.dwt ?? "—"}</td>
                  <td className="num">
                    {vessel.length_m || vessel.beam_m
                      ? `${vessel.length_m?.toFixed(0) ?? "?"} × ${vessel.beam_m?.toFixed(0) ?? "?"} m`
                      : "—"}
                  </td>
                  <td className="mono">{formatDateTime(vessel.last_seen)}</td>
                  <td className="num">{vessel.calls_total ?? 0}</td>
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
                      <span style={{ color: "var(--dim)" }}>da completare</span>
                    )}
                  </td>
                  <td>
                    {vessel.port_call_status === "IN_PORT" && <span className="chip chip-ok">in porto</span>}
                    {vessel.port_call_status === "EXPECTED" && <span className="chip chip-warning">attesa</span>}
                    {!vessel.port_call_status && <span className="chip chip-muted">archivio</span>}
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

function safeList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
