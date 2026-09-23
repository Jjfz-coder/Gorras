// Refinamientos de código sobre la fábrica generada (spec: geometryDescriptor.deformationStack).
// Se aplican a la geometría ya escalada de cada componente, por nombre, y se recalculan las normales.
import * as THREE from 'three';

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
      bendGeometry(mesh.geometry, (p) => {
        p.z -= 0.42 * p.x * p.x;
        const fwd = -p.y - 0.49; if (fwd > 0) p.z -= 0.15 * fwd * fwd;
      });
      applied.push(`${name}: deformationStack bend (lateral 0.42*x^2, tip 0.15*fwd^2)`);
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
