import * as THREE from 'three';
import {
  createGorraMakeCumbresChingonAgainModel as createModel,
  createGorraMakeCumbresChingonAgainLookDevLights as createLights,
  configureGorraMakeCumbresChingonAgainRenderer as configureRenderer,
} from '../src/createGorraModel';
import { applyRefinements } from '../src/refine';

declare global { interface Window { __IMG2THREEJS_READY__: boolean; __IMG2THREEJS_CAPTURE__: any; __model: THREE.Group; } }

const params = new URLSearchParams(location.search);
const W = Number(params.get('w') || 700), H = Number(params.get('h') || 340);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
configureRenderer(renderer);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const model = createModel({ textureSize: 1024 });
(window as any).__refinements = applyRefinements(model);
window.__model = model;
scene.add(model);
scene.add(createLights('reference'));
// luz clave suave de estudio (arriba-frente) y ambiente para la sombra de contacto
const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-1.5, 3.2, 3.0); scene.add(key);
const fill = new THREE.HemisphereLight(0xffffff, 0xd8d8d4, 0.9); scene.add(fill);
scene.environment = null;

const camera = new THREE.PerspectiveCamera(Number(params.get('fov') || 28), W / H, 0.05, 50);
const box = new THREE.Box3().setFromObject(model);
const center = box.getCenter(new THREE.Vector3());
const size = box.getSize(new THREE.Vector3());

// camera spec: {azimuthDeg, elevationDeg, fillWidth (0-1), look:[x,y,z]|undefined}
function setCamera(spec: { azimuthDeg?: number; elevationDeg?: number; fillWidth?: number; distance?: number; target?: number[]; targetDy?: number; fov?: number } = {}) {
  if (spec.fov) { camera.fov = spec.fov; camera.updateProjectionMatrix(); }
  const az = ((spec.azimuthDeg ?? 0) * Math.PI) / 180, el = ((spec.elevationDeg ?? 6) * Math.PI) / 180;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  // ancho aparente del objeto en esa dirección: usa la caja proyectada sobre el eje derecho de la cámara
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const extent = Math.abs(size.x * right.x) + Math.abs(size.z * right.z);
  const fill = spec.fillWidth ?? 0.86;
  const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
  const dist = spec.distance ?? (extent / fill) / (2 * Math.tan(hfov / 2)) + Math.max(size.x, size.z) * 0.25;
  const target = spec.target ? new THREE.Vector3().fromArray(spec.target) : center.clone().add(new THREE.Vector3(0, spec.targetDy ?? 0, 0));
  camera.position.copy(target).add(dir.multiplyScalar(dist));
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return { position: camera.position.toArray(), target: target.toArray(), dist };
}
window.__IMG2THREEJS_CAPTURE__ = { setCamera: async (s: any) => setCamera(s), scene, camera, renderer, model };

const view = params.get('view') || 'front';
const override: any = {};
for (const k of ['azimuthDeg', 'elevationDeg', 'fillWidth', 'targetDy', 'fov']) if (params.has(k)) override[k] = Number(params.get(k));
const VIEWS: Record<string, any> = {
  front: { azimuthDeg: 0, elevationDeg: 9, fillWidth: 0.79, targetDy: -0.09 },     // encuadre ajustado al mate frontal (Tier 1)
  right: { azimuthDeg: 90, elevationDeg: 6, fillWidth: 0.92, targetDy: -0.04 },     // lado del portador con ONE COMMUNITY (+X)
  left: { azimuthDeg: -90, elevationDeg: 6, fillWidth: 0.92, targetDy: -0.04 },     // lado del portador con la bandera (-X)
  back: { azimuthDeg: 180, elevationDeg: 8, fillWidth: 0.78, targetDy: -0.07 },
  quarter: { azimuthDeg: 38, elevationDeg: 22, fillWidth: 0.78 },
  top: { azimuthDeg: 0, elevationDeg: 80, fillWidth: 0.7 },
};
setCamera({ ...(VIEWS[view] || VIEWS.front), ...override });
// los primeros cuadros pueden salir negros mientras se compilan shaders y se suben las texturas de canvas:
// se renderizan varios cuadros antes de declarar la escena lista
let frames = 0;
function warm() { renderer.render(scene, camera); frames += 1; if (frames < 8) requestAnimationFrame(warm); else window.__IMG2THREEJS_READY__ = true; }
requestAnimationFrame(warm);
