import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { ClienteResumen } from "../lib/tipos";

function fecha(valor: string | null) {
  if (!valor) return "—";
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", timeZone: "America/Lima" }).format(new Date(valor));
}

export function Clientes() {
  const [clientes, setClientes] = useState<ClienteResumen[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase
      .from("clientes_resumen")
      .select("id,nombre,institucion,especialidad,telefono,etapa,etapa_orden,temperatura,activo,ultima_reunion,proximo_seguimiento_fecha,proximo_seguimiento_motivo")
      .eq("activo", true)
      .order("etapa_orden")
      .order("nombre")
      .limit(100)
      .then(({ data, error }) => {
        if (error) setError("No se pudieron cargar los clientes. Revisa que tu usuario esté activo.");
        else setClientes((data ?? []) as ClienteResumen[]);
        setCargando(false);
      });
  }, []);

  return (
    <main className="contenido">
      <h1>Clientes</h1>
      {cargando && <p className="suave">Cargando…</p>}
      {error && <p className="error">{error}</p>}
      {!cargando && !error && clientes.length === 0 && (
        <div className="vacio">
          <p><strong>Todavía no hay clientes.</strong></p>
          <p className="suave">Cuando registres el primero, aparecerá aquí con su etapa y su próximo seguimiento.</p>
        </div>
      )}
      {clientes.length > 0 && (
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Institución</th>
                <th>Etapa</th>
                <th>Temperatura</th>
                <th>Última reunión</th>
                <th>Próximo seguimiento</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.nombre}</strong><div className="suave">{c.especialidad ?? ""}</div></td>
                  <td>{c.institucion ?? "—"}</td>
                  <td><span className="etiqueta">{c.etapa}</span></td>
                  <td>{c.temperatura ? <span className={`temp temp-${c.temperatura.toLowerCase()}`}>{c.temperatura === "Frio" ? "Frío" : c.temperatura}</span> : "—"}</td>
                  <td>{fecha(c.ultima_reunion)}</td>
                  <td>{c.proximo_seguimiento_fecha ? <>{fecha(c.proximo_seguimiento_fecha)}<div className="suave">{c.proximo_seguimiento_motivo}</div></> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
