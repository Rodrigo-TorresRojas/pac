import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigurado } from "./lib/supabase";
import { Login } from "./pages/Login";
import { Clientes } from "./pages/Clientes";
import { marca } from "./lib/marca";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => setSession(nueva));
    return () => data.subscription.unsubscribe();
  }, []);

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

  return (
    <div className="app">
      <header className="barra">
        <div className="marca">
          <img src={marca.logos.logoHorizontal} alt={marca.nombre} />
          {marca.nombre !== marca.producto && <span className="producto">{marca.producto}</span>}
        </div>
        <span className="suave">{session.user.email}</span>
        <button className="boton-secundario" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      </header>
      <Clientes />
    </div>
  );
}
