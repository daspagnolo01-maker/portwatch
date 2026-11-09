import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getVessel, getProfile, getVesselState, profileCargoTypes } from "@/lib/repo/vessels";
import { callsForVessel } from "@/lib/repo/calls";
import { listOperations, operationProgress } from "@/lib/repo/customs";
import { listEvents } from "@/lib/repo/events";
import { VesselSheetForm } from "@/components/VesselSheetForm";
import { CreateOperationButton } from "@/components/CreateOperationButton";
import { EventFeed } from "@/components/EventFeed";
import { formatDateTime } from "@/lib/time";
import { flagFromMmsi } from "@/lib/flags";
import { navStatusLabel } from "@/lib/shipTypes";
import { formatDistanceNm, distanceNm } from "@/lib/geo";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const vessel = await getVessel(Number(id));
  return { title: vessel ? `${vessel.name ?? vessel.mmsi} — PortWatch` : "Scheda nave — PortWatch" };
}

export default async function VesselPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vesselId = Number(id);
  if (!Number.isInteger(vesselId)) notFound();
  const vessel = await getVessel(vesselId);
  if (!vessel) notFound();

  const profile = await getProfile(vesselId);
  const state = await getVesselState(vesselId);
  const calls = await callsForVessel(vesselId, 20);
  const operations = await listOperations({ vesselId });
  const events = await listEvents({ vesselId, limit: 12 });
  const cargoTypes = profileCargoTypes(profile);
  const settings = await getSettings();
  const flag = flagFromMmsi(vessel.mmsi);
  const distance =
    vessel.last_lat !== null && vessel.last_lon !== null
      ? distanceNm(vessel.last_lat, vessel.last_lon, settings.centerLat, settings.centerLon)
      : null;
  const openOperation = operations.find((operation) => operation.status !== "closed");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            Scheda nave · {vessel.flag_country ?? flag.country}
          </div>
          <h1 className="page-title">
            {vessel.name ?? `MMSI ${vessel.mmsi}`}{" "}
            {state.inside_port === 1 && <span className="chip chip-ok">in porto</span>}
            {state.inside_port === 0 && operations.length > 0 && operations[0].status === "draft" && (
              <span className="chip chip-warning">pratica in bozza</span>
            )}
          </h1>
          <p className="page-sub">
            IMO {vessel.imo ?? "non disponibile"} · MMSI {vessel.mmsi} ·{" "}
            {vessel.ship_type_label ?? "tipologia non disponibile"} · prima osservazione{" "}
            {formatDateTime(vessel.first_seen)} · ultimo segnale {formatDateTime(vessel.last_seen)}
          </p>
        </div>
        <div className="row">
          <Link className="btn" href="/navi">
            ← Archivio
          </Link>
          <Link className="btn" href={`/api/export?dataset=posizioni&vesselId=${vessel.id}`}>
            ⤓ Traccia AIS
          </Link>
        </div>
      </div>

      <div className="cols">
        <VesselSheetForm vessel={vessel} profile={profile} />

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <span className="card-title">Posizione e stato</span>
            </div>
            <div className="card-body">
              <dl className="kv">
                <dt>Bandiera</dt>
                <dd>
                  {flag.flagEmoji} {vessel.flag_country ?? flag.country}
                </dd>
                <dt>Posizione</dt>
                <dd className="mono">
                  {vessel.last_lat !== null && vessel.last_lon !== null
                    ? `${vessel.last_lat.toFixed(4)}, ${vessel.last_lon.toFixed(4)}`
                    : "—"}
                </dd>
                <dt>Distanza porto</dt>
                <dd>{distance !== null ? formatDistanceNm(distance) : "—"}</dd>
                <dt>Velocità</dt>
                <dd className="mono">{vessel.last_sog !== null ? `${vessel.last_sog.toFixed(1)} kn` : "—"}</dd>
                <dt>Rotta</dt>
                <dd className="mono">{vessel.last_cog !== null ? `${Math.round(vessel.last_cog)}°` : "—"}</dd>
                <dt>Stato AIS</dt>
                <dd>
                  {navStatusLabel(vessel.nav_status)}
                  {state.signal_lost === 1 ? " · segnale perso" : ""}
                </dd>
                <dt>Destinazione</dt>
                <dd>{vessel.destination_declared ?? "—"}</dd>
                <dt>ETA dichiarata</dt>
                <dd>{formatDateTime(vessel.eta_declared)}</dd>
                <dt>Pescaggio</dt>
                <dd className="mono">{vessel.draught_m ? `${vessel.draught_m} m` : "—"}</dd>
                <dt>GT / DWT</dt>
                <dd className="mono">
                  {vessel.gt ?? "—"} / {vessel.dwt ?? "—"}
                </dd>
              </dl>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Merci abituali (storico)</span>
              <span className="spacer" />
              {cargoTypes.length > 0 && (
                <CreateOperationButton
                  vesselId={vessel.id}
                  label={openOperation ? "Nuova pratica" : "Crea pratica"}
                />
              )}
            </div>
            <div className="card-body">
              {cargoTypes.length === 0 ? (
                <div className="empty" style={{ padding: "10px 0" }}>
                  Scheda merceologica da compilare nella scheda &laquo;Merci e dogana&raquo;.
                  <br />
                  Senza tipologie di merce il sistema non può predisporre la checklist doganale.
                </div>
              ) : (
                <>
                  <div className="tag-list">
                    {cargoTypes.map((value) => (
                      <span className="tag" key={value}>
                        {value}
                      </span>
                    ))}
                  </div>
                  {profile?.cargo_description && (
                    <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
                      {profile.cargo_description}
                    </p>
                  )}
                  {profile?.hs_codes && (
                    <div className="field-hint" style={{ marginTop: 6 }}>
                      Codici HS noti: {profile.hs_codes}
                    </div>
                  )}
                  <div className="notice" style={{ marginTop: 10, fontSize: 11 }}>
                    Informazioni storiche: non costituiscono dichiarazione del carico attuale.
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Pratiche doganali</span>
              <span className="spacer" />
              <Link className="btn btn-sm" href="/dogana">
                Modelli
              </Link>
            </div>
            <ul className="list-clean">
              {operations.length === 0 && <li className="empty">Nessuna pratica associata.</li>}
              {operations.map((operation) => {
                const progress = operationProgress(operation);
                return (
                  <li className="list-row" key={operation.id} style={{ display: "block" }}>
                    <div className="row">
                      <Link href={`/dogana/${operation.id}`} style={{ flex: 1 }}>
                        {operation.title}
                      </Link>
                      <span className="chip chip-muted">{operation.status}</span>
                    </div>
                    <div className="cell-sub" style={{ margin: "4px 0" }}>
                      {progress.done}/{progress.total} completati
                    </div>
                    <div className="bar">
                      <div className="bar-fill" style={{ width: `${progress.percent}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Eventi della nave</span>
              <span className="spacer" />
              <Link className="btn btn-sm" href="/eventi">
                Storico
              </Link>
            </div>
            <EventFeed initialEvents={events} limit={12} compact />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <span className="card-title">Ultimi arrivi e partenze registrati</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="no-sort">Stato</th>
                <th className="no-sort">ETA dichiarata</th>
                <th className="no-sort">ATA</th>
                <th className="no-sort">Partenza</th>
                <th className="no-sort">Provenienza</th>
                <th className="no-sort">Destinazione</th>
                <th className="no-sort">Origine dato</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">Nessuno scalo registrato per questa unità.</div>
                  </td>
                </tr>
              )}
              {calls.map((call) => (
                <tr key={call.id}>
                  <td>
                    <span
                      className={`chip ${
                        call.status === "IN_PORT" ? "chip-ok" : call.status === "EXPECTED" ? "chip-warning" : "chip-muted"
                      }`}
                    >
                      {call.status}
                    </span>
                  </td>
                  <td className="mono">{formatDateTime(call.eta_declared)}</td>
                  <td className="mono">{formatDateTime(call.ata ?? call.arrival_ts)}</td>
                  <td className="mono">{formatDateTime(call.departure_ts)}</td>
                  <td>{call.last_port ?? "—"}</td>
                  <td>{call.destination ?? "—"}</td>
                  <td>{call.expected_source ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
