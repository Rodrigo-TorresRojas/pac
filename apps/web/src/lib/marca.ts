// La marca activa sale de marcas/<MARCA> (ver vite.config.ts).
// Los tipos se toman de marcas/plantilla: todas las marcas tienen la misma forma.
import datos from "@marca/marca.json";
import isotipo from "@marca/isotipo.svg";
import logo from "@marca/logo.svg";
import logoHorizontal from "@marca/logo-horizontal.svg";
import logoHorizontalBlanco from "@marca/logo-horizontal-blanco.svg";

export const marca = {
  ...datos,
  logos: { isotipo, logo, logoHorizontal, logoHorizontalBlanco },
};

/** Aplica los colores de la marca a las variables CSS y pone el ícono de la pestaña. */
export function aplicarMarca() {
  const raiz = document.documentElement.style;
  for (const [nombre, valor] of Object.entries(marca.colores)) raiz.setProperty(`--${nombre}`, valor);

  let icono = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!icono) {
    icono = document.createElement("link");
    icono.rel = "icon";
    document.head.appendChild(icono);
  }
  icono.type = "image/svg+xml";
  icono.href = isotipo;
}
