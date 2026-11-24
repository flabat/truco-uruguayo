import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Variables del .env de la raíz del repositorio; las del proceso tienen prioridad. */
export function leerEntorno(raizRepo: string): Record<string, string | undefined> {
  const archivo = path.join(raizRepo, ".env");
  const valores: Record<string, string | undefined> = {};
  if (existsSync(archivo)) {
    for (const linea of readFileSync(archivo, "utf8").split("\n")) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linea);
      if (m && !linea.trimStart().startsWith("#")) valores[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return { ...valores, ...process.env };
}
