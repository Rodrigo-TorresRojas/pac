import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Falta configurar Supabase en el .env de la raíz. */
export const supabaseConfigurado = Boolean(url && anonKey);

export const supabase = createClient(url ?? "http://localhost", anonKey ?? "sin-clave");
