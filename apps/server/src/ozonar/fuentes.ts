import { ErrorHttp } from "../supabase.js";

/**
 * Fuentes externas de Ozonar:
 * - Google Places (New): descubre lugares que existen hoy, con su estado, teléfono y web.
 * - Tavily: lee la web de cada prospecto del lote para saber qué servicios ofrece.
 * Las URLs base se pueden cambiar solo para pruebas locales.
 */
const PLACES = (process.env.PLACES_BASE_URL?.trim() || "https://places.googleapis.com").replace(/\/$/, "");
const TAVILY = (process.env.TAVILY_BASE_URL?.trim() || "https://api.tavily.com").replace(/\/$/, "");

export const placesConfigurado = () => Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
export const tavilyConfigurado = () => Boolean(process.env.TAVILY_API_KEY?.trim());

export interface Lugar {
  id: string;
  displayName?: { text: string };
  primaryTypeDisplayName?: { text: string };
  types?: string[];
  businessStatus?: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  googleMapsUri?: string;
}

async function placesFetch(ruta: string, init: RequestInit, campos: string): Promise<unknown> {
  const clave = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!clave) throw new ErrorHttp(503, "Falta la clave de Google Maps (GOOGLE_PLACES_API_KEY) en el servidor.");
  let r: Response;
  try {
    r = await fetch(`${PLACES}${ruta}`, { ...init, headers: { "Content-Type": "application/json", "X-Goog-Api-Key": clave, "X-Goog-FieldMask": campos } });
  } catch {
    throw new ErrorHttp(502, "No se pudo conectar con Google Maps.");
  }
  if (r.status === 429) throw new ErrorHttp(429, "Se alcanzó la cuota diaria de Google Maps. Inténtalo mañana.");
  if (r.status === 403 || r.status === 401) throw new ErrorHttp(502, "La clave de Google Maps no es válida o la Places API (New) no está activada.");
  if (r.status === 404) return null;
  if (!r.ok) throw new ErrorHttp(502, "Google Maps respondió con un error.");
  return r.json();
}

/** Búsqueda de texto en Google Maps (Perú, en español). */
export async function buscarLugares(texto: string): Promise<Lugar[]> {
  const campos = "places.id,places.displayName,places.primaryTypeDisplayName,places.types,places.businessStatus,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri";
  const json = await placesFetch("/v1/places:searchText", {
    method: "POST",
    body: JSON.stringify({ textQuery: texto, languageCode: "es", regionCode: "PE", pageSize: 20 }),
  }, campos) as { places?: Lugar[] } | null;
  return json?.places ?? [];
}

/** Datos actuales de un lugar. «basico» para el diagrama; «contacto» para la tarjeta. */
export async function detallesLugar(placeId: string, nivel: "basico" | "contacto"): Promise<Lugar | null> {
  const campos = nivel === "basico"
    ? "id,displayName,formattedAddress,businessStatus,primaryTypeDisplayName"
    : "id,displayName,formattedAddress,businessStatus,primaryTypeDisplayName,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri,rating,userRatingCount";
  return await placesFetch(`/v1/places/${encodeURIComponent(placeId)}?languageCode=es&regionCode=PE`, { method: "GET" }, campos) as Lugar | null;
}

export interface Pagina { titulo: string; url: string; contenido: string }

async function tavilyFetch<T>(ruta: string, cuerpo: unknown): Promise<T | null> {
  const clave = process.env.TAVILY_API_KEY?.trim();
  if (!clave) return null;
  try {
    const r = await fetch(`${TAVILY}${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) return null; // Tavily es un extra: si falla, el lote sale igual con menos información
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** Búsqueda web sobre un prospecto. */
export async function buscarWeb(consulta: string): Promise<Pagina[]> {
  const json = await tavilyFetch<{ results?: { title: string; url: string; content: string }[] }>("/search", {
    query: consulta, search_depth: "basic", max_results: 3, include_answer: false, country: "peru",
  });
  return (json?.results ?? []).map((x) => ({ titulo: x.title, url: x.url, contenido: (x.content ?? "").slice(0, 1500) }));
}

/** Lee el contenido de varias webs (hasta 5 por crédito). */
export async function leerWebs(urls: string[]): Promise<Pagina[]> {
  if (!urls.length) return [];
  const json = await tavilyFetch<{ results?: { url: string; raw_content: string }[] }>("/extract", { urls: urls.slice(0, 20) });
  return (json?.results ?? []).map((x) => ({ titulo: "Web oficial", url: x.url, contenido: (x.raw_content ?? "").slice(0, 3000) }));
}
