import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, LogOut, Menu, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { marca } from "../lib/marca";
import { useSesion } from "../lib/sesion";
import { contarPorAsignar, EVENTO_BANDEJA, sincronizarGranola } from "../lib/bandeja";

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

  // Reuniones de Granola por asignar: se buscan al entrar y cada 5 minutos mientras la app está abierta.
  const [porAsignar, setPorAsignar] = useState(0);
  useEffect(() => {
    let conGranola = true;
    const contar = () => void contarPorAsignar().then(setPorAsignar);
    const sincronizar = () => {
      if (!conGranola || document.hidden) return;
      sincronizarGranola().then((r) => { conGranola = r.configurado; }).catch(() => undefined).finally(contar);
    };
    contar();
    sincronizar();
    const reloj = window.setInterval(sincronizar, 5 * 60_000);
    window.addEventListener(EVENTO_BANDEJA, contar);
    document.addEventListener("visibilitychange", sincronizar);
    return () => {
      window.clearInterval(reloj);
      window.removeEventListener(EVENTO_BANDEJA, contar);
      document.removeEventListener("visibilitychange", sincronizar);
    };
  }, []);

  return (
    <div className="app">
      <aside className={`lateral ${abierto ? "abierto" : ""}`}>
        <div className="lateral-cabecera">
          <div className="lateral-logo"><img src={marca.logos.logoHorizontal} alt={marca.nombre} /></div>
          <button className="icono-boton menu-movil" onClick={() => setAbierto((v) => !v)} aria-label="Menú"><Menu size={20} />{porAsignar > 0 && <span className="punto-alerta" />}</button>
        </div>
        <nav className="lateral-menu">
          {SECCIONES.map(({ a, texto, icono: Icono }) => (
            <NavLink key={a} to={a} end={a === "/"} className="lateral-enlace">
              <Icono size={18} />{texto}
              {a === "/clientes" && porAsignar > 0 && <span className="contador" title={`${porAsignar} reuniones por asignar`}>{porAsignar}</span>}
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
