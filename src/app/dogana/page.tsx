import Link from "next/link";
import { listCalls } from "@/lib/repo/calls";
import { listOperations, listTemplates, operationProgress, parseCargoTypes } from "@/lib/repo/customs";
import { CreateOperationButton } from "@/components/CreateOperationButton";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "bozza",
  in_progress: "in corso",
  ready: "pronta",
  closed: "chiusa",
};

export default async function DoganaPage() {
  const operations = await listOperations();
  const templates = await listTemplates();
  const expected = await listCalls("expected", { limit: 300 });
  const awaitingWithout = expected.filter(
    (call) => !call.customs_operation_id && parseCargoTypes(call.profile_cargo_types).length > 0,
  );
  const open = operations.filter((operation) => operation.status !== "closed");
  const ready = operations.filter((operation) => operation.status === "ready").length;
  const missingRequired = open.reduce(
    (total, operation) =>
      total + operation.items.filter((item) => item.required === 1 && item.done === 0).length,
    0,
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Intelligence e preparazione</div>
          <h1 className="page-title">Preparazione operazioni doganali</h1>
          <p className="page-sub">
            Pratiche documentali associate alle navi attese o in porto. Per ogni unità la scheda storica fornisce le
            tipologie di merce abituali, sulle quali il sistema propone la checklist di documenti e controlli da
            predisporre prima dell&apos;arrivo.
          </p>
        </div>
        <a className="btn btn-primary" href="/api/export?dataset=dogana">
          ⤓ Esporta pratiche
        </a>
      </div>

      <div className="notice notice-warn" style={{ marginBottom: 14 }}>
        <strong>Avvertenza operativa.</strong> Le merci indicate provengono dallo storico della nave e sono
        indicative: non rappresentano il carico del viaggio in corso. Le checklist sono modelli di lavoro e non
        sostituiscono la normativa doganale né i sistemi ufficiali (AIDA, ADM). Ogni voce va confermata o
        modificata dall&apos;operatore sulla base della documentazione effettiva.
      </div>

      <div className="grid-kpi">
        <div className="kpi">
          <div className="kpi-label">Pratiche aperte</div>
          <div className="kpi-value">{open.length}</div>
          <div className="kpi-foot">bozze e in corso</div>
        </div>
        <div className="kpi" style={{ borderColor: "rgba(52,211,153,0.3)" }}>
          <div className="kpi-label">Pronte</div>
          <div className="kpi-value">{ready}</div>
          <div className="kpi-foot">checklist completate</div>
        </div>
        <div className="kpi" style={{ borderColor: "rgba(245,158,11,0.3)" }}>
          <div className="kpi-label">Documenti obbligatori mancanti</div>
          <div className="kpi-value">{missingRequired}</div>
          <div className="kpi-foot">su pratiche aperte</div>
        </div>
        <div className="kpi" style={{ borderColor: "rgba(34,211,238,0.3)" }}>
          <div className="kpi-label">Attese con scheda merceologica</div>
          <div className="kpi-value">{awaitingWithout.length + open.length}</div>
          <div className="kpi-foot">{awaitingWithout.length} senza pratica</div>
        </div>
      </div>

      {awaitingWithout.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <span className="card-title">Navi attese con merci storiche note — pratica da creare</span>
          </div>
          <ul className="list-clean">
            {awaitingWithout.map((call) => {
              const cargo = parseCargoTypes(call.profile_cargo_types);
              return (
                <li className="list-row" key={call.id}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <Link href={`/navi/${call.vessel_id}`} style={{ color: "#e8f3fd", fontWeight: 500 }}>
                      {call.name ?? `MMSI ${call.mmsi}`}
                    </Link>
                    <div className="cell-sub">
                      ETA {formatDateTime(call.effective_eta)} ·{" "}
                      {cargo.slice(0, 3).join(", ") || "merci non specificate"}
                    </div>
                  </span>
                  <CreateOperationButton vesselId={call.vessel_id} label="Crea pratica" />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <span className="card-title">Pratiche in archivio</span>
          <span className="spacer" />
          <a className="btn btn-sm" href="/api/export?dataset=dogana">
            Excel
          </a>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="no-sort">Pratica</th>
                <th className="no-sort">Nave</th>
                <th className="no-sort">ETA / scalo</th>
                <th className="no-sort">Stato</th>
                <th className="no-sort">Avanzamento</th>
                <th className="no-sort">Documenti obbligatori mancanti</th>
                <th className="no-sort">Aggiornata</th>
              </tr>
            </thead>
            <tbody>
              {operations.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      Nessuna pratica doganale. Vengono create automaticamente quando una nave attesa ha una scheda
                      merceologica compilata, oppure manualmente dalla scheda nave.
                    </div>
                  </td>
                </tr>
              )}
              {operations.map((operation) => {
                const progress = operationProgress(operation);
                const missing = operation.items.filter((item) => item.required === 1 && item.done === 0);
                return (
                  <tr key={operation.id}>
                    <td>
                      <Link className="cell-name" href={`/dogana/${operation.id}`}>
                        {operation.title}
                      </Link>
                      <div className="cell-sub">
                        {operation.template_key ?? "personalizzata"} · {parseCargoTypes(operation.cargo_types).join(", ")}
                      </div>
                    </td>
                    <td>
                      <Link href={`/navi/${operation.vessel_id}`}>
                        {operation.vessel_name ?? `MMSI ${operation.mmsi}`}
                      </Link>
                      <div className="cell-sub">{operation.imo ? `IMO ${operation.imo}` : operation.mmsi}</div>
                    </td>
                    <td className="mono">{formatDateTime(operation.eta)}</td>
                    <td>
                      <span
                        className={`chip ${
                          operation.status === "ready"
                            ? "chip-ok"
                            : operation.status === "in_progress"
                              ? "chip-warning"
                              : operation.status === "closed"
                                ? "chip-muted"
                                : "chip-info"
                        }`}
                      >
                        {STATUS_LABEL[operation.status] ?? operation.status}
                      </span>
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <div className="mono" style={{ fontSize: 11, marginBottom: 4 }}>
                        {progress.done}/{progress.total} · {progress.percent}%
                      </div>
                      <div className="bar">
                        <div className="bar-fill" style={{ width: `${progress.percent}%` }} />
                      </div>
                    </td>
                    <td className="wrap">
                      {missing.length === 0 ? (
                        <span style={{ color: "var(--green)" }}>completa</span>
                      ) : (
                        <span style={{ color: "var(--amber)" }}>{missing.map((item) => item.label).join(" · ")}</span>
                      )}
                    </td>
                    <td className="mono">{formatDateTime(operation.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Modelli di checklist disponibili</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="no-sort">Modello</th>
                <th className="no-sort">Tipologia carico</th>
                <th className="no-sort">Voci</th>
                <th className="no-sort">Descrizione</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.key}>
                  <td className="cell-name">{template.name}</td>
                  <td>{template.cargoType}</td>
                  <td className="num">{template.items}</td>
                  <td className="wrap">{template.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
