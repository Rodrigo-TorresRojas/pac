import { useState } from "react";
import { CalendarPlus, Check, ChevronDown, Copy, FileText, Loader2, MessageCircle, RefreshCw, Sparkles, Thermometer, Trash2 } from "lucide-react";
import type { Producto, Reunion, Temperatura as T } from "../lib/tipos";
import { cuando, textoTemperatura } from "../lib/formato";

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }).format(new Date(iso));

export function ReunionTarjeta({ reunion, analizando, temperaturaActual, telefono, productos, seguimientoCreado, onAnalizar, onAplicarTemperatura, onCrearSeguimiento, onEliminar }: {
  reunion: Reunion;
  analizando: boolean;
  temperaturaActual: T | null;
  telefono: string | null;
  productos: Producto[];
  seguimientoCreado: boolean;
  onAnalizar: () => void;
  onAplicarTemperatura: (t: T) => void;
  onCrearSeguimiento: (fecha: string, motivo: string) => void;
  onEliminar: () => void;
}) {
  const [verTexto, setVerTexto] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const a = reunion.analisis[0];
  const producto = a?.producto_sugerido_id ? productos.find((p) => p.id === a.producto_sugerido_id) : null;
  const digitos = (telefono ?? "").replace(/\D/g, "");
  const wa = a?.borrador_whatsapp && digitos.length >= 9
    ? `https://wa.me/${digitos.length === 9 ? "51" + digitos : digitos}?text=${encodeURIComponent(a.borrador_whatsapp)}`
    : null;

  async function copiar() {
    if (!a?.borrador_whatsapp) return;
    try { await navigator.clipboard.writeText(a.borrador_whatsapp); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin permiso */ }
  }

  return (
    <article className="reunion">
      <header className="reunion-cabecera">
        <div>
          <strong>{reunion.titulo || "Reunión"}</strong>
          <span className="suave pequeño">
            {fechaHora(reunion.fecha)}{reunion.duracion_min ? ` · ${reunion.duracion_min} min` : ""} · {reunion.granola_id ? "Granola" : "Registrada a mano"}
          </span>
        </div>
        <div className="reunion-acciones">
          {(reunion.transcripcion || reunion.resumen_granola) && !analizando && (
            <button className="icono-boton" onClick={onAnalizar} title="Analizar de nuevo" aria-label="Analizar de nuevo"><RefreshCw size={16} /></button>
          )}
          {confirmar ? (
            <span className="confirmar">
              ¿Eliminar reunión y análisis?
              <button className="boton-peligro" onClick={onEliminar}>Eliminar</button>
              <button className="boton-secundario boton-chico" onClick={() => setConfirmar(false)}>No</button>
            </span>
          ) : (
            <button className="icono-boton" onClick={() => setConfirmar(true)} title="Eliminar" aria-label="Eliminar reunión"><Trash2 size={16} /></button>
          )}
        </div>
      </header>

      {analizando && <p className="analizando"><Loader2 size={16} className="gira" />Analizando con IA…</p>}
      {!analizando && reunion.estado_analisis === "error" && (
        <div className="aviso" role="alert">
          <span>{reunion.error_analisis ?? "No se pudo analizar."}</span>
          <button className="boton-secundario boton-chico" onClick={onAnalizar}><RefreshCw size={14} />Analizar de nuevo</button>
        </div>
      )}
      {!analizando && !a && reunion.estado_analisis === "pendiente" && (
        <div className="aviso aviso-neutro">
          <span>Esta reunión aún no tiene análisis.</span>
          <button className="boton-secundario boton-chico" onClick={onAnalizar}><Sparkles size={14} />Analizar</button>
        </div>
      )}

      {a && !analizando && (
        <>
          <p className="reunion-resumen">{a.resumen}</p>
          <div className="reunion-detalle">
            {a.objeciones.length > 0 && (
              <section>
                <h4>Objeciones</h4>
                <ul className="objeciones">{a.objeciones.map((o) => <li key={o}>{o}</li>)}</ul>
              </section>
            )}
            {a.acuerdos && <section><h4>Acuerdos</h4><p>{a.acuerdos}</p></section>}
            {a.recomendaciones && <section><h4>Recomendaciones</h4><p>{a.recomendaciones}</p></section>}
          </div>

          <div className="sugerencias">
            <h4><Sparkles size={14} />Sugerencias de la IA</h4>
            {a.temperatura_sugerida && (
              <div className="sugerencia">
                <Thermometer size={16} />
                <span>Temperatura: <strong>{textoTemperatura(a.temperatura_sugerida)}</strong></span>
                {temperaturaActual === a.temperatura_sugerida
                  ? <span className="hecho-ok"><Check size={14} />Aplicada</span>
                  : <button className="boton-secundario boton-chico" onClick={() => onAplicarTemperatura(a.temperatura_sugerida!)}>Aplicar</button>}
              </div>
            )}
            {a.seguimiento_sugerido_fecha && (
              <div className="sugerencia">
                <CalendarPlus size={16} />
                <span><strong>{cuando(a.seguimiento_sugerido_fecha)}</strong>{a.seguimiento_sugerido_motivo ? `: ${a.seguimiento_sugerido_motivo}` : ""}</span>
                {seguimientoCreado
                  ? <span className="hecho-ok"><Check size={14} />Creado</span>
                  : <button className="boton-secundario boton-chico" onClick={() => onCrearSeguimiento(a.seguimiento_sugerido_fecha!, a.seguimiento_sugerido_motivo || "Seguimiento de la reunión")}>Crear seguimiento</button>}
              </div>
            )}
            {producto && <div className="sugerencia"><Sparkles size={16} /><span>Producto: <strong>{producto.nombre}</strong></span></div>}
            {a.borrador_whatsapp && (
              <div className="borrador">
                <p>{a.borrador_whatsapp}</p>
                <div className="borrador-acciones">
                  <button className="boton-secundario boton-chico" onClick={() => void copiar()}>{copiado ? <><Check size={14} />Copiado</> : <><Copy size={14} />Copiar</>}</button>
                  {wa && <a className="boton-secundario boton-chico" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />Abrir en WhatsApp</a>}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {(reunion.transcripcion || reunion.resumen_granola) ? (
        <>
          <button className="ver-texto" onClick={() => setVerTexto((v) => !v)} aria-expanded={verTexto}>
            <FileText size={14} />{verTexto ? "Ocultar transcripción" : "Ver transcripción"}<ChevronDown size={14} className={verTexto ? "girado" : ""} />
          </button>
          {verTexto && <div className="transcripcion">{reunion.transcripcion ?? reunion.resumen_granola}</div>}
        </>
      ) : a && <p className="suave pequeño">La transcripción se borró automáticamente a los 8 meses; el análisis se conserva.</p>}
    </article>
  );
}
