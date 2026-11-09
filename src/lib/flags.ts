/**
 * Bandiera ricavata dai primi 3 digiti dell'MMSI (MID — Maritime Identification Digits).
 * Tabella parziale: copre Mediterraneo, Europa, principali bandiere di comodo
 * e traffico oceanico. Un MID non mappato resta esplicitamente "non determinato".
 */
const MID_TABLE: Record<string, [string, string]> = {
  "201": ["Albania", "AL"], "202": ["Andorra", "AD"], "203": ["Austria", "AT"],
  "204": ["Portogallo (Azzorre)", "PT"], "205": ["Belgio", "BE"], "206": ["Bielorussia", "BY"],
  "207": ["Bulgaria", "BG"], "208": ["Città del Vaticano", "VA"], "209": ["Cipro", "CY"],
  "210": ["Cipro", "CY"], "211": ["Germania", "DE"], "212": ["Cipro", "CY"],
  "213": ["Georgia", "GE"], "214": ["Moldavia", "MD"], "215": ["Malta", "MT"],
  "216": ["Armenia", "AM"], "218": ["Germania", "DE"], "219": ["Danimarca", "DK"],
  "220": ["Danimarca", "DK"], "224": ["Spagna", "ES"], "225": ["Spagna", "ES"],
  "226": ["Francia", "FR"], "227": ["Francia", "FR"], "228": ["Francia", "FR"],
  "229": ["Malta", "MT"], "230": ["Finlandia", "FI"], "231": ["Fær Øer", "FO"],
  "232": ["Regno Unito", "GB"], "233": ["Regno Unito", "GB"], "234": ["Regno Unito", "GB"],
  "235": ["Regno Unito", "GB"], "236": ["Gibilterra", "GI"], "237": ["Grecia", "GR"],
  "238": ["Croazia", "HR"], "239": ["Grecia", "GR"], "240": ["Grecia", "GR"],
  "241": ["Grecia", "GR"], "242": ["Marocco", "MA"], "243": ["Ungheria", "HU"],
  "244": ["Paesi Bassi", "NL"], "245": ["Paesi Bassi", "NL"], "246": ["Paesi Bassi", "NL"],
  "247": ["Italia", "IT"], "248": ["Malta", "MT"], "249": ["Malta", "MT"],
  "250": ["Irlanda", "IE"], "251": ["Islanda", "IS"], "252": ["Liechtenstein", "LI"],
  "253": ["Lussemburgo", "LU"], "254": ["Monaco", "MC"], "255": ["Portogallo (Madeira)", "PT"],
  "256": ["Malta", "MT"], "257": ["Norvegia", "NO"], "258": ["Norvegia", "NO"],
  "259": ["Norvegia", "NO"], "261": ["Polonia", "PL"], "262": ["Montenegro", "ME"],
  "263": ["Portogallo", "PT"], "264": ["Romania", "RO"], "265": ["Svezia", "SE"],
  "266": ["Svezia", "SE"], "267": ["Slovacchia", "SK"], "268": ["San Marino", "SM"],
  "269": ["Svizzera", "CH"], "270": ["Cechia", "CZ"], "271": ["Turchia", "TR"],
  "272": ["Ucraina", "UA"], "273": ["Russia", "RU"], "274": ["Macedonia del Nord", "MK"],
  "275": ["Lettonia", "LV"], "276": ["Estonia", "EE"], "277": ["Lituania", "LT"],
  "278": ["Slovenia", "SI"], "279": ["Serbia", "RS"],
  "301": ["Anguilla", "AI"], "303": ["Stati Uniti", "US"], "304": ["Antigua e Barbuda", "AG"],
  "305": ["Antigua e Barbuda", "AG"], "306": ["Curaçao", "CW"], "307": ["Aruba", "AW"],
  "308": ["Bahamas", "BS"], "309": ["Bahamas", "BS"], "310": ["Bermuda", "BM"],
  "311": ["Bahamas", "BS"], "312": ["Belize", "BZ"], "314": ["Barbados", "BB"],
  "316": ["Canada", "CA"], "319": ["Isole Cayman", "KY"], "321": ["Costa Rica", "CR"],
  "323": ["Cuba", "CU"], "325": ["Dominica", "DM"], "327": ["Rep. Dominicana", "DO"],
  "329": ["Guadalupa", "GP"], "330": ["Grenada", "GD"], "331": ["Groenlandia", "GL"],
  "332": ["Guatemala", "GT"], "334": ["Honduras", "HN"], "336": ["Haiti", "HT"],
  "338": ["Stati Uniti", "US"], "339": ["Giamaica", "JM"], "341": ["Saint Kitts e Nevis", "KN"],
  "343": ["Saint Lucia", "LC"], "345": ["Messico", "MX"], "347": ["Martinica", "MQ"],
  "348": ["Montserrat", "MS"], "350": ["Nicaragua", "NI"], "351": ["Panama", "PA"],
  "352": ["Panama", "PA"], "353": ["Panama", "PA"], "354": ["Panama", "PA"],
  "355": ["Panama", "PA"], "356": ["Panama", "PA"], "357": ["Panama", "PA"],
  "358": ["Porto Rico", "PR"], "359": ["El Salvador", "SV"], "361": ["Saint-Pierre e Miquelon", "PM"],
  "362": ["Trinidad e Tobago", "TT"], "364": ["Turks e Caicos", "TC"], "366": ["Stati Uniti", "US"],
  "367": ["Stati Uniti", "US"], "368": ["Stati Uniti", "US"], "369": ["Stati Uniti", "US"],
  "370": ["Panama", "PA"], "371": ["Panama", "PA"], "372": ["Panama", "PA"],
  "373": ["Panama", "PA"], "374": ["Panama", "PA"], "375": ["Saint Vincent", "VC"],
  "376": ["Saint Vincent", "VC"], "377": ["Saint Vincent", "VC"],
  "378": ["Isole Vergini Britanniche", "VG"], "379": ["Isole Vergini USA", "VI"],
  "401": ["Afghanistan", "AF"], "403": ["Arabia Saudita", "SA"], "405": ["Bangladesh", "BD"],
  "408": ["Bahrein", "BH"], "412": ["Cina", "CN"], "413": ["Cina", "CN"],
  "414": ["Cina", "CN"], "416": ["Taiwan", "TW"], "417": ["Sri Lanka", "LK"],
  "419": ["India", "IN"], "422": ["Iran", "IR"], "423": ["Azerbaigian", "AZ"],
  "425": ["Iraq", "IQ"], "428": ["Israele", "IL"], "431": ["Giappone", "JP"],
  "432": ["Giappone", "JP"], "434": ["Turkmenistan", "TM"], "436": ["Kazakistan", "KZ"],
  "437": ["Uzbekistan", "UZ"], "438": ["Giordania", "JO"], "440": ["Corea del Sud", "KR"],
  "441": ["Corea del Sud", "KR"], "443": ["Palestina", "PS"], "445": ["Corea del Nord", "KP"],
  "447": ["Kuwait", "KW"], "450": ["Libano", "LB"], "451": ["Kirghizistan", "KG"],
  "453": ["Macao", "MO"], "455": ["Maldive", "MV"], "457": ["Mongolia", "MN"],
  "459": ["Nepal", "NP"], "461": ["Oman", "OM"], "463": ["Pakistan", "PK"],
  "466": ["Qatar", "QA"], "468": ["Siria", "SY"], "470": ["Emirati Arabi Uniti", "AE"],
  "472": ["Tagikistan", "TJ"], "473": ["Yemen", "YE"], "475": ["Vietnam", "VN"],
  "477": ["Hong Kong", "HK"], "478": ["Bosnia ed Erzegovina", "BA"],
  "501": ["Antartide", "AQ"], "503": ["Australia", "AU"], "506": ["Myanmar", "MM"],
  "508": ["Brunei", "BN"], "510": ["Micronesia", "FM"], "511": ["Palau", "PW"],
  "512": ["Nuova Zelanda", "NZ"], "514": ["Cambogia", "KH"], "515": ["Cambogia", "KH"],
  "518": ["Isole Cook", "CK"], "520": ["Figi", "FJ"], "525": ["Indonesia", "ID"],
  "529": ["Kiribati", "KI"], "531": ["Laos", "LA"], "533": ["Malaysia", "MY"],
  "536": ["Isole Marianne Settentrionali", "MP"], "538": ["Isole Marshall", "MH"],
  "540": ["Nuova Caledonia", "NC"], "542": ["Niue", "NU"], "544": ["Nauru", "NR"],
  "546": ["Polinesia Francese", "PF"], "548": ["Filippine", "PH"], "553": ["Papua Nuova Guinea", "PG"],
  "555": ["Isole Pitcairn", "PN"], "557": ["Isole Salomone", "SB"], "559": ["Samoa Americane", "AS"],
  "561": ["Samoa", "WS"], "563": ["Singapore", "SG"], "564": ["Singapore", "SG"],
  "565": ["Singapore", "SG"], "566": ["Singapore", "SG"], "567": ["Thailandia", "TH"],
  "570": ["Tonga", "TO"], "572": ["Tuvalu", "TV"], "574": ["Vietnam", "VN"],
  "576": ["Vanuatu", "VU"], "577": ["Vanuatu", "VU"], "578": ["Wallis e Futuna", "WF"],
  "601": ["Sudafrica", "ZA"], "603": ["Angola", "AO"], "605": ["Algeria", "DZ"],
  "607": ["Terre Australi Francesi", "TF"], "608": ["Ascension", "SH"], "609": ["Burundi", "BI"],
  "610": ["Benin", "BJ"], "611": ["Botswana", "BW"], "612": ["Rep. Centrafricana", "CF"],
  "613": ["Camerun", "CM"], "615": ["Congo", "CG"], "616": ["Comore", "KM"],
  "617": ["Capo Verde", "CV"], "619": ["Costa d'Avorio", "CI"], "620": ["Comore", "KM"],
  "621": ["Gibuti", "DJ"], "622": ["Egitto", "EG"], "624": ["Etiopia", "ET"],
  "625": ["Eritrea", "ER"], "626": ["Gabon", "GA"], "627": ["Ghana", "GH"],
  "629": ["Gambia", "GM"], "630": ["Guinea-Bissau", "GW"], "631": ["Guinea Equatoriale", "GQ"],
  "632": ["Guinea", "GN"], "633": ["Burkina Faso", "BF"], "634": ["Kenya", "KE"],
  "636": ["Liberia", "LR"], "637": ["Liberia", "LR"], "638": ["Sud Sudan", "SS"],
  "642": ["Libia", "LY"], "644": ["Lesotho", "LS"], "645": ["Mauritius", "MU"],
  "647": ["Madagascar", "MG"], "649": ["Mali", "ML"], "650": ["Mozambico", "MZ"],
  "654": ["Mauritania", "MR"], "655": ["Malawi", "MW"], "656": ["Niger", "NE"],
  "657": ["Nigeria", "NG"], "659": ["Namibia", "NA"], "660": ["La Réunion", "RE"],
  "661": ["Ruanda", "RW"], "662": ["Sudan", "SD"], "663": ["Senegal", "SN"],
  "664": ["Seychelles", "SC"], "665": ["Sant'Elena", "SH"], "666": ["Somalia", "SO"],
  "667": ["Sierra Leone", "SL"], "668": ["São Tomé e Príncipe", "ST"], "669": ["Eswatini", "SZ"],
  "670": ["Ciad", "TD"], "671": ["Togo", "TG"], "672": ["Tunisia", "TN"],
  "674": ["Tanzania", "TZ"], "675": ["Uganda", "UG"], "676": ["Rep. Dem. del Congo", "CD"],
  "677": ["Tanzania", "TZ"], "678": ["Zambia", "ZM"], "679": ["Zimbabwe", "ZW"],
  "701": ["Argentina", "AR"], "710": ["Brasile", "BR"], "720": ["Bolivia", "BO"],
  "725": ["Cile", "CL"], "730": ["Colombia", "CO"], "735": ["Ecuador", "EC"],
  "740": ["Isole Falkland", "FK"], "745": ["Guyana Francese", "GF"], "750": ["Guyana", "GY"],
  "755": ["Paraguay", "PY"], "760": ["Perù", "PE"], "765": ["Suriname", "SR"],
  "770": ["Uruguay", "UY"], "775": ["Venezuela", "VE"],
};

export interface FlagInfo {
  country: string;
  iso2: string | null;
  flagEmoji: string;
}

export function flagFromMmsi(mmsi: string | null | undefined): FlagInfo {
  const digits = (mmsi ?? "").replace(/\D/g, "");
  if (digits.length !== 9) {
    return { country: "Non determinata", iso2: null, flagEmoji: "🏳️" };
  }
  const mid = digits.slice(0, 3);
  const entry = MID_TABLE[mid];
  if (!entry) {
    return { country: `MID ${mid} non mappato`, iso2: null, flagEmoji: "🏳️" };
  }
  return { country: entry[0], iso2: entry[1], flagEmoji: emojiFromIso2(entry[1]) };
}

export function emojiFromIso2(iso2: string | null): string {
  if (!iso2 || iso2.length !== 2) return "🏳️";
  const base = 0x1f1e6;
  const chars = [...iso2.toUpperCase()].map((char) =>
    String.fromCodePoint(base + (char.charCodeAt(0) - 65)),
  );
  return chars.join("");
}

/** Tipo di stazione ricavato dal prefisso MMSI (utile per escludere AtoN/base). */
export function mmsiKind(mmsi: string): "ship" | "aton" | "base" | "sar" | "unknown" {
  const digits = (mmsi ?? "").replace(/\D/g, "");
  if (digits.length !== 9) return "unknown";
  const first = digits[0];
  if (first === "9") return digits.startsWith("99") ? "aton" : "sar";
  if (first === "0") return "base";
  if (first === "1") return "sar";
  return "ship";
}
