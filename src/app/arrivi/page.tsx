import { CallsSection } from "@/components/CallsSection";

export const dynamic = "force-dynamic";

export default function ArriviPage() {
  return (
    <CallsSection
      kind="arrivals"
      eyebrow="Registro scali"
      title="Arrivi"
      description="Navi che hanno attraversato l'area di ingresso del porto o hanno raggiunto la banchina. L'ATA è l'orario del primo campione AIS confermato dentro la geofence portuale: è quindi un orario di rilevamento, non un dato ufficiale dell'Autorità Portuale."
      emptyHint={
        "L'arrivo viene registrato quando una nave resta dentro il raggio portuale per i campioni consecutivi configurati (anti rimbalzo GPS). Nessun arrivo viene inserito manualmente dal sistema."
      }
    />
  );
}
