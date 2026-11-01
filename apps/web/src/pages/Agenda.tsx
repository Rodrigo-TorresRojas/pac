import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarCheck, Check, ChevronDown, FileText, Plus, Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import { cuando, diasHasta, fechaCorta, hoy, nombreVisible, textoTemperatura } from "../lib/formato";
import type { ClienteResumen, Temperatura } from "../lib/tipos";
import { Modal } from "../components/Modal";

interface Seg { id: string; fecha: string; motivo: string; hecho: boolean; completado_at: string | null; cliente_id: string; clientes: { nombre: string | null; institucion: string | null } | null }
interface Reu {
  id: string; fecha: string; titulo: string | null; granola_id: string | null; cliente_id: string; estado_analisis: string;
  clientes: { nombre: string | null; institucion: string | null; temperatura: Temperatura | null } | null;
  analisis: { resumen: string; temperatura_sugerida: Temperatura | null; objeciones: string[] }[];
}

const normal = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Agenda: todos los seguimientos (llamadas y tareas) y el historial de todas las reuniones. */
export function Agenda() {
  const [params, setParams] = useSearchParams();
  const vista = params.get("vista") === "reuniones" ? "reuniones" : "seguimientos";
  return (
    <>
      <header className="pagina-cabecera">
        <div>
          <p className="suave">Tu trabajo de la semana</p>
          <h1>Agenda</h1>
        </div>
      </header>
      <nav className="pestanas" aria-label="Secciones de la agenda">
        <button className={`pestana ${vista === "seguimientos" ? "active" : ""}`} onClick={() => setParams({}, { replace: true })}><CalendarCheck size={16} />Seguimientos</button>
        <button className={`pestana ${vista === "reuniones" ? "active" : ""}`} onClick={() => setParams({ vista: "reuniones" }, { replace: true })}><FileText size={16} />Reuniones</button>
      </nav>
      {vista === "seguimientos" ? <Seguimientos /> : <Reuniones />}
    </>
  );
}

function Seguimientos() {
  const [lista, setLista] = useState<Seg[] | null>(null);
  const [hechos, setHechos] = useState<Seg[]>([]);
  const [verHechos, setVerHechos] = useState(false);
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback(async () => {
    const [p, h] = await Promise.all([
      supabase.from("seguimientos").select("id,fecha,motivo,hecho,completado_at,cliente_id,clientes(nombre,institucion)").eq("hecho", false).order("fecha").limit(300),
      supabase.from("seguimientos").select("id,fecha,motivo,hecho,completado_at,cliente_id,clientes(nombre,institucion)").eq("hecho", true).order("completado_at", { ascending: false }).limit(30),
    ]);
    setLista((p.data ?? []) as unknown as Seg[]);
    setHechos((h.data ?? []) as unknown as Seg[]);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function marcar(s: Seg) {
    setLista((l) => l?.filter((x) => x.id !== s.id) ?? null);
    await supabase.from("seguimientos").update({ hecho: !s.hecho }).eq("id", s.id);
    void cargar();
  }

  const grupos = useMemo(() => {
    const g = { atrasados: [] as Seg[], hoy: [] as Seg[], semana: [] as Seg[], despues: [] as Seg[] };
    for (const s of lista ?? []) {
      const d = diasHasta(s.fecha);
      (d < 0 ? g.atrasados : d === 0 ? g.hoy : d <= 7 ? g.semana : g.despues).push(s);
    }
    return g;
  }, [lista]);

  const Fila = ({ s }: { s: Seg }) => (
    <li className={`lista-fila ${s.hecho ? "hecho" : ""}`}>
      <button className={`check ${s.hecho ? "marcado" : ""}`} onClick={() => void marcar(s)} aria-label={s.hecho ? "Volver a pendiente" : "Marcar como hecho"}><Check size={14} /></button>
      <Link to={`/clientes/${s.cliente_id}`} className="lista-texto">
        <strong>{s.clientes ? nombreVisible(s.clientes) : "Cliente"}</strong>
        <span className="suave">{s.motivo}</span>
      </Link>
      <span className={!s.hecho && diasHasta(s.fecha) < 0 ? "tono-alerta pequeño" : "suave pequeño"}>{s.hecho ? fechaCorta(s.completado_at ?? s.fecha) : cuando(s.fecha)}</span>
    </li>
  );

  const bloques: [string, Seg[], string][] = [
    ["Atrasados", grupos.atrasados, "tono-alerta"], ["Hoy", grupos.hoy, ""], ["Próximos 7 días", grupos.semana, ""], ["Más adelante", grupos.despues, ""],
  ];

  return (
    <>
      <div className="barra-acciones">
        <span className="suave">{lista ? `${lista.length} pendientes` : ""}</span>
        <button className="boton boton-chico" onClick={() => setNuevo(true)}><Plus size={14} />Nuevo seguimiento</button>
      </div>
      {!lista && <p className="suave">Cargando…</p>}
      {lista?.length === 0 && <div className="vacio"><p><strong>No tienes seguimientos pendientes.</strong></p><p className="suave">Agrégalos aquí, desde la ficha de un cliente o aceptando la sugerencia de una reunión.</p></div>}
      <div className="agenda-grupos">
        {bloques.filter(([, l]) => l.length).map(([titulo, l, tono]) => (
          <section key={titulo} className="panel">
            <h2 className={`panel-titulo ${tono}`}>{titulo} · {l.length}</h2>
            <ul className="lista">{l.map((s) => <Fila key={s.id} s={s} />)}</ul>
          </section>
        ))}
      </div>
      {hechos.length > 0 && (
        <section className="panel">
          <button className="ver-texto" onClick={() => setVerHechos((v) => !v)} aria-expanded={verHechos}>
            Hechos recientemente ({hechos.length})<ChevronDown size={14} className={verHechos ? "girado" : ""} />
          </button>
          {verHechos && <ul className="lista">{hechos.map((s) => <Fila key={s.id} s={s} />)}</ul>}
        </section>
      )}
      {nuevo && <NuevoSeguimiento onCerrar={() => setNuevo(false)} onGuardado={() => { setNuevo(false); void cargar(); }} />}
    </>
  );
}

function NuevoSeguimiento({ onCerrar, onGuardado }: { onCerrar: () => void; onGuardado: () => void }) {
  const [clientes, setClientes] = useState<ClienteResumen[]>([]);
  const [buscar, setBuscar] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.from("clientes_resumen").select("*").eq("activo", true).order("nombre").limit(5000).then(({ data }) => setClientes((data ?? []) as ClienteResumen[]));
  }, []);
  const opciones = clientes.filter((c) => !buscar.trim() || normal(`${c.nombre} ${c.institucion}`).includes(normal(buscar.trim()))).slice(0, 200);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!clienteId) return setError("Elige el cliente.");
    if (!motivo.trim()) return setError("Escribe qué hay que hacer.");
    const { error: err } = await supabase.from("seguimientos").insert({ cliente_id: clienteId, fecha, motivo: motivo.trim() });
    if (err) return setError("No se pudo guardar.");
    onGuardado();
  }

  return (
    <Modal titulo="Nuevo seguimiento" onCerrar={onCerrar}>
      <form className="modal-form" onSubmit={guardar} noValidate>
        <div className="modal-cuerpo formulario">
          <label className="buscador buscador-chico"><Search size={14} /><input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar cliente…" aria-label="Buscar cliente" /></label>
          <label>Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Elegir ({opciones.length})</option>
              {opciones.map((c) => <option key={c.id} value={c.id}>{nombreVisible(c)}{c.nombre && c.institucion ? ` · ${c.institucion}` : ""}</option>)}
            </select>
          </label>
          <div className="rejilla-2">
            <label>Fecha<input type="date" value={fecha} min={hoy()} onChange={(e) => setFecha(e.target.value)} /></label>
            <label>Qué hay que hacer<input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Llamar para confirmar demo" maxLength={300} /></label>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <footer className="modal-pie">
          <button type="button" className="boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="boton">Guardar</button>
        </footer>
      </form>
    </Modal>
  );
}

function Reuniones() {
  const [lista, setLista] = useState<Reu[] | null>(null);
  const [texto, setTexto] = useState("");
  useEffect(() => {
    void supabase.from("reuniones")
      .select("id,fecha,titulo,granola_id,cliente_id,estado_analisis,clientes(nombre,institucion,temperatura),analisis(resumen,temperatura_sugerida,objeciones)")
      .not("cliente_id", "is", null).order("fecha", { ascending: false }).limit(300)
      .then(({ data }) => setLista((data ?? []) as unknown as Reu[]));
  }, []);
  const visibles = (lista ?? []).filter((r) => {
    const q = normal(texto.trim());
    if (!q) return true;
    const a = r.analisis[0];
    return normal([r.titulo, r.clientes?.nombre, r.clientes?.institucion, a?.resumen, a?.objeciones?.join(" ")].join(" ")).includes(q);
  });
  return (
    <>
      <div className="barra-acciones">
        <label className="buscador"><Search size={16} /><input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por cliente, tema u objeción…" aria-label="Buscar reuniones" /></label>
      </div>
      {!lista && <p className="suave">Cargando…</p>}
      {lista && visibles.length === 0 && <div className="vacio"><p><strong>{lista.length ? "Ninguna reunión coincide." : "Aún no hay reuniones."}</strong></p></div>}
      <ul className="reuniones-globales">
        {visibles.map((r) => {
          const a = r.analisis[0];
          return (
            <li key={r.id}>
              <Link to={`/clientes/${r.cliente_id}`} className="reunion-global">
                <span className="rg-fecha"><strong>{fechaCorta(r.fecha)}</strong><span className="suave pequeño">{r.granola_id ? "Granola" : "A mano"}</span></span>
                <span className="rg-texto">
                  <strong>{r.clientes ? nombreVisible(r.clientes) : "Cliente"}</strong>{r.titulo && <span className="suave"> · {r.titulo}</span>}
                  <span className="rg-resumen">{a?.resumen ?? (r.estado_analisis === "error" ? "El análisis falló: ábrela para reintentar." : "Sin análisis todavía.")}</span>
                </span>
                {a?.temperatura_sugerida && <span className={`temp temp-${a.temperatura_sugerida.toLowerCase()}`}>{textoTemperatura(a.temperatura_sugerida)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
