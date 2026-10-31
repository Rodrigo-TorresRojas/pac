import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { ClienteResumen, Etapa } from "../lib/tipos";
import { cuando, diasHasta, nombreVisible, subtitulo, TEMPERATURAS, textoTemperatura } from "../lib/formato";
import { Temperatura } from "../components/Temperatura";
import { ClienteFormulario } from "../components/ClienteFormulario";

/** Quita tildes y mayúsculas para buscar. */
const normal = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Clientes() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [clientes, setClientes] = useState<ClienteResumen[] | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  const etapa = params.get("etapa") ?? "";
  const temp = params.get("temp") ?? "";
  const sinPaso = params.get("sin_paso") === "1";
  const inactivos = params.get("inactivos") === "1";
  const nuevo = params.get("nuevo") === "1";

  const cambiar = (clave: string, valor: string | null) => {
    const p = new URLSearchParams(params);
    if (valor) p.set(clave, valor); else p.delete(clave);
    setParams(p, { replace: true });
  };

  const cargar = useCallback(async () => {
    const [c, e] = await Promise.all([
      supabase.from("clientes_resumen").select("*").order("updated_at", { ascending: false }).limit(5000),
      supabase.from("etapas").select("id,nombre,orden,es_cierre").eq("activa", true).order("orden"),
    ]);
    if (c.error || e.error) return setError("No se pudieron cargar los clientes. Revisa tu conexión.");
    setClientes(c.data as ClienteResumen[]);
    setEtapas(e.data as Etapa[]);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const cierre = useMemo(() => new Set(etapas.filter((e) => e.es_cierre).map((e) => e.id)), [etapas]);

  const visibles = useMemo(() => {
    const q = normal(texto.trim());
    const qDigitos = texto.replace(/\D/g, "");
    return (clientes ?? []).filter((c) => {
      if (c.activo === inactivos) return false;
      if (etapa === "cierre" ? !cierre.has(c.etapa_id) : etapa && c.etapa_id !== etapa) return false;
      if (temp && (temp === "sin" ? c.temperatura : c.temperatura !== temp)) return false;
      if (sinPaso && (c.proximo_seguimiento_fecha || cierre.has(c.etapa_id))) return false;
      if (!q) return true;
      if (qDigitos.length >= 3 && (c.telefono ?? "").replace(/\D/g, "").includes(qDigitos)) return true;
      return [c.nombre, c.institucion, c.especialidad, c.distrito, c.email].some((v) => normal(v).includes(q));
    });
  }, [clientes, texto, etapa, temp, sinPaso, inactivos, cierre]);

  const totalInactivos = (clientes ?? []).filter((c) => !c.activo).length;
  const hayFiltros = Boolean(texto || etapa || temp || sinPaso);

  return (
    <>
      <header className="pagina-cabecera">
        <div>
          <p className="suave">{inactivos ? "Clientes inactivos" : "Tu cartera"}</p>
          <h1>Clientes</h1>
        </div>
        <button className="boton boton-acento" onClick={() => cambiar("nuevo", "1")}><Plus size={18} />Nuevo cliente</button>
      </header>

      <div className="filtros">
        <label className="buscador">
          <Search size={16} />
          <input type="search" placeholder="Buscar por nombre, clínica, teléfono…" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar clientes" />
        </label>
        <div className="chips" role="group" aria-label="Etapa">
          <button className={`chip ${!etapa ? "activo" : ""}`} onClick={() => cambiar("etapa", null)}>Todas</button>
          {etapas.map((e) => (
            <button key={e.id} className={`chip ${etapa === e.id || (etapa === "cierre" && e.es_cierre) ? "activo" : ""}`} onClick={() => cambiar("etapa", e.id)}>{e.nombre}</button>
          ))}
        </div>
        <select className="selector" value={temp} onChange={(e) => cambiar("temp", e.target.value || null)} aria-label="Temperatura">
          <option value="">Toda temperatura</option>
          {TEMPERATURAS.map((t) => <option key={t} value={t}>{textoTemperatura(t)}</option>)}
          <option value="sin">Sin temperatura</option>
        </select>
        <label className="interruptor"><input type="checkbox" checked={sinPaso} onChange={(e) => cambiar("sin_paso", e.target.checked ? "1" : null)} />Sin próximo paso</label>
        {(totalInactivos > 0 || inactivos) && (
          <label className="interruptor"><input type="checkbox" checked={inactivos} onChange={(e) => cambiar("inactivos", e.target.checked ? "1" : null)} />Ver inactivos ({totalInactivos})</label>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {!clientes && !error && <p className="suave">Cargando…</p>}

      {clientes && visibles.length === 0 && (
        <div className="vacio">
          {clientes.length === 0 ? (
            <>
              <p><strong>Todavía no hay clientes.</strong></p>
              <p className="suave">Registra el primero con «Nuevo cliente».</p>
            </>
          ) : (
            <>
              <p><strong>Ningún cliente coincide.</strong></p>
              {hayFiltros && <button className="boton-secundario" onClick={() => { setTexto(""); setParams(inactivos ? { inactivos: "1" } : {}, { replace: true }); }}>Quitar filtros</button>}
            </>
          )}
        </div>
      )}

      {visibles.length > 0 && (
        <div className="tabla-envoltura">
          <table className="tabla-clic">
            <thead>
              <tr><th>Cliente</th><th>Contacto</th><th>Etapa</th><th>Temperatura</th><th>Próximo paso</th></tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.id} onClick={() => navegar(`/clientes/${c.id}`)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && navegar(`/clientes/${c.id}`)}>
                  <td><strong>{nombreVisible(c)}</strong>{subtitulo(c) && <div className="suave">{subtitulo(c)}</div>}</td>
                  <td>{c.telefono ?? ""}{c.email && <div className="suave">{c.email}</div>}{!c.telefono && !c.email && "—"}</td>
                  <td><span className={`etiqueta ${cierre.has(c.etapa_id) ? "etiqueta-exito" : ""}`}>{c.etapa}</span></td>
                  <td><Temperatura valor={c.temperatura} /></td>
                  <td>
                    {c.proximo_seguimiento_fecha ? (
                      <><span className={diasHasta(c.proximo_seguimiento_fecha) < 0 ? "tono-alerta" : ""}>{cuando(c.proximo_seguimiento_fecha)}</span><div className="suave recorte">{c.proximo_seguimiento_motivo}</div></>
                    ) : cierre.has(c.etapa_id) ? <span className="suave">—</span> : <span className="tono-alerta">Sin próximo paso</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visibles.length > 0 && <p className="suave nota">{visibles.length} {visibles.length === 1 ? "cliente" : "clientes"}</p>}

      {nuevo && (
        <ClienteFormulario
          onCerrar={() => cambiar("nuevo", null)}
          onGuardado={(id) => navegar(`/clientes/${id}`)}
        />
      )}
    </>
  );
}
