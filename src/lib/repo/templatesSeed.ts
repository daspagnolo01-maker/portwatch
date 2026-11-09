import { getDb } from "../db";

/**
 * I modelli sono inseriti in modo idempotente all'apertura del database
 * (in `src/lib/db.ts`). Qui garantiamo solo che il DB sia inizializzato.
 */
export async function ensureTemplatesSeeded(): Promise<void> {
  await getDb();
}
