import { Router } from "express";
import { z } from "zod";
import { clienteDeUsuario, ErrorHttp } from "../supabase.js";
import { analizar } from "../ia/copiloto.js";
import { mensajeDeError } from "../ia/gemini.js";
import { nombreEmpresa } from "../marca.js";

export const reuniones = Router();

const EMPRESA = nombreEmpresa();
const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

// Límite simple por usuario: 30 análisis cada 10 minutos.
const limites = new Map<string, { hasta: number; n: number }>();
function controlarLimite(usuarioId: string) {
  const ahora = Date.now();
  for (const [k, v] of limites) if (v.hasta < ahora) limites.delete(k);
  const l = limites.get(usuarioId) ?? { n: 0, hasta: ahora + 10 * 60_000 };
  if (l.n >= 30) throw new ErrorHttp(429, "Analizaste muchas reuniones seguidas. Espera unos minutos.");
  l.n++;
  limites.set(usuarioId, l);
}

/** Analiza (o vuelve a analizar) una reunión ya asignada a un cliente y guarda el resultado. */
reuniones.post("/reuniones/:id/analizar", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return void res.status(400).json({ error: "Reunión no válida." });

  let sb: Awaited<ReturnType<typeof clienteDeUsuario>>["sb"] | null = null;
  try {
    const sesion = await clienteDeUsuario(req.get("authorization"));
    sb = sesion.sb;
    controlarLimite(sesion.usuarioId);

    const { data: r, error } = await sb
      .from("reuniones")
      .select("id,titulo,transcripcion,resumen_granola,cliente_id,clientes(nombre,institucion,especialidad,temperatura,etapas(nombre))")
      .eq("id", id.data)
      .maybeSingle();
    if (error) throw new ErrorHttp(500, "No se pudo leer la reunión.");
    if (!r) throw new ErrorHttp(404, "La reunión no existe.");
    if (!r.cliente_id) throw new ErrorHttp(400, "Primero asigna la reunión a un cliente.");
    const texto = (r.transcripcion ?? "").trim() || (r.resumen_granola ?? "").trim();
    if (texto.length < 40) throw new ErrorHttp(400, "La reunión tiene muy poco texto para analizar.");

    const { data: productos } = await sb.from("productos").select("id,nombre,especialidad_objetivo,descripcion").eq("activo", true).order("nombre");
    const c = r.clientes as unknown as { nombre: string | null; institucion: string | null; especialidad: string | null; temperatura: string | null; etapas: { nombre: string } | null };

    await sb.from("reuniones").update({ estado_analisis: "pendiente", error_analisis: null }).eq("id", r.id);

    const resultado = await analizar(texto, {
      empresa: EMPRESA,
      hoy: hoyLima(),
      titulo: r.titulo,
      productos: productos ?? [],
      cliente: { nombre: c.nombre, institucion: c.institucion, especialidad: c.especialidad, temperatura: c.temperatura, etapa: c.etapas?.nombre ?? "" },
    });

    const producto = (productos ?? []).find((p) => p.nombre.toLowerCase() === resultado.producto_sugerido.trim().toLowerCase());
    const fila = {
      reunion_id: r.id,
      resumen: resultado.resumen,
      objeciones: resultado.objeciones.map((o) => o.trim()).filter(Boolean),
      acuerdos: resultado.acuerdos.trim() || null,
      recomendaciones: resultado.recomendaciones.trim() || null,
      temperatura_sugerida: resultado.temperatura_sugerida,
      producto_sugerido_id: producto?.id ?? null,
      seguimiento_sugerido_fecha: resultado.seguimiento_fecha || null,
      seguimiento_sugerido_motivo: resultado.seguimiento_motivo.trim() || null,
      borrador_whatsapp: resultado.borrador_whatsapp.trim() || null,
      created_at: new Date().toISOString(),
    };
    const guardado = await sb.from("analisis").upsert(fila, { onConflict: "reunion_id" }).select("*").single();
    if (guardado.error) throw new ErrorHttp(500, "No se pudo guardar el análisis.");
    await sb.from("reuniones").update({ estado_analisis: "listo", error_analisis: null }).eq("id", r.id);
    res.json({ analisis: guardado.data });
  } catch (error) {
    const mensaje = mensajeDeError(error);
    const status = error instanceof ErrorHttp ? error.status : 503;
    if (!(error instanceof ErrorHttp)) console.warn("Análisis falló:", (error as Error)?.message ?? error);
    // Se deja constancia en la reunión para mostrar el botón «Analizar de nuevo».
    if (sb && status !== 401 && status !== 404 && status !== 429) {
      await sb.from("reuniones").update({ estado_analisis: "error", error_analisis: mensaje }).eq("id", id.data);
    }
    res.status(status).json({ error: mensaje });
  }
});
