import { EventsTable } from "@/components/EventsTable";
import { listEvents } from "@/lib/repo/events";
import { ExportLink } from "@/components/ExportLink";

export const dynamic = "force-dynamic";

export default async function EventiPage() {
  const events = await listEvents({ limit: 300 });
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Registro eventi</div>
          <h1 className="page-title">Eventi AIS e notifiche</h1>
          <p className="page-sub">
            Storico di ingressi, uscite, avvicinamenti, variazioni ETA e perdite di segnale rilevati dal sistema.
            Ogni evento è deduplicato per nave e tipologia nella finestra configurata.
          </p>
        </div>
        <ExportLink dataset="eventi" label="Esporta eventi" />
      </div>

      <EventsTable initialEvents={events} />
    </>
  );
}
