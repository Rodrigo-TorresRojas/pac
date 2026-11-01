import { Router } from "express";
import { clienteDeUsuario, ErrorHttp } from "../supabase.js";
import { detallesLugar, placesConfigurado, tavilyConfigurado } from "../ozonar/fuentes.js";
import { generarLote } from "../ozonar/generar.js";
import { mensajeDeError } from "../ia/gemini.js";
import { configOzonar } from "../marca.js";

export const ozonar = Router();

const mesActual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date()).slice(0, 8) + "01";
const responderError = (res: import("express").Response, error: unknown) => {
  const known = error instanceof ErrorHttp;
  if (!known) console.warn("Ozonar:", (error as Error)?.message ?? error);
  res.status(known ? error.status : 500).json({ error: known ? error.message : "Ozonar tuvo un problema. Inténtalo de nuevo." });
};

/** Estado de Ozonar: configuración, último lote y sus prospectos con nombre y dirección actuales de Google. */
ozonar.get("/ozonar", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { sb } = await clienteDeUsuario(req.get("authorization"));
    const config = { places: placesConfigurado(), tavily: tavilyConfigurado(), gemini: Boolean(process.env.GEMINI_API_KEY?.trim()), tamano_lote: configOzonar().tamano_lote };
    const { data: lote } = await sb.from("ozonar_lotes").select("*").order("mes", { ascending: false }).order("numero", { ascending: false }).limit(1).maybeSingle();
    let prospectos: Record<string, unknown>[] = [];
    if (lote) {
      const { data } = await sb.from("prospectos")
        .select("id,place_id,exploracion,segmento,zona,afinidad,razon,servicios,ofrece_ozono,correo,fuentes,opinion,estado,motivo_descarte,contactado_at,producto_sugerido_id,productos(nombre)")
        .eq("lote_id", lote.id).order("afinidad", { ascending: false });
      // Nombre y dirección se piden a Google en el momento (no se guardan).
      prospectos = await Promise.all((data ?? []).map(async (p) => {
        const l = p.place_id && config.places ? await detallesLugar(p.place_id, "basico").catch(() => null) : null;
        return { ...p, nombre: l?.displayName?.text ?? null, direccion: l?.formattedAddress ?? null, tipo: l?.primaryTypeDisplayName?.text ?? null, operativo: l ? l.businessStatus === "OPERATIONAL" || !l.businessStatus : null };
      }));
    }
    res.json({ config, mes_actual: mesActual(), lote, prospectos });
  } catch (error) { responderError(res, error); }
});

/** Contacto actual de un prospecto (teléfono, web, Google Maps). */
ozonar.get("/ozonar/lugar/:placeId", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { sb } = await clienteDeUsuario(req.get("authorization"));
    const { data } = await sb.from("prospectos").select("id").eq("place_id", req.params.placeId).maybeSingle();
    if (!data) throw new ErrorHttp(404, "Ese prospecto no existe.");
    const l = await detallesLugar(req.params.placeId, "contacto");
    if (!l) throw new ErrorHttp(404, "Google Maps ya no tiene ese lugar.");
    res.json({
      nombre: l.displayName?.text ?? null, direccion: l.formattedAddress ?? null, tipo: l.primaryTypeDisplayName?.text ?? null,
      telefono: l.nationalPhoneNumber ?? null, telefono_internacional: l.internationalPhoneNumber ?? null,
      web: l.websiteUri ?? null, maps: l.googleMapsUri ?? null, calificacion: l.rating ?? null, resenas: l.userRatingCount ?? null,
      operativo: l.businessStatus ? l.businessStatus === "OPERATIONAL" : null,
    });
  } catch (error) { responderError(res, error); }
});

/**
 * Genera el lote del mes (o uno extra si ya se trabajó todo el actual).
 * Responde enseguida y sigue trabajando; la web consulta GET /ozonar hasta que el lote esté listo.
 */
ozonar.post("/ozonar/generar", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { sb } = await clienteDeUsuario(req.get("authorization"));
    if (!placesConfigurado()) throw new ErrorHttp(503, "Falta la clave de Google Maps (GOOGLE_PLACES_API_KEY) en el servidor.");
    if (!process.env.GEMINI_API_KEY?.trim()) throw new ErrorHttp(503, "Falta la clave de Gemini (GEMINI_API_KEY) en el servidor.");
    const mes = mesActual();
    const { data: lotes } = await sb.from("ozonar_lotes").select("id,numero,estado,created_at").eq("mes", mes).order("numero", { ascending: false });
    const ultimo = lotes?.[0];
    if (ultimo?.estado === "generando" && Date.now() - Date.parse(ultimo.created_at) < 10 * 60_000) return void res.status(202).json({ lote_id: ultimo.id });
    if (ultimo && ultimo.estado === "listo") {
      const { count } = await sb.from("prospectos").select("id", { count: "exact", head: true }).eq("lote_id", ultimo.id).eq("estado", "nuevo");
      if ((count ?? 0) > 0) throw new ErrorHttp(409, "Aún tienes prospectos sin trabajar en el lote actual.");
      if (ultimo.numero >= 4) throw new ErrorHttp(429, "Ya pediste 3 lotes extra este mes. El próximo llega el día 1.");
    }
    const numero = ultimo ? (ultimo.estado === "listo" ? ultimo.numero + 1 : ultimo.numero) : 1;
    const { data: lote, error } = await sb.from("ozonar_lotes")
      .upsert({ mes, numero, estado: "generando", error: null, created_at: new Date().toISOString() }, { onConflict: "mes,numero" })
      .select("id").single();
    if (error || !lote) throw new ErrorHttp(500, "No se pudo iniciar el lote.");
    res.status(202).json({ lote_id: lote.id });

    // Sigue en segundo plano (≈1 minuto).
    generarLote(sb, lote.id)
      .then((candidatos) => sb.from("ozonar_lotes").update({ estado: "listo", candidatos }).eq("id", lote.id))
      .catch((e) => {
        console.warn("Lote de Ozonar falló:", (e as Error)?.message ?? e);
        const mensaje = e instanceof ErrorHttp ? e.message : (e as Error)?.message?.startsWith("Google Maps no devolvió") ? (e as Error).message : mensajeDeError(e).replace("analizar la reunión", "armar el lote");
        return sb.from("ozonar_lotes").update({ estado: "error", error: mensaje }).eq("id", lote.id);
      });
  } catch (error) { responderError(res, error); }
});
