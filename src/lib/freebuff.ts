import { createFreebuffNext, type FreebuffNext } from "@freebuff/auth/next";

let instance: FreebuffNext | null = null;

/**
 * Istanza unica per isolate, creata alla prima richiesta e non all'import:
 * durante la build del Worker le variabili dell'ambiente non esistono ancora.
 *
 * `clientId`, `issuer` e `baseUrl` sono configurazione pubblica, non segreti:
 * il deploy su Sites le inietta come `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`
 * e `APP_ORIGIN`.
 */
export function freebuff(): FreebuffNext {
  if (instance) return instance;

  const clientId = process.env.FREEBUFF_CLIENT_ID;
  const baseUrl = process.env.APP_ORIGIN;
  if (!clientId || !baseUrl) {
    throw new Error(
      "Accesso non configurato: FREEBUFF_CLIENT_ID e APP_ORIGIN sono obbligatorie (le inietta Sites al deploy)",
    );
  }

  instance = createFreebuffNext({
    clientId,
    baseUrl,
    issuer: process.env.FREEBUFF_ISSUER || undefined,
    // Solo in sviluppo: consente il callback su http://localhost.
    allowInsecureLocalhost: process.env.NODE_ENV !== "production",
  });
  return instance;
}
