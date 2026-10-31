import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Plus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useSesion } from "../lib/sesion";
import type { ClienteResumen, Etapa, Temperatura as T } from "../lib/tipos";
import { cuando, diasHasta, hoy, inicioDeMes, nombreVisible, saludo, subtitulo, textoTemperatura } from "../lib/formato";
import { Temperatura } from "../components/Temperatura";

interface Pendiente {
  id: string;
  fecha: string;
  motivo: string;
  cliente_id: string;
  clientes: { nombre: string | null; institucion: string | null } | null;
}

const ORDEN_TEMP: Record<string, number> = { Caliente: 0, Tibio: 1, Frio: 2 };

export function Inicio() {
  const { usuario } = useSesion();
  const navegar = useNavigate();
  const [clientes, setClientes] = useState<ClienteResumen[] | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [hechosMes, setHechosMes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [c, e, p, h] = await Promise.all([
      supabase.from("clientes_resumen").select("*").limit(5000),
      supabase.from("etapas").select("id,nombre,orden,es_cierre").eq("activa", true).order("orden"),
      supabase.from("seguimientos").select("id,fecha,motivo,cliente_id,clientes(nombre,institucion)")
        .eq("hecho", false).lte("fecha", hoy()).order("fecha").limit(30),
      supabase.from("seguimientos").select("id", { count: "exact", head: true })
        .eq("hecho", true).gte("completado_at", inicioDeMes()),
    ]);
    if (c.error || e.error || p.error) return setError("No se pudieron cargar los datos. Revisa tu conexión.");
    setClientes(c.data as ClienteResumen[]);
    setEtapas(e.data as Etapa[]);
    setPendientes(p.data as unknown as Pendiente[]);
    setHechosMes(h.count ?? 0);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const m = useMemo(() => {
    if (!clientes) return null;
    const cierre = new Set(etapas.filter((e) => e.es_cierre).map((e) => e.id));
    const activos = clientes.filter((c) => c.activo);
    const abiertos = activos.filter((c) => !cierre.has(c.etapa_id));
    const mes = inicioDeMes();
    const sinPaso = abiertos
      .filter((c) => !c.proximo_seguimiento_fecha)
      .sort((a, b) => (ORDEN_TEMP[a.temperatura ?? ""] ?? 3) - (ORDEN_TEMP[b.temperatura ?? ""] ?? 3) || a.created_at.localeCompare(b.created_at));
    const temps: Record<string, number> = { Caliente: 0, Tibio: 0, Frio: 0, "": 0 };
    for (const c of abiertos) temps[c.temperatura ?? ""]++;
    return {
      enCartera: abiertos.length,
      nuevosMes: clientes.filter((c) => c.created_at >= mes).length,
      calientes: abiertos.filter((c) => c.temperatura === "Caliente").length,
      calientesSinPaso: sinPaso.filter((c) => c.temperatura === "Caliente").length,
      cerradosMes: clientes.filter((c) => c.fecha_cierre && c.fecha_cierre >= mes).length,
      cerradosTotal: clientes.filter((c) => cierre.has(c.etapa_id)).length,
      inactivos: clientes.length - activos.length,
      porEtapa: etapas.map((e) => ({ ...e, total: activos.filter((c) => c.etapa_id === e.id).length })),
      temps,
      sinPaso,
    };
  }, [clientes, etapas]);

  async function completar(id: string) {
    setPendientes((p) => p.filter((s) => s.id !== id));
    setHechosMes((n) => n + 1);
    await supabase.from("seguimientos").update({ hecho: true }).eq("id", id);
    void cargar();
  }

  const vencidos = pendientes.filter((p) => diasHasta(p.fecha) < 0).length;
  const maxEtapa = Math.max(1, ...(m?.porEtapa.map((e) => e.total) ?? [1]));
  const totalTemp = m ? Object.values(m.temps).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <header className="pagina-cabecera">
        <div>
          <p className="suave">Panel comercial</p>
          <h1>{saludo()}, {usuario.nombre.split(" ")[0]}</h1>
        </div>
        <button className="boton boton-acento" onClick={() => navegar("/clientes?nuevo=1")}><Plus size={18} />Nuevo cliente</button>
      </header>

      {error && <p className="error">{error}</p>}
      {!m && !error && <p className="suave">Cargando…</p>}

      {m && (
        <>
          <section className="kpis">
            <Link to="/clientes" className="kpi">
              <span className="kpi-valor">{m.enCartera}</span>
              <span className="kpi-titulo">En cartera</span>
              <span className="kpi-detalle">{m.nuevosMes} nuevos este mes</span>
            </Link>
            <Link to="/clientes?temp=Caliente" className="kpi">
              <span className="kpi-valor tono-acento">{m.calientes}</span>
              <span className="kpi-titulo">Oportunidades calientes</span>
              <span className={`kpi-detalle ${m.calientesSinPaso ? "tono-alerta" : ""}`}>
                {m.calientesSinPaso ? `${m.calientesSinPaso} sin próximo paso` : "Todas con próximo paso"}
              </span>
            </Link>
            <a href="#para-hoy" className="kpi">
              <span className="kpi-valor tono-principal">{pendientes.length}</span>
              <span className="kpi-titulo">Seguimientos para hoy</span>
              <span className={`kpi-detalle ${vencidos ? "tono-alerta" : ""}`}>{vencidos ? `${vencidos} atrasados` : `${hechosMes} hechos este mes`}</span>
            </a>
            <Link to="/clientes?etapa=cierre" className="kpi">
              <span className="kpi-valor tono-exito">{m.cerradosMes}</span>
              <span className="kpi-titulo">Cerrados este mes</span>
              <span className="kpi-detalle">{m.cerradosTotal} en total</span>
            </Link>
          </section>

          <section className="rejilla-paneles">
            <div className="panel">
              <h2 className="panel-titulo">Ruta de venta</h2>
              {m.porEtapa.map((e) => (
                <Link key={e.id} to={`/clientes?etapa=${e.id}`} className="barra-fila">
                  <span>{e.nombre}</span>
                  <span className="barra-pista"><span className={`barra-relleno ${e.es_cierre ? "relleno-exito" : ""}`} style={{ width: `${(e.total / maxEtapa) * 100}%`, display: e.total ? undefined : "none" }} /></span>
                  <strong>{e.total}</strong>
                </Link>
              ))}
              {m.inactivos > 0 && <p className="suave nota">{m.inactivos} inactivos no se cuentan.</p>}
            </div>
            <div className="panel">
              <h2 className="panel-titulo">Temperatura de la cartera</h2>
              {totalTemp === 0 ? <p className="suave">Sin clientes en curso.</p> : (
                <>
                  <div className="apilada">
                    {(["Caliente", "Tibio", "Frio", ""] as const).map((t) => m.temps[t] > 0 && (
                      <span key={t} className={`apilada-${t ? t.toLowerCase() : "sin"}`} style={{ flex: m.temps[t] }} />
                    ))}
                  </div>
                  <ul className="leyenda">
                    {(["Caliente", "Tibio", "Frio", ""] as const).map((t) => (
                      <li key={t}>
                        <Link to={`/clientes?temp=${t || "sin"}`}>
                          <span className={`punto apilada-${t ? t.toLowerCase() : "sin"}`} />
                          {t ? textoTemperatura(t as T) : "Sin temperatura"}
                          <strong>{m.temps[t]}</strong>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>

          <section className="rejilla-paneles">
            <div className="panel" id="para-hoy">
              <div className="panel-cabecera">
                <h2 className="panel-titulo">Para hoy</h2>
              </div>
              {pendientes.length === 0 ? (
                <div className="vacio-panel"><strong>Nada pendiente para hoy</strong><span className="suave">Los seguimientos se programan desde la ficha de cada cliente.</span></div>
              ) : (
                <ul className="lista">
                  {pendientes.map((s) => (
                    <li key={s.id} className="lista-fila">
                      <button className="check" onClick={() => void completar(s.id)} aria-label="Marcar como hecho" title="Marcar como hecho"><Check size={14} /></button>
                      <Link to={`/clientes/${s.cliente_id}`} className="lista-texto">
                        <strong>{s.clientes ? nombreVisible(s.clientes) : "Cliente"}</strong>
                        <span className="suave">{s.motivo}</span>
                      </Link>
                      <span className={diasHasta(s.fecha) < 0 ? "tono-alerta pequeño" : "suave pequeño"}>{cuando(s.fecha)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel">
              <div className="panel-cabecera">
                <h2 className="panel-titulo">Sin próximo paso</h2>
                {m.sinPaso.length > 6 && <Link to="/clientes?sin_paso=1" className="ver-todo">Ver los {m.sinPaso.length} <ArrowRight size={14} /></Link>}
              </div>
              {m.sinPaso.length === 0 ? (
                m.enCartera === 0
                  ? <div className="vacio-panel"><strong>Sin clientes en curso</strong><span className="suave">Registra clientes con «Nuevo cliente» y aparecerán aquí si les falta un seguimiento.</span></div>
                  : <div className="vacio-panel"><strong>Todos tienen un próximo paso</strong><span className="suave">Cada cliente en curso tiene un seguimiento programado.</span></div>
              ) : (
                <ul className="lista">
                  {m.sinPaso.slice(0, 6).map((c) => (
                    <li key={c.id} className="lista-fila">
                      <Link to={`/clientes/${c.id}`} className="lista-texto">
                        <strong>{nombreVisible(c)}</strong>
                        <span className="suave">{c.etapa}{subtitulo(c) ? ` · ${subtitulo(c)}` : ""}</span>
                      </Link>
                      <Temperatura valor={c.temperatura} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

        </>
      )}
    </>
  );
}
