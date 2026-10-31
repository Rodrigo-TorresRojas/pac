import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

/** Traduce los errores de Supabase Auth a algo que se pueda resolver. */
function mensajeDeError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "El correo aún no está confirmado. En Supabase, confirma el usuario o créalo con «Auto Confirm User».";
  if (m.includes("invalid api key") || m.includes("no api key")) return "La clave de Supabase del archivo .env no es válida. Revisa VITE_SUPABASE_ANON_KEY.";
  if (m.includes("failed to fetch") || m.includes("network")) return "No se pudo conectar con Supabase. Revisa VITE_SUPABASE_URL en el .env y tu conexión.";
  return `No se pudo ingresar: ${mensaje}`;
}

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ingresar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(mensajeDeError(error.message));
    setEnviando(false);
  }

  return (
    <main className="centrado">
      <form className="tarjeta formulario" onSubmit={ingresar}>
        <h1>PAC</h1>
        <p className="suave">Plataforma de Apoyo Comercial</p>
        <label>
          Correo
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="boton" type="submit" disabled={enviando}>{enviando ? "Ingresando…" : "Ingresar"}</button>
      </form>
    </main>
  );
}
