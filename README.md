# Cumbres Supply — prototipo de e-commerce

Prototipo de tienda en línea de gorras premium con el mensaje
**“Make Cumbres Chingón Again”**, con envíos a todo México.

Marca, precios, tiempos de entrega y testimonios son **ficticios**: es una
demostración de diseño, no una tienda real.

## Cómo verlo

Abre `index.html` en el navegador, o sirve la carpeta:

```bash
npx http-server . -p 8080
```

## Qué incluye

- **Hero** con la gorra ilustrada en SVG (sin fotos, sin dependencias).
- **Colección** de 4 modelos con precios en MXN y botón de agregar.
- **Bolsa lateral** con cantidades, subtotal y aviso de envío gratis desde $1,200.
- **Sección de construcción** con especificaciones del bordado y materiales.
- **Mapa de cobertura** de México con destinos y tabla de tiempos/costos por zona.
- **Newsletter** para el siguiente drop.

## Estructura

```
index.html      estructura y contenido
styles.css      tema oscuro, tipografía y layout responsivo
script.js       catálogo, bolsa, ilustración SVG de la gorra y mapa
assets/         favicon
```

## Notas técnicas

- HTML, CSS y JS puros. Sin build, sin frameworks.
- La gorra es un SVG parametrizado: cada modelo cambia copa, visera e hilo
  con variables CSS (`--crown`, `--brim`, `--thread`).
- La silueta de México se generó a partir de datos públicos de fronteras
  (proyección equirectangular) y se simplificó a un solo `path`.
- Tipografías vía Google Fonts (Bebas Neue + Inter) con fallback del sistema.
- Respeta `prefers-reduced-motion` y funciona de 360 px hasta escritorio.
- La bolsa vive en memoria: al recargar la página se vacía.
