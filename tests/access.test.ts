import test from "node:test";
import assert from "node:assert/strict";
import { accessFor, isPublicPath } from "../src/lib/access.ts";

test("ogni pagina riservata rimanda all'accesso quando non c'è sessione", () => {
  for (const path of ["/", "/mappa", "/impostazioni", "/dogana", "/dogana/12", "/navi/42", "/eventi"]) {
    assert.deepEqual(accessFor(path, "", false), { kind: "signin", returnTo: path }, path);
  }
});

test("il ritorno al percorso conserva la query string", () => {
  assert.deepEqual(accessFor("/impostazioni", "?tab=email", false), {
    kind: "signin",
    returnTo: "/impostazioni?tab=email",
  });
});

test("con una sessione valida le stesse pagine sono accessibili", () => {
  for (const path of ["/", "/impostazioni", "/dogana", "/api/recipients"]) {
    assert.equal(accessFor(path, "", true).kind, "allow", path);
  }
});

test("le API riservate non rimandano al login ma rispondono 401", () => {
  for (const path of [
    "/api/recipients",
    "/api/settings",
    "/api/customs",
    "/api/export",
    "/api/email/test",
    "/api/vessels",
    "/api/ais/reconnect",
  ]) {
    assert.deepEqual(accessFor(path, "", false), { kind: "unauthorized" }, path);
  }
});

test("gli endpoint di monitoraggio restano pubblici per cron e controlli", () => {
  for (const path of ["/api/ais/status", "/api/health"]) {
    assert.equal(isPublicPath(path), true, path);
    assert.deepEqual(accessFor(path, "", false), { kind: "allow" }, path);
  }
  assert.deepEqual(accessFor("/api/ais/status", "?full=1", false), { kind: "allow" });
});

test("le rotte di autenticazione sono pubbliche", () => {
  for (const path of [
    "/auth/freebuff/signin",
    "/auth/freebuff/callback",
    "/auth/freebuff/signout",
    "/auth/freebuff/session",
  ]) {
    assert.equal(isPublicPath(path), true, path);
  }
});

test("percorsi solo simili agli endpoint pubblici restano protetti", () => {
  for (const path of ["/api/ais/status-bypass", "/api/ais/status/extra", "/api/healthz", "/auth/freebuffx"]) {
    assert.equal(isPublicPath(path), false, path);
    assert.notEqual(accessFor(path, "", false).kind, "allow", path);
  }
});
