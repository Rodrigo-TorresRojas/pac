import { createClient } from "@supabase/supabase-js";

/**
 * Deja solo https://xxxx.supabase.co, aunque en el .env se haya pegado
 * con una barra final o con /rest/v1/ (el cliente de Supabase agrega esas rutas solo).
 */
function soloOrigen(valor: string | undefined): string | undefined {
  const limpio = valor?.trim();
  if (!limpio) return undefined;
  try {
    return new URL(limpio).origin;
  } catch {
    return limpio;
  }
}

const url = soloOrigen(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** Falta configurar Supabase en el .env de la raíz. */
export const supabaseConfigurado = Boolean(url && anonKey);

export const supabase = createClient(url ?? "http://localhost", anonKey ?? "sin-clave");
