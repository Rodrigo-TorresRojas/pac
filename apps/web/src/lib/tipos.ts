/** Fila de la vista public.clientes_resumen (ver supabase/migrations). */
export interface ClienteResumen {
  id: string;
  nombre: string;
  institucion: string | null;
  especialidad: string | null;
  telefono: string | null;
  etapa: string;
  etapa_orden: number;
  temperatura: "Frio" | "Tibio" | "Caliente" | null;
  activo: boolean;
  ultima_reunion: string | null;
  proximo_seguimiento_fecha: string | null;
  proximo_seguimiento_motivo: string | null;
}
