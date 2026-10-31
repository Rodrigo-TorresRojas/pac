import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: "admin" | "vendedor";
}

export const SesionContexto = createContext<{ session: Session; usuario: Usuario } | null>(null);

export function useSesion() {
  const s = useContext(SesionContexto);
  if (!s) throw new Error("useSesion fuera de una sesión");
  return s;
}
