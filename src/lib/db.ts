import { SCHEMA, MIGRATIONS } from "./schema";
import { CHECKLIST_TEMPLATES } from "./customsTemplates";

/**
 * Accesso al database sull'istanza ospitata (Cloudflare Workers + D1).
 *
 * Il binding D1 arriva dal contesto Cloudflare: in produzione è il database
 * provisionato da Sites, in sviluppo è il D1 locale di Miniflare avviato da
 * `initOpenNextCloudflareForDev()` in next.config.ts.
 *
 * L'API D1 è asincrona, quindi tutte le funzioni di accesso restituiscono
 * Promise: i repository (`src/lib/repo/*`) e i chiamanti le attendono.
 */
interface D1Result<T> {
  results?: T[];
  meta?: { changes?: number; last_row_id?: number; rows_read?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result<never>>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
  exec(sql: string): Promise<unknown>;
}

export type Param = string | number | null | boolean | undefined | Date;

/** Etichetta mostrata nelle impostazioni al posto del percorso del file SQLite. */
export const DATABASE_LABEL = "D1 (Cloudflare Workers)";

function toParam(value: Param): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

let testBinding: D1DatabaseLike | null = null;

/**
 * Inietta un binding compatibile D1 (usato dai test con un adattatore SQLite in
 * memoria). Passare `null` ripristina il binding del contesto Cloudflare.
 */
export function setDatabaseBindingForTests(binding: D1DatabaseLike | null): void {
  testBinding = binding;
  ready = null;
}

async function database(): Promise<D1DatabaseLike> {
  if (testBinding) return testBinding;
  // Import dinamico: i test e i moduli puri non devono caricare il runtime Cloudflare.
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const binding = (env as { DB?: D1DatabaseLike }).DB;
  if (!binding) {
    throw new Error(
      "Binding D1 «DB» non disponibile: verificare la configurazione Sites (sites_add_storage) o il wrangler locale.",
    );
  }
  return binding;
}

/** Divide lo schema in singole istruzioni, rispettando le stringhe quotate. */
export function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    if (char === "'") inString = !inString;
    if (char === ";" && !inString) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }
    current += char;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  // D1 non supporta i PRAGMA di connessione usati da SQLite su file.
  return statements.filter((statement) => !/^PRAGMA\b/i.test(statement));
}

async function initialize(db: D1DatabaseLike): Promise<void> {
  for (const statement of splitSql(SCHEMA)) {
    await db.prepare(statement).run();
  }

  for (const migration of MIGRATIONS) {
    const applied = await db
      .prepare("SELECT value FROM app_meta WHERE key = ?")
      .bind(migration.key)
      .first<{ value: string }>();
    if (applied) continue;
    for (const statement of splitSql(migration.sql)) {
      await db.prepare(statement).run();
    }
    await db
      .prepare("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING")
      .bind(migration.key, new Date().toISOString())
      .run();
  }

  const createdAt = new Date().toISOString();
  for (const template of CHECKLIST_TEMPLATES) {
    await db
      .prepare(
        `INSERT INTO checklist_templates (key, name, cargo_type, description, items, is_default, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(key) DO NOTHING`,
      )
      .bind(
        template.key,
        template.name,
        template.cargoType,
        template.description,
        JSON.stringify(template.items),
        createdAt,
      )
      .run();
  }
}

let ready: Promise<void> | null = null;

/**
 * Restituisce il binding D1 inizializzato (schema, migrazioni e modelli
 * doganali inseriti in modo idempotente una sola volta per isolate).
 */
export async function getDb(): Promise<D1DatabaseLike> {
  const db = await database();
  if (!ready) {
    ready = initialize(db).catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  await ready;
  return db;
}

function toPlainRow<T>(row: unknown): T {
  return { ...(row as Record<string, unknown>) } as unknown as T;
}

function bound(sql: string, params: Param[], db: D1DatabaseLike): D1PreparedStatement {
  const statement = db.prepare(sql);
  return params.length > 0 ? statement.bind(...params.map(toParam)) : statement;
}

export async function all<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T[]> {
  const db = await getDb();
  const result = await bound(sql, params, db).all<Record<string, unknown>>();
  return (result.results ?? []).map((row) => toPlainRow<T>(row));
}

export async function one<T = Record<string, unknown>>(
  sql: string,
  ...params: Param[]
): Promise<T | undefined> {
  const db = await getDb();
  const row = await bound(sql, params, db).first<Record<string, unknown>>();
  return row === null || row === undefined ? undefined : toPlainRow<T>(row);
}

export async function run(
  sql: string,
  ...params: Param[]
): Promise<{ changes: number; lastId: number }> {
  const db = await getDb();
  const result = await bound(sql, params, db).run();
  return {
    changes: Number(result.meta?.changes ?? 0),
    lastId: Number(result.meta?.last_row_id ?? 0),
  };
}

/**
 * D1 esegue ogni istruzione in autocommit: non esiste una transazione
 * interattiva lato Worker. Le sequenze critiche usano `db.batch()` quando
 * devono essere atomiche; qui il callback viene semplicemente atteso.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

export function jsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Verifica di integrità usata dalla pagina di stato/impostazioni. */
export async function databaseHealth(): Promise<{ ok: boolean; file: string; error?: string }> {
  try {
    await one<{ n: number }>("SELECT COUNT(*) AS n FROM vessels");
    return { ok: true, file: DATABASE_LABEL };
  } catch (error) {
    return {
      ok: false,
      file: DATABASE_LABEL,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
