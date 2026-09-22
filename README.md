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
  Mientras carga three.js se ve un render WebP del mismo modelo.
- **Colección** de 4 modelos, nombrados como cumbres del país, con renders reales del
  modelo 3D (dos ángulos, se intercambian al pasar el mouse), tilt sutil y "Agregar a la
  bolsa" al hover. Clic en la imagen abre la **vista rápida** con el modelo 3D de ese colorway.
- **Bolsa lateral** con cantidades, subtotal y aviso de envío gratis desde $1,200.
- **Sección de construcción** con la Malinche girando 360° y especificaciones numeradas.
- **Mapa de cobertura** nacional con destinos y tabla de tiempos/costos por zona.
- **Newsletter** para el siguiente drop.

## Landing tipo Acne Studios

`landing.html` es una portada alternativa: el wordmark **Cumbres Supply** ocupa todo el
ancho de la pantalla y, al hacer scroll, se queda contigo mientras se encoge hasta
convertirse en el logo del header (sólo `transform`, calculado por frame a partir de
`scrollY`). Debajo, portada 3D, tiles editoriales, la colección en cuatro y una banda de campaña.
Las fotos de personas con gorra son **provisionales** (Pexels, licencia libre), enlazadas
directamente desde `images.pexels.com`; sustitúyelas por la fotografía real de la marca.

## Estructura

```
index.html       tienda: estructura y contenido
landing.html     portada tipo Acne (landing.css, landing.js)
styles.css       tema claro, tipografía, tokens de movimiento y layout responsivo
script.js        catálogo, bolsa, configurador, vista rápida y mapa
assets/cap3d.js  gorra procedural en three.js (copa, visera, costuras, bordado, suede)
assets/renders/  renders WebP del modelo 3D por colorway (frente y tres cuartos)
assets/vendor/   three.min.js (r149, vendorizado)
assets/          favicon, fonts.css y las tipografías en woff2
```

## Notas técnicas

- HTML, CSS y JS puros. Sin build, sin frameworks. three.js vendorizado para el 3D y
  cargado en segundo plano: la página pinta con los SVG y el 3D entra en cuanto está listo.
- La gorra 3D es 100% procedural: copa por revolución de un perfil, visera como
  superficie paramétrica en "D" con caída y curva, costuras en tubo, pespunte en la
  visera, ojales, botón, snapback trasero y bordado como textura de canvas (Jost) con
  relieve. Si no hay WebGL, se queda el SVG.
- Acabado **suede**: `MeshPhysicalMaterial` con roughness 1, casi sin especular y
  `sheen` alto (BRDF "Charlie" para telas), mapa de normales de ruido para el pelo,
  una capa fresnel de pelusa sobre la copa y un entorno de estudio procedural
  (equirectangular → PMREM) para que el sheen tenga luz ambiente a la que responder.
- Animación: entrada con subida y giro, vaivén + flotación en reposo, inclinación con el
  puntero, arrastre con inercia al soltar, giro con el scroll y vuelta completa con
  transición de material al cambiar de colorway.
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
- Diseño revisado con `frontend-design`, `taste-skill`, `awesome-design-md` (Apple y Nike
  como referencias de comercio) y los skills de animación de Emil Kowalski: superficies
  cuadradas sin sombra (la única sombra es la del producto), píldoras sólo en lo
  interactivo, sentence case en toda la interfaz, sin guiones largos ni etiquetas
  numeradas, un solo momento de entrada (el hero) y curvas de easing fuertes con
  duraciones de UI por debajo de 300 ms.
- Respeta `prefers-reduced-motion` y funciona de 360 px hasta escritorio.
- La bolsa vive en memoria: al recargar la página se vacía.
