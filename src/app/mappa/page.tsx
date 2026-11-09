import { LiveMap } from "@/components/LiveMap";

export const dynamic = "force-dynamic";

export default function MappaPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Monitoraggio AIS</div>
          <h1 className="page-title">Mappa del traffico — Porto di Termini Imerese</h1>
          <p className="page-sub">
            Posizioni, rotte e dati statici ricevuti in tempo reale dalle fonti AIS configurate (AISStream e
            aiscast/Open Waters). Il cerchio rosso è
            l&apos;area portuale usata per il rilevamento di arrivi e partenze, quello tratteggiato arancione il
            raggio di avvicinamento, quello esterno l&apos;area richiesta alle fonti AIS.
          </p>
        </div>
      </div>

      <LiveMap />
    </>
  );
}
