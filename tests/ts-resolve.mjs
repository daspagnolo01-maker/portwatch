import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Hook di risoluzione per i test con il runner nativo di Node.
 * I moduli di `src` usano import senza estensione (risolti dal bundler Next):
 * qui aggiungiamo `.ts` / `/index.ts` solo per le specifier relative, così
 * `node --test` può caricare gli stessi file senza un bundler.
 */
export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);

  if (isRelative && !hasExtension) {
    const parentPath = context.parentURL
      ? fileURLToPath(context.parentURL)
      : path.join(process.cwd(), "index.js");
    const candidate = path.resolve(path.dirname(parentPath), specifier);

    for (const suffix of [".ts", ".tsx", "/index.ts"]) {
      if (existsSync(candidate + suffix)) {
        return nextResolve(pathToFileURL(candidate + suffix).href, context);
      }
    }
  }

  return nextResolve(specifier, context);
}
