import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ingresar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError("Correo o contraseña incorrectos.");
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
