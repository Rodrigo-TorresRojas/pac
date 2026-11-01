import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useSesion } from "../lib/sesion";
import { Modal } from "./Modal";

/** Cada persona cambia su nombre y su contraseña. */
export function MiCuenta({ onCerrar }: { onCerrar: () => void }) {
  const { usuario, recargarUsuario } = useSesion();
  const [nombre, setNombre] = useState(usuario.nombre);
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [aviso, setAviso] = useState<{ error: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setAviso({ error: true, texto: "Escribe tu nombre." });
    if (clave && clave.length < 8) return setAviso({ error: true, texto: "La contraseña debe tener al menos 8 caracteres." });
    if (clave !== clave2) return setAviso({ error: true, texto: "Las contraseñas no coinciden." });
    setGuardando(true);
    if (nombre.trim() !== usuario.nombre) {
      const { error } = await supabase.from("usuarios").update({ nombre: nombre.trim() }).eq("id", usuario.id);
      if (error) { setGuardando(false); return setAviso({ error: true, texto: "No se pudo guardar tu nombre." }); }
    }
    if (clave) {
      const { error } = await supabase.auth.updateUser({ password: clave });
      if (error) { setGuardando(false); return setAviso({ error: true, texto: "No se pudo cambiar la contraseña. Prueba con otra más segura." }); }
    }
    setGuardando(false);
    setClave(""); setClave2("");
    setAviso({ error: false, texto: "Listo, cambios guardados." });
    recargarUsuario();
  }

  return (
    <Modal titulo="Mi cuenta" onCerrar={onCerrar}>
      <form className="modal-form" onSubmit={guardar} noValidate>
        <div className="modal-cuerpo formulario">
          <label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} /></label>
          <label>Correo<input value={usuario.email} disabled /></label>
          <p className="suave ayuda">El correo lo cambia un administrador desde Equipo.</p>
          <div className="rejilla-2">
            <label>Nueva contraseña<input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Dejar vacío para no cambiar" /></label>
            <label>Repetir contraseña<input type="password" autoComplete="new-password" value={clave2} onChange={(e) => setClave2(e.target.value)} /></label>
          </div>
          {aviso && <p className={aviso.error ? "error" : "hecho-ok"} role="status">{aviso.texto}</p>}
        </div>
        <footer className="modal-pie">
          <button type="button" className="boton-secundario" onClick={onCerrar}>Cerrar</button>
          <button className="boton" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
        </footer>
      </form>
    </Modal>
  );
}
