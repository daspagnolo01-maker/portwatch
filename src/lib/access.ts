/**
 * Regole di accesso dell'applicazione, in un modulo puro così da poterle
 * verificare senza rete né sessione.
 *
 * Tutto richiede l'accesso, tranne:
 * - le rotte di autenticazione stesse (`/auth/freebuff/*`);
 * - i due endpoint di monitoraggio usati dal cron GitHub e dai controlli
 *   esterni, che non espongono dati personali.
 */
export const PUBLIC_PATHS = [/^\/auth\/freebuff\//, /^\/api\/ais\/status$/, /^\/api\/health$/] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
}

export type AccessDecision =
  | { kind: "allow" }
  | { kind: "signin"; returnTo: string }
  | { kind: "unauthorized" };

export function accessFor(pathname: string, search: string, signedIn: boolean): AccessDecision {
  if (isPublicPath(pathname)) return { kind: "allow" };
  if (signedIn) return { kind: "allow" };
  if (pathname.startsWith("/api/")) return { kind: "unauthorized" };
  return { kind: "signin", returnTo: `${pathname}${search}` };
}
