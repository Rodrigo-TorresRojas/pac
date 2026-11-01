# Marcas

Cada carpeta es la identidad de una empresa. La que se usa se elige con `MARCA=<carpeta>` en el `.env` (o como build arg en Docker). Sin `MARCA`, se usa `plantilla`.

Para una empresa nueva, copia `plantilla/` con el nombre de la empresa y reemplaza sus archivos. Todos son obligatorios y deben conservar el nombre:

| Archivo | Uso |
|---|---|
| `marca.json` | Nombre, descripción, los 4 colores (hex `#RRGGBB`) y la ubicación que se propone al crear un cliente |
| `isotipo.svg` | Solo el símbolo. Ícono de la pestaña del navegador |
| `logo.svg` | Símbolo arriba y nombre abajo. Pantalla de ingreso |
| `logo-horizontal.svg` | Símbolo a la izquierda y nombre. Barra superior |
| `logo-horizontal-blanco.svg` | Igual, con el nombre en blanco, para fondos oscuros |
| `nombre.svg` | Solo el nombre |

En `marca.json`, la sección `ozonar` define el prospectador: tamaño del lote mensual, cuántos son de exploración, qué buscar en Google Maps (`busquedas`) y dónde (`zonas`, con un `peso` relativo).

Colores: `principal` (botones y enlaces), `acento` (destacados, por ejemplo clientes calientes), `texto` y `fondo`.
