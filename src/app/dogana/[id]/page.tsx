import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperation, operationProgress, parseCargoTypes } from "@/lib/repo/customs";
import { getVessel, getProfile, profileCargoTypes } from "@/lib/repo/vessels";
import { CustomsChecklist } from "@/components/CustomsChecklist";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function CustomsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const operation = await getOperation(Number(id));
  if (!operation) notFound();

  const vessel = await getVessel(operation.vessel_id);
  const profile = await getProfile(operation.vessel_id);
  const cargoTypes = profileCargoTypes(profile);
  const progress = operationProgress(operation);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Preparazione operazioni doganali</div>
          <h1 className="page-title">{operation.title}</h1>
          <p className="page-sub">
            Nave{" "}
            <Link href={`/navi/${operation.vessel_id}`}>
              {operation.vessel_name ?? `MMSI ${operation.mmsi}`}
            </Link>{" "}
            · IMO {operation.imo ?? "n.d."} · ETA {formatDateTime(operation.eta)} · creata{" "}
            {formatDateTime(operation.created_at)} · avanzamento {progress.percent}% ({progress.done}/{progress.total})
          </p>
        </div>
        <div className="row">
          <Link className="btn" href="/dogana">
            ← Pratiche
          </Link>
          <a className="btn" href={`/api/export?dataset=dogana`}>
            ⤓ Excel
          </a>
        </div>
      </div>

      <div className="cols">
        <CustomsChecklist operation={operation} />

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <span className="card-title">Scheda nave (storico)</span>
            </div>
            <div className="card-body">
              <dl className="kv">
                <dt>Nave</dt>
                <dd>{vessel?.name ?? "—"}</dd>
                <dt>MMSI / IMO</dt>
                <dd className="mono">
                  {vessel?.mmsi} / {vessel?.imo ?? "—"}
                </dd>
                <dt>Bandiera</dt>
                <dd>{vessel?.flag_country ?? "—"}</dd>
                <dt>Tipologia</dt>
                <dd>{vessel?.ship_type_label ?? "—"}</dd>
                <dt>Merci abituali</dt>
                <dd>{cargoTypes.length > 0 ? cargoTypes.join(", ") : "non censite"}</dd>
                <dt>Trasporto</dt>
                <dd>{profile?.transport_mode ?? "—"}</dd>
                <dt>Frequenza scali</dt>
                <dd>{profile?.call_frequency ?? "—"}</dd>
              </dl>
              {profile?.operator_notes && (
                <div className="notice notice-accent" style={{ marginTop: 10, fontSize: 11.5 }}>
                  <strong>Annotazioni operatore:</strong> {profile.operator_notes}
                </div>
              )}
              {operation.cargo_types && (
                <div className="tag-list" style={{ marginTop: 10 }}>
                  {parseCargoTypes(operation.cargo_types).map((value) => (
                    <span className="tag" key={value}>
                      {value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="notice notice-warn">
            <strong>Dati indicativi.</strong> La checklist proposta deriva dalla tipologia di carico storica della
            nave. Prima di qualunque adempimento verificare manifesto, polizze di carico e documentazione della
            partita effettiva. L&apos;operatore può aggiungere, rimuovere o annotare ogni voce.
          </div>
        </div>
      </div>
    </>
  );
}
