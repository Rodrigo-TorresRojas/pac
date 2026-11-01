export type Temperatura = "Frio" | "Tibio" | "Caliente";

/** Fila de public.clientes. */
export interface Cliente {
  id: string;
  nombre: string | null;
  institucion: string | null;
  especialidad: string | null;
  telefono: string | null;
  email: string | null;
  pais: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  ubigeo: string | null;
  etapa_id: string;
  temperatura: Temperatura | null;
  activo: boolean;
  fecha_cierre: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

/** Fila de la vista public.clientes_resumen: el cliente con su etapa y su próximo seguimiento. */
export interface ClienteResumen extends Cliente {
  etapa: string;
  etapa_orden: number;
  ultima_reunion: string | null;
  proximo_seguimiento_fecha: string | null;
  proximo_seguimiento_motivo: string | null;
}

export interface Etapa {
  id: string;
  nombre: string;
  orden: number;
  es_cierre: boolean;
}

export interface Seguimiento {
  id: string;
  cliente_id: string;
  fecha: string;
  motivo: string;
  hecho: boolean;
  completado_at: string | null;
}

export interface Duplicado {
  id: string;
  nombre: string | null;
  institucion: string | null;
  activo: boolean;
  coincide: string;
}
