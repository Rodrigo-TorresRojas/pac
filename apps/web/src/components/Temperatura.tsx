import type { Temperatura as T } from "../lib/tipos";
import { textoTemperatura } from "../lib/formato";

export function Temperatura({ valor }: { valor: T | null }) {
  if (!valor) return <span className="suave">—</span>;
  return <span className={`temp temp-${valor.toLowerCase()}`}>{textoTemperatura(valor)}</span>;
}
