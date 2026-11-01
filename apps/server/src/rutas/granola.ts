import { Router } from "express";
import { clienteDeUsuario, ErrorHttp } from "../supabase.js";
import { duracionMin, granolaConfigurado, listarNotas, obtenerNota, resumenComoTexto, transcripcionComoTexto } from "../granola.js";

export const granola = Router();

const DIAS = Number(process.env.GRANOLA_DIAS ?? 14); // en la primera sincronización, cuántos días atrás traer
let enCurso: Promise<unknown> | null = null;      // evita dos sincronizaciones a la vez

/**
 * Trae de Granola las reuniones nuevas y las deja en la bandeja (sin cliente asignado).
 * Lo llama la web al abrirse y cada pocos minutos.
 */
granola.post("/granola/sincronizar", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { sb } = await clienteDeUsuario(req.get("authorization"));
    if (!granolaConfigurado()) return void res.json({ configurado: false, nuevas: 0 });
    if (enCurso) { await enCurso.catch(() => undefined); return void res.json({ configurado: true, nuevas: 0 }); }

    const tarea = (async () => {
      // Desde la última reunión importada (con 2 días de margen) o, la primera vez, los últimos DIAS días.
      const { data: ultima } = await sb.from("reuniones").select("created_at").not("granola_id", "is", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const desde = new Date(ultima ? Date.parse(ultima.created_at) - 2 * 86_400_000 : Date.now() - DIAS * 86_400_000).toISOString();

      const notas = (await listarNotas(desde)).filter((n) => !n.deleted_at);
      if (!notas.length) return 0;
      const ids = notas.map((n) => n.id);
      const [{ data: existentes }, { data: descartadas }] = await Promise.all([
        sb.from("reuniones").select("granola_id").in("granola_id", ids),
        sb.from("reuniones_descartadas").select("granola_id").in("granola_id", ids),
      ]);
      const omitir = new Set([...(existentes ?? []), ...(descartadas ?? [])].map((x) => x.granola_id));

      let nuevas = 0;
      for (const n of notas) {
        if (omitir.has(n.id)) continue;
        const nota = await obtenerNota(n.id);
        if (!nota) continue; // Granola aún la está procesando: se trae en la próxima vuelta
        const duenio = nota.owner?.email?.toLowerCase();
        const asistentes = (nota.attendees ?? [])
          .filter((a) => a.email?.toLowerCase() !== duenio)
          .map((a) => ({ nombre: a.name ?? null, email: a.email ?? null }));
        const { error } = await sb.from("reuniones").upsert({
          granola_id: nota.id,
          cliente_id: null,
          titulo: (nota.title || nota.calendar_event?.event_title || "").slice(0, 300) || null,
          fecha: nota.calendar_event?.scheduled_start_time ?? nota.created_at,
          duracion_min: duracionMin(nota),
          asistentes,
          resumen_granola: resumenComoTexto(nota).slice(0, 20_000) || null,
          transcripcion: transcripcionComoTexto(nota).slice(0, 200_000) || null,
        }, { onConflict: "granola_id", ignoreDuplicates: true });
        if (!error) nuevas++;
      }
      return nuevas;
    })();
    enCurso = tarea;
    const nuevas = await tarea.finally(() => { enCurso = null; });
    res.json({ configurado: true, nuevas });
  } catch (error) {
    const known = error instanceof ErrorHttp;
    if (!known) console.warn("Sincronización con Granola falló:", (error as Error)?.message ?? error);
    res.status(known ? error.status : 500).json({ error: known ? error.message : "No se pudo sincronizar con Granola." });
  }
});
