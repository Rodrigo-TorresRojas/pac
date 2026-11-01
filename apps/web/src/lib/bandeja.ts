import { supabase } from "./supabase";
import { api } from "./api";

/** Aviso entre pantallas: cambió la bandeja (llegaron, se asignaron o se eliminaron reuniones). */
export const EVENTO_BANDEJA = "pac:bandeja";
export const avisarBandeja = () => window.dispatchEvent(new Event(EVENTO_BANDEJA));

export async function contarPorAsignar(): Promise<number> {
  const { count } = await supabase.from("reuniones").select("id", { count: "exact", head: true }).is("cliente_id", null);
  return count ?? 0;
}

/** Pide al servidor que traiga las reuniones nuevas de Granola. */
export async function sincronizarGranola(): Promise<{ configurado: boolean; nuevas: number }> {
  const r = await api<{ configurado: boolean; nuevas: number }>("/granola/sincronizar");
  if (r.nuevas > 0) avisarBandeja();
  return r;
}
