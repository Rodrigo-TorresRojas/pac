import { ErrorHttp } from "./supabase.js";

/** Cliente mínimo de la API pública de Granola (solo lectura). https://docs.granola.ai */
const BASE = (process.env.GRANOLA_BASE_URL?.trim() || "https://public-api.granola.ai").replace(/\/$/, "");

export const granolaConfigurado = () => Boolean(process.env.GRANOLA_API_KEY?.trim());

interface Persona { name: string | null; email: string }
interface Segmento {
  speaker: { source: "microphone" | "speaker"; attribution?: "me" | "them"; diarization_label?: string; name?: string };
  text: string;
  start_time: string;
  end_time: string;
}
export interface NotaResumen { id: string; title: string | null; created_at: string; deleted_at: string | null }
export interface Nota extends NotaResumen {
  owner: Persona;
  calendar_event: { event_title: string | null; scheduled_start_time: string | null; scheduled_end_time: string | null } | null;
  attendees: Persona[];
  summary_text: string;
  summary_markdown: string | null;
  transcript: Segmento[] | null;
}

async function pedir<T>(ruta: string): Promise<{ status: number; json: T }> {
  const clave = process.env.GRANOLA_API_KEY?.trim();
  if (!clave) throw new ErrorHttp(503, "Falta la clave de Granola (GRANOLA_API_KEY) en el servidor.");
  for (let intento = 0; intento < 3; intento++) {
    let r: Response;
    try {
      r = await fetch(`${BASE}${ruta}`, { headers: { Authorization: `Bearer ${clave}`, Accept: "application/json" } });
    } catch {
      throw new ErrorHttp(502, "No se pudo conectar con Granola.");
    }
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 1500 * (intento + 1))); continue; }
    if (r.status === 401 || r.status === 403) throw new ErrorHttp(502, "La clave de Granola no es válida o no tiene permisos.");
    const json = (await r.json().catch(() => ({}))) as T;
    return { status: r.status, json };
  }
  throw new ErrorHttp(503, "Granola está limitando las consultas. Inténtalo en un minuto.");
}

/** Notas creadas desde una fecha (recorre todas las páginas). */
export async function listarNotas(desde: string): Promise<NotaResumen[]> {
  const notas: NotaResumen[] = [];
  let cursor: string | null = null;
  for (let pagina = 0; pagina < 20; pagina++) {
    const q = new URLSearchParams({ created_after: desde, page_size: "30" });
    if (cursor) q.set("cursor", cursor);
    const { status, json } = await pedir<{ notes: NotaResumen[]; hasMore: boolean; cursor: string | null }>(`/v1/notes?${q}`);
    if (status !== 200) throw new ErrorHttp(502, "Granola respondió con un error al listar las reuniones.");
    notas.push(...json.notes);
    if (!json.hasMore || !json.cursor) break;
    cursor = json.cursor;
  }
  return notas;
}

/** Una nota completa con su transcripción. Devuelve null si Granola aún no la terminó de procesar. */
export async function obtenerNota(id: string): Promise<Nota | null> {
  const { status, json } = await pedir<Nota & { code?: string }>(`/v1/notes/${encodeURIComponent(id)}?include=transcript`);
  if (status === 404) return null;
  if (status === 413) {
    const { status: s2, json: base } = await pedir<Nota>(`/v1/notes/${encodeURIComponent(id)}`);
    if (s2 !== 200) return null;
    const segmentos: Segmento[] = [];
    let cursor: string | null = null;
    for (let pagina = 0; pagina < 100; pagina++) {
      const q = new URLSearchParams({ page_size: "100" });
      if (cursor) q.set("cursor", cursor);
      const { status: s3, json: t } = await pedir<{ transcript: Segmento[]; hasMore: boolean; cursor: string | null }>(`/v1/notes/${encodeURIComponent(id)}/transcript?${q}`);
      if (s3 !== 200) break;
      segmentos.push(...t.transcript);
      if (!t.hasMore || !t.cursor) break;
      cursor = t.cursor;
    }
    return { ...base, transcript: segmentos };
  }
  if (status !== 200) throw new ErrorHttp(502, "Granola respondió con un error al leer una reunión.");
  return json;
}

/** Transcripción como texto: "Víctor: ...", "Participante: ..." (une frases seguidas de la misma persona). */
export function transcripcionComoTexto(nota: Nota): string {
  const duenio = nota.owner?.name?.trim() || "Vendedor";
  const lineas: string[] = [];
  let anterior = "";
  for (const s of nota.transcript ?? []) {
    const texto = s.text?.trim();
    if (!texto) continue;
    const quien = s.speaker.name?.trim()
      || (s.speaker.attribution === "me" || s.speaker.source === "microphone" ? duenio : s.speaker.diarization_label?.trim().replace(/^Speaker\b/i, "Participante") || "Participante");
    if (quien === anterior && lineas.length) lineas[lineas.length - 1] += " " + texto;
    else lineas.push(`${quien}: ${texto}`);
    anterior = quien;
  }
  return lineas.join("\n\n");
}

/** Duración en minutos según la transcripción o, si no hay, según el calendario. */
export function duracionMin(nota: Nota): number | null {
  const t = nota.transcript ?? [];
  const ini = t[0]?.start_time ?? nota.calendar_event?.scheduled_start_time;
  const fin = t[t.length - 1]?.end_time ?? nota.calendar_event?.scheduled_end_time;
  if (!ini || !fin) return null;
  const min = Math.round((Date.parse(fin) - Date.parse(ini)) / 60_000);
  return Number.isFinite(min) && min > 0 ? min : null;
}

/** Resumen de Granola en texto simple: sin #, ** ni enlaces de Markdown; viñetas como «•». */
export function resumenComoTexto(nota: Nota): string {
  const md = nota.summary_markdown?.trim();
  if (!md) return nota.summary_text?.trim() ?? "";
  return md
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\[(.+?)\]\((?:[^)]+)\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
