import { CallsSection } from "@/components/CallsSection";

export const dynamic = "force-dynamic";

export default function AttesePage() {
  return (
    <CallsSection
      kind="expected"
      eyebrow="Traffico in arrivo"
      title="Navi attese"
      description="Unità rilevate nell'area monitorata con destinazione Termini Imerese (dichiarata nel messaggio AIS o dedotta dall'avvicinamento) non ancora entrate in area portuale. L'ETA dichiarata dall'equipaggio viene affiancata, quando assente, da una stima calcolata su distanza e velocità fondata."
      emptyHint={
        "Le attese si popolano automaticamente quando una nave con destinazione ITTRI entra nel raggio di monitoraggio. Nessun dato viene simulato: se l'elenco è vuoto, il flusso AIS non ha rilevato navi dirette al porto."
      }
    />
  );
}
