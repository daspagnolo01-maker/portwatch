import { CallsSection } from "@/components/CallsSection";

export const dynamic = "force-dynamic";

export default function PartenzePage() {
  return (
    <CallsSection
      kind="departures"
      eyebrow="Registro scali"
      title="Partenze"
      description="Navi che hanno lasciato l'area portuale dopo uno scalo rilevato. L'orario di partenza corrisponde all'ultima posizione confermata all'interno della geofence, dopo la conferma di uscita (isteresi + tempo minimo fuori area)."
      emptyHint={
        "Una partenza viene confermata solo dopo che la nave è rimasta fuori dal raggio portuale (maggiorato dell'isteresi) per il tempo configurato: oscillazioni GPS e brevi perdite di segnale non generano partenze false."
      }
    />
  );
}
