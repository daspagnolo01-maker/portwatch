import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/**
 * Il dev server gira dentro la VM e viene esposto tramite un hostname di anteprima
 * che cambia ad ogni sessione. Gli origin ammessi per richieste cross-origin di
 * sviluppo (HMR, asset) vanno dichiarati esplicitamente: mai usare wildcard totali.
 */
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "localhost,127.0.0.1")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
  poweredByHeader: false,
};

// L'applicazione accede al database solo tramite il binding D1. In `next dev`
// quel binding non esiste: OpenNext avvia il D1 locale definito nella
// configurazione Wrangler generata da Sites (`freebuff.wrangler.jsonc`).
initOpenNextCloudflareForDev({ configPath: "./freebuff.wrangler.jsonc" });

export default nextConfig;
