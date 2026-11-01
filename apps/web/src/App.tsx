import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigurado } from "./lib/supabase";
import { SesionContexto, type Usuario } from "./lib/sesion";
import { Login } from "./pages/Login";
import { Inicio } from "./pages/Inicio";
import { Clientes } from "./pages/Clientes";
import { ClienteFicha } from "./pages/ClienteFicha";
import { Bandeja } from "./pages/Bandeja";
import { Ozonar } from "./pages/Ozonar";
import { Layout } from "./components/Layout";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sinAcceso, setSinAcceso] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setCargando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => setSession(nueva));
    return () => data.subscription.unsubscribe();
  }, []);

  // Perfil del usuario (nombre y rol) desde public.usuarios.
  const idUsuario = session?.user.id;
  useEffect(() => {
    if (!idUsuario || !session) { setUsuario(null); return; }
    supabase.from("usuarios").select("id,nombre,rol,activo").eq("id", idUsuario).maybeSingle().then(({ data }) => {
      if (!data || !data.activo) setSinAcceso(true);
      else {
        setSinAcceso(false);
        setUsuario({ id: data.id, nombre: data.nombre, rol: data.rol, email: session.user.email ?? "" });
      }
      setCargando(false);
    });
  }, [idUsuario]);

  if (!supabaseConfigurado) {
    return (
      <main className="centrado">
        <div className="tarjeta">
          <h1>Falta configurar Supabase</h1>
          <p>Copia <code>.env.example</code> como <code>.env</code> en la raíz del proyecto, completa la URL y la clave anon de Supabase y reinicia <code>npm run dev</code>.</p>
        </div>
      </main>
    );
  }

  if (cargando) return <main className="centrado"><p className="suave">Cargando…</p></main>;
  if (!session) return <Login />;
  if (!usuario && !sinAcceso) return <main className="centrado"><p className="suave">Cargando…</p></main>;
  if (sinAcceso || !usuario) {
    return (
      <main className="centrado">
        <div className="tarjeta">
          <h1>Sin acceso</h1>
          <p className="suave">Tu usuario está desactivado o aún no tiene perfil. Pide al administrador que lo active.</p>
          <button className="boton-secundario" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </div>
      </main>
    );
  }

  return (
    <SesionContexto.Provider value={{ session, usuario }}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Inicio />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/bandeja" element={<Bandeja />} />
            <Route path="clientes/:id" element={<ClienteFicha />} />
            <Route path="ozonar" element={<Ozonar />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SesionContexto.Provider>
  );
}
