import { CallsSection } from "@/components/CallsSection";

export const dynamic = "force-dynamic";

export default function InPortoPage() {
  return (
    <CallsSection
      kind="inport"
      eyebrow="Situazione porto"
      title="Navi in porto"
      description="Unità attualmente presenti nell'area portuale secondo l'ultimo segnale AIS ricevuto. La colonna Dogana indica lo stato della pratica di preparazione documentale associata alla nave."
      emptyHint={
        "L'elenco riflette esclusivamente le posizioni AIS ricevute: una nave ferma in banchina senza trasmissione AIS può risultare assente dopo la soglia di perdita segnale, che viene registrata come evento dedicato."
      }
    />
  );
}
