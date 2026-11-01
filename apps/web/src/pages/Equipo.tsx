import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { useSesion } from "../lib/sesion";
import { Modal } from "../components/Modal";
import { fechaCorta } from "../lib/formato";

interface Miembro { id: string; nombre: string; email: string | null; rol: "admin" | "vendedor"; activo: boolean; created_at: string }

export function Equipo() {
  const { usuario } = useSesion();
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [editando, setEditando] = useState<Miembro | "nuevo" | null>(null);
  const [clave, setClave] = useState<{ nombre: string; email: string | null; password: string } | null>(null);
  const [confirmar, setConfirmar] = useState<{ tipo: "eliminar" | "clave"; m: Miembro } | null>(null);
  const [aviso, setAviso] = useState<{ error: boolean; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("usuarios").select("id,nombre,email,rol,activo,created_at").order("activo", { ascending: false }).order("nombre");
    setMiembros((data ?? []) as Miembro[]);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function ejecutar(accion: () => Promise<unknown>, exito: string) {
    try { await accion(); setAviso({ error: false, texto: exito }); }
    catch (e) { setAviso({ error: true, texto: (e as Error).message }); }
    void cargar();
  }

  async function restablecer(m: Miembro) {
    setConfirmar(null);
    try {
      const r = await api<{ password_temporal: string }>(`/equipo/usuarios/${m.id}/clave`);
      setClave({ nombre: m.nombre, email: m.email, password: r.password_temporal });
    } catch (e) { setAviso({ error: true, texto: (e as Error).message }); }
  }

  return (
    <>
      <header className="pagina-cabecera">
        <div>
          <p className="suave">Solo administradores</p>
          <h1>Equipo</h1>
        </div>
        <button className="boton boton-acento" onClick={() => setEditando("nuevo")}><Plus size={18} />Agregar usuario</button>
      </header>

      <div className="panel permisos">
        <p><ShieldCheck size={16} /><strong>Administrador:</strong> todo lo de un vendedor, más gestionar el equipo (agregar, editar, desactivar y eliminar usuarios).</p>
        <p><UserRound size={16} /><strong>Vendedor:</strong> ve y trabaja toda la cartera: clientes, reuniones, seguimientos, Ozonar y el Asistente.</p>
        <p className="suave">Un usuario <strong>desactivado</strong> no puede entrar ni ver datos, pero su historial se conserva. <strong>Eliminar</strong> borra su cuenta; los clientes y reuniones no se pierden.</p>
      </div>

      {aviso && <p className={`aviso-linea ${aviso.error ? "aviso-error" : ""}`} role="status">{aviso.texto}</p>}
      {!miembros && <p className="suave">Cargando…</p>}

      {miembros && (
        <div className="tabla-envoltura">
          <table>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Desde</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {miembros.map((m) => (
                <tr key={m.id} className={m.activo ? "" : "fila-inactiva"}>
                  <td><strong>{m.nombre}</strong>{m.id === usuario.id && <span className="suave"> (tú)</span>}</td>
                  <td>{m.email ?? "—"}</td>
                  <td><span className={`etiqueta ${m.rol === "admin" ? "" : "etiqueta-gris"}`}>{m.rol === "admin" ? "Administrador" : "Vendedor"}</span></td>
                  <td>{m.activo ? <span className="hecho-ok"><Check size={14} />Activo</span> : <span className="suave">Desactivado</span>}</td>
                  <td>{fechaCorta(m.created_at)}</td>
                  <td>
                    <div className="acciones-tabla">
                      <button className="icono-boton" onClick={() => setEditando(m)} title="Editar" aria-label={`Editar a ${m.nombre}`}><Pencil size={16} /></button>
                      <button className="icono-boton" onClick={() => setConfirmar({ tipo: "clave", m })} title="Nueva contraseña temporal" aria-label="Nueva contraseña"><KeyRound size={16} /></button>
                      {m.id !== usuario.id && <button className="icono-boton" onClick={() => setConfirmar({ tipo: "eliminar", m })} title="Eliminar" aria-label={`Eliminar a ${m.nombre}`}><Trash2 size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormularioMiembro miembro={editando === "nuevo" ? null : editando} esYo={editando !== "nuevo" && editando.id === usuario.id}
          onCerrar={() => setEditando(null)}
          onCreado={(r) => { setEditando(null); setClave(r); void cargar(); }}
          onGuardado={(texto) => { setEditando(null); setAviso({ error: false, texto }); void cargar(); }} />
      )}

      {confirmar && (
        <Modal titulo={confirmar.tipo === "eliminar" ? "Eliminar usuario" : "Nueva contraseña"} onCerrar={() => setConfirmar(null)}>
          <div className="modal-cuerpo">
            {confirmar.tipo === "eliminar"
              ? <p>¿Eliminar la cuenta de <strong>{confirmar.m.nombre}</strong>? Ya no podrá entrar. Los clientes y reuniones se conservan. Si solo quieres quitarle el acceso por un tiempo, mejor <strong>desactívalo</strong> desde Editar.</p>
              : <p>Se creará una contraseña temporal para <strong>{confirmar.m.nombre}</strong> y la actual dejará de funcionar.</p>}
          </div>
          <footer className="modal-pie">
            <button className="boton-secundario" onClick={() => setConfirmar(null)}>Cancelar</button>
            {confirmar.tipo === "eliminar"
              ? <button className="boton-peligro" onClick={() => { const m = confirmar.m; setConfirmar(null); void ejecutar(() => api(`/equipo/usuarios/${m.id}`, { metodo: "DELETE" }), `${m.nombre} fue eliminado.`); }}>Eliminar</button>
              : <button className="boton" onClick={() => void restablecer(confirmar.m)}>Crear contraseña</button>}
          </footer>
        </Modal>
      )}

      {clave && <ClaveTemporal {...clave} onCerrar={() => setClave(null)} />}
    </>
  );
}

function FormularioMiembro({ miembro, esYo, onCerrar, onCreado, onGuardado }: {
  miembro: Miembro | null;
  esYo: boolean;
  onCerrar: () => void;
  onCreado: (r: { nombre: string; email: string; password: string }) => void;
  onGuardado: (texto: string) => void;
}) {
  const [nombre, setNombre] = useState(miembro?.nombre ?? "");
  const [email, setEmail] = useState(miembro?.email ?? "");
  const [rol, setRol] = useState<Miembro["rol"]>(miembro?.rol ?? "vendedor");
  const [activo, setActivo] = useState(miembro?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setError("Escribe el nombre.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Escribe un correo válido.");
    setGuardando(true); setError(null);
    try {
      if (!miembro) {
        const r = await api<{ password_temporal: string }>("/equipo/usuarios", { cuerpo: { nombre: nombre.trim(), email: email.trim(), rol } });
        onCreado({ nombre: nombre.trim(), email: email.trim(), password: r.password_temporal });
      } else {
        const cambios: Record<string, unknown> = {};
        if (nombre.trim() !== miembro.nombre) cambios.nombre = nombre.trim();
        if (email.trim().toLowerCase() !== (miembro.email ?? "")) cambios.email = email.trim();
        if (rol !== miembro.rol) cambios.rol = rol;
        if (activo !== miembro.activo) cambios.activo = activo;
        if (Object.keys(cambios).length) await api(`/equipo/usuarios/${miembro.id}`, { metodo: "PATCH", cuerpo: cambios });
        onGuardado("Cambios guardados.");
      }
    } catch (err) { setError((err as Error).message); }
    setGuardando(false);
  }

  return (
    <Modal titulo={miembro ? "Editar usuario" : "Agregar usuario"} onCerrar={onCerrar}>
      <form className="modal-form" onSubmit={guardar} noValidate>
        <div className="modal-cuerpo formulario">
          <label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Víctor Ramos" maxLength={120} /></label>
          <label>Correo (con este entra a PAC)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="victor@tecnocare.pe" /></label>
          <fieldset className="opciones">
            <legend>Rol</legend>
            {(["vendedor", "admin"] as const).map((r) => (
              <button type="button" key={r} disabled={esYo} className={`opcion opcion-rol ${rol === r ? "elegida" : ""}`} onClick={() => setRol(r)}>{r === "admin" ? "Administrador" : "Vendedor"}</button>
            ))}
          </fieldset>
          {miembro && (
            <label className="interruptor"><input type="checkbox" checked={activo} disabled={esYo} onChange={(e) => setActivo(e.target.checked)} />Usuario activo (puede entrar a PAC)</label>
          )}
          {esYo && <p className="suave ayuda">No puedes cambiar tu propio rol ni desactivarte.</p>}
          {!miembro && <p className="suave ayuda">Se creará una contraseña temporal para que se la compartas. Al entrar, puede cambiarla en «Mi cuenta».</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <footer className="modal-pie">
          <button type="button" className="boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="boton" disabled={guardando}>{guardando ? "Guardando…" : miembro ? "Guardar" : "Crear usuario"}</button>
        </footer>
      </form>
    </Modal>
  );
}

function ClaveTemporal({ nombre, email, password, onCerrar }: { nombre: string; email: string | null; password: string; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Hola ${nombre}, ya tienes acceso a PAC.\nEntra con: ${email ?? ""}\nContraseña temporal: ${password}\nCámbiala en «Mi cuenta» al entrar.`;
  return (
    <Modal titulo="Contraseña temporal" onCerrar={onCerrar}>
      <div className="modal-cuerpo formulario">
        <p>Compártela con <strong>{nombre}</strong> por un medio privado. <strong>No se volverá a mostrar.</strong></p>
        <div className="clave-temporal">{password}</div>
        <button className="boton-secundario" onClick={() => void navigator.clipboard.writeText(texto).then(() => setCopiado(true)).catch(() => undefined)}>
          {copiado ? <><Check size={16} />Mensaje copiado</> : <><Copy size={16} />Copiar mensaje con los datos</>}
        </button>
      </div>
      <footer className="modal-pie"><button className="boton" onClick={onCerrar}>Listo</button></footer>
    </Modal>
  );
}
