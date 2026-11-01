import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AudioLines, Check, ChevronDown, Clock3, FileText, Plus, RefreshCw, Search, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { avisarBandeja, sincronizarGranola } from "../lib/bandeja";
import { sugerirCliente } from "../lib/sugerencia";
import type { ClienteResumen, Reunion } from "../lib/tipos";
import { nombreVisible } from "../lib/formato";
import { PestanasClientes } from "../components/PestanasClientes";
import { ClienteFormulario } from "../components/ClienteFormulario";

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }).format(new Date(iso));

const normal = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Estado = { tipo: "ok" | "error"; texto: string; enlace?: { a: string; texto: string } } | null;

export function Bandeja() {
  const [reuniones, setReuniones] = useState<Reunion[] | null>(null);
  const [clientes, setClientes] = useState<ClienteResumen[]>([]);
  const [granola, setGranola] = useState<"desconocido" | "conectado" | "sin-clave" | "error">("desconocido");
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<Estado>(null);
  const [creandoPara, setCreandoPara] = useState<Reunion | null>(null);

  const cargar = useCallback(async () => {
    const [r, c] = await Promise.all([
      supabase.from("reuniones")
        .select("id,cliente_id,fecha,titulo,duracion_min,asistentes,resumen_granola,transcripcion,granola_id,estado_analisis,error_analisis,analisis(*)")
        .is("cliente_id", null).order("fecha", { ascending: false }).limit(100),
      supabase.from("clientes_resumen").select("*").order("nombre").limit(5000),
    ]);
    setReuniones((r.data ?? []) as Reunion[]);
    setClientes((c.data ?? []) as ClienteResumen[]);
  }, []);

  const sincronizar = useCallback(async (manual: boolean) => {
    setSincronizando(true);
    try {
      const r = await sincronizarGranola();
      setGranola(r.configurado ? "conectado" : "sin-clave");
      if (manual && r.configurado) setAviso({ tipo: "ok", texto: r.nuevas ? `Llegaron ${r.nuevas} reuniones nuevas de Granola.` : "No hay reuniones nuevas en Granola." });
    } catch (e) {
      setGranola("error");
      if (manual) setAviso({ tipo: "error", texto: (e as Error).message });
    }
    setSincronizando(false);
    void cargar();
  }, [cargar]);

  useEffect(() => { void cargar(); void sincronizar(false); }, [cargar, sincronizar]);

  async function asignar(r: Reunion, cliente: { id: string; nombre: string | null; institucion: string | null }) {
    setReuniones((lista) => lista?.filter((x) => x.id !== r.id) ?? null);
    const { error } = await supabase.from("reuniones").update({ cliente_id: cliente.id }).eq("id", r.id);
    if (error) { setAviso({ tipo: "error", texto: "No se pudo asignar la reunión." }); return void cargar(); }
    setAviso({ tipo: "ok", texto: `Asignada a ${nombreVisible(cliente)}. La IA la está analizando.`, enlace: { a: `/clientes/${cliente.id}`, texto: "Ver ficha" } });
    avisarBandeja();
    api(`/reuniones/${r.id}/analizar`).catch(() => undefined); // si falla, en la ficha aparece «Analizar de nuevo»
  }

  async function eliminar(r: Reunion) {
    setReuniones((lista) => lista?.filter((x) => x.id !== r.id) ?? null);
    const { error } = await supabase.from("reuniones").delete().eq("id", r.id);
    setAviso(error ? { tipo: "error", texto: "No se pudo eliminar la reunión." } : { tipo: "ok", texto: "Reunión eliminada. No volverá a aparecer." });
    avisarBandeja();
    if (error) void cargar();
  }

  const activos = useMemo(() => clientes.filter((c) => c.activo), [clientes]);

  return (
    <>
      <header className="pagina-cabecera">
        <div>
          <p className="suave">Granola · reuniones</p>
          <h1>Reuniones por asignar</h1>
        </div>
        <button className="boton-secundario" onClick={() => void sincronizar(true)} disabled={sincronizando}>
          <RefreshCw size={16} className={sincronizando ? "gira" : ""} />{sincronizando ? "Buscando…" : "Buscar nuevas"}
        </button>
      </header>
      <PestanasClientes />

      {granola === "sin-clave" && <p className="aviso-linea aviso-error">Granola no está conectado: falta GRANOLA_API_KEY en el servidor. Mientras tanto puedes registrar reuniones a mano desde la ficha de cada cliente.</p>}
      {aviso && (
        <p className={`aviso-linea ${aviso.tipo === "error" ? "aviso-error" : ""}`} role="status">
          {aviso.texto} {aviso.enlace && <Link to={aviso.enlace.a}>{aviso.enlace.texto}</Link>}
          <button className="icono-boton cerrar-aviso" onClick={() => setAviso(null)} aria-label="Cerrar aviso"><X size={14} /></button>
        </p>
      )}

      {!reuniones && <p className="suave">Cargando…</p>}
      {reuniones?.length === 0 && (
        <div className="vacio vacio-centrado">
          <AudioLines size={28} className="tono-acento" />
          <p><strong>Todo al día</strong></p>
          <p className="suave">Cuando grabes una reunión con Granola, en la computadora o en el celular, aparecerá aquí para que elijas de qué cliente es.</p>
        </div>
      )}

      <div className="bandeja">
        {reuniones?.map((r) => (
          <TarjetaPorAsignar key={r.id} reunion={r} clientes={activos}
            onAsignar={(c) => void asignar(r, c)} onCrear={() => setCreandoPara(r)} onEliminar={() => void eliminar(r)} />
        ))}
      </div>

      {creandoPara && (
        <ClienteFormulario
          inicial={{
            nombre: creandoPara.asistentes.find((a) => a.nombre)?.nombre ?? "",
            email: creandoPara.asistentes.find((a) => a.email)?.email ?? "",
          }}
          onCerrar={() => setCreandoPara(null)}
          onGuardado={(id) => {
            const r = creandoPara;
            setCreandoPara(null);
            void supabase.from("clientes").select("id,nombre,institucion").eq("id", id).single().then(({ data }) => data && asignar(r, data));
          }}
        />
      )}
    </>
  );
}

function TarjetaPorAsignar({ reunion: r, clientes, onAsignar, onCrear, onEliminar }: {
  reunion: Reunion;
  clientes: ClienteResumen[];
  onAsignar: (c: ClienteResumen) => void;
  onCrear: () => void;
  onEliminar: () => void;
}) {
  const [buscar, setBuscar] = useState("");
  const [elegido, setElegido] = useState("");
  const [verTexto, setVerTexto] = useState(false);
  const [verResumen, setVerResumen] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const sugerencia = useMemo(() => sugerirCliente(r, clientes), [r, clientes]);
  const opciones = useMemo(() => {
    const q = normal(buscar.trim());
    return clientes.filter((c) => !q || normal(`${c.nombre ?? ""} ${c.institucion ?? ""}`).includes(q)).slice(0, 200);
  }, [clientes, buscar]);
  const elegidoCliente = clientes.find((c) => c.id === elegido);

  return (
    <article className="por-asignar">
      <header className="por-asignar-cabecera">
        <div className="por-asignar-titulos">
          <strong>{r.titulo || "Reunión sin título"}</strong>
          <span className="suave pequeño"><Clock3 size={13} />{fechaHora(r.fecha)}{r.duracion_min ? ` · ${r.duracion_min} min` : ""}</span>
        </div>
        {confirmar ? (
          <span className="confirmar">
            ¿Eliminar esta reunión?
            <button className="boton-peligro" onClick={onEliminar}>Eliminar</button>
            <button className="boton-secundario boton-chico" onClick={() => setConfirmar(false)}>No</button>
          </span>
        ) : (
          <button className="icono-boton" onClick={() => setConfirmar(true)} title="Eliminar" aria-label="Eliminar reunión"><Trash2 size={16} /></button>
        )}
      </header>

      {r.asistentes.length > 0 && (
        <ul className="asistentes">
          {r.asistentes.map((a, i) => <li key={i}><UserRound size={13} />{a.nombre || a.email}{a.nombre && a.email ? <span className="suave"> · {a.email}</span> : null}</li>)}
        </ul>
      )}

      {r.resumen_granola && (
        <div className={`resumen-granola ${verResumen ? "completo" : ""}`}>
          <p>{r.resumen_granola}</p>
          {r.resumen_granola.length > 280 && <button className="ver-texto" onClick={() => setVerResumen((v) => !v)}>{verResumen ? "Ver menos" : "Ver más"}</button>}
        </div>
      )}
      {r.transcripcion && (
        <>
          <button className="ver-texto" onClick={() => setVerTexto((v) => !v)} aria-expanded={verTexto}>
            <FileText size={14} />{verTexto ? "Ocultar transcripción" : "Ver transcripción"}<ChevronDown size={14} className={verTexto ? "girado" : ""} />
          </button>
          {verTexto && <div className="transcripcion">{r.transcripcion}</div>}
        </>
      )}

      {sugerencia && (
        <div className="sugerencia-cliente">
          <Sparkles size={16} />
          <span>Parece ser <strong>{nombreVisible(sugerencia.cliente)}</strong> <span className="suave">({sugerencia.motivo})</span></span>
          <button className="boton boton-chico" onClick={() => onAsignar(sugerencia.cliente)}><Check size={14} />Asignar</button>
        </div>
      )}

      <div className="asignar">
        <label className="buscador buscador-chico">
          <Search size={14} />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar cliente…" aria-label="Buscar cliente" />
        </label>
        <select className="selector" value={elegido} onChange={(e) => setElegido(e.target.value)} aria-label="Elegir cliente">
          <option value="">{opciones.length ? `Elegir cliente (${opciones.length})` : "Sin coincidencias"}</option>
          {opciones.map((c) => <option key={c.id} value={c.id}>{nombreVisible(c)}{c.nombre && c.institucion ? ` · ${c.institucion}` : ""}</option>)}
        </select>
        <button className="boton boton-chico" disabled={!elegidoCliente} onClick={() => elegidoCliente && onAsignar(elegidoCliente)}>Asignar</button>
        <button className="boton-secundario boton-chico boton-crear" onClick={onCrear}><Plus size={14} />Cliente nuevo</button>
      </div>
    </article>
  );
}
