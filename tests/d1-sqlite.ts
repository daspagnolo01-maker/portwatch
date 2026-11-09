/**
 * Adattatore minimale dell'API D1 sopra `node:sqlite`, usato SOLO dai test.
 *
 * L'applicazione non usa `node:sqlite`: sul runtime di produzione il binding è
 * D1. Questo adattatore permette di verificare in locale, con SQL reale, la
 * logica di ingest e i repository, senza dipendere da wrangler o dal cloud.
 */
import { DatabaseSync } from "node:sqlite";
import type { D1DatabaseLike } from "../src/lib/db.ts";

type Row = Record<string, unknown>;

class Statement {
  private readonly db: DatabaseSync;
  private readonly sql: string;
  private readonly params: unknown[];

  constructor(db: DatabaseSync, sql: string, params: unknown[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...values: unknown[]): Statement {
    return new Statement(this.db, this.sql, values.map(normalize));
  }

  async all<T = Row>(): Promise<{ results: T[]; meta: { changes: number } }> {
    const statement = this.db.prepare(this.sql);
    const rows = statement.all(...(this.params as never[])) as T[];
    return { results: rows.map((row) => ({ ...(row as Row) }) as T), meta: { changes: 0 } };
  }

  async first<T = Row>(): Promise<T | null> {
    const statement = this.db.prepare(this.sql);
    const row = statement.get(...(this.params as never[])) as T | undefined;
    return row === undefined ? null : ({ ...(row as Row) } as T);
  }

  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    const statement = this.db.prepare(this.sql);
    const result = statement.run(...(this.params as never[]));
    return {
      meta: {
        changes: Number(result.changes ?? 0),
        last_row_id: Number(result.lastInsertRowid ?? 0),
      },
    };
  }
}

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

export class D1Sqlite implements D1DatabaseLike {
  private readonly db: DatabaseSync;

  constructor(file = ":memory:") {
    this.db = new DatabaseSync(file);
  }

  prepare(sql: string): Statement {
    return new Statement(this.db, sql);
  }

  async batch(statements: Statement[]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }

  async exec(sql: string): Promise<unknown> {
    this.db.exec(sql);
    return { count: 0 };
  }

  close(): void {
    this.db.close();
  }
}
