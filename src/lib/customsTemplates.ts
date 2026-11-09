/**
 * Modelli di checklist per la preparazione delle operazioni doganali.
 * ATTENZIONE: sono modelli operativi indicativi, non un elenco normativo.
 * L'operatore deve verificarli sulla documentazione effettiva della partita.
 */
export type ChecklistCategory = "documento" | "merce" | "controllo" | "operativo";

export interface ChecklistTemplateItem {
  label: string;
  category: ChecklistCategory;
  required: boolean;
  note?: string;
}

export interface ChecklistTemplate {
  key: string;
  name: string;
  cargoType: string;
  description: string;
  items: ChecklistTemplateItem[];
}

const doc = (label: string, note?: string): ChecklistTemplateItem => ({
  label,
  category: "documento",
  required: true,
  ...(note ? { note } : {}),
});
const optDoc = (label: string, note?: string): ChecklistTemplateItem => ({
  label,
  category: "documento",
  required: false,
  ...(note ? { note } : {}),
});
const check = (label: string, note?: string): ChecklistTemplateItem => ({
  label,
  category: "controllo",
  required: true,
  ...(note ? { note } : {}),
});
const goods = (label: string, note?: string): ChecklistTemplateItem => ({
  label,
  category: "merce",
  required: false,
  ...(note ? { note } : {}),
});
const op = (label: string, note?: string): ChecklistTemplateItem => ({
  label,
  category: "operativo",
  required: false,
  ...(note ? { note } : {}),
});

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    key: "general",
    name: "General cargo / merce varia",
    cargoType: "General cargo",
    description:
      "Modello base per merce non containerizzata e carichi eterogenei.",
    items: [
      doc("Manifesto di carico (cargo manifest)"),
      doc("Polizze di carico (Bill of Lading) o sea waybill"),
      doc("Fattura commerciale"),
      doc("Packing list"),
      optDoc("Certificato di origine"),
      doc("Dichiarazione sommaria di scarico (ENS/DSK)"),
      check("Verifica corrispondenza colli, pesi e misure con il manifesto"),
      check("Controllo visivo stato merci e sigilli all'apertura del boccaporto"),
      goods("Verifica eventuali merci soggette a licenza o autorizzazione"),
      op("Coordinamento con agente raccomandatario per la presa in carico"),
      op("Annotazioni operatore"),
    ],
  },
  {
    key: "container",
    name: "Container",
    cargoType: "Container",
    description: "Modello per navi portacontainer e merce containerizzata.",
    items: [
      doc("Manifesto di carico container (bay plan / container list)"),
      doc("Polizze di carico (Bill of Lading)"),
      doc("Fattura commerciale e packing list per ogni B/L"),
      doc("Dichiarazione sommaria di scarico"),
      optDoc("Certificato di origine"),
      check("Raffronto container list con posizione a bordo (bay plan)"),
      check("Verifica integrità sigilli e numero container"),
      check("Controllo merci pericolose IMDG (se presenti)"),
      goods("Verifica merce in transito / destinazione finale"),
      op("Predisposizione eventuale scansione o ispezione mirata"),
      op("Annotazioni operatore"),
    ],
  },
  {
    key: "bulk_solid",
    name: "Rinfuse solide",
    cargoType: "Rinfuse solide",
    description:
      "Modello per cemento, inerti, cereali, rottami e altre rinfuse solide.",
    items: [
      doc("Manifesto di carico con quantitativi in tonnellate"),
      doc("Polizza di carico / charter party (se pertinente)"),
      doc("Fattura commerciale provvisoria o definitiva"),
      doc("Dichiarazione sommaria di scarico"),
      optDoc("Certificato di qualità / analisi della merce"),
      optDoc("Certificati fitosanitari o sanitari (prodotti alimentari)"),
      check("Verifica pescaggio e quantità dichiarata (draft survey)"),
      check("Controllo pulizia stive e assenza contaminazioni"),
      check("Verifica eventuali residui di carico precedente"),
      goods("Classificazione merce e codice HS dichiarato"),
      op("Pianificazione banchine, silos e aree di stoccaggio"),
      op("Annotazioni operatore"),
    ],
  },
  {
    key: "energy",
    name: "Prodotti energetici / rinfuse liquide",
    cargoType: "Prodotti energetici",
    description:
      "Modello per prodotti petroliferi, chimici e altre rinfuse liquide.",
    items: [
      doc("Manifesto di carico con specifica prodotto e quantità"),
      doc("Bill of Lading / charter party"),
      doc("Fattura commerciale e certificati di analisi"),
      doc("Dichiarazione sommaria di scarico"),
      doc("Documentazione ADM / accise (prodotti soggetti ad accisa)"),
      optDoc("Schede di sicurezza (SDS) e classificazione IMDG"),
      check("Verifica compatibilità prodotto e autorizzazioni terminal"),
      check("Controllo linee, valvole e presidi antincendio durante l'operazione"),
      check("Verifica quantità tramite misurazioni (ullage / flow meter)"),
      goods("Verifica merce pericolosa e piano di emergenza"),
      op("Coordinamento con terminal e autorità di controllo"),
      op("Annotazioni operatore"),
    ],
  },
  {
    key: "roro",
    name: "RoRo / autoveicoli",
    cargoType: "RoRo / autoveicoli",
    description: "Modello per navi RoRo, traghetti merci e trasporto veicoli.",
    items: [
      doc("Manifesto di carico veicoli / trailer"),
      doc("Bill of Lading o documenti di trasporto"),
      doc("Fattura commerciale (se merce)"),
      doc("Dichiarazione sommaria di scarico"),
      check("Verifica targhe, telai e corrispondenza con il manifesto"),
      check("Controllo stato veicoli e presenza merci a bordo dei mezzi"),
      goods("Verifica eventuali merci pericolose trasportate su veicolo"),
      op("Gestione flussi di sbarco/imbarco e aree di sosta"),
      op("Annotazioni operatore"),
    ],
  },
  {
    key: "passenger",
    name: "Passeggeri / traghetto",
    cargoType: "Passeggeri",
    description: "Modello per navi passeggeri e traghetti misti.",
    items: [
      doc("Lista passeggeri e lista equipaggio"),
      doc("Manifesto merci e veicoli al seguito"),
      optDoc("Documentazione sanitaria di bordo (se richiesta)"),
      check("Verifica lista passeggeri rispetto alle prenotazioni"),
      check("Controllo veicoli al seguito e merci dichiarate"),
      op("Coordinamento Polizia di Frontiera e terminal passeggeri"),
      op("Annotazioni operatore"),
    ],
  },
];

/** Sceglie il modello più adatto in base alle tipologie di carico storiche. */
export function templateForCargoTypes(cargoTypes: string[]): ChecklistTemplate {
  const normalized = cargoTypes.map((value) => value.toLowerCase());
  const has = (needle: string) => normalized.some((value) => value.includes(needle));

  if (has("container")) return byKey("container");
  if (has("rinfuse solide") || has("cemento") || has("siderurgico")) return byKey("bulk_solid");
  if (has("energetic") || has("rinfuse liquide") || has("chimic")) return byKey("energy");
  if (has("roro") || has("autoveicol")) return byKey("roro");
  if (has("passegger")) return byKey("passenger");
  return byKey("general");
}

export function byKey(key: string): ChecklistTemplate {
  return CHECKLIST_TEMPLATES.find((template) => template.key === key) ?? CHECKLIST_TEMPLATES[0];
}
