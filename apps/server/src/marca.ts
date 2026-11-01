import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ConfigOzonar {
  tamano_lote: number;
  exploracion: number;
  busquedas: string[];
  zonas: { zona: string; peso: number }[];
}

interface Marca { nombre?: string; ozonar?: Partial<ConfigOzonar> }

/** marcas/<MARCA>/marca.json (el mismo archivo que usa la web). */
function leerMarca(): Marca {
  const marca = (process.env.MARCA || "plantilla").trim();
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  for (const raiz of [path.resolve(aqui, "../../.."), process.cwd()]) {
    const archivo = path.join(raiz, "marcas", marca, "marca.json");
    if (existsSync(archivo)) {
      try { return JSON.parse(readFileSync(archivo, "utf8")) as Marca; } catch { /* sigue */ }
    }
  }
  return {};
}

export function nombreEmpresa(): string {
  return leerMarca().nombre ?? "la empresa";
}

export function configOzonar(): ConfigOzonar {
  const o = leerMarca().ozonar ?? {};
  return {
    tamano_lote: Math.min(30, Math.max(5, o.tamano_lote ?? 15)),
    exploracion: Math.max(0, o.exploracion ?? 4),
    busquedas: o.busquedas?.length ? o.busquedas : ["clínica"],
    zonas: o.zonas?.length ? o.zonas : [{ zona: "Lima", peso: 1 }],
  };
}
