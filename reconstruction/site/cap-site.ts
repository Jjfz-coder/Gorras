/* ============================================================
   Gorra reconstruida (img2threejs) para el sitio.
   Expone window.Cap3D con la misma interfaz que el modelo anterior:
     Cap3D.supported
     Cap3D.mount(el, { crown, brim, thread, spin, tilt, yaw, still, scale })
       -> { setColors(next), spin(dx), dispose() }
   y window.THREE para el mapa de envíos.

   La geometría base (copa, visera, correa) sale de la fábrica generada por el
   pipeline (src/createGorraModel.ts, pasada blockout) más sus refinamientos
   documentados (src/refine.ts). Encima, esta capa del sitio añade los elementos
   del spec que el pipeline aún no emite: bordados, bandera, botón, ojales y la
   abertura trasera. Cada uno se proyecta sobre la superficie real de la copa.
   ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createGorraMakeCumbresChingonAgainModel as createModel } from '../src/createGorraModel';
import { applyRefinements } from '../src/refine';

type Colors = { crown?: string; brim?: string; thread?: string };
type MountOptions = Colors & { spin?: boolean; tilt?: number; yaw?: number; still?: boolean; scale?: number };

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BONE_LINEAR = 0.74;          // luminancia lineal media del mapa de albedo de la sarga
const SURFACE_OFFSET = 0.004;      // separación de los parches respecto a la tela

const supported = (() => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch { return false; }
})();

/* ---------- perfil real de la copa, medido de sus vértices ---------- */
type Profile = { y0: number; y1: number; r: (y: number) => number };
function measureCrown(crown: THREE.Mesh): Profile {
  const pos = crown.geometry.attributes.position as THREE.BufferAttribute;
  const bins = 64;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i += 1) { const y = pos.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const radii = new Float32Array(bins + 1);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i), r = Math.hypot(pos.getX(i), pos.getZ(i));
    const b = Math.round(((y - y0) / (y1 - y0)) * bins);
    if (r > radii[b]) radii[b] = r;
  }
  for (let b = 1; b <= bins; b += 1) if (radii[b] === 0) radii[b] = radii[b - 1];
  return {
    y0, y1,
    r(y: number) {
      const t = Math.min(bins, Math.max(0, ((y - y0) / (y1 - y0)) * bins));
      const i = Math.floor(t), f = t - i;
      return radii[i] * (1 - f) + radii[Math.min(bins, i + 1)] * f;
    },
  };
}

/* Un parche curvo sobre la copa: rejilla en (azimut, altura) a la distancia de la tela. */
function crownPatch(profile: Profile, phiCenter: number, phiHalf: number, yA: number, yB: number, offset = SURFACE_OFFSET): THREE.BufferGeometry {
  const nu = 40, nv = 16;
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  for (let j = 0; j <= nv; j += 1) {
    const v = j / nv, y = yA + (yB - yA) * v, r = profile.r(y) + offset;
    for (let i = 0; i <= nu; i += 1) {
      const u = i / nu, phi = phiCenter - phiHalf + 2 * phiHalf * u;
      positions.push(r * Math.sin(phi), y, r * Math.cos(phi));
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < nv; j += 1) for (let i = 0; i < nu; i += 1) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    index.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/* ---------- texturas de canvas ---------- */
function textTexture(lines: string[], color: string, w: number, h: number, weight = 600): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const lineH = h / lines.length;
  const size = lineH * 0.82;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((line, i) => {
    let s = size;
    x.font = `${weight} ${s}px "Cormorant Garamond", Georgia, "Times New Roman", serif`;
    const maxW = w * 0.98;
    const mw = x.measureText(line).width;
    if (mw > maxW) { s *= maxW / mw; x.font = `${weight} ${s}px "Cormorant Garamond", Georgia, "Times New Roman", serif`; }
    // relieve del bordado: sombra corta abajo y luz arriba
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillText(line, w / 2 + 1, lineH * (i + 0.5) + 2);
    x.fillStyle = color; x.strokeStyle = color; x.lineWidth = s * 0.045; x.lineJoin = 'round';
    x.strokeText(line, w / 2, lineH * (i + 0.5)); x.fillText(line, w / 2, lineH * (i + 0.5));   // grosor de hilo
    x.globalAlpha = 0.18; x.fillStyle = '#ffffff'; x.fillText(line, w / 2, lineH * (i + 0.5) - 1.5); x.globalAlpha = 1;
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function flagTexture(): THREE.CanvasTexture {
  const w = 480, h = 300;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f2f2ee'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#1f8a4c'; x.fillRect(0, 0, w / 3, h);
  x.fillStyle = '#c8202e'; x.fillRect((2 * w) / 3, 0, w / 3, h);
  // escudo simplificado: águila parda sobre el nopal y la rama de laurel
  const cx = w / 2, cy = h / 2;
  x.fillStyle = '#2f7d3f';
  x.beginPath(); x.ellipse(cx, cy + 46, 50, 12, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#7a4a22';
  x.beginPath(); x.ellipse(cx, cy - 4, 26, 34, -0.25, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#5a3416';
  x.beginPath(); x.ellipse(cx - 20, cy - 10, 22, 12, -0.8, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(cx + 10, cy - 36, 10, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#c9a23a';
  x.beginPath(); x.moveTo(cx + 18, cy - 38); x.lineTo(cx + 30, cy - 33); x.lineTo(cx + 18, cy - 30); x.fill();
  x.strokeStyle = '#3b8f4b'; x.lineWidth = 5;
  x.beginPath(); x.arc(cx, cy + 10, 44, 0.35 * Math.PI, 0.65 * Math.PI); x.stroke();
  // orilla merrow
  x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10);
  // trama tejida
  x.globalAlpha = 0.08; x.fillStyle = '#000';
  for (let yy = 0; yy < h; yy += 4) x.fillRect(0, yy, w, 1);
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function archTexture(): THREE.CanvasTexture {
  const w = 256, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  // U invertida: rectángulo con arco superior, negro con la cinta interior impresa
  const pad = 14, top = 40, rad = (w - 2 * pad) / 2;
  x.beginPath();
  x.moveTo(pad, h); x.lineTo(pad, top + rad); x.arc(w / 2, top + rad, rad, Math.PI, 0); x.lineTo(w - pad, h); x.closePath();
  x.fillStyle = '#e4dfd3'; x.fill();                       // ribete de sarga alrededor del arco
  x.beginPath();
  const inset = 10;
  x.moveTo(pad + inset, h); x.lineTo(pad + inset, top + rad); x.arc(w / 2, top + rad, rad - inset, Math.PI, 0); x.lineTo(w - pad - inset, h); x.closePath();
  x.fillStyle = '#121317'; x.fill();
  x.fillStyle = 'rgba(160,165,175,.55)'; x.textAlign = 'center';
  x.font = '600 22px Georgia, serif'; x.fillText('ONE', w / 2, top + rad + 18);
  x.font = '600 15px Georgia, serif'; x.fillText('COMMUNITY', w / 2, top + rad + 38);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- capa del sitio: elementos del spec que la pasada blockout aún no emite ---------- */
function dressCap(model: THREE.Group, colors: Required<Colors>) {
  let crown: THREE.Mesh | null = null;
  model.traverse(o => { if ((o as THREE.Mesh).isMesh && o.name.startsWith('Crown')) crown = o as THREE.Mesh; });
  if (!crown) return null;
  const crownMesh = crown as THREE.Mesh;
  const profile = measureCrown(crownMesh);
  const H = profile.y1 - profile.y0;
  const at = (f: number) => profile.y0 + H * f;          // altura como fracción de la copa
  const layer = new THREE.Group(); layer.name = 'Site dressing';
  crownMesh.parent!.add(layer);
  layer.position.copy(crownMesh.position); layer.quaternion.copy(crownMesh.quaternion);

  const decalMat = (map: THREE.Texture, rough = 0.62) => new THREE.MeshStandardMaterial({
    map, transparent: true, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
  });

  // bordado frontal: tres líneas centradas en el panel frontal
  let frontTex = textTexture(['MAKE', 'CUMBRES', 'CHINGÓN AGAIN'], colors.thread, 1024, 480);
  const front = new THREE.Mesh(crownPatch(profile, 0, 0.62, at(0.22), at(0.74)), decalMat(frontTex));
  front.name = 'Front embroidery'; layer.add(front);

  // ONE COMMUNITY: lado izquierdo del portador (+X), tercio trasero bajo
  let sideTex = textTexture(['ONE', 'COMMUNITY'], colors.thread, 512, 220);
  const side = new THREE.Mesh(crownPatch(profile, Math.PI / 2 + 0.42, 0.34, at(0.16), at(0.40)), decalMat(sideTex));
  side.name = 'ONE COMMUNITY embroidery'; layer.add(side);

  // bandera tejida: lado derecho del portador (-X), algo en relieve
  const flag = new THREE.Mesh(crownPatch(profile, -Math.PI / 2 - 0.40, 0.21, at(0.18), at(0.44), 0.008),
    new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }));
  flag.name = 'Flag patch'; layer.add(flag);

  // abertura trasera en U invertida sobre la banda
  const arch = new THREE.Mesh(crownPatch(profile, Math.PI, 0.36, at(0.0), at(0.40), 0.003), decalMat(archTexture(), 0.85));
  arch.name = 'Rear opening'; layer.add(arch);

  // interior de la copa: forro negro visto por la abertura y desde abajo
  const liner = new THREE.Mesh(crownMesh.geometry, new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9, side: THREE.BackSide }));
  liner.name = 'Interior liner'; liner.scale.setScalar(0.992); layer.add(liner);

  // botón del ápice
  const twill = crownMesh.material as THREE.MeshPhysicalMaterial;
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.036, 24, 16), twill);
  button.scale.set(1, 0.62, 1); button.position.set(0, profile.y1 + 0.006, 0);
  button.name = 'Apex button'; layer.add(button);

  // ojales bordados en los paneles laterales y traseros
  const eyeletY = at(0.72);
  const ring = new THREE.MeshStandardMaterial({ color: 0xd8d3c6, roughness: 0.8 });
  const hole = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.9 });
  [55, 125, 235, 305].forEach((deg, i) => {
    const phi = (deg * Math.PI) / 180, r = profile.r(eyeletY) + 0.002;
    const g = new THREE.Group(); g.name = `Eyelet ${i + 1}`;
    g.position.set(r * Math.sin(phi), eyeletY, r * Math.cos(phi));
    g.lookAt(g.position.clone().multiplyScalar(2).setY(eyeletY));
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 8, 20), ring); g.add(t);
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.009, 16), hole); d.position.z = 0.001; g.add(d);
    layer.add(g);
  });

  let thread = colors.thread;
  // la tipografía del bordado puede llegar después del primer cuadro: se repinta cuando carga
  document.fonts?.load('600 64px "Cormorant Garamond"').then(() => api.setThread(thread)).catch(() => {});
  const api = {
    setThread(color: string) {
      thread = color;
      const oldF = frontTex, oldS = sideTex;
      frontTex = textTexture(['MAKE', 'CUMBRES', 'CHINGÓN AGAIN'], color, 1024, 480);
      sideTex = textTexture(['ONE', 'COMMUNITY'], color, 512, 220);
      (front.material as THREE.MeshStandardMaterial).map = frontTex;
      (side.material as THREE.MeshStandardMaterial).map = sideTex;
      (front.material as THREE.Material).needsUpdate = true; (side.material as THREE.Material).needsUpdate = true;
      oldF.dispose(); oldS.dispose();
    },
  };
  return api;
}

/* tinte sobre el mapa de albedo hueso: blanco -> hueso, marino -> marino */
function tint(material: THREE.MeshPhysicalMaterial, hex: string) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r / BONE_LINEAR); c.g = Math.min(1, c.g / BONE_LINEAR); c.b = Math.min(1, c.b / BONE_LINEAR);
  material.color.copy(c);
}

/* ---------- montaje ---------- */
function mount(el: HTMLElement, opts: MountOptions = {}) {
  const o = { crown: '#ece8de', brim: '#e4dfd3', thread: '#1f2a44', spin: false, tilt: 0.16, yaw: 0.42, still: false, scale: 1, ...opts };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!o.still });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'cap3d'; canvas.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-2.5, 4.2, 3.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xdde7f2, 1.0); rim.position.set(3.5, 2.0, -4.0); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd4db, 0.9));

  const model = createModel({ textureSize: 1024 });
  applyRefinements(model);
  // materiales propios por instancia para que copa y visera se tiñan por separado
  let crownMat: THREE.MeshPhysicalMaterial | null = null, brimMat: THREE.MeshPhysicalMaterial | null = null;
  model.traverse(obj => {
    const m = obj as THREE.Mesh; if (!m.isMesh) return;
    if (m.name.startsWith('Crown')) { crownMat = (m.material as THREE.MeshPhysicalMaterial).clone(); m.material = crownMat; }
    if (m.name.startsWith('Visor (')) { brimMat = (m.material as THREE.MeshPhysicalMaterial).clone(); m.material = brimMat; }
  });
  const dress = dressCap(model, { crown: o.crown, brim: o.brim, thread: o.thread });
  const setColors = (next: Colors) => {
    if (next.crown && crownMat) tint(crownMat, next.crown);
    if (next.brim && brimMat) tint(brimMat, next.brim);
    if (next.thread && dress) dress.setThread(next.thread);
  };
  setColors(o);

  // centrar el modelo y colgarlo de un pivote
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(center);
  const pivot = new THREE.Group(); pivot.add(model);
  const rig = new THREE.Group(); rig.add(pivot); scene.add(rig);

  // sombra de contacto suave
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sx = sc.getContext('2d')!; const gr = sx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(21,26,33,.30)'); gr.addColorStop(1, 'rgba(21,26,33,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.25, size.z * 1.05), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -size.y / 2 - 0.02; rig.add(shadow);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 40);
  // la esfera envolvente completa deja la gorra chica; el 82% basta porque la visera nunca apunta a cámara al mismo tiempo que su ancho máximo
  const radius = (size.length() / 2) * 0.82;
  el.appendChild(canvas);

  const state = { drag: 0, vel: 0, dragging: false, lastX: 0, mx: 0, my: 0, ry: o.yaw, rx: o.tilt, t0: performance.now(), visible: true, tween: 0 };
  const resize = () => {
    const r = el.getBoundingClientRect(); const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // encuadre: la esfera envolvente ocupa ~74% del lado menor, ajustado por opts.scale
    const vfov = (camera.fov * Math.PI) / 180;
    const fit = (radius / Math.sin(Math.min(vfov, 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect)) / 2)) / (0.9 * o.scale);
    camera.position.set(0, fit * 0.2, fit); camera.lookAt(0, -size.y * 0.04, 0);
    camera.updateProjectionMatrix();
  };
  resize();
  const onResize = new ResizeObserver(resize); onResize.observe(el);

  // arrastre para girar (con inercia) y paralaje del puntero
  const interactive = !o.still;
  const down = (e: PointerEvent) => { state.dragging = true; state.lastX = e.clientX; state.vel = 0; canvas.setPointerCapture(e.pointerId); };
  const moveDrag = (e: PointerEvent) => { if (!state.dragging) return; const dx = (e.clientX - state.lastX) * 0.01; state.drag += dx; state.vel = dx; state.lastX = e.clientX; };
  const up = () => { state.dragging = false; };
  const onMove = (e: PointerEvent) => { state.mx = (e.clientX / innerWidth) * 2 - 1; state.my = (e.clientY / innerHeight) * 2 - 1; };
  if (interactive) {
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', moveDrag);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    if (matchMedia('(hover:hover) and (pointer:fine)').matches) addEventListener('pointermove', onMove);
  }

  let raf = 0;
  const io = new IntersectionObserver(en => { state.visible = en.some(x => x.isIntersecting); if (state.visible && !raf) raf = requestAnimationFrame(tick); });
  io.observe(el);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  function tick() {
    raf = 0;
    const t = (performance.now() - state.t0) / 1000;
    const calm = reduceMotion || o.still;
    const u = Math.min(1, t / 1.4);
    const intro = calm ? 1 : 1 - Math.pow(1 - u, 3);
    if (!state.dragging && Math.abs(state.vel) > 0.0004) { state.drag += state.vel; state.vel *= 0.94; }
    if (state.tween !== 0) { const step = state.tween * 0.08; state.drag += step; state.tween -= step; if (Math.abs(state.tween) < 0.001) state.tween = 0; }
    const auto = calm ? 0 : (o.spin ? t * 0.26 : Math.sin(t * 0.3) * 0.4);
    const targetY = o.yaw + auto + state.drag + (calm ? 0 : state.mx * 0.3);
    const targetX = o.tilt + (calm ? 0 : state.my * 0.12 + Math.sin(t * 0.53) * 0.02);
    state.ry = calm ? targetY : lerp(state.ry, targetY, state.dragging ? 0.35 : 0.06);
    state.rx = calm ? targetX : lerp(state.rx, targetX, 0.06);
    pivot.rotation.set(state.rx, state.ry - (1 - intro) * 1.2, 0);
    const floatY = calm ? 0 : Math.sin(t * 0.9) * 0.02;
    pivot.position.y = floatY - (1 - intro) * 0.5;
    rig.scale.setScalar(0.92 + 0.08 * intro);
    (shadow.material as THREE.MeshBasicMaterial).opacity = intro;
    renderer.render(scene, camera);
    if (!el.classList.contains('is-3d')) el.classList.add('is-3d');
    if (state.visible && !(o.still && t > 0.6)) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    setColors,
    spin(dx: number) { state.tween += dx; },
    dispose() {
      cancelAnimationFrame(raf); onResize.disconnect(); io.disconnect();
      removeEventListener('pointermove', onMove);
      scene.traverse(obj => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
        mats.forEach(mt => { const s = mt as THREE.MeshStandardMaterial; s.map?.dispose(); s.dispose(); });
      });
      scene.environment?.dispose();
      renderer.dispose(); canvas.remove(); el.classList.remove('is-3d');
    },
  };
}

(window as any).THREE = THREE;
(window as any).Cap3D = { supported, mount };
