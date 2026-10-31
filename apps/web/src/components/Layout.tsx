import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, LogOut, Menu, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { marca } from "../lib/marca";
import { useSesion } from "../lib/sesion";

// Solo las secciones que ya funcionan. Las demás se agregan cuando existan.
const SECCIONES = [
  { a: "/", texto: "Inicio", icono: Home },
  { a: "/clientes", texto: "Clientes", icono: Users },
];

export function Layout() {
  const { usuario } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const { pathname } = useLocation();
  const [ultimaRuta, setUltimaRuta] = useState(pathname);
  if (pathname !== ultimaRuta) { setUltimaRuta(pathname); setAbierto(false); }

  return (
    <div className="app">
      <aside className={`lateral ${abierto ? "abierto" : ""}`}>
        <div className="lateral-cabecera">
          <div className="lateral-logo"><img src={marca.logos.logoHorizontal} alt={marca.nombre} /></div>
          <button className="icono-boton menu-movil" onClick={() => setAbierto((v) => !v)} aria-label="Menú"><Menu size={20} /></button>
        </div>
        <nav className="lateral-menu">
          {SECCIONES.map(({ a, texto, icono: Icono }) => (
            <NavLink key={a} to={a} end={a === "/"} className="lateral-enlace">
              <Icono size={18} />{texto}
            </NavLink>
          ))}
        </nav>
        <div className="lateral-pie">
          <div className="lateral-usuario">
            <strong>{usuario.nombre}</strong>
            <span>{usuario.email}</span>
          </div>
          <button className="lateral-enlace" onClick={() => supabase.auth.signOut()}><LogOut size={18} />Cerrar sesión</button>
        </div>
      </aside>
      <main className="contenido"><Outlet /></main>
    </div>
  );
}
