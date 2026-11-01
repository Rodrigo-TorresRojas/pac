import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Nombre de la empresa según marcas/<MARCA>/marca.json (el mismo archivo que usa la web). */
export function nombreEmpresa(): string {
  const marca = (process.env.MARCA || "plantilla").trim();
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  for (const raiz of [path.resolve(aqui, "../../.."), process.cwd()]) {
    const archivo = path.join(raiz, "marcas", marca, "marca.json");
    if (existsSync(archivo)) {
      try { return JSON.parse(readFileSync(archivo, "utf8")).nombre ?? "la empresa"; } catch { /* sigue */ }
    }
  }
  return "la empresa";
}
