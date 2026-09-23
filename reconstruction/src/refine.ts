// Refinamientos de código sobre la fábrica generada (spec: geometryDescriptor.deformationStack).
// Se aplican a la geometría ya escalada de cada componente, por nombre, y se recalculan las normales.
import * as THREE from 'three';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function bendGeometry(geometry: THREE.BufferGeometry, fn: (p: THREE.Vector3) => void): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) { p.fromBufferAttribute(pos, i); fn(p); pos.setXYZ(i, p.x, p.y, p.z); }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
}

export function applyRefinements(root: THREE.Object3D): string[] {
  const applied: string[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const name = mesh.name;
    // visera: la extrusión está en el plano XY local (x lateral, -y hacia adelante) y el nodo la gira -90 grados en X,
    // así que la altura del mundo es la z local. Arco lateral: los extremos (x = +-0.54) bajan 0.10; la punta baja 0.04.
    if (name.startsWith('Visor')) {
      // la extrusión trae triángulos largos y delgados: se subdividen antes de doblar para que el arco sea continuo
      let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      g.deleteAttribute('normal');
      g = new TessellateModifier(0.035, 8).modify(g);
      g = mergeVertices(g, 1e-5);
      mesh.geometry.dispose(); mesh.geometry = g;
      bendGeometry(mesh.geometry, (p) => {
        // el arco crece al alejarse de la banda: junto a la copa la visera queda cosida a la banda, sin hueco
        const fromBand = Math.max(0, Math.hypot(p.x, p.y) - 0.49);
        const w = Math.min(1, fromBand / 0.12); const blend = w * w * (3 - 2 * w);
        p.z -= 0.42 * p.x * p.x * blend;
        const fwd = -p.y - 0.49; if (fwd > 0) p.z -= 0.15 * fwd * fwd;
      });
      applied.push(`${name}: tessellated to 0.035 edges, deformationStack bend (lateral 0.42*x^2 blended in over 0.12 from the band, tip 0.15*fwd^2)`);
    }
    // correa y abertura: extrusiones planas en XY local giradas 180 grados en Y; se envuelven en el círculo de la banda (r 0.51)
    if (name.startsWith('Snapback strap') || name.startsWith('Rear opening')) {
      const R = name.startsWith('Snapback strap') ? 0.53 : 0.52;
      bendGeometry(mesh.geometry, (p) => {
        const th = p.x / R;
        const x = R * Math.sin(th);
        p.z = p.z - R * (1 - Math.cos(th));
        p.x = x;
      });
      applied.push(`${name}: deformationStack bend around Y, radius ${R}`);
    }
  });
  return applied;
}
