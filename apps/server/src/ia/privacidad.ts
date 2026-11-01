/**
 * Filtro de privacidad (Ley 29733): antes de enviar texto a la IA se ocultan
 * DNI, correos, celulares e historias clínicas. Los nombres del médico y la clínica se mantienen
 * porque son necesarios para el análisis comercial.
 */
export function filtrarPrivacidad(texto: string): string {
  return texto
    .replace(/\b(?:DNI|D\.N\.I\.?)\s*:?\s*\d{8}\b/gi, "[DNI]")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[correo]")
    .replace(/(?<!\d)(?:\+?51[\s-]?)?9\d{2}[\s-]?\d{3}[\s-]?\d{3}(?!\d)/g, "[celular]")
    .replace(/(?<!\d)\d{8}(?!\d)/g, "[número]")
    .replace(/\b(?:historia cl[ií]nica|HC)\s*(?:n[°ºo.]*)?\s*:?\s*\d+/gi, "[historia clínica]");
}
