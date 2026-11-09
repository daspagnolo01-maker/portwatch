import { VesselArchiveTable } from "@/components/VesselArchiveTable";
import { NewVesselForm } from "@/components/NewVesselForm";
import { listVesselCards } from "@/lib/repo/vessels";

export const dynamic = "force-dynamic";

export default async function NaviPage() {
  const vessels = await listVesselCards({ limit: 2000 });
  const withProfile = vessels.filter((vessel) => vessel.profile_cargo_types && vessel.profile_cargo_types !== "[]").length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Archivio permanente</div>
          <h1 className="page-title">Navi censite</h1>
          <p className="page-sub">
            Anagrafica persistente di tutte le unità rilevate dal sistema o censite manualmente. Le schede restano
            disponibili anche quando la nave non è più in porto: {vessels.length} navi in archivio, {withProfile} con
            scheda merceologica compilata.
          </p>
        </div>
      </div>

      <VesselArchiveTable initialVessels={vessels} />
      <NewVesselForm />

      <div className="footer-note">
        Il riconoscimento automatico avviene prima per MMSI, poi per IMO: un&apos;unità che cambia identificativo AIS
        mantiene la stessa scheda storica. I dati statici ricevuti via AIS (nome, tipo, dimensioni, destinazione)
        aggiornano la scheda senza sovrascrivere i campi inseriti manualmente.
      </div>
    </>
  );
}
