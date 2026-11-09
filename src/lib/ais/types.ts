/** Modelli e tipi dei messaggi AISStream (sottoinsieme usato dall'applicazione). */

export interface AisMetaData {
  MMSI?: number | string;
  MMSI_String?: number | string;
  ShipName?: string;
  latitude?: number;
  longitude?: number;
  Latitude?: number;
  Longitude?: number;
  time_utc?: string;
}

export interface AisEnvelope {
  MessageType: string;
  MetaData?: AisMetaData;
  Message?: Record<string, unknown>;
  error?: string;
  Error?: string;
}

export interface AisEtaFields {
  Month?: number;
  Day?: number;
  Hour?: number;
  Minute?: number;
}

export interface AisDimensionFields {
  A?: number;
  B?: number;
  C?: number;
  D?: number;
}

export interface AisPositionMessage {
  MessageID?: number;
  UserID?: number;
  Valid?: boolean;
  NavigationalStatus?: number;
  Sog?: number;
  Cog?: number;
  TrueHeading?: number;
  Latitude?: number;
  Longitude?: number;
  Timestamp?: number;
  Name?: string;
  Type?: number;
  Dimension?: AisDimensionFields;
}

export interface AisShipStaticMessage {
  MessageID?: number;
  UserID?: number;
  Valid?: boolean;
  ImoNumber?: number;
  CallSign?: string;
  Name?: string;
  Type?: number;
  Dimension?: AisDimensionFields;
  Eta?: AisEtaFields;
  MaximumStaticDraught?: number;
  Destination?: string;
}

export interface StaticDataReportFields {
  UserID?: number;
  PartNumber?: number | boolean;
  ShipName?: string;
  ShipType?: number;
  CallSign?: string;
  Dimension?: AisDimensionFields;
  ReportA?: { Name?: string; Valid?: boolean };
  ReportB?: {
    ShipType?: number;
    CallSign?: string;
    Dimension?: AisDimensionFields;
  };
}

export interface SubscriptionConfirmation {
  MessageType: "SubscriptionConfirmation";
  Message?: { CompressionEnabled?: boolean };
}

export const POSITION_MESSAGE_TYPES = [
  "PositionReport",
  "ExtendedClassBPositionReport",
  "StandardClassBPositionReport",
  "LongRangeAisBroadcastMessage",
] as const;

/** Tipi richiesti alla sottoscrizione: solo ciò che serve davvero. */
export const SUBSCRIBED_MESSAGE_TYPES = [
  "PositionReport",
  "ExtendedClassBPositionReport",
  "StandardClassBPositionReport",
  "ShipStaticData",
  "StaticDataReport",
];

export interface NormalizedPosition {
  mmsi: string;
  name: string | null;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  navStatus: number | null;
  ts: string;
  messageType: string;
}

export interface NormalizedStatic {
  mmsi: string;
  imo: string | null;
  name: string | null;
  callsign: string | null;
  shipTypeCode: number | null;
  lengthM: number | null;
  beamM: number | null;
  draughtM: number | null;
  destination: string | null;
  eta: AisEtaFields | null;
  aisClass: string;
}
