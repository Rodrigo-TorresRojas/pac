import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarPlus, Check, Loader2, MessageCircle, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { cuando, textoTemperatura } from "../lib/formato";
import type { Temperatura } from "../lib/tipos";

interface Propuesta {
  tipo: "seguimiento" | "cambio";
  cliente_id: string;
  cliente: string;
  fecha?: string;
  motivo?: string;
  temperatura?: Temperatura;
  etapa_id?: string;
  etapa?: string;
  estado?: "pendiente" | "hecha" | "descartada" | "error";
}
interface Mensaje { rol: "usuario" | "asistente"; texto: string; propuestas?: Propuesta[]; error?: boolean }

const SUGERENCIAS = [
  "¿Qué tengo pendiente para hoy?",
  "¿Qué clientes calientes no tienen próximo paso?",
  "¿Qué objeciones me han puesto este mes?",
  "¿Cómo asigno una reunión de Granola?",
];

/** Negritas y enlaces internos: **texto** y [Nombre](/clientes/id). */
function enLinea(texto: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let i = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(texto))) {
    if (m.index > i) partes.push(texto.slice(i, m.index));
    partes.push(m[1] ? <strong key={k++}>{m[1]}</strong> : <Link key={k++} to={m[3]}>{m[2]}</Link>);
    i = m.index + m[0].length;
  }
  if (i < texto.length) partes.push(texto.slice(i));
  return partes;
}

/** Markdown mínimo: párrafos, listas con viñetas o números, títulos como negrita. */
function Texto({ texto }: { texto: string }) {
  const bloques: ReactNode[] = [];
  let lista: { ordenada: boolean; items: string[] } | null = null;
  const cerrarLista = () => {
    if (!lista) return;
    const Etiqueta = lista.ordenada ? "ol" : "ul";
    bloques.push(<Etiqueta key={bloques.length}>{lista.items.map((it, j) => <li key={j}>{enLinea(it)}</li>)}</Etiqueta>);
    lista = null;
  };
  for (const linea of texto.split("\n")) {
    const vi = linea.match(/^\s*[-*•]\s+(.*)$/);
    const nu = linea.match(/^\s*\d+[.)]\s+(.*)$/);
    if (vi || nu) {
      const ordenada = Boolean(nu);
      if (!lista || lista.ordenada !== ordenada) { cerrarLista(); lista = { ordenada, items: [] }; }
      lista.items.push((vi ?? nu)![1]);
      continue;
    }
    cerrarLista();
    const t = linea.replace(/^#{1,6}\s*/, "").trim();
    if (t) bloques.push(<p key={bloques.length}>{/^#/.test(linea) ? <strong>{enLinea(t)}</strong> : enLinea(t)}</p>);
  }
  cerrarLista();
  return <>{bloques.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</>;
}

export function Asistente() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const { pathname } = useLocation();
  const clienteActual = pathname.match(/^\/clientes\/([0-9a-f-]{36})$/)?.[1] ?? null;
  const lista = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = lista.current; // solo se desplaza la lista de mensajes, nunca la página
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [mensajes, pensando, abierto]);
  useEffect(() => { if (abierto) entrada.current?.focus(); }, [abierto]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);

  async function enviar(pregunta: string) {
    const limpia = pregunta.trim();
    if (!limpia || pensando) return;
    const historial: Mensaje[] = [...mensajes.filter((m) => !m.error), { rol: "usuario", texto: limpia }];
    setMensajes((m) => [...m, { rol: "usuario", texto: limpia }]);
    setTexto("");
    setPensando(true);
    try {
      const r = await api<{ texto: string; propuestas: Propuesta[] }>("/asistente", {
        cuerpo: { mensajes: historial.map(({ rol, texto }) => ({ rol, texto })), cliente_actual: clienteActual },
      });
      setMensajes((m) => [...m, { rol: "asistente", texto: r.texto, propuestas: r.propuestas.map((p) => ({ ...p, estado: "pendiente" })) }]);
    } catch (e) {
      setMensajes((m) => [...m, { rol: "asistente", texto: (e as Error).message, error: true }]);
    }
    setPensando(false);
  }

  function cambiarPropuesta(iMensaje: number, iProp: number, estado: Propuesta["estado"]) {
    setMensajes((lista) => lista.map((m, i) => i !== iMensaje ? m : { ...m, propuestas: m.propuestas?.map((p, j) => j === iProp ? { ...p, estado } : p) }));
  }

  async function confirmar(iMensaje: number, iProp: number, p: Propuesta) {
    const { error } = p.tipo === "seguimiento"
      ? await supabase.from("seguimientos").insert({ cliente_id: p.cliente_id, fecha: p.fecha, motivo: p.motivo })
      : await supabase.from("clientes").update({ ...(p.temperatura ? { temperatura: p.temperatura } : {}), ...(p.etapa_id ? { etapa_id: p.etapa_id } : {}) }).eq("id", p.cliente_id);
    cambiarPropuesta(iMensaje, iProp, error ? "error" : "hecha");
    if (!error) window.dispatchEvent(new Event("pac:datos"));
  }

  function enviarFormulario(e: FormEvent) { e.preventDefault(); void enviar(texto); }

  return (
    <>
      {!abierto && (
        <button className="asistente-boton" onClick={() => setAbierto(true)} aria-label="Abrir Asistente PAC">
          <Sparkles size={22} /><span>Asistente</span>
        </button>
      )}
      {abierto && (
        <section className="asistente" role="dialog" aria-label="Asistente PAC">
          <header className="asistente-cabecera">
            <div><Sparkles size={18} /><strong>Asistente PAC</strong></div>
            <div>
              {mensajes.length > 0 && <button className="icono-boton" onClick={() => setMensajes([])} title="Nueva conversación" aria-label="Nueva conversación"><RotateCcw size={16} /></button>}
              <button className="icono-boton" onClick={() => setAbierto(false)} aria-label="Cerrar"><X size={18} /></button>
            </div>
          </header>

          <div className="asistente-mensajes" ref={lista}>
            {mensajes.length === 0 && (
              <div className="asistente-inicio">
                <MessageCircle size={28} />
                <p><strong>¿En qué te ayudo?</strong></p>
                <p className="suave">Pregúntame por tus clientes, seguimientos y reuniones, o cómo usar PAC.</p>
                <div className="asistente-sugerencias">
                  {SUGERENCIAS.map((s) => <button key={s} onClick={() => void enviar(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={`burbuja de-${m.rol} ${m.error ? "con-error" : ""}`}>
                {m.rol === "usuario" ? <p>{m.texto}</p> : <Texto texto={m.texto} />}
                {m.propuestas?.map((p, j) => (
                  <div key={j} className="propuesta">
                    <CalendarPlus size={16} />
                    <span>
                      {p.tipo === "seguimiento"
                        ? <>Seguimiento con <strong>{p.cliente}</strong>: {cuando(p.fecha!)} · {p.motivo}</>
                        : <>Cambiar a <strong>{p.cliente}</strong>: {[p.temperatura && `temperatura ${textoTemperatura(p.temperatura)}`, p.etapa && `etapa ${p.etapa}`].filter(Boolean).join(" y ")}</>}
                    </span>
                    {p.estado === "pendiente" && (
                      <span className="propuesta-acciones">
                        <button className="boton boton-chico" onClick={() => void confirmar(i, j, p)}><Check size={14} />Confirmar</button>
                        <button className="boton-secundario boton-chico" onClick={() => cambiarPropuesta(i, j, "descartada")}>Descartar</button>
                      </span>
                    )}
                    {p.estado === "hecha" && <span className="hecho-ok"><Check size={14} />Hecho</span>}
                    {p.estado === "descartada" && <span className="suave pequeño">Descartada</span>}
                    {p.estado === "error" && <span className="error pequeño">No se pudo guardar</span>}
                  </div>
                ))}
              </div>
            ))}
            {pensando && <div className="burbuja de-asistente pensando"><Loader2 size={16} className="gira" />Pensando…</div>}
          </div>

          <form className="asistente-entrada" onSubmit={enviarFormulario}>
            <textarea ref={entrada} rows={1} value={texto} maxLength={4000} placeholder="Escribe tu pregunta…"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(texto); } }} />
            <button className="boton" disabled={!texto.trim() || pensando} aria-label="Enviar"><Send size={16} /></button>
          </form>
        </section>
      )}
    </>
  );
}
