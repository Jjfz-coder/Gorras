# Cumbres Supply — prototipo de e-commerce

Prototipo de tienda en línea de gorras premium con el mensaje
**“Make Cumbres Chingón Again”**, con envíos a los 32 estados del país.

Marca, precios, tiempos de entrega y testimonios son **ficticios**: es una
demostración de diseño, no una tienda real.

## Cómo verlo

Abre `index.html` en el navegador, o sirve la carpeta:

```bash
npx http-server . -p 8080
```

## Qué incluye

- **Hero** con la gorra en 3D real (three.js): gira sola, sigue el puntero, se puede arrastrar
  y cambia de colorway en vivo con los swatches (transición de material + vuelta completa).
- **Colección** de 4 modelos —nombrados como cumbres del país— en tarjetas con tilt 3D,
  brillo que sigue el cursor y quick-add al pasar el mouse. Clic en la tarjeta abre la
  **vista rápida** con el modelo 3D de ese colorway.
- **Bolsa lateral** con cantidades, subtotal y aviso de envío gratis desde $1,200.
- **Sección de construcción** con la Malinche girando 360° y especificaciones numeradas.
- **Mapa de cobertura** nacional con destinos y tabla de tiempos/costos por zona.
- **Newsletter** para el siguiente drop.

## Estructura

```
index.html      estructura y contenido
styles.css      tema claro, tipografía, tilt de tarjetas y layout responsivo
script.js       catálogo, bolsa, tilt, reveals, ilustración SVG de la gorra y mapa
assets/cap3d.js gorra procedural en three.js (copa, visera, costuras, bordado)
assets/vendor/  three.min.js (r149, vendorizado)
assets/         favicon, fonts.css y las tipografías en woff2
```

## Notas técnicas

- HTML, CSS y JS puros. Sin build, sin frameworks. three.js vendorizado para el 3D y
  cargado en segundo plano: la página pinta con los SVG y el 3D entra en cuanto está listo.
- La gorra 3D es 100% procedural: copa por revolución de un perfil, visera como
  superficie paramétrica en "D" con caída y curva, costuras en tubo, ojales, botón y
  bordado como textura de canvas (Jost) con bump map. Si no hay WebGL, se queda el SVG.
- Paleta clara: blanco, grises azulados y un azul acero (`--accent: #41607f`)
  como único color de acento. Todos los tokens viven en `:root`.
- La gorra es un SVG parametrizado: cada modelo cambia copa, visera, hilo,
  costuras y sombreado con variables CSS (`--crown`, `--brim`, `--thread`,
  `--stroke`, `--seam`, `--shade`). Cada instancia recibe un `id` de gradiente
  único para que los colores no se pisen entre sí.
- La silueta de México se generó a partir de datos públicos de fronteras
  (proyección equirectangular) y se simplificó a un solo `path`.
- Tipografías auto-hospedadas en `assets/fonts/` (Cormorant Garamond para
  títulos, Jost para interfaz): sin peticiones a terceros y sin FOUT.
- Respeta `prefers-reduced-motion` y funciona de 360 px hasta escritorio.
- La bolsa vive en memoria: al recargar la página se vacía.
