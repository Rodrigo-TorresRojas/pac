import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const raiz = fileURLToPath(new URL("../..", import.meta.url));

const ARCHIVOS_DE_MARCA = ["marca.json", "isotipo.svg", "logo.svg", "logo-horizontal.svg", "logo-horizontal-blanco.svg", "nombre.svg"];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Ubica la carpeta marcas/<MARCA> y revisa que esté completa antes de compilar. */
function carpetaDeMarca(marca: string): string {
  if (!/^[a-z0-9-]+$/.test(marca)) throw new Error(`MARCA="${marca}" no es válido: usa minúsculas, números y guiones.`);
  const dir = resolve(raiz, "marcas", marca);
  if (!existsSync(dir)) throw new Error(`No existe la carpeta marcas/${marca}. Revisa MARCA en el .env.`);
  const faltan = ARCHIVOS_DE_MARCA.filter((f) => !existsSync(resolve(dir, f)));
  if (faltan.length) throw new Error(`A marcas/${marca} le faltan: ${faltan.join(", ")}`);
  const json = JSON.parse(readFileSync(resolve(dir, "marca.json"), "utf8"));
  for (const c of ["principal", "acento", "texto", "fondo"]) {
    if (!HEX.test(json?.colores?.[c] ?? "")) throw new Error(`marcas/${marca}/marca.json: colores.${c} debe ser un color #RRGGBB.`);
  }
  return dir;
}

/** Pone el título de la pestaña según la marca. */
function tituloDeMarca(dir: string): Plugin {
  const { nombre, producto } = JSON.parse(readFileSync(resolve(dir, "marca.json"), "utf8"));
  const titulo = nombre === producto ? producto : `${producto} · ${nombre}`;
  return { name: "pac-marca", transformIndexHtml: (html) => html.replace("%TITULO%", titulo) };
}

// El .env vive en la raíz del repositorio (../..).
// En desarrollo, /api se envía al servidor Node del puerto 3000.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, raiz, "");
  const dir = carpetaDeMarca((env.MARCA || "plantilla").trim());
  return {
    plugins: [react(), tituloDeMarca(dir)],
    envDir: raiz,
    resolve: { alias: { "@marca": dir } },
    server: {
      port: 5173,
      proxy: { "/api": "http://localhost:3000" },
      fs: { allow: [raiz] },
    },
  };
});
