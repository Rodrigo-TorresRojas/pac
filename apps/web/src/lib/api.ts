import { supabase } from "./supabase";

/** Llama al servidor de PAC (/api) con la sesión actual. Devuelve el JSON o lanza un Error con el mensaje. */
export async function api<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  let r: Response;
  try {
    r = await fetch(`/api${ruta}`, {
      method: opciones.metodo ?? "POST",
      headers: {
        "Content-Type": "application/json",
        ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor de PAC.");
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((json as { error?: string }).error ?? "El servidor respondió con un error.");
  return json as T;
}
