import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { LiveMap } from "@/components/LiveMap";
import { EventFeed } from "@/components/EventFeed";
import { ExportLink } from "@/components/ExportLink";
import { getDashboardStats } from "@/lib/repo/stats";
import { listCalls } from "@/lib/repo/calls";
import { listEvents } from "@/lib/repo/events";
import { listOperations, operationProgress, parseCargoTypes } from "@/lib/repo/customs";
import { ensureInitialPoll, getAisStatus } from "@/lib/ais/status";
import { formatDateTime, formatTime } from "@/lib/time";
import { CATEGORY_META, type ShipCategory } from "@/lib/shipTypes";
import { formatDistanceNm } from "@/lib/geo";
import { PORT } from "@/lib/port";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard — PortWatch Termini Imerese" };

function categoryColor(category: string | null): string {
  return CATEGORY_META[(category as ShipCategory) ?? "other"]?.color ?? CATEGORY_META.other.color;
}

const kpiColor = (color: string) => ({ "--kpi-color": color }) as CSSProperties;

export default async function DashboardPage() {
  // Primo accesso in assoluto: esegue un ciclo AIS prima di leggere i contatori.
  // Se la fonte non risponde la pagina si apre comunque, con lo stato esplicito.
  try {
    await ensureInitialPoll();
  } catch {
    /* nessun dato disponibile: la dashboard mostra lo stato «in attesa» */
  }

  const stats = await getDashboardStats();
  const inPort = await listCalls("inport", { limit: 6 });
  const expected = await listCalls("expected", { limit: 6 });
  const arrivals = await listCalls("arrivals", { limit: 5 });
  const departures = await listCalls("departures", { limit: 5 });
  const events = await listEvents({ limit: 8 });
  const operations = (await listOperations())
    .filter((operation) => operation.status !== "closed")
    .slice(0, 5);
  const status = await getAisStatus();
  const expectedWithCargo = expected.filter(
    (call) => parseCargoTypes(call.profile_cargo_types).length > 0,
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Centro di controllo · {PORT.locode}</div>
          <h1 className="page-title">Porto di Termini Imerese — situazione operativa</h1>
          <p className="page-sub">
            Traffico AIS in tempo reale, scali rilevati e preparazione delle operazioni doganali.
            Ultima posizione registrata:{" "}
            <span className="mono">{stats.lastPositionAt ? formatDateTime(stats.lastPositionAt) : "nessun dato"}</span>.
          </p>
        </div>
        <div className="row">
          <Link className="btn btn-primary" href="/mappa">
            Apri mappa AIS
          </Link>
          <ExportLink dataset="navi" label="Esporta navi" />
        </div>
      </div>

      {status.state !== "connected" && (
        <div className="notice notice-warn" style={{ marginBottom: 14 }}>
          <strong>Segnale AIS non attivo.</strong>{" "}
          {status.state === "idle"
            ? "Il primo aggiornamento dell'area non è ancora stato eseguito: i dati compaiono dopo il primo polling riuscito verso aiscast (Open Waters AIS)."
            : `Stato connessione: ${status.state}. ${status.error ?? "Prossimo aggiornamento automatico in corso."}`}{" "}
          Le sezioni operative restano vuote finché non vengono ricevuti messaggi reali dal servizio AIS.
        </div>
      )}

      <div className="grid-kpi">
        <div className="kpi" style={kpiColor("#34d399")}>
          <div className="kpi-label">Navi in porto</div>
          <div className="kpi-value">{stats.inPort}</div>
          <div className="kpi-foot">geofence portuale attiva</div>
        </div>
        <div className="kpi" style={kpiColor("#f59e0b")}>
          <div className="kpi-label">Navi attese</div>
          <div className="kpi-value">{stats.expected}</div>
          <div className="kpi-foot">
            24h {stats.expected24} · 48h {stats.expected48} · 72h {stats.expected72}
          </div>
        </div>
        <div className="kpi" style={kpiColor("#38bdf8")}>
          <div className="kpi-label">Arrivi 24h</div>
          <div className="kpi-value">{stats.arrivals24h}</div>
          <div className="kpi-foot">rilevati da AIS</div>
        </div>
        <div className="kpi" style={kpiColor("#a78bfa")}>
          <div className="kpi-label">Partenze 24h</div>
          <div className="kpi-value">{stats.departures24h}</div>
          <div className="kpi-foot">confermate dal geofence</div>
        </div>
        <div className="kpi" style={kpiColor("#22d3ee")}>
          <div className="kpi-label">Eventi 24h</div>
          <div className="kpi-value">{stats.events24h}</div>
          <div className="kpi-foot">{stats.unacknowledged} non letti</div>
        </div>
        <div className="kpi" style={kpiColor("#e879f9")}>
          <div className="kpi-label">Pratiche doganali</div>
          <div className="kpi-value">{stats.customsOpen}</div>
          <div className="kpi-foot">aperte o in preparazione</div>
        </div>
        <div className="kpi" style={kpiColor("#64748b")}>
          <div className="kpi-label">Navi censite</div>
          <div className="kpi-value">{stats.vesselsTotal}</div>
          <div className="kpi-foot">{stats.vesselsWithProfile} con scheda merceologica</div>
        </div>
      </div>

      <div className="cols">
        <div className="stack">
          <LiveMap compact />

          <div className="card">
            <div className="card-head">
              <span className="card-title">Navi attualmente in porto</span>
              <span className="spacer" />
              <Link className="btn btn-sm" href="/in-porto">
                Tutte
              </Link>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th className="no-sort">Nave</th>
                    <th className="no-sort">Tipologia</th>
                    <th className="no-sort">Provenienza</th>
                    <th className="no-sort">ATA</th>
                    <th className="no-sort">Destinazione</th>
                    <th className="no-sort">Dogana</th>
                  </tr>
                </thead>
                <tbody>
                  {inPort.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty">Nessuna nave rilevata in area portuale.</div>
                      </td>
                    </tr>
                  )}
                  {inPort.map((call) => (
                    <tr key={call.id}>
                      <td>
                        <Link className="cell-name" href={`/navi/${call.vessel_id}`}>
                          {call.name ?? `MMSI ${call.mmsi}`}
                        </Link>
                        <div className="cell-sub">{call.mmsi}</div>
                      </td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <span className="dot" style={{ background: categoryColor(call.ship_category) }} />
                          {call.ship_type_label ?? "—"}
                        </span>
                      </td>
                      <td>{call.last_port ?? "—"}</td>
                      <td className="mono">{formatDateTime(call.ata)}</td>
                      <td>{call.destination ?? "—"}</td>
                      <td>
                        {call.customs_operation_id ? (
                          <Link className="chip chip-violet" href={`/dogana/${call.customs_operation_id}`}>
                            {call.customs_status ?? "bozza"}
                          </Link>
                        ) : (
                          <span style={{ color: "var(--dim)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Attese con scheda merceologica disponibile</span>
              <span className="spacer" />
              <Link className="btn btn-sm" href="/attese">
                Tutte le attese
              </Link>
            </div>
            <div className="card-body">
              {expectedWithCargo.length === 0 ? (
                <div className="empty">
                  Nessuna nave attesa ha ancora una scheda merceologica compilata.
                  <br />
                  Censire le merci abituali dalla scheda nave per attivare l&apos;intelligence doganale.
                </div>
              ) : (
                <div className="stack">
                  {expectedWithCargo.map((call) => {
                    const cargo = parseCargoTypes(call.profile_cargo_types);
                    return (
                      <div className="list-row" key={call.id} style={{ padding: "8px 0" }}>
                        <span className="dot" style={{ background: categoryColor(call.ship_category) }} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <Link href={`/navi/${call.vessel_id}`} style={{ color: "#e8f3fd", fontWeight: 500 }}>
                            {call.name ?? `MMSI ${call.mmsi}`}
                          </Link>
                          <div className="cell-sub">
                            ETA {formatDateTime(call.effective_eta)}
                            {call.eta_source === "estimated" ? " (stimata)" : ""} ·{" "}
                            {call.distance_nm !== null ? formatDistanceNm(call.distance_nm) : "distanza n.d."}
                          </div>
                          <div className="tag-list" style={{ marginTop: 5 }}>
                            {cargo.slice(0, 4).map((value) => (
                              <span className="tag" key={value}>
                                {value}
                              </span>
                            ))}
                          </div>
                        </span>
                        {call.customs_operation_id ? (
                          <Link className="btn btn-sm" href={`/dogana/${call.customs_operation_id}`}>
                            Pratica
                          </Link>
                        ) : (
                          <Link className="btn btn-sm btn-primary" href={`/navi/${call.vessel_id}`}>
                            Prepara
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="cols-even">
            <div className="card">
              <div className="card-head">
                <span className="card-title">Ultimi arrivi</span>
                <span className="spacer" />
                <Link className="btn btn-sm" href="/arrivi">
                  Registro
                </Link>
              </div>
              <ul className="list-clean">
                {arrivals.length === 0 && <li className="empty">Nessun arrivo registrato.</li>}
                {arrivals.map((call) => (
                  <li className="list-row" key={call.id}>
                    <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                      {formatTime(call.ata ?? call.arrival_ts)}
                    </span>
                    <Link href={`/navi/${call.vessel_id}`} style={{ flex: 1, minWidth: 0 }}>
                      {call.name ?? call.mmsi}
                    </Link>
                    <span className="chip chip-muted">{call.last_port ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <div className="card-head">
                <span className="card-title">Ultime partenze</span>
                <span className="spacer" />
                <Link className="btn btn-sm" href="/partenze">
                  Registro
                </Link>
              </div>
              <ul className="list-clean">
                {departures.length === 0 && <li className="empty">Nessuna partenza registrata.</li>}
                {departures.map((call) => (
                  <li className="list-row" key={call.id}>
                    <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                      {formatTime(call.departure_ts)}
                    </span>
                    <Link href={`/navi/${call.vessel_id}`} style={{ flex: 1, minWidth: 0 }}>
                      {call.name ?? call.mmsi}
                    </Link>
                    <span className="chip chip-muted">{call.destination ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <span className="card-title">Eventi AIS recenti</span>
              <span className="spacer" />
              <Link className="btn btn-sm" href="/eventi">
                Storico
              </Link>
            </div>
            <EventFeed initialEvents={events} limit={8} />
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Prossimi arrivi previsti</span>
              <span className="spacer" />
              <ExportLink dataset="attese" label="Excel" />
            </div>
            <ul className="list-clean">
              {expected.length === 0 && <li className="empty">Nessuna nave in attesa.</li>}
              {expected.map((call) => (
                <li className="list-row" key={call.id} style={{ alignItems: "flex-start" }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <Link href={`/navi/${call.vessel_id}`} style={{ color: "#e8f3fd", fontWeight: 500 }}>
                      {call.name ?? `MMSI ${call.mmsi}`}
                    </Link>
                    <div className="cell-sub">
                      {call.imo ? `IMO ${call.imo} · ` : ""}
                      {call.ship_type_label ?? "tipologia n.d."}
                    </div>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 11.5 }}>
                      {formatDateTime(call.effective_eta)}
                    </div>
                    <div className="cell-sub">
                      {call.eta_source === "estimated" ? "stimata" : "dichiarata"} ·{" "}
                      {call.distance_nm !== null ? formatDistanceNm(call.distance_nm) : "—"}
                    </div>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Operazioni doganali da preparare</span>
              <span className="spacer" />
              <Link className="btn btn-sm" href="/dogana">
                Apri
              </Link>
            </div>
            <ul className="list-clean">
              {operations.length === 0 && (
                <li className="empty">
                  Nessuna pratica aperta. Le pratiche vengono create automaticamente per le navi attese
                  con scheda merceologica compilata.
                </li>
              )}
              {operations.map((operation) => {
                const progress = operationProgress(operation);
                return (
                  <li className="list-row" key={operation.id} style={{ display: "block" }}>
                    <div className="row" style={{ gap: 6 }}>
                      <Link href={`/dogana/${operation.id}`} style={{ flex: 1, minWidth: 0 }}>
                        {operation.vessel_name ?? operation.mmsi}
                      </Link>
                      <span className={`chip chip-${operation.status === "ready" ? "ok" : operation.status === "in_progress" ? "warning" : "muted"}`}>
                        {operation.status === "ready" ? "pronta" : operation.status === "in_progress" ? "in corso" : "bozza"}
                      </span>
                    </div>
                    <div className="cell-sub" style={{ margin: "4px 0 5px" }}>
                      {progress.done}/{progress.total} controlli · {operation.items.filter((item) => item.required === 1 && item.done === 0).length} documenti obbligatori mancanti
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
              <span className="card-title">Stato ricezione AIS</span>
            </div>
            <div className="card-body">
              <dl className="kv">
                <dt>Connessione</dt>
                <dd>{status?.state ?? "sconosciuto"}</dd>
                <dt>Messaggi</dt>
                <dd className="mono">{status?.messages ?? 0}</dd>
                <dt>Posizioni</dt>
                <dd className="mono">{status?.positionReports ?? 0}</dd>
                <dt>Statici</dt>
                <dd className="mono">{status?.staticReports ?? 0}</dd>
                <dt>Ultimo msg</dt>
                <dd className="mono">{status?.lastMessageAt ? formatDateTime(status.lastMessageAt) : "—"}</dd>
                <dt>Compressione</dt>
                <dd>{status?.compression === false ? "non attiva" : status?.compression ? "attiva" : "—"}</dd>
              </dl>
              {status?.subscription && (
                <div className="field-hint" style={{ marginTop: 10 }}>
                  Bbox: {status.subscription.minLat.toFixed(2)}, {status.subscription.minLon.toFixed(2)} →{" "}
                  {status.subscription.maxLat.toFixed(2)}, {status.subscription.maxLon.toFixed(2)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="footer-note">
        I dati AIS sono forniti da aiscast (Open Waters AIS: dati AISHub e ricevitori volontari) e dipendono dalla
        copertura delle stazioni riceventi: assenza di segnale non implica assenza della nave. Le informazioni merceologiche associate alle navi sono storiche e
        indicative, non costituiscono dichiarazione del carico in corso e non sostituiscono i sistemi doganali
        ufficiali. Connessione: {stats.vesselsTracked} navi con segnale nelle ultime 24 ore.
      </div>
    </>
  );
}
