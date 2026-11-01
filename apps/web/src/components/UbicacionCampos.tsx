import { useEffect, useMemo, useState } from "react";

export interface Ubicacion {
  pais: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  ubigeo: string | null;
}

type Distrito = [codigo: string, nombre: string];
type Provincia = [codigo: string, nombre: string, distritos: Distrito[]];
type Departamento = [codigo: string, nombre: string, provincias: Provincia[]];

export const PERU = "Perú";
const PAISES = [PERU, "Argentina", "Bolivia", "Brasil", "Chile", "Colombia", "Costa Rica", "Ecuador", "El Salvador", "España", "Estados Unidos", "Guatemala", "Honduras", "México", "Nicaragua", "Panamá", "Paraguay", "República Dominicana", "Uruguay", "Venezuela"];
const OTRO = "__otro__";

const normal = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const buscar = <T extends [string, string, ...unknown[]]>(lista: T[] | undefined, nombre: string | null) =>
  lista?.find((x) => normal(x[1]) === normal(nombre));

/** La lista oficial se carga solo cuando hace falta (unos 50 KB). */
let cache: Promise<Departamento[]> | null = null;
const cargarUbigeo = () => (cache ??= import("../datos/ubigeo-pe.json").then((m) => m.default as unknown as Departamento[]));

/**
 * País, departamento, provincia y distrito.
 * En Perú se eligen de la lista oficial (y se guarda el ubigeo); en otros países se escriben.
 */
export function UbicacionCampos({ valor, onCambio }: { valor: Ubicacion; onCambio: (u: Ubicacion) => void }) {
  const [deps, setDeps] = useState<Departamento[] | null>(null);
  const esPeru = valor.pais === PERU;
  const paisEnLista = PAISES.includes(valor.pais);
  const [otroPais, setOtroPais] = useState(!paisEnLista);

  useEffect(() => {
    if (esPeru && !deps) void cargarUbigeo().then(setDeps);
  }, [esPeru, deps]);

  const dep = useMemo(() => buscar(deps ?? undefined, valor.departamento), [deps, valor.departamento]);
  const prov = useMemo(() => buscar(dep?.[2], valor.provincia), [dep, valor.provincia]);
  const dist = useMemo(() => buscar(prov?.[2], valor.distrito), [prov, valor.distrito]);

  const cambiar = (c: Partial<Ubicacion>) => onCambio({ ...valor, ...c });

  function elegirPais(p: string) {
    if (p === OTRO) { setOtroPais(true); return cambiar({ pais: "", departamento: null, provincia: null, distrito: null, ubigeo: null }); }
    setOtroPais(false);
    cambiar({ pais: p, departamento: null, provincia: null, distrito: null, ubigeo: null });
  }

  function elegirDepartamento(codigo: string) {
    const d = deps?.find((x) => x[0] === codigo);
    const unica = d && d[2].length === 1 ? d[2][0] : null; // Callao tiene una sola provincia
    cambiar({ departamento: d?.[1] ?? null, provincia: unica?.[1] ?? null, distrito: null, ubigeo: null });
  }

  function elegirProvincia(codigo: string) {
    const p = dep?.[2].find((x) => x[0] === codigo);
    cambiar({ provincia: p?.[1] ?? null, distrito: null, ubigeo: null });
  }

  function elegirDistrito(codigo: string) {
    const d = prov?.[2].find((x) => x[0] === codigo);
    cambiar({ distrito: d?.[1] ?? null, ubigeo: d?.[0] ?? null });
  }

  // Un valor guardado antes de la lista (por ejemplo "lima" escrito a mano) se muestra para no perderlo.
  const anterior = (texto: string | null, encontrado: unknown) =>
    texto && !encontrado ? <option value="__anterior__" disabled>{texto} (revisar)</option> : null;

  return (
    <fieldset className="ubicacion">
      <legend>Ubicación</legend>
      <div className="rejilla-2">
        <label>
          País
          <select value={otroPais ? OTRO : valor.pais} onChange={(e) => elegirPais(e.target.value)}>
            {PAISES.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value={OTRO}>Otro país…</option>
          </select>
          {otroPais && <input value={valor.pais} onChange={(e) => cambiar({ pais: e.target.value })} placeholder="Escribe el país" aria-label="Otro país" />}
        </label>

        {esPeru ? (
          <>
            <label>
              Departamento
              <select value={dep?.[0] ?? (valor.departamento ? "__anterior__" : "")} onChange={(e) => elegirDepartamento(e.target.value)} disabled={!deps}>
                <option value="">{deps ? "Elegir…" : "Cargando…"}</option>
                {anterior(valor.departamento, dep)}
                {deps?.map((d) => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
              </select>
            </label>
            <label>
              Provincia
              <select value={prov?.[0] ?? (valor.provincia ? "__anterior__" : "")} onChange={(e) => elegirProvincia(e.target.value)} disabled={!dep}>
                <option value="">{dep ? "Elegir…" : "Primero el departamento"}</option>
                {anterior(valor.provincia, prov)}
                {dep?.[2].map((p) => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
              </select>
            </label>
            <label>
              Distrito
              <select value={dist?.[0] ?? (valor.distrito ? "__anterior__" : "")} onChange={(e) => elegirDistrito(e.target.value)} disabled={!prov}>
                <option value="">{prov ? "Elegir…" : "Primero la provincia"}</option>
                {anterior(valor.distrito, dist)}
                {prov?.[2].map((d) => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              Región o estado
              <input value={valor.departamento ?? ""} onChange={(e) => cambiar({ departamento: e.target.value, ubigeo: null })} placeholder="Región Metropolitana" />
            </label>
            <label>
              Ciudad
              <input value={valor.distrito ?? ""} onChange={(e) => cambiar({ distrito: e.target.value, provincia: null, ubigeo: null })} placeholder="Santiago" />
            </label>
          </>
        )}
      </div>
    </fieldset>
  );
}

/** "Miraflores, Lima" (Perú) o "Las Condes, Santiago · Chile". */
export function textoUbicacion(u: Partial<Ubicacion>): string {
  const lugar = [u.distrito, u.provincia !== u.departamento ? u.provincia : null, u.departamento].filter(Boolean).join(", ");
  if (!u.pais || u.pais === PERU) return lugar;
  return lugar ? `${lugar} · ${u.pais}` : u.pais;
}
