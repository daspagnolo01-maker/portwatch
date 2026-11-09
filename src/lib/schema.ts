/**
 * Schema del database persistente (SQLite).
 * Le tabelle sono create in modo idempotente all'avvio: gli aggiornamenti
 * successivi passano da `migrate()` in db.ts.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS vessels (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  mmsi                TEXT NOT NULL UNIQUE,
  imo                 TEXT,
  name                TEXT,
  callsign            TEXT,
  flag_country        TEXT,
  flag_code           TEXT,
  ship_type_code      INTEGER,
  ship_type_label     TEXT,
  ship_category       TEXT,
  length_m            REAL,
  beam_m              REAL,
  gt                  REAL,
  dwt                 REAL,
  year_built          INTEGER,
  owner               TEXT,
  operator            TEXT,
  company             TEXT,
  ais_class           TEXT,
  draught_m           REAL,
  destination_declared TEXT,
  destination_ts      TEXT,
  eta_declared        TEXT,
  eta_ts              TEXT,
  first_seen          TEXT NOT NULL,
  last_seen           TEXT NOT NULL,
  last_lat            REAL,
  last_lon            REAL,
  last_sog            REAL,
  last_cog            REAL,
  last_heading        INTEGER,
  nav_status          INTEGER,
  note                TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vessels_name ON vessels(name);
CREATE INDEX IF NOT EXISTS idx_vessels_imo ON vessels(imo);
CREATE INDEX IF NOT EXISTS idx_vessels_lastseen ON vessels(last_seen);

-- Alcune unità cambiano MMSI (riassegnazione, duplicati IMO): gli alias
-- permettono di riconoscere la stessa nave senza duplicare la scheda.
CREATE TABLE IF NOT EXISTS vessel_aliases (
  mmsi        TEXT PRIMARY KEY,
  vessel_id   INTEGER NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alias_vessel ON vessel_aliases(vessel_id);

-- Scheda commerciale / merceologica (archivio storico, non carico corrente).
CREATE TABLE IF NOT EXISTS vessel_profiles (
  vessel_id           INTEGER PRIMARY KEY REFERENCES vessels(id) ON DELETE CASCADE,
  cargo_types         TEXT,
  cargo_description   TEXT,
  hs_codes            TEXT,
  transport_mode      TEXT,
  cargo_particulars   TEXT,
  usual_routes        TEXT,
  frequent_ports      TEXT,
  usual_origins       TEXT,
  usual_destinations  TEXT,
  call_frequency      TEXT,
  operator_notes      TEXT,
  updated_at          TEXT NOT NULL
);

-- Stato geografico e anti-rimbalzo per ciascuna nave monitorata.
CREATE TABLE IF NOT EXISTS vessel_states (
  vessel_id         INTEGER PRIMARY KEY REFERENCES vessels(id) ON DELETE CASCADE,
  inside_port       INTEGER NOT NULL DEFAULT 0,
  inside_since      TEXT,
  outside_since     TEXT,
  entry_samples     INTEGER NOT NULL DEFAULT 0,
  exit_samples      INTEGER NOT NULL DEFAULT 0,
  approached        INTEGER NOT NULL DEFAULT 0,
  signal_lost       INTEGER NOT NULL DEFAULT 0,
  last_inside_ts    TEXT,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vessel_id    INTEGER NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  mmsi         TEXT NOT NULL,
  lat          REAL NOT NULL,
  lon          REAL NOT NULL,
  sog          REAL,
  cog          REAL,
  heading      INTEGER,
  nav_status   INTEGER,
  ts           TEXT NOT NULL,
  received_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_positions_vessel_ts ON positions(vessel_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_positions_ts ON positions(ts);

-- Scali portuali: un solo scalo aperto (EXPECTED o IN_PORT) per nave.
CREATE TABLE IF NOT EXISTS port_calls (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  vessel_id      INTEGER NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('EXPECTED','IN_PORT','DEPARTED','CANCELLED')),
  eta_declared   TEXT,
  eta_estimated  TEXT,
  arrival_ts     TEXT,
  ata            TEXT,
  departure_ts   TEXT,
  last_port      TEXT,
  destination    TEXT,
  expected_source TEXT,
  declared_draught REAL,
  note           TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_open
  ON port_calls(vessel_id) WHERE status IN ('EXPECTED','IN_PORT');
CREATE INDEX IF NOT EXISTS idx_calls_status ON port_calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_arrival ON port_calls(arrival_ts DESC);
CREATE INDEX IF NOT EXISTS idx_calls_departure ON port_calls(departure_ts DESC);

CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'info',
  vessel_id     INTEGER REFERENCES vessels(id) ON DELETE SET NULL,
  vessel_name   TEXT,
  mmsi          TEXT,
  title         TEXT NOT NULL,
  details       TEXT,
  ts            TEXT NOT NULL,
  email_status  TEXT,
  email_error   TEXT,
  acknowledged  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_vessel ON events(vessel_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, ts DESC);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_recipients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  cargo_type  TEXT NOT NULL,
  description TEXT,
  items       TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customs_operations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vessel_id    INTEGER NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  port_call_id INTEGER REFERENCES port_calls(id) ON DELETE SET NULL,
  template_key TEXT,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','ready','closed')),
  cargo_types  TEXT,
  notes        TEXT,
  created_by   TEXT DEFAULT 'operatore',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customs_vessel ON customs_operations(vessel_id);
CREATE INDEX IF NOT EXISTS idx_customs_status ON customs_operations(status);

CREATE TABLE IF NOT EXISTS customs_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id  INTEGER NOT NULL REFERENCES customs_operations(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'documento',
  required      INTEGER NOT NULL DEFAULT 1,
  done          INTEGER NOT NULL DEFAULT 0,
  done_at       TEXT,
  note          TEXT,
  sort          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_customs_items_op ON customs_items(operation_id);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Migrazioni incrementali: ogni voce è eseguita una sola volta. */
export const MIGRATIONS: { key: string; sql: string }[] = [
  {
    key: "2026-11-01-initial-indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_vessels_name_nocase ON vessels(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_calls_vessel ON port_calls(vessel_id);
    `,
  },
];
