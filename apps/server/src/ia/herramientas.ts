import { Type, type FunctionDeclaration } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Herramientas que el Asistente puede usar. Todas LEEN datos con los permisos del usuario.
 * Las de "proponer_*" no cambian nada: devuelven una propuesta que el usuario confirma con un botón.
 * No se envían teléfonos ni correos a la IA (no los necesita para responder).
 */
export const DECLARACIONES: FunctionDeclaration[] = [
  {
    name: "buscar_clientes",
    description: "Lista clientes de la cartera con filtros. Úsala para preguntas como «clientes calientes», «leads en Surco», «quiénes no tienen próximo paso».",
    parameters: {
      type: Type.OBJECT,
      properties: {
        texto: { type: Type.STRING, description: "Parte del nombre, clínica, especialidad o distrito" },
        etapa: { type: Type.STRING, description: "Nombre de la etapa, por ejemplo Lead, Negociación o Cerrado" },
        temperatura: { type: Type.STRING, enum: ["Caliente", "Tibio", "Frio", "sin"] },
        sin_proximo_paso: { type: Type.BOOLEAN, description: "Solo clientes en curso sin seguimiento pendiente" },
        incluir_inactivos: { type: Type.BOOLEAN },
        limite: { type: Type.INTEGER, description: "Máximo de resultados (por defecto 20, máximo 50)" },
      },
    },
  },
  {
    name: "ver_cliente",
    description: "Ficha completa de un cliente: datos, etapa, temperatura, seguimientos, historial y las últimas reuniones con su análisis (resumen, objeciones, acuerdos).",
    parameters: { type: Type.OBJECT, properties: { cliente_id: { type: Type.STRING } }, required: ["cliente_id"] },
  },
  {
    name: "ver_seguimientos",
    description: "Seguimientos (tareas) por fecha. Por defecto, los pendientes hasta hoy, incluidos los atrasados.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        desde: { type: Type.STRING, description: "AAAA-MM-DD" },
        hasta: { type: Type.STRING, description: "AAAA-MM-DD" },
        estado: { type: Type.STRING, enum: ["pendientes", "hechos", "todos"] },
      },
    },
  },
  {
    name: "metricas",
    description: "Resumen del negocio: clientes en cartera, por etapa y temperatura, cerrados del mes, seguimientos de hoy y atrasados, reuniones por asignar.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "buscar_en_reuniones",
    description: "Busca en los análisis de reuniones (resúmenes, objeciones, acuerdos, recomendaciones). Úsala para «qué objeciones me han puesto», «quién pidió estudios clínicos», «qué acordé con…».",
    parameters: {
      type: Type.OBJECT,
      properties: {
        texto: { type: Type.STRING, description: "Palabra o frase a buscar; vacío para las más recientes" },
        desde: { type: Type.STRING, description: "AAAA-MM-DD" },
        limite: { type: Type.INTEGER, description: "Máximo 30" },
      },
    },
  },
  {
    name: "proponer_seguimiento",
    description: "Propone crear un seguimiento. NO lo crea: el usuario lo confirma con un botón.",
    parameters: {
      type: Type.OBJECT,
      properties: { cliente_id: { type: Type.STRING }, fecha: { type: Type.STRING, description: "AAAA-MM-DD, hoy o después" }, motivo: { type: Type.STRING } },
      required: ["cliente_id", "fecha", "motivo"],
    },
  },
  {
    name: "proponer_cambio",
    description: "Propone cambiar la temperatura o la etapa de un cliente. NO lo cambia: el usuario lo confirma con un botón.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        cliente_id: { type: Type.STRING },
        temperatura: { type: Type.STRING, enum: ["Caliente", "Tibio", "Frio"] },
        etapa: { type: Type.STRING, description: "Nombre de la etapa" },
      },
      required: ["cliente_id"],
    },
  },
];

export interface Propuesta {
  tipo: "seguimiento" | "cambio";
  cliente_id: string;
  cliente: string;
  fecha?: string;
  motivo?: string;
  temperatura?: string;
  etapa_id?: string;
  etapa?: string;
}

type Args = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const entero = (v: unknown, def: number, max: number) => Math.min(max, Math.max(1, Number.isFinite(Number(v)) ? Math.round(Number(v)) : def));
const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nombre = (c: { nombre: string | null; institucion: string | null }) => c.nombre || c.institucion || "Sin nombre";
const normal = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ejecuta una herramienta. Devuelve datos para la IA y, si corresponde, una propuesta para el usuario. */
export async function ejecutar(sb: SupabaseClient, nombreHerramienta: string, args: Args, hoy: string): Promise<{ resultado: unknown; propuesta?: Propuesta }> {
  switch (nombreHerramienta) {
    case "buscar_clientes": {
      const { data, error } = await sb.from("clientes_resumen")
        .select("id,nombre,institucion,especialidad,distrito,departamento,pais,etapa,etapa_orden,etapa_id,temperatura,activo,fecha_cierre,proximo_seguimiento_fecha,proximo_seguimiento_motivo,ultima_reunion,created_at")
        .limit(5000);
      if (error) return { resultado: { error: "No se pudieron leer los clientes." } };
      const { data: etapas } = await sb.from("etapas").select("id,nombre,es_cierre");
      const cierre = new Set((etapas ?? []).filter((e) => e.es_cierre).map((e) => e.id));
      const q = normal(texto(args.texto));
      const et = normal(texto(args.etapa));
      const t = texto(args.temperatura);
      const lista = (data ?? []).filter((c) => {
        if (!args.incluir_inactivos && !c.activo) return false;
        if (et && normal(c.etapa) !== et) return false;
        if (t && (t === "sin" ? c.temperatura : c.temperatura !== t)) return false;
        if (args.sin_proximo_paso && (c.proximo_seguimiento_fecha || cierre.has(c.etapa_id) || !c.activo)) return false;
        if (q && ![c.nombre, c.institucion, c.especialidad, c.distrito, c.departamento].some((v) => normal(v).includes(q))) return false;
        return true;
      });
      const limite = entero(args.limite, 20, 50);
      return {
        resultado: {
          total: lista.length,
          mostrando: Math.min(lista.length, limite),
          clientes: lista.slice(0, limite).map((c) => ({
            id: c.id, nombre: nombre(c), institucion: c.nombre ? c.institucion : null, especialidad: c.especialidad,
            ubicacion: [c.distrito, c.departamento].filter(Boolean).join(", ") || null, etapa: c.etapa, temperatura: c.temperatura,
            activo: c.activo, proximo_seguimiento: c.proximo_seguimiento_fecha ? `${c.proximo_seguimiento_fecha}: ${c.proximo_seguimiento_motivo}` : null,
            ultima_reunion: c.ultima_reunion?.slice(0, 10) ?? null, registrado: c.created_at.slice(0, 10),
          })),
        },
      };
    }

    case "ver_cliente": {
      const id = texto(args.cliente_id);
      if (!UUID.test(id)) return { resultado: { error: "Id de cliente no válido. Búscalo primero con buscar_clientes." } };
      const [c, s, r, h] = await Promise.all([
        sb.from("clientes_resumen").select("id,nombre,institucion,especialidad,distrito,departamento,pais,etapa,temperatura,activo,fecha_cierre,notas,created_at").eq("id", id).maybeSingle(),
        sb.from("seguimientos").select("fecha,motivo,hecho,completado_at").eq("cliente_id", id).order("fecha", { ascending: false }).limit(15),
        sb.from("reuniones").select("fecha,titulo,analisis(resumen,objeciones,acuerdos,recomendaciones,temperatura_sugerida)").eq("cliente_id", id).order("fecha", { ascending: false }).limit(5),
        sb.from("historial_etapas").select("created_at,nueva:etapas!historial_etapas_etapa_nueva_id_fkey(nombre)").eq("cliente_id", id).order("created_at").limit(20),
      ]);
      if (!c.data) return { resultado: { error: "No encontré ese cliente." } };
      const d = c.data;
      return {
        resultado: {
          id: d.id, nombre: nombre(d), institucion: d.nombre ? d.institucion : null, especialidad: d.especialidad,
          ubicacion: [d.distrito, d.departamento, d.pais !== "Perú" ? d.pais : null].filter(Boolean).join(", ") || null,
          etapa: d.etapa, temperatura: d.temperatura, activo: d.activo, cerrado_el: d.fecha_cierre, notas: d.notas, registrado: d.created_at.slice(0, 10),
          seguimientos: s.data ?? [],
          reuniones: (r.data ?? []).map((x) => ({ fecha: x.fecha.slice(0, 10), titulo: x.titulo, analisis: (x.analisis as unknown[])?.[0] ?? null })),
          historial_etapas: (h.data ?? []).map((x) => ({ fecha: x.created_at.slice(0, 10), etapa: (x.nueva as unknown as { nombre: string } | null)?.nombre })),
        },
      };
    }

    case "ver_seguimientos": {
      const estado = texto(args.estado) || "pendientes";
      let q = sb.from("seguimientos").select("fecha,motivo,hecho,cliente_id,clientes(nombre,institucion)").order("fecha").limit(60);
      if (estado === "pendientes") q = q.eq("hecho", false);
      if (estado === "hechos") q = q.eq("hecho", true);
      const desde = fecha(args.desde), hasta = fecha(args.hasta) ?? (estado === "pendientes" && !fecha(args.desde) ? hoy : null);
      if (desde) q = q.gte("fecha", desde);
      if (hasta) q = q.lte("fecha", hasta);
      const { data } = await q;
      return {
        resultado: {
          hoy,
          seguimientos: (data ?? []).map((x) => ({
            fecha: x.fecha, motivo: x.motivo, hecho: x.hecho, atrasado: !x.hecho && x.fecha < hoy, cliente_id: x.cliente_id,
            cliente: x.clientes ? nombre(x.clientes as unknown as { nombre: string | null; institucion: string | null }) : null,
          })),
        },
      };
    }

    case "metricas": {
      const mes = hoy.slice(0, 8) + "01";
      const [c, e, s, b] = await Promise.all([
        sb.from("clientes_resumen").select("etapa,etapa_id,temperatura,activo,fecha_cierre,created_at,proximo_seguimiento_fecha").limit(5000),
        sb.from("etapas").select("id,nombre,es_cierre,orden").order("orden"),
        sb.from("seguimientos").select("fecha").eq("hecho", false).lte("fecha", hoy),
        sb.from("reuniones").select("id", { count: "exact", head: true }).is("cliente_id", null),
      ]);
      const clientes = c.data ?? [];
      const cierre = new Set((e.data ?? []).filter((x) => x.es_cierre).map((x) => x.id));
      const activos = clientes.filter((x) => x.activo);
      const abiertos = activos.filter((x) => !cierre.has(x.etapa_id));
      const contar = <T,>(lista: T[], f: (x: T) => string) => lista.reduce<Record<string, number>>((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
      return {
        resultado: {
          hoy,
          en_cartera: abiertos.length,
          inactivos: clientes.length - activos.length,
          por_etapa: (e.data ?? []).map((x) => ({ etapa: x.nombre, clientes: activos.filter((y) => y.etapa_id === x.id).length })),
          temperatura_en_curso: contar(abiertos, (x) => x.temperatura ?? "Sin temperatura"),
          nuevos_este_mes: clientes.filter((x) => x.created_at >= mes).length,
          cerrados_este_mes: clientes.filter((x) => x.fecha_cierre && x.fecha_cierre >= mes).length,
          sin_proximo_paso: abiertos.filter((x) => !x.proximo_seguimiento_fecha).length,
          seguimientos_para_hoy: (s.data ?? []).length,
          seguimientos_atrasados: (s.data ?? []).filter((x) => x.fecha < hoy).length,
          reuniones_por_asignar: b.count ?? 0,
        },
      };
    }

    case "buscar_en_reuniones": {
      const limite = entero(args.limite, 15, 30);
      let q = sb.from("reuniones")
        .select("fecha,titulo,cliente_id,clientes(nombre,institucion),analisis!inner(resumen,objeciones,acuerdos,recomendaciones,temperatura_sugerida)")
        .not("cliente_id", "is", null).order("fecha", { ascending: false }).limit(200);
      const desde = fecha(args.desde);
      if (desde) q = q.gte("fecha", desde);
      const { data } = await q;
      const busqueda = normal(texto(args.texto));
      const lista = (data ?? []).filter((x) => {
        if (!busqueda) return true;
        const a = (x.analisis as unknown as { resumen: string; objeciones: string[]; acuerdos: string | null; recomendaciones: string | null }[])[0];
        return normal([x.titulo, a?.resumen, a?.objeciones?.join(" "), a?.acuerdos, a?.recomendaciones].join(" ")).includes(busqueda);
      });
      return {
        resultado: {
          total: lista.length,
          reuniones: lista.slice(0, limite).map((x) => ({
            fecha: x.fecha.slice(0, 10), titulo: x.titulo, cliente_id: x.cliente_id,
            cliente: x.clientes ? nombre(x.clientes as unknown as { nombre: string | null; institucion: string | null }) : null,
            analisis: (x.analisis as unknown[])[0],
          })),
        },
      };
    }

    case "proponer_seguimiento":
    case "proponer_cambio": {
      const id = texto(args.cliente_id);
      if (!UUID.test(id)) return { resultado: { error: "Id de cliente no válido." } };
      const { data: c } = await sb.from("clientes").select("id,nombre,institucion").eq("id", id).maybeSingle();
      if (!c) return { resultado: { error: "No encontré ese cliente." } };
      if (nombreHerramienta === "proponer_seguimiento") {
        const f = fecha(args.fecha);
        const motivo = texto(args.motivo).slice(0, 300);
        if (!f || f < hoy) return { resultado: { error: `La fecha debe ser AAAA-MM-DD y no anterior a hoy (${hoy}).` } };
        if (!motivo) return { resultado: { error: "Falta el motivo." } };
        return { resultado: { ok: "Propuesta mostrada al usuario; se crea solo si la confirma." }, propuesta: { tipo: "seguimiento", cliente_id: id, cliente: nombre(c), fecha: f, motivo } };
      }
      const temp = ["Caliente", "Tibio", "Frio"].includes(texto(args.temperatura)) ? texto(args.temperatura) : undefined;
      let etapa: { id: string; nombre: string } | undefined;
      if (texto(args.etapa)) {
        const { data: etapas } = await sb.from("etapas").select("id,nombre").eq("activa", true);
        etapa = (etapas ?? []).find((x) => normal(x.nombre) === normal(texto(args.etapa)));
        if (!etapa) return { resultado: { error: `Etapa no válida. Opciones: ${(etapas ?? []).map((x) => x.nombre).join(", ")}` } };
      }
      if (!temp && !etapa) return { resultado: { error: "Indica temperatura o etapa." } };
      return {
        resultado: { ok: "Propuesta mostrada al usuario; se aplica solo si la confirma." },
        propuesta: { tipo: "cambio", cliente_id: id, cliente: nombre(c), temperatura: temp, etapa_id: etapa?.id, etapa: etapa?.nombre },
      };
    }

    default:
      return { resultado: { error: "Herramienta desconocida." } };
  }
}
