/** Mappatura dei codici tipo nave AIS (ITU-R M.1371) in etichette e categorie. */

export type ShipCategory =
  | "cargo"
  | "tanker"
  | "passenger"
  | "highSpeed"
  | "tug"
  | "fishing"
  | "pleasure"
  | "pilot"
  | "sar"
  | "military"
  | "service"
  | "other";

export interface ShipTypeInfo {
  code: number;
  label: string;
  category: ShipCategory;
}

export const CATEGORY_META: Record<
  ShipCategory,
  { label: string; color: string; short: string }
> = {
  cargo: { label: "Cargo", color: "#38bdf8", short: "CARGO" },
  tanker: { label: "Cisterna", color: "#f59e0b", short: "TANKER" },
  passenger: { label: "Passeggeri", color: "#a78bfa", short: "PAX" },
  highSpeed: { label: "Alta velocità", color: "#22d3ee", short: "HSC" },
  tug: { label: "Rimorchiatore", color: "#34d399", short: "TUG" },
  fishing: { label: "Peschereccio", color: "#fb923c", short: "FISH" },
  pleasure: { label: "Dipartimento", color: "#94a3b8", short: "PLEASURE" },
  pilot: { label: "Pilota", color: "#e879f9", short: "PILOT" },
  sar: { label: "SAR / soccorso", color: "#ef4444", short: "SAR" },
  military: { label: "Militare", color: "#64748b", short: "MIL" },
  service: { label: "Servizio / lavoro", color: "#14b8a6", short: "SERVICE" },
  other: { label: "Altro", color: "#94a3b8", short: "ALTRO" },
};

function info(code: number, label: string, category: ShipCategory): ShipTypeInfo {
  return { code, label, category };
}

const EXACT: Record<number, ShipTypeInfo> = {
  0: info(0, "Non disponibile", "other"),
  20: info(20, "WIG — aliscafo", "highSpeed"),
  30: info(30, "Peschereccio", "fishing"),
  31: info(31, "Rimorchiatore / traino", "tug"),
  32: info(32, "Traino grande / fuori sagoma", "tug"),
  33: info(33, "Draga", "service"),
  34: info(34, "Unità subacquea", "service"),
  35: info(35, "Militare", "military"),
  36: info(36, "Veliero", "pleasure"),
  37: info(37, "Imbarcazione da diporto", "pleasure"),
  50: info(50, "Pilota", "pilot"),
  51: info(51, "SAR — ricerca e soccorso", "sar"),
  52: info(52, "Rimorchiatore", "tug"),
  53: info(53, "Mezzo portuale", "service"),
  54: info(54, "Antinquinamento", "service"),
  55: info(55, "Autorità / law enforcement", "service"),
  56: info(56, "Spare — locale", "other"),
  57: info(57, "Spare — locale", "other"),
  58: info(58, "Sanitario / medical", "service"),
  59: info(59, "Unità speciale", "other"),
  90: info(90, "Altro", "other"),
};

export function shipTypeInfo(code: number | null | undefined): ShipTypeInfo {
  if (code === null || code === undefined || !Number.isFinite(code)) {
    return info(-1, "Non disponibile", "other");
  }
  const exact = EXACT[code];
  if (exact) return exact;

  if (code >= 40 && code <= 49) return info(code, "Mezzo ad alta velocità", "highSpeed");
  if (code >= 60 && code <= 69) return info(code, "Nave passeggeri", "passenger");
  if (code >= 70 && code <= 79)
    return info(code, code === 70 || code === 79 ? "Cargo" : "Nave cargo", "cargo");
  if (code >= 80 && code <= 89)
    return info(code, code === 80 || code === 89 ? "Cisterna" : "Nave cisterna", "tanker");
  if (code >= 21 && code <= 29) return info(code, "WIG — aliscafo", "highSpeed");
  return info(code, `Tipo AIS ${code}`, "other");
}

/** Sottotipi merceologici utili alla preparazione doganale. */
export const CARGO_TYPE_OPTIONS = [
  "Container",
  "Rinfuse solide",
  "Rinfuse liquide",
  "Prodotti energetici",
  "General cargo",
  "RoRo / autoveicoli",
  "Passeggeri",
  "Merci pericolose (IMDG)",
  "Siderurgico",
  "Cemento / inerti",
  "Prodotti alimentari",
  "Macchinari e impianti",
] as const;

export const TRANSPORT_MODE_OPTIONS = [
  "Container",
  "Rinfuse",
  "General cargo",
  "Prodotti energetici",
  "RoRo",
  "Passeggeri",
  "Misto",
] as const;

const NAV_STATUS: Record<number, string> = {
  0: "In navigazione",
  1: "All'ancora",
  2: "Non governa",
  3: "Manovrabilità ridotta",
  4: "Limitata dalla pescaggio",
  5: "Ormeggiata",
  6: "Incagliata",
  7: "Pesca",
  8: "In navigazione a vela",
  9: "Riservato",
  10: "Riservato",
  11: "Trazione rimorchio",
  12: "Spinta / rimorchio",
  13: "Riservato",
  14: "Soccorso (AIS-SART)",
  15: "Non definito",
};

export function navStatusLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return NAV_STATUS[value] ?? `Stato ${value}`;
}
