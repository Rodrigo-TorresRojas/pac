import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { reuniones } from "./rutas/reuniones.js";
import { granola } from "./rutas/granola.js";
import { asistente } from "./rutas/asistente.js";
import { ozonar } from "./rutas/ozonar.js";
import { equipo } from "./rutas/equipo.js";

/**
 * Servidor de PAC.
 * - /api/* : rutas del servidor (aquí vivirá la IA, con la clave de Gemini segura).
 * - todo lo demás: la web compilada (solo en producción; en desarrollo la sirve Vite).
 */
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/healthz", (_req, res) => {
  res.json({ ok: true, servicio: "pac", hora: new Date().toISOString() });
});

app.use("/api", reuniones);
app.use("/api", granola);
app.use("/api", asistente);
app.use("/api", ozonar);
app.use("/api", equipo);

// Cualquier otra ruta /api que no exista
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// Web compilada (apps/web/dist). Las rutas de React vuelven a index.html.
const aqui = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(aqui, "../../web/dist");
if (existsSync(web)) {
  app.use(express.static(web));
  app.get("*", (_req, res) => res.sendFile(path.join(web, "index.html")));
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`PAC escuchando en http://localhost:${port}`);
});
