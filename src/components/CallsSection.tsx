import { CallTable, type CallTableKind } from "@/components/CallTable";
import { ExportLink } from "@/components/ExportLink";
import { listCalls } from "@/lib/repo/calls";

interface Props {
  kind: CallTableKind;
  eyebrow: string;
  title: string;
  description: string;
  emptyHint: string;
}

/** Contenuto condiviso delle quattro sezioni operative. */
export async function CallsSection({ kind, eyebrow, title, description, emptyHint }: Props) {
  const calls = await listCalls(kind, { limit: 500 });
  const dataset =
    kind === "expected" ? "attese" : kind === "arrivals" ? "arrivi" : kind === "departures" ? "partenze" : "in-porto";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">{eyebrow}</div>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{description}</p>
        </div>
        <div className="row">
          <ExportLink dataset={dataset} label="Esporta sezione" />
        </div>
      </div>

      <div className="notice" style={{ marginBottom: 12 }}>
        {emptyHint}
      </div>

      <CallTable kind={kind} initialCalls={calls} />
    </>
  );
}
