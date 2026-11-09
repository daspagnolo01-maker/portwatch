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

  // Il flag dipende dall'origine, non da NODE_ENV: nel Worker compilato
  // NODE_ENV vale sempre "production", anche quando si prova in locale. In
  // produzione APP_ORIGIN è https, quindi il flag resta spento e non indebolisce
  // nulla; serve solo al callback su http://localhost durante lo sviluppo.
  const isLoopback = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(baseUrl);

  instance = createFreebuffNext({
    clientId,
    baseUrl,
    issuer: process.env.FREEBUFF_ISSUER || undefined,
    allowInsecureLocalhost: isLoopback,
  });
  return instance;
}
