import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Ventana emergente. Se cierra con Esc, con la X o haciendo clic fuera. */
export function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar.current();
    document.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    caja.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} ref={caja}>
        <header className="modal-cabecera">
          <h2>{titulo}</h2>
          <button className="icono-boton" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}
