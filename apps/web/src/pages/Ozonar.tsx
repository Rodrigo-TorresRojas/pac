import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, Mail, MapPin, MessageCircle, Phone, RefreshCw, Sparkles, ThumbsDown, ThumbsUp, UserPlus, X } from "lucide-react";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { marca } from "../lib/marca";
import { ClienteFormulario } from "../components/ClienteFormulario";

interface Prospecto {
  id: string;
  place_id: string;
  exploracion: boolean;
  segmento: string | null;
  zona: string | null;
  afinidad: number | null;
  razon: string | null;
  servicios: string | null;
  ofrece_ozono: "si" | "no" | "desconocido";
  correo: string | null;
  fuentes: { titulo: string; url: string }[];
  opinion: -1 | 1 | null;
  estado: "nuevo" | "contactado" | "descartado" | "convertido";
  motivo_descarte: string | null;
  productos: { nombre: string } | null;
  nombre: string | null;
  direccion: string | null;
  tipo: string | null;
  operativo: boolean | null;
}
interface Lote { id: string; mes: string; numero: number; estado: "generando" | "listo" | "error"; error: string | null; candidatos: number | null }
interface Estado { config: { places: boolean; tavily: boolean; gemini: boolean; tamano_lote: number }; mes_actual: string; lote: Lote | null; prospectos: Prospecto[] }
interface Contacto { nombre: string | null; direccion: string | null; tipo: string | null; telefono: string | null; telefono_internacional: string | null; web: string | null; maps: string | null; calificacion: number | null; resenas: number | null }

const MOTIVOS = ["No le interesa", "Ya tiene equipo", "No es el perfil", "Dato incorrecto", "No contactar"];
const nombreMes = (mes: string) => new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(mes + "T12:00:00Z"));
const nivel = (a: number | null) => (a ?? 0) >= 80 ? "alta" : (a ?? 0) >= 50 ? "media" : "baja";

/** Posición en el diagrama: más afinidad, más cerca del centro. */
function posiciones(lista: Prospecto[]) {
  const anillos: Record<string, Prospecto[]> = { alta: [], media: [], baja: [] };
  for (const p of lista) anillos[nivel(p.afinidad)].push(p);
  const radio = { alta: [24, 30], media: [36, 40], baja: [45, 45] } as const;
  const desfase = { alta: -100, media: -40, baja: -70 };
  const out = new Map<string, { x: number; y: number }>();
  for (const k of ["alta", "media", "baja"] as const) {
    const n = anillos[k].length;
    anillos[k].forEach((p, i) => {
      const ang = ((desfase[k] + (360 / Math.max(n, 1)) * i) * Math.PI) / 180;
      out.set(p.id, { x: 50 + radio[k][0] * Math.cos(ang), y: 50 + radio[k][1] * Math.sin(ang) });
    });
  }
  return out;
}

export function Ozonar() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [convirtiendo, setConvirtiendo] = useState<{ p: Prospecto; c: Contacto | null } | null>(null);
  const pidiendo = useRef(false);

  const cargar = useCallback(async () => {
    try {
      const e = await api<Estado>("/ozonar", { metodo: "GET" });
      setEstado(e);
      setError(null);
      return e;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  const pedirLote = useCallback(async () => {
    if (pidiendo.current) return;
    pidiendo.current = true;
    try { await api("/ozonar/generar"); } catch (err) { setError((err as Error).message); }
    pidiendo.current = false;
    void cargar();
  }, [cargar]);

  // Al entrar: si no hay lote de este mes y todo está configurado, se arma solo.
  useEffect(() => {
    void cargar().then((e) => {
      if (e && e.config.places && e.config.gemini && (!e.lote || e.lote.mes < e.mes_actual)) void pedirLote();
    });
  }, [cargar, pedirLote]);

  // Mientras se arma, se consulta cada 4 segundos.
  const generando = estado?.lote?.estado === "generando";
  useEffect(() => {
    if (!generando) return;
    const t = window.setInterval(() => void cargar(), 4000);
    return () => window.clearInterval(t);
  }, [generando, cargar]);

  async function cambiar(p: Prospecto, cambios: Partial<Prospecto> & { contactado_at?: string }) {
    setEstado((e) => e && { ...e, prospectos: e.prospectos.map((x) => x.id === p.id ? { ...x, ...cambios } : x) });
    const { productos: _, nombre: __, direccion: ___, tipo: ____, operativo: _____, ...guardar } = cambios as Prospecto;
    const { error: err } = await supabase.from("prospectos").update(guardar).eq("id", p.id);
    if (err) { setError("No se pudo guardar el cambio."); void cargar(); }
  }

  const prospectos = estado?.prospectos ?? [];
  const enDiagrama = prospectos.filter((p) => p.estado === "nuevo" || p.estado === "contactado");
  const pos = useMemo(() => posiciones(enDiagrama), [enDiagrama]);
  const sel = prospectos.find((p) => p.id === elegido) ?? null;
  const contactados = prospectos.filter((p) => p.estado !== "nuevo").length;
  const faltan = estado ? [!estado.config.places && "GOOGLE_PLACES_API_KEY", !estado.config.gemini && "GEMINI_API_KEY"].filter(Boolean) : [];

  return (
    <>
      <header className="pagina-cabecera">
        <div>
          <p className="suave">Ozonar · prospección</p>
          <h1>¿A quién contactar primero?</h1>
        </div>
        {estado?.lote?.estado === "listo" && enDiagrama.every((p) => p.estado !== "nuevo") && (
          <button className="boton boton-acento" onClick={() => void pedirLote()}><RefreshCw size={16} />Pedir nuevo lote</button>
        )}
      </header>

      {error && <p className="aviso-linea aviso-error">{error}</p>}
      {faltan.length > 0 && (
        <p className="aviso-linea aviso-error">Ozonar no está configurado: falta {faltan.join(" y ")} en el servidor.</p>
      )}
      {estado && !estado.config.tavily && estado.config.places && (
        <p className="aviso-linea">Sin TAVILY_API_KEY, Ozonar no lee la web de cada prospecto: las razones serán más generales.</p>
      )}

      {!estado && !error && <p className="suave">Cargando…</p>}

      {estado?.lote && (
        <section className="ozonar">
          <div className="ozonar-cabecera">
            <div>
              <span className="ozonar-etiqueta">Lote de {nombreMes(estado.lote.mes)}{estado.lote.numero > 1 ? ` · extra ${estado.lote.numero - 1}` : ""}</span>
              {estado.lote.estado === "listo" && <span className="ozonar-cuenta">{prospectos.length} prospectos · {contactados} trabajados{estado.lote.candidatos ? ` · elegidos entre ${estado.lote.candidatos} lugares` : ""}</span>}
            </div>
          </div>

          {generando && (
            <div className="ozonar-generando">
              <Loader2 size={28} className="gira" />
              <strong>Armando tu lote del mes…</strong>
              <span>Buscando en Google Maps, leyendo las webs y puntuando. Tarda alrededor de un minuto.</span>
            </div>
          )}
          {estado.lote.estado === "error" && (
            <div className="ozonar-generando">
              <strong>No se pudo armar el lote</strong>
              <span>{estado.lote.error}</span>
              <button className="boton boton-chico" onClick={() => void pedirLote()}><RefreshCw size={14} />Intentar de nuevo</button>
            </div>
          )}

          {estado.lote.estado === "listo" && (
            <div className="diagrama" onClick={(e) => e.target === e.currentTarget && setElegido(null)}>
              <div className="diagrama-centro"><img src={marca.logos.logo} alt={marca.nombre} /></div>
              {enDiagrama.map((p) => {
                const xy = pos.get(p.id)!;
                const tam = 34 + Math.round(((p.afinidad ?? 50) / 100) * 34);
                return (
                  <button key={p.id} className={`burbuja-p nivel-${nivel(p.afinidad)} ${p.exploracion ? "exploracion" : ""} ${elegido === p.id ? "elegida" : ""}`}
                    style={{ left: `${xy.x}%`, top: `${xy.y}%`, ["--t" as string]: tam }}
                    onClick={() => setElegido(p.id)} aria-label={`${p.nombre ?? "Prospecto"}, afinidad ${p.afinidad}%`} title={p.nombre ?? ""}>
                    {p.estado === "contactado" && <span className="burbuja-check"><Check size={12} /></span>}
                    {(nivel(p.afinidad) === "alta" || elegido === p.id) && <span className={`burbuja-nombre ${xy.x > 50 ? "derecha" : "izquierda"}`}>{p.nombre}</span>}
                  </button>
                );
              })}
              {enDiagrama.length === 0 && <p className="diagrama-vacio">Trabajaste todo el lote. Pide uno nuevo o espera al día 1.</p>}
              {sel && <TarjetaProspecto p={sel} onCerrar={() => setElegido(null)} onCambiar={(c) => void cambiar(sel, c)} onConvertir={(c) => setConvirtiendo({ p: sel, c })} />}
            </div>
          )}

          {estado.lote.estado === "listo" && (
            <div className="diagrama-leyenda">
                <span><i className="punto nivel-alta" />Afinidad alta (80+)</span>
                <span><i className="punto nivel-media" />Media (50–79)</span>
                <span><i className="punto nivel-baja" />Baja (&lt;50)</span>
                <span><i className="punto punteado" />Exploración</span>
                <span><i className="punto contactado" />Contactado</span>
              </div>
          )}

          {estado.lote.estado === "listo" && prospectos.length > 0 && (
            <ul className="ozonar-lista">
              {prospectos.map((p) => (
                <li key={p.id}>
                  <button onClick={() => p.estado === "nuevo" || p.estado === "contactado" ? setElegido(p.id) : undefined} className={`ozonar-fila estado-${p.estado}`}>
                    <span className={`afinidad nivel-${nivel(p.afinidad)}`}>{p.afinidad ?? "—"}</span>
                    <span className="ozonar-fila-texto">
                      <strong>{p.nombre ?? "Prospecto"}</strong>
                      <span className="suave pequeño">{[p.tipo ?? p.segmento, p.zona].filter(Boolean).join(" · ")}{p.exploracion ? " · exploración" : ""}</span>
                      {p.estado !== "nuevo" && (
                        <span className="ozonar-fila-estado">
                          {p.estado === "contactado" && <span className="hecho-ok"><Check size={13} />Contactado</span>}
                          {p.estado === "convertido" && "Ahora es cliente"}
                          {p.estado === "descartado" && `Quitado: ${p.motivo_descarte ?? ""}`}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {convirtiendo && (
        <ClienteFormulario
          inicial={inicialDesde(convirtiendo.p, convirtiendo.c)}
          onCerrar={() => setConvirtiendo(null)}
          onGuardado={(id) => {
            const p = convirtiendo.p;
            setConvirtiendo(null);
            setElegido(null);
            // Ligar el cliente al prospecto: un disparador lo marca como «convertido».
            void supabase.from("clientes").update({ prospecto_id: p.id }).eq("id", id).then(() => cargar());
          }}
        />
      )}
    </>
  );
}

/** Datos para el formulario de cliente a partir del prospecto. */
function inicialDesde(p: Prospecto, c: Contacto | null) {
  const [distrito, depto] = (p.zona ?? "").split(",").map((x) => x.trim());
  const enLima = depto === "Lima";
  return {
    institucion: c?.nombre ?? p.nombre ?? "",
    telefono: c?.telefono ?? "",
    email: p.correo ?? "",
    pais: "Perú",
    departamento: enLima ? "Lima" : distrito || null,
    provincia: enLima ? "Lima" : null,
    distrito: enLima ? distrito : null,
    notas: [p.razon, p.servicios && `Servicios: ${p.servicios}`, c?.web && `Web: ${c.web}`].filter(Boolean).join("\n"),
  };
}

function TarjetaProspecto({ p, onCerrar, onCambiar, onConvertir }: {
  p: Prospecto;
  onCerrar: () => void;
  onCambiar: (c: Partial<Prospecto> & { contactado_at?: string }) => void;
  onConvertir: (c: Contacto | null) => void;
}) {
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [preguntar, setPreguntar] = useState(false);
  const [quitando, setQuitando] = useState(false);

  useEffect(() => {
    setContacto(null); setCargando(true); setPreguntar(false); setQuitando(false);
    api<Contacto>(`/ozonar/lugar/${encodeURIComponent(p.place_id)}`, { metodo: "GET" }).then(setContacto).catch(() => setContacto(null)).finally(() => setCargando(false));
  }, [p.place_id]);

  const digitos = (contacto?.telefono ?? "").replace(/\D/g, "");
  const celular = digitos.length === 9 && digitos.startsWith("9");
  const contactar = () => { if (p.estado === "nuevo") setPreguntar(true); };

  return (
    <div className="tarjeta-prospecto" role="dialog" aria-label={p.nombre ?? "Prospecto"}>
      <button className="icono-boton cerrar-tarjeta" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
      <div className="tp-insignias">
        <span className={`insignia nivel-${nivel(p.afinidad)}`}>Afinidad {p.afinidad ?? "—"}%</span>
        {p.exploracion && <span className="insignia exploracion">Exploración</span>}
        {p.estado === "contactado" && <span className="insignia contactado"><Check size={12} />Contactado</span>}
      </div>
      <h3>{contacto?.nombre ?? p.nombre ?? "Prospecto"}</h3>
      <p className="suave pequeño tp-lugar"><MapPin size={13} />{[contacto?.tipo ?? p.tipo ?? p.segmento, contacto?.direccion ?? p.direccion ?? p.zona].filter(Boolean).join(" · ")}</p>
      {p.razon && <p className="tp-razon">{p.razon}</p>}
      <dl className="tp-datos">
        {p.servicios && <><dt>Servicios</dt><dd>{p.servicios}</dd></>}
        <dt>Ozonoterapia</dt><dd>{p.ofrece_ozono === "si" ? "Ya la ofrece" : p.ofrece_ozono === "no" ? "No la ofrece" : "No se sabe"}</dd>
        {p.productos && <><dt>Producto sugerido</dt><dd><strong>{p.productos.nombre}</strong></dd></>}
        <dt>Teléfono</dt><dd>{cargando ? "…" : contacto?.telefono ? <>{contacto.telefono} <span className="fuente">Google Maps</span></> : "Sin teléfono publicado"}</dd>
        {p.correo && <><dt>Correo</dt><dd>{p.correo} <span className="fuente">su web</span></dd></>}
        {contacto?.resenas ? <><dt>Reseñas</dt><dd>{contacto.calificacion}★ · {contacto.resenas}</dd></> : null}
      </dl>
      <div className="tp-enlaces">
        {contacto?.web && <a href={contacto.web} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />Web</a>}
        {contacto?.maps && <a href={contacto.maps} target="_blank" rel="noopener noreferrer"><MapPin size={13} />Google Maps</a>}
        {p.fuentes.map((f, i) => <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" title={f.url}><ExternalLink size={13} />{f.titulo.slice(0, 28) || "Fuente"}</a>)}
      </div>

      {preguntar ? (
        <div className="tp-pregunta">
          <span>¿Lo contactaste?</span>
          <button className="boton boton-chico" onClick={() => { onCambiar({ estado: "contactado", contactado_at: new Date().toISOString() }); setPreguntar(false); }}><Check size={14} />Sí</button>
          <button className="boton-secundario boton-chico" onClick={() => setPreguntar(false)}>Todavía no</button>
        </div>
      ) : (
        <div className="tp-contacto">
          {celular && <a className="boton boton-wa" href={`https://wa.me/51${digitos}`} target="_blank" rel="noopener noreferrer" onClick={contactar}><MessageCircle size={16} />WhatsApp</a>}
          {contacto?.telefono && <a className="boton-secundario" href={`tel:${contacto.telefono_internacional ?? contacto.telefono}`.replace(/\s/g, "")} onClick={contactar}><Phone size={16} />Llamar</a>}
          {p.correo && <a className="boton-secundario" href={`mailto:${p.correo}`} onClick={contactar}><Mail size={16} />Correo</a>}
          {!cargando && !contacto?.telefono && !p.correo && contacto?.web && <a className="boton-secundario" href={contacto.web} target="_blank" rel="noopener noreferrer" onClick={contactar}><ExternalLink size={16} />Contactar por su web</a>}
          {p.estado === "nuevo" && <button className="enlace-chico" onClick={() => onCambiar({ estado: "contactado", contactado_at: new Date().toISOString() })}>Marcar como contactado</button>}
        </div>
      )}

      {quitando ? (
        <div className="tp-motivos">
          <span className="suave pequeño">¿Por qué lo quitas?</span>
          <div>{MOTIVOS.map((m) => <button key={m} className="chip" onClick={() => { onCambiar({ estado: "descartado", motivo_descarte: m, ...(m === "No le interesa" || m === "No es el perfil" ? { opinion: -1 } : {}) }); onCerrar(); }}>{m}</button>)}</div>
          <button className="enlace-chico" onClick={() => setQuitando(false)}>Cancelar</button>
        </div>
      ) : (
        <div className="tp-acciones">
          <div className="tp-opinion" role="group" aria-label="¿Te sirve este tipo de prospecto?">
            <button className={p.opinion === 1 ? "activo" : ""} onClick={() => onCambiar({ opinion: p.opinion === 1 ? null : 1 })} title="Me sirve este tipo de prospecto"><ThumbsUp size={16} /></button>
            <button className={p.opinion === -1 ? "activo negativo" : ""} onClick={() => onCambiar({ opinion: p.opinion === -1 ? null : -1 })} title="No me sirve este tipo"><ThumbsDown size={16} /></button>
          </div>
          <button className="boton-secundario boton-chico" onClick={() => setQuitando(true)}><X size={14} />Quitar</button>
          <button className="boton boton-chico" onClick={() => onConvertir(contacto)}><UserPlus size={14} />Convertir en cliente</button>
        </div>
      )}
      <p className="tp-nota"><Sparkles size={12} />Puntuación de la IA con datos públicos. Verifica antes de contactar.</p>
    </div>
  );
}
