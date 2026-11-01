import type { Asistente, ClienteResumen } from "./tipos";

export interface Sugerencia {
  cliente: ClienteResumen;
  motivo: string;
}

const normal = (t: string | null | undefined) =>
  (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9@. ]+/g, " ").replace(/\s+/g, " ").trim();

// Palabras que no identifican a nadie por sí solas.
const COMUNES = new Set(["dr", "dra", "doctor", "doctora", "lic", "clinica", "centro", "medico", "medica", "consultorio", "policlinico", "instituto", "hospital", "de", "del", "la", "el", "los", "las", "san", "santa", "sac", "eirl", "srl", "y"]);

/** Nombre sin títulos ni palabras comunes, por ejemplo "Dr. Luis Paredes" → "luis paredes". */
function nucleo(nombre: string | null): string {
  return normal(nombre).split(" ").filter((p) => p.length > 2 && !COMUNES.has(p)).join(" ");
}

/**
 * ¿De qué cliente parece ser la reunión? Busca, en orden:
 * 1. el correo de un asistente, 2. el celular dicho en la conversación, 3. el nombre o la clínica mencionados.
 */
export function sugerirCliente(
  reunion: { titulo: string | null; asistentes: Asistente[]; resumen_granola: string | null; transcripcion: string | null },
  clientes: ClienteResumen[],
): Sugerencia | null {
  const correos = new Set(reunion.asistentes.map((a) => normal(a.email)).filter(Boolean));
  const textoCrudo = [reunion.titulo, reunion.resumen_granola, reunion.transcripcion?.slice(0, 50_000)].join(" ");
  const texto = ` ${normal(textoCrudo)} `;
  const digitos = textoCrudo.replace(/[^\d]/g, " ");

  let mejor: { c: ClienteResumen; puntos: number; motivo: string } | null = null;
  const considerar = (c: ClienteResumen, puntos: number, motivo: string) => {
    if (!mejor || puntos > mejor.puntos) mejor = { c, puntos, motivo };
  };

  for (const c of clientes) {
    if (c.email && correos.has(normal(c.email))) { considerar(c, 100, "su correo está entre los asistentes"); continue; }
    const tel = (c.telefono ?? "").replace(/\D/g, "").slice(-9);
    if (tel.length === 9 && digitos.replace(/\s/g, "").includes(tel)) { considerar(c, 90, "se menciona su teléfono"); continue; }
    const persona = nucleo(c.nombre);
    if (persona.includes(" ") && texto.includes(` ${persona} `)) { considerar(c, 80, "se menciona su nombre"); continue; }
    const inst = nucleo(c.institucion);
    if (inst.length >= 5 && texto.includes(` ${inst} `)) { considerar(c, 70, "se menciona su clínica"); continue; }
    const apellido = persona.split(" ").pop();
    if (apellido && apellido.length >= 5 && persona.split(" ").length >= 2 && new RegExp(`\\b(dr|dra|doctor|doctora) ${apellido}\\b`).test(texto)) {
      considerar(c, 50, "se menciona su apellido");
    }
  }
  const m = mejor as { c: ClienteResumen; puntos: number; motivo: string } | null;
  return m ? { cliente: m.c, motivo: m.motivo } : null;
}
