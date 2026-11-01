import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { Modal } from "./Modal";

const MINIMO = 40;
const MAXIMO = 200_000;

/** Fecha y hora local para <input type="datetime-local">. */
function ahoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Registrar una reunión a mano: pegar la transcripción o las notas. */
export function RegistrarReunion({ clienteId, onCerrar, onGuardada }: {
  clienteId: string;
  onCerrar: () => void;
  onGuardada: (reunionId: string) => void;
}) {
  const [fecha, setFecha] = useState(ahoraLocal());
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const limpio = texto.trim();
    if (limpio.length < MINIMO) return setError("Pega la transcripción o escribe notas un poco más completas.");
    setGuardando(true);
    const { data, error: err } = await supabase
      .from("reuniones")
      .insert({ cliente_id: clienteId, fecha: new Date(fecha).toISOString(), titulo: titulo.trim() || null, transcripcion: limpio })
      .select("id")
      .single();
    setGuardando(false);
    if (err || !data) return setError("No se pudo guardar la reunión. Revisa tu conexión.");
    onGuardada(data.id);
  }

  return (
    <Modal titulo="Registrar reunión" onCerrar={onCerrar}>
      <form className="modal-form" onSubmit={guardar} noValidate>
        <div className="modal-cuerpo formulario">
          <div className="rejilla-2">
            <label>Fecha y hora<input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></label>
            <label>Título (opcional)<input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Demo Ozonette Dent" maxLength={300} /></label>
          </div>
          <label>
            Transcripción o notas
            <textarea rows={12} value={texto} maxLength={MAXIMO} onChange={(e) => setTexto(e.target.value)}
              placeholder="Pega aquí la transcripción de la reunión, o escribe lo que recuerdas: qué le interesó, qué dudas tuvo, qué quedaron en hacer…" />
          </label>
          <p className="suave ayuda">
            Al guardar, la IA la analiza y te sugiere temperatura, próximo seguimiento y un mensaje de WhatsApp.
            Antes de enviarla se ocultan teléfonos, correos y DNI. {texto.length > 1000 && <>({texto.length.toLocaleString("es-PE")} / 200 000 caracteres)</>}
          </p>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <footer className="modal-pie">
          <button type="button" className="boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="boton" disabled={guardando}>{guardando ? "Guardando…" : "Guardar y analizar"}</button>
        </footer>
      </form>
    </Modal>
  );
}
