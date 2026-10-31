import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Cliente, Duplicado, Temperatura } from "../lib/tipos";
import { nombreVisible, TEMPERATURAS, textoTemperatura } from "../lib/formato";
import { Modal } from "./Modal";

type Campos = Pick<Cliente, "nombre" | "institucion" | "especialidad" | "telefono" | "email" | "distrito" | "temperatura" | "notas">;

const VACIO: Campos = { nombre: "", institucion: "", especialidad: "", telefono: "", email: "", distrito: "", temperatura: null, notas: "" };

function limpiar(c: Campos): Campos {
  const t = (v: string | null) => (v ?? "").trim() || null;
  return {
    nombre: t(c.nombre), institucion: t(c.institucion), especialidad: t(c.especialidad),
    telefono: t(c.telefono), email: t(c.email)?.toLowerCase() ?? null, distrito: t(c.distrito),
    temperatura: c.temperatura, notas: t(c.notas),
  };
}

/** Crear (sin `cliente`) o editar un cliente en una ventana emergente. */
export function ClienteFormulario({ cliente, onCerrar, onGuardado }: {
  cliente?: Cliente;
  onCerrar: () => void;
  onGuardado: (id: string) => void;
}) {
  const [campos, setCampos] = useState<Campos>(cliente ? { ...VACIO, ...cliente } : VACIO);
  const [error, setError] = useState<string | null>(null);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const poner = (k: keyof Campos) => (e: { target: { value: string } }) => {
    setCampos((c) => ({ ...c, [k]: e.target.value }));
    if (k === "telefono" || k === "email") { setDuplicados([]); setConfirmado(false); }
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const datos = limpiar(campos);
    if (!datos.nombre && !datos.institucion) return setError("Escribe el nombre de la persona o de la institución.");
    if (!datos.telefono && !datos.email) return setError("Agrega un teléfono o un correo para poder contactarlo.");
    if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) return setError("El correo no parece válido.");
    setError(null);
    setGuardando(true);

    if (!confirmado) {
      const { data } = await supabase.rpc("buscar_duplicados", { p_telefono: datos.telefono, p_email: datos.email, p_excluir: cliente?.id ?? null });
      if (data && data.length > 0) {
        setDuplicados(data as Duplicado[]);
        setConfirmado(true);
        setGuardando(false);
        return;
      }
    }

    const consulta = cliente
      ? supabase.from("clientes").update(datos).eq("id", cliente.id).select("id").single()
      : supabase.from("clientes").insert(datos).select("id").single();
    const { data, error: err } = await consulta;
    setGuardando(false);
    if (err || !data) return setError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
    onGuardado(data.id);
  }

  return (
    <Modal titulo={cliente ? "Editar cliente" : "Nuevo cliente"} onCerrar={onCerrar}>
      <form className="modal-cuerpo formulario" onSubmit={guardar} noValidate>
        <p className="suave ayuda">Basta con el nombre de la persona <strong>o</strong> de la institución, y un teléfono <strong>o</strong> correo.</p>
        <div className="rejilla-2">
          <label>Persona de contacto<input value={campos.nombre ?? ""} onChange={poner("nombre")} placeholder="Dra. Ana Torres" /></label>
          <label>Clínica o empresa<input value={campos.institucion ?? ""} onChange={poner("institucion")} placeholder="Clínica San Pablo" /></label>
          <label>Teléfono<input type="tel" value={campos.telefono ?? ""} onChange={poner("telefono")} placeholder="987 654 321" /></label>
          <label>Correo<input type="email" value={campos.email ?? ""} onChange={poner("email")} placeholder="ana@clinica.pe" /></label>
          <label>Especialidad<input value={campos.especialidad ?? ""} onChange={poner("especialidad")} placeholder="Traumatología" /></label>
          <label>Distrito<input value={campos.distrito ?? ""} onChange={poner("distrito")} placeholder="Miraflores" /></label>
        </div>
        <fieldset className="opciones">
          <legend>Temperatura</legend>
          {TEMPERATURAS.map((t) => (
            <button type="button" key={t} className={`opcion temp-${t.toLowerCase()} ${campos.temperatura === t ? "elegida" : ""}`}
              onClick={() => setCampos((c) => ({ ...c, temperatura: c.temperatura === t ? null : (t as Temperatura) }))}>
              {textoTemperatura(t)}
            </button>
          ))}
        </fieldset>
        <label>Notas<textarea rows={3} value={campos.notas ?? ""} onChange={poner("notas")} placeholder="Cómo lo conocimos, qué equipo usa hoy…" /></label>

        {duplicados.length > 0 && (
          <div className="aviso" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>Ya tienes {duplicados.length === 1 ? "un cliente" : "clientes"} con estos datos:</strong>
              <ul>
                {duplicados.map((d) => (
                  <li key={d.id}>
                    <Link to={`/clientes/${d.id}`} onClick={onCerrar}>{nombreVisible(d)}</Link> (mismo {d.coincide}{d.activo ? "" : ", inactivo"})
                  </li>
                ))}
              </ul>
              <span>Si es otra persona, pulsa «Guardar de todos modos».</span>
            </div>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        <footer className="modal-pie">
          <button type="button" className="boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="boton" disabled={guardando}>
            {guardando ? "Guardando…" : duplicados.length ? "Guardar de todos modos" : cliente ? "Guardar cambios" : "Crear cliente"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
