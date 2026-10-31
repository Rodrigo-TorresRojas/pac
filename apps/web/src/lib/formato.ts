import type { Cliente, Temperatura } from "./tipos";

const ZONA = "America/Lima";

/** Cómo se muestra un cliente: la persona, la institución o ambas. */
export function nombreVisible(c: Pick<Cliente, "nombre" | "institucion">): string {
  return c.nombre?.trim() || c.institucion?.trim() || "Sin nombre";
}

/** Subtítulo: la institución, solo si el título ya es la persona. */
export function subtitulo(c: Pick<Cliente, "nombre" | "institucion" | "especialidad">): string {
  const partes = [c.nombre?.trim() ? c.institucion : null, c.especialidad].filter(Boolean);
  return partes.join(" · ");
}

/** Fecha de hoy en Lima, como YYYY-MM-DD (igual que las columnas date). */
export function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}

export function inicioDeMes(): string {
  return hoy().slice(0, 8) + "01";
}

/** "31 oct." para columnas date (YYYY-MM-DD) o timestamps. */
export function fechaCorta(valor: string | null | undefined): string {
  if (!valor) return "—";
  const d = valor.length === 10 ? new Date(valor + "T12:00:00") : new Date(valor);
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", timeZone: valor.length === 10 ? "UTC" : ZONA }).format(d);
}

/** Días desde hoy hasta una fecha YYYY-MM-DD (negativo = vencida). */
export function diasHasta(fecha: string): number {
  const a = Date.parse(hoy() + "T00:00:00Z");
  const b = Date.parse(fecha + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

export function cuando(fecha: string): string {
  const d = diasHasta(fecha);
  if (d === 0) return "Hoy";
  if (d === 1) return "Mañana";
  if (d === -1) return "Ayer";
  if (d < 0) return `Hace ${-d} días`;
  return fechaCorta(fecha);
}

export function saludo(): string {
  const h = Number(new Intl.DateTimeFormat("es-PE", { hour: "numeric", hour12: false, timeZone: ZONA }).format(new Date()));
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export const TEMPERATURAS: Temperatura[] = ["Caliente", "Tibio", "Frio"];
export function textoTemperatura(t: Temperatura): string {
  return t === "Frio" ? "Frío" : t;
}

/** Enlace de WhatsApp para un teléfono peruano. */
export function enlaceWhatsapp(telefono: string | null): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (d.length < 9) return null;
  return `https://wa.me/${d.length === 9 ? "51" + d : d}`;
}
