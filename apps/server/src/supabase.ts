import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Limpia la URL igual que la web: solo https://xxxx.supabase.co */
function origen(valor: string | undefined): string | undefined {
  const v = valor?.trim();
  if (!v) return undefined;
  try { return new URL(v).origin; } catch { return v; }
}

const URL_SUPABASE = origen(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL);
const CLAVE_ANON = (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY)?.trim();

export class ErrorHttp extends Error {
  constructor(readonly status: number, mensaje: string) { super(mensaje); }
}

/**
 * Cliente de Supabase con la sesión de quien llama.
 * Así el servidor respeta los mismos permisos (RLS) que la web y no necesita la clave de servicio.
 */
export async function clienteDeUsuario(autorizacion: string | undefined): Promise<{ sb: SupabaseClient; usuarioId: string }> {
  if (!URL_SUPABASE || !CLAVE_ANON) throw new ErrorHttp(500, "Falta configurar Supabase en el servidor.");
  const token = autorizacion?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ErrorHttp(401, "Inicia sesión de nuevo.");
  const sb = createClient(URL_SUPABASE, CLAVE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new ErrorHttp(401, "Tu sesión venció. Inicia sesión de nuevo.");
  return { sb, usuarioId: data.user.id };
}
