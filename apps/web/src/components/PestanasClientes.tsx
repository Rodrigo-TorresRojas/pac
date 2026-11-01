import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { AudioLines, Users } from "lucide-react";
import { contarPorAsignar, EVENTO_BANDEJA } from "../lib/bandeja";

/** Pestañas "Clientes" y "Reuniones por asignar" con el contador de la bandeja. */
export function PestanasClientes() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const actualizar = () => void contarPorAsignar().then(setN);
    actualizar();
    window.addEventListener(EVENTO_BANDEJA, actualizar);
    return () => window.removeEventListener(EVENTO_BANDEJA, actualizar);
  }, []);
  return (
    <nav className="pestanas" aria-label="Secciones de clientes">
      <NavLink to="/clientes" end className="pestana"><Users size={16} />Clientes</NavLink>
      <NavLink to="/clientes/bandeja" className={({ isActive }) => `pestana ${n > 0 ? "pestana-alerta" : ""} ${isActive ? "active" : ""}`}>
        <AudioLines size={16} />Reuniones por asignar{n > 0 && <span className="contador">{n}</span>}
      </NavLink>
    </nav>
  );
}
