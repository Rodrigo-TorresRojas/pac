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
  reunion_id: string | null;
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

export interface Asistente {
  nombre?: string | null;
  email?: string | null;
}

export interface Analisis {
  id: string;
  reunion_id: string;
  resumen: string;
  objeciones: string[];
  acuerdos: string | null;
  recomendaciones: string | null;
  temperatura_sugerida: Temperatura | null;
  producto_sugerido_id: string | null;
  seguimiento_sugerido_fecha: string | null;
  seguimiento_sugerido_motivo: string | null;
  borrador_whatsapp: string | null;
  created_at: string;
}

export interface Reunion {
  id: string;
  cliente_id: string | null;
  fecha: string;
  titulo: string | null;
  duracion_min: number | null;
  asistentes: Asistente[];
  resumen_granola: string | null;
  transcripcion: string | null;
  granola_id: string | null;
  estado_analisis: "pendiente" | "listo" | "error";
  error_analisis: string | null;
  analisis: Analisis[];
}

export interface Producto {
  id: string;
  nombre: string;
}
