import { GoogleGenAI } from "@google/genai";
import { ErrorHttp } from "../supabase.js";

// Modelo principal y de respaldo. Se pueden cambiar con GEMINI_MODEL en el .env sin tocar código.
const PRINCIPAL = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
const RESPALDO = process.env.GEMINI_MODEL_RESPALDO?.trim() || "gemini-3.6-flash";

let cliente: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  const clave = process.env.GEMINI_API_KEY?.trim();
  if (!clave) throw new ErrorHttp(503, "Falta la clave de Gemini (GEMINI_API_KEY) en el servidor.");
  // GEMINI_BASE_URL solo se usa en pruebas locales (un servidor falso que imita a Gemini).
  const base = process.env.GEMINI_BASE_URL?.trim();
  return (cliente ??= new GoogleGenAI({ apiKey: clave, ...(base ? { httpOptions: { baseUrl: base } } : {}) }));
}

export const MODELOS = [...new Set([PRINCIPAL, RESPALDO])];

// El Asistente conversa y consulta datos (usa herramientas): conviene un modelo más capaz que Flash-Lite.
export const MODELOS_ASISTENTE = [...new Set([
  process.env.GEMINI_MODEL_ASISTENTE?.trim() || "gemini-3.8-flash",
  process.env.GEMINI_MODEL_ASISTENTE_RESPALDO?.trim() || "gemini-3.6-flash",
  PRINCIPAL, // último recurso: el modelo del copiloto (suele ser Flash-Lite, con cupo aparte)
])];

/** Estado HTTP del error de Gemini, si lo trae. */
export function estadoDeError(error: unknown): number | undefined {
  const e = error as { status?: number; code?: number };
  return e?.status ?? e?.code;
}

/** Errores en los que conviene probar el modelo de respaldo. */
export function reintentable(error: unknown): boolean {
  const s = estadoDeError(error);
  return s === 429 || s === 500 || s === 503 || s === 504 || s === 404;
}

/** Mensaje entendible para Víctor. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorHttp) return error.message;
  const s = estadoDeError(error);
  if (s === 400 || s === 401 || s === 403) return "La clave de Gemini no es válida o no tiene permisos.";
  if (s === 402) return "Se acabó el saldo prepagado de Gemini. Recarga en Google AI Studio.";
  if (s === 429) return "Se alcanzó el límite de uso de Gemini (en el plan gratuito es bajo; con facturación activa es mucho mayor). Inténtalo en un minuto.";
  if (s && s >= 500) return "La IA no está disponible en este momento. Inténtalo en unos minutos.";
  return "No se pudo analizar la reunión. Inténtalo de nuevo.";
}
