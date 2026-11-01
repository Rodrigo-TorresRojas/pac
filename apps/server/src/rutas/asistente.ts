import { Router } from "express";
import { z } from "zod";
import { clienteDeUsuario, ErrorHttp } from "../supabase.js";
import { conversar } from "../ia/asistente.js";
import { mensajeDeError } from "../ia/gemini.js";
import { nombreEmpresa } from "../marca.js";

export const asistente = Router();

const EMPRESA = nombreEmpresa();
const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

const Cuerpo = z.object({
  mensajes: z.array(z.object({ rol: z.enum(["usuario", "asistente"]), texto: z.string().trim().min(1).max(4000) })).min(1).max(40),
  cliente_actual: z.string().uuid().nullish(),
});

const limites = new Map<string, { hasta: number; n: number }>();

asistente.post("/asistente", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { sb, usuarioId } = await clienteDeUsuario(req.get("authorization"));
    const cuerpo = Cuerpo.safeParse(req.body);
    if (!cuerpo.success) throw new ErrorHttp(400, "No pude leer tu mensaje.");
    if (cuerpo.data.mensajes.at(-1)?.rol !== "usuario") throw new ErrorHttp(400, "Falta tu pregunta.");

    const ahora = Date.now();
    for (const [k, v] of limites) if (v.hasta < ahora) limites.delete(k);
    const l = limites.get(usuarioId) ?? { n: 0, hasta: ahora + 10 * 60_000 };
    if (l.n >= 60) throw new ErrorHttp(429, "Hiciste muchas preguntas seguidas. Espera unos minutos.");
    l.n++; limites.set(usuarioId, l);

    const { data: perfil } = await sb.from("usuarios").select("nombre").eq("id", usuarioId).maybeSingle();
    const respuesta = await conversar(sb, cuerpo.data.mensajes, {
      empresa: EMPRESA,
      usuario: perfil?.nombre ?? "el vendedor",
      hoy: hoyLima(),
      clienteActual: cuerpo.data.cliente_actual ?? null,
    });
    res.json(respuesta);
  } catch (error) {
    const status = error instanceof ErrorHttp ? error.status : 503;
    if (!(error instanceof ErrorHttp)) console.warn("Asistente falló:", (error as Error)?.message ?? error);
    res.status(status).json({ error: error instanceof ErrorHttp ? error.message : mensajeDeError(error).replace("analizar la reunión", "responder") });
  }
});
