import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, MessageCircle, Pencil, Power, RotateCcw } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Cliente, Etapa, Seguimiento, Temperatura as T } from "../lib/tipos";
import { cuando, diasHasta, enlaceWhatsapp, fechaCorta, hoy, nombreVisible, subtitulo, TEMPERATURAS, textoTemperatura } from "../lib/formato";
import { ClienteFormulario } from "../components/ClienteFormulario";
import { textoUbicacion } from "../components/UbicacionCampos";

interface Movimiento {
  id: string;
  created_at: string;
  anterior: { nombre: string } | null;
  nueva: { nombre: string } | null;
}

function manana(): string {
  const d = new Date(hoy() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function ClienteFicha() {
  const { id = "" } = useParams();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [historial, setHistorial] = useState<Movimiento[]>([]);
  const [estado, setEstado] = useState<"cargando" | "listo" | "no-existe" | "error">("cargando");
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nuevoSeg, setNuevoSeg] = useState({ fecha: manana(), motivo: "" });

  const cargar = useCallback(async () => {
    const [c, e, s, h] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", id).maybeSingle(),
      supabase.from("etapas").select("id,nombre,orden,es_cierre").eq("activa", true).order("orden"),
      supabase.from("seguimientos").select("id,cliente_id,fecha,motivo,hecho,completado_at").eq("cliente_id", id).order("fecha"),
      supabase.from("historial_etapas")
        .select("id,created_at,anterior:etapas!historial_etapas_etapa_anterior_id_fkey(nombre),nueva:etapas!historial_etapas_etapa_nueva_id_fkey(nombre)")
        .eq("cliente_id", id).order("created_at", { ascending: false }).limit(20),
    ]);
    if (c.error || e.error || s.error) return setEstado("error");
    if (!c.data) return setEstado("no-existe");
    setCliente(c.data as Cliente);
    setEtapas(e.data as Etapa[]);
    setSeguimientos(s.data as Seguimiento[]);
    setHistorial((h.data ?? []) as unknown as Movimiento[]);
    setEstado("listo");
  }, [id]);

  useEffect(() => { setEstado("cargando"); void cargar(); }, [cargar]);

  async function actualizar(cambios: Partial<Cliente>, mensaje?: string) {
    if (!cliente) return;
    setCliente({ ...cliente, ...cambios });
    const { error } = await supabase.from("clientes").update(cambios).eq("id", cliente.id);
    setAviso(error ? "No se pudo guardar el cambio." : mensaje ?? null);
    void cargar();
  }

  async function agregarSeguimiento(e: FormEvent) {
    e.preventDefault();
    if (!nuevoSeg.motivo.trim()) return;
    const { error } = await supabase.from("seguimientos").insert({ cliente_id: id, fecha: nuevoSeg.fecha, motivo: nuevoSeg.motivo.trim() });
    if (error) return setAviso("No se pudo agregar el seguimiento.");
    setNuevoSeg({ fecha: manana(), motivo: "" });
    void cargar();
  }

  async function marcar(s: Seguimiento) {
    setSeguimientos((lista) => lista.map((x) => (x.id === s.id ? { ...x, hecho: !s.hecho } : x)));
    await supabase.from("seguimientos").update({ hecho: !s.hecho }).eq("id", s.id);
    void cargar();
  }

  if (estado === "cargando") return <p className="suave">Cargando…</p>;
  if (estado === "error") return <p className="error">No se pudo cargar el cliente. Revisa tu conexión.</p>;
  if (estado === "no-existe" || !cliente) return <div className="vacio"><p><strong>Este cliente no existe.</strong></p><Link to="/clientes">Volver a clientes</Link></div>;

  const etapaActual = etapas.find((e) => e.id === cliente.etapa_id);
  const pendientes = seguimientos.filter((s) => !s.hecho);
  const hechos = seguimientos.filter((s) => s.hecho).reverse().slice(0, 5);
  const wa = enlaceWhatsapp(cliente.telefono);

  return (
    <>
      <Link to="/clientes" className="volver"><ArrowLeft size={16} />Clientes</Link>
      <header className="pagina-cabecera">
        <div>
          <h1>{nombreVisible(cliente)} {!cliente.activo && <span className="etiqueta etiqueta-gris">Inactivo</span>}</h1>
          {subtitulo(cliente) && <p className="suave">{subtitulo(cliente)}</p>}
        </div>
        <div className="acciones">
          {wa && <a className="boton-secundario" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />WhatsApp</a>}
          <button className="boton-secundario" onClick={() => setEditando(true)}><Pencil size={16} />Editar</button>
          {cliente.activo
            ? <button className="boton-secundario" onClick={() => void actualizar({ activo: false }, "Cliente desactivado. Puedes reactivarlo cuando quieras.")}><Power size={16} />Desactivar</button>
            : <button className="boton" onClick={() => void actualizar({ activo: true }, "Cliente reactivado.")}><RotateCcw size={16} />Reactivar</button>}
        </div>
      </header>
      {aviso && <p className="aviso-linea" role="status">{aviso}</p>}

      <section className="panel">
        <div className="ficha-estado">
          <div>
            <h2 className="panel-titulo">Etapa</h2>
            <div className="pasos">
              {etapas.map((e) => (
                <button key={e.id} className={`paso ${e.id === cliente.etapa_id ? "actual" : ""} ${etapaActual && e.orden < etapaActual.orden ? "pasado" : ""} ${e.es_cierre ? "paso-cierre" : ""}`}
                  onClick={() => e.id !== cliente.etapa_id && void actualizar({ etapa_id: e.id })}>
                  {e.nombre}
                </button>
              ))}
            </div>
            {cliente.fecha_cierre && <p className="suave nota">Cerrado el {fechaCorta(cliente.fecha_cierre)}</p>}
          </div>
          <div>
            <h2 className="panel-titulo">Temperatura</h2>
            <div className="opciones">
              {TEMPERATURAS.map((t) => (
                <button key={t} className={`opcion temp-${t.toLowerCase()} ${cliente.temperatura === t ? "elegida" : ""}`}
                  onClick={() => void actualizar({ temperatura: cliente.temperatura === t ? null : (t as T) })}>
                  {textoTemperatura(t)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rejilla-paneles">
        <div className="panel">
          <h2 className="panel-titulo">Seguimientos</h2>
          <form className="seg-nuevo" onSubmit={agregarSeguimiento}>
            <input type="date" value={nuevoSeg.fecha} min={hoy()} onChange={(e) => setNuevoSeg((s) => ({ ...s, fecha: e.target.value }))} aria-label="Fecha" required />
            <input placeholder="Qué hay que hacer (llamar, enviar cotización…)" value={nuevoSeg.motivo} onChange={(e) => setNuevoSeg((s) => ({ ...s, motivo: e.target.value }))} aria-label="Motivo" />
            <button className="boton" disabled={!nuevoSeg.motivo.trim()}>Agregar</button>
          </form>
          {pendientes.length === 0 && <p className="tono-alerta nota">{cliente.activo && !etapaActual?.es_cierre ? "Sin próximo paso: programa un seguimiento." : "Sin seguimientos pendientes."}</p>}
          <ul className="lista">
            {pendientes.map((s) => (
              <li key={s.id} className="lista-fila">
                <button className="check" onClick={() => void marcar(s)} aria-label="Marcar como hecho" title="Marcar como hecho"><Check size={14} /></button>
                <span className="lista-texto">{s.motivo}</span>
                <span className={diasHasta(s.fecha) < 0 ? "tono-alerta pequeño" : "suave pequeño"}>{cuando(s.fecha)}</span>
              </li>
            ))}
            {hechos.map((s) => (
              <li key={s.id} className="lista-fila hecho">
                <button className="check marcado" onClick={() => void marcar(s)} aria-label="Marcar como pendiente" title="Volver a pendiente"><Check size={14} /></button>
                <span className="lista-texto">{s.motivo}</span>
                <span className="suave pequeño">{fechaCorta(s.completado_at ?? s.fecha)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2 className="panel-titulo">Datos</h2>
          <dl className="datos">
            <dt>Persona</dt><dd>{cliente.nombre ?? "—"}</dd>
            <dt>Institución</dt><dd>{cliente.institucion ?? "—"}</dd>
            <dt>Teléfono</dt><dd>{cliente.telefono ? <a href={`tel:${cliente.telefono}`}>{cliente.telefono}</a> : "—"}</dd>
            <dt>Correo</dt><dd>{cliente.email ? <a href={`mailto:${cliente.email}`}>{cliente.email}</a> : "—"}</dd>
            <dt>Especialidad</dt><dd>{cliente.especialidad ?? "—"}</dd>
            <dt>Ubicación</dt><dd>{textoUbicacion(cliente) || "—"}</dd>
            <dt>Registrado</dt><dd>{fechaCorta(cliente.created_at)}</dd>
          </dl>
          {cliente.notas && <><h3 className="subtitulo-panel">Notas</h3><p className="notas">{cliente.notas}</p></>}
          {historial.length > 0 && (
            <>
              <h3 className="subtitulo-panel">Historial de etapas</h3>
              <ul className="historial">
                {historial.map((h) => (
                  <li key={h.id}><span className="suave">{fechaCorta(h.created_at)}</span> {h.anterior ? `${h.anterior.nombre} → ` : "Entró en "}<strong>{h.nueva?.nombre}</strong></li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {editando && (
        <ClienteFormulario cliente={cliente} onCerrar={() => setEditando(false)} onGuardado={() => { setEditando(false); setAviso("Cambios guardados."); void cargar(); }} />
      )}
    </>
  );
}
