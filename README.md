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

- **Hero** con la gorra ilustrada en SVG (sin fotos, sin dependencias).
- **Colección** de 4 modelos —nombrados como cumbres del país— con precios en MXN.
- **Bolsa lateral** con cantidades, subtotal y aviso de envío gratis desde $1,200.
- **Sección de construcción** con especificaciones del bordado y materiales.
- **Mapa de cobertura** nacional con destinos y tabla de tiempos/costos por zona.
- **Newsletter** para el siguiente drop.

## Estructura

```
index.html      estructura y contenido
styles.css      tema claro, tipografía y layout responsivo
script.js       catálogo, bolsa, ilustración SVG de la gorra y mapa
assets/         favicon, fonts.css y las tipografías en woff2
```

## Notas técnicas

- HTML, CSS y JS puros. Sin build, sin frameworks.
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
