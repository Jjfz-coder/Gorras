import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

// bevelEnabled defaults to true on THREE.ExtrudeGeometry and rounds every
// corner — sharp/pointed profiles (blades, fork tines, spikes) need
// bevelEnabled: false plus lineTo()-only path segments near the tip, since a
// curve command cannot produce a true converging point.
function buildExtrudeShape(points: [number, number][], holes?: [number, number][][]): THREE.Shape {
  const shape = new THREE.Shape();
  if (points.length > 0) {
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      shape.lineTo(points[i][0], points[i][1]);
    }
  }
  // Cutouts (e.g. an oval wire-cutter hole) as THREE.Path added to shape.holes —
  // dep-free boolean subtraction via the tessellator, no CSG library needed.
  for (const loop of holes ?? []) {
    if (loop.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i += 1) path.lineTo(loop[i][0], loop[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

// Build an N-gon oval loop (for hole authoring from a compact {cx,cy,rx,ry} descriptor).
function ovalLoop(cx: number, cy: number, rx: number, ry: number, seg = 24): [number, number][] {
  const loop: [number, number][] = [];
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    loop.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return loop;
}

function buildExtrudeGeometry(profile: { points: [number, number][]; depth: number; holes?: [number, number][][]; ovalHoles?: { cx: number; cy: number; rx: number; ry: number }[] }): THREE.ExtrudeGeometry {
  const holes = [...(profile.holes ?? []), ...((profile.ovalHoles ?? []).map((o) => ovalLoop(o.cx, o.cy, o.rx, o.ry)))];
  const shape = buildExtrudeShape(profile.points, holes);
  return new THREE.ExtrudeGeometry(shape, {
    depth: profile.depth,
    bevelEnabled: false,
    steps: 1,
  });
}

function buildLatheGeometry(profile: { points: [number, number][]; segments?: number }): THREE.LatheGeometry {
  const points = profile.points.map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y));
  return new THREE.LatheGeometry(points, profile.segments ?? 24);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Gorra Make Cumbres Chingon Again
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createGorraMakeCumbresChingonAgainModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Gorra Make Cumbres Chingon Again";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 40.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [0.0, 0.0, 3.0], "note": "For likeness work, solve the reference camera (forge/stage1_intake/solve_camera_pose.py) so the review render aligns with the photo and the reference can be projected. Confirm by overlay review."}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["twill-bone"] = createSculptMaterial(
    "twill-bone",
    {"id": "twill-bone", "name": "Bone cotton twill (crown, visor top, button, eyelets)", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#ECE8DE", "color": "#ECE8DE", "albedo": {"dominant": "#ECE8DE", "secondary": ["#E2DDD1", "#F3F0E8"], "samplingNotes": "sampled from reconstruction/crops"}, "colorVariation": {"palette": ["#E0DED8", "#DBD9D3", "#E7E6E1"], "pattern": "woven", "amplitude": 0.06, "heightCorrelation": 0.25}, "textureResolution": 2048, "textureProjection": {"mode": "uv", "repeat": [6.0, 6.0], "anisotropy": 8, "texelDensityIntent": "weave grain at constant object scale; do not stretch with component scale"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.06, "role": "broad tonal breakup across panels"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.12, "role": "weave direction bands and seam shading"}, {"id": "micro", "frequency": 64.0, "amplitude": 0.1, "role": "thread grain visible under grazing light"}], "roughness": {"base": 0.9, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "slightly lower roughness on convex panel crests, higher in seams"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "fine diagonal weave grain", "strength": 0.3, "scale": 48.0, "space": "tangent"}, "bump": {"pattern": "fine diagonal weave grain", "amplitude": 0.02, "scale": 48.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.35, "contactShadowBias": 0.4, "notes": "darken seams, the band under the visor and the rear opening"}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "weave-grain", "region": "all panels", "changes": "diagonal twill grain as normal/bump; roughness 0.86-0.94", "strength": 0.3, "evidenceRefs": ["view-front", "view-right"]}, {"id": "seam-shadow", "region": "along the five panel seams and the band", "changes": "ambient occlusion darkening 0.35, roughness +0.04", "strength": 0.35, "evidenceRefs": ["view-front"]}, {"id": "visor-stitch-lines", "region": "visor top: six concentric arcs from the crown edge to the tip", "changes": "painted linework in slightly darker bone (#D8D3C6) plus stitch bump 0.01", "strength": 0.4, "evidenceRefs": ["view-front", "view-right"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Bone cotton twill (crown, visor top, button, eyelets)", "referencePbr": {"usable": true, "confidence": 0.716, "estimatedFidelity": 0.716, "sourceCrop": "/home/user/Gorras/reconstruction/crops/twill-crown.png", "extractedBy": "forge/stage1_intake/extract_pbr_evidence.py", "palette": ["#E0DED8", "#DBD9D3", "#E7E6E1", "#E4E2DC", "#BDB9AD"], "maps": {"albedo": {"path": "/home/user/Gorras/reconstruction/material-evidence/twill-bone/twill-bone_albedo.png", "url": "twill-bone_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/user/Gorras/reconstruction/material-evidence/twill-bone/twill-bone_roughness.png", "url": "twill-bone_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/user/Gorras/reconstruction/material-evidence/twill-bone/twill-bone_height.png", "url": "twill-bone_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/user/Gorras/reconstruction/material-evidence/twill-bone/twill-bone_normal.png", "url": "twill-bone_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/user/Gorras/reconstruction/material-evidence/twill-bone/twill-bone_ao.png", "url": "twill-bone_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "limitation": "single-image inference, not inverse rendering"}, "textureAnalysis": {"finishClass": "plastic", "recipe": {"metalness": 0.05, "roughness": 0.6, "clearcoat": 0.2, "clearcoatRoughness": 0.3, "transmission": 0.0, "ior": 1.5, "envMapIntensity": 0.7, "anisotropy": 0.0, "procedural": "flat-clearcoat"}, "palette": ["#E5E4DF", "#E2E1DB", "#DFDDD8", "#DEDBD6", "#DBD8D3"], "appliedScalars": "observed values kept; see note", "note": "analyzer: plastic/rough 0.6 on a 120x80 crop; observed matte cotton twill with no specular hotspot, roughness kept at 0.9 (fabric)."}},
    options
  );
  materialMap["thread-navy"] = createSculptMaterial(
    "thread-navy",
    {"id": "thread-navy", "name": "Navy embroidery thread (front text, ONE COMMUNITY)", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#1F2A44", "color": "#1F2A44", "albedo": {"dominant": "#1F2A44", "secondary": ["#182238", "#2A3757"], "samplingNotes": "sampled from reconstruction/crops"}, "colorVariation": {"palette": ["#1F2A44", "#182238", "#2A3757"], "pattern": "striated", "amplitude": 0.06, "heightCorrelation": 0.25}, "textureResolution": 2048, "textureProjection": {"mode": "uv", "repeat": [6.0, 6.0], "anisotropy": 8, "texelDensityIntent": "weave grain at constant object scale; do not stretch with component scale"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.06, "role": "broad tonal breakup across panels"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.12, "role": "weave direction bands and seam shading"}, {"id": "micro", "frequency": 64.0, "amplitude": 0.1, "role": "thread grain visible under grazing light"}], "roughness": {"base": 0.6, "variation": 0.08, "map": "independent-procedural-field", "localResponse": "slightly lower roughness on convex panel crests, higher in seams"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "satin stitch ridges", "strength": 0.45, "scale": 90.0, "space": "tangent"}, "bump": {"pattern": "satin stitch ridges", "amplitude": 0.02, "scale": 90.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.35, "contactShadowBias": 0.4, "notes": "darken seams, the band under the visor and the rear opening"}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "stitch-relief", "region": "letter strokes", "changes": "raised 1-2 mm satin stitch; roughness 0.55-0.65", "strength": 0.45, "evidenceRefs": ["view-front"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Navy embroidery thread (front text, ONE COMMUNITY)", "referencePbr": {"usable": true, "confidence": 0.831, "estimatedFidelity": 0.831, "sourceCrop": "/home/user/Gorras/reconstruction/crops/thread-navy.png", "extractedBy": "forge/stage1_intake/extract_pbr_evidence.py", "palette": ["#363849", "#2D2F40", "#3F4153", "#242637", "#4C4E60"], "maps": {"albedo": {"path": "/home/user/Gorras/reconstruction/material-evidence/thread-navy/thread-navy_albedo.png", "url": "thread-navy_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/user/Gorras/reconstruction/material-evidence/thread-navy/thread-navy_roughness.png", "url": "thread-navy_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/user/Gorras/reconstruction/material-evidence/thread-navy/thread-navy_height.png", "url": "thread-navy_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/user/Gorras/reconstruction/material-evidence/thread-navy/thread-navy_normal.png", "url": "thread-navy_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/user/Gorras/reconstruction/material-evidence/thread-navy/thread-navy_ao.png", "url": "thread-navy_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "limitation": "single-image inference, not inverse rendering"}, "textureAnalysis": {"finishClass": "brushed-steel", "recipe": {"metalness": 1.0, "roughness": 0.35, "clearcoat": 0.0, "clearcoatRoughness": 0.0, "transmission": 0.0, "ior": 1.5, "envMapIntensity": 1.0, "anisotropy": 1.0, "procedural": "brushed"}, "palette": ["#93949C", "#B4B4B8", "#B2B1B7", "#B7B6B9", "#9D9CA2"], "appliedScalars": "observed values kept; see note", "note": "analyzer: brushed-steel because the crop mixes navy letters with bone background; observed satin-stitch thread, dielectric, roughness 0.6."}},
    options
  );
  materialMap["plastic-navy"] = createSculptMaterial(
    "plastic-navy",
    {"id": "plastic-navy", "name": "Navy moulded plastic (snapback strap, buckle)", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#232B4A", "color": "#232B4A", "albedo": {"dominant": "#232B4A", "secondary": ["#1B2238", "#2F3A5F"], "samplingNotes": "sampled from reconstruction/crops"}, "colorVariation": {"palette": ["#24293C", "#292E41", "#1C2030"], "pattern": "uniform", "amplitude": 0.06, "heightCorrelation": 0.25}, "textureResolution": 2048, "textureProjection": {"mode": "uv", "repeat": [6.0, 6.0], "anisotropy": 8, "texelDensityIntent": "weave grain at constant object scale; do not stretch with component scale"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.06, "role": "broad tonal breakup across panels"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.12, "role": "weave direction bands and seam shading"}, {"id": "micro", "frequency": 64.0, "amplitude": 0.1, "role": "thread grain visible under grazing light"}], "roughness": {"base": 0.45, "variation": 0.05, "map": "independent-procedural-field", "localResponse": "slightly lower roughness on convex panel crests, higher in seams"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "none", "strength": 0.05, "scale": 8.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.02, "scale": 8.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.35, "contactShadowBias": 0.4, "notes": "darken seams, the band under the visor and the rear opening"}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "hole-rims", "region": "rim of each of the seven holes", "changes": "moulding gloss on the rims, AO inside the hole", "roughness": 0.28, "strength": 0.3, "evidenceRefs": ["view-back"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Navy moulded plastic (snapback strap, buckle)", "referencePbr": {"usable": true, "confidence": 0.8, "estimatedFidelity": 0.8, "sourceCrop": "/home/user/Gorras/reconstruction/crops/strap-navy.png", "extractedBy": "forge/stage1_intake/extract_pbr_evidence.py", "palette": ["#24293C", "#292E41", "#1C2030", "#313649", "#0B0D0E"], "maps": {"albedo": {"path": "/home/user/Gorras/reconstruction/material-evidence/plastic-navy/plastic-navy_albedo.png", "url": "plastic-navy_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/user/Gorras/reconstruction/material-evidence/plastic-navy/plastic-navy_roughness.png", "url": "plastic-navy_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/user/Gorras/reconstruction/material-evidence/plastic-navy/plastic-navy_height.png", "url": "plastic-navy_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/user/Gorras/reconstruction/material-evidence/plastic-navy/plastic-navy_normal.png", "url": "plastic-navy_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/user/Gorras/reconstruction/material-evidence/plastic-navy/plastic-navy_ao.png", "url": "plastic-navy_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "limitation": "single-image inference, not inverse rendering"}, "textureAnalysis": {"finishClass": "painted-metal", "recipe": {"metalness": 0.0, "roughness": 0.5, "clearcoat": 1.0, "clearcoatRoughness": 0.05, "transmission": 0.0, "ior": 1.5, "envMapIntensity": 1.0, "anisotropy": 0.0, "procedural": "flat-clearcoat"}, "palette": ["#0B0C0B", "#242836", "#252A3E", "#23283A", "#23283B"], "appliedScalars": "observed values kept; see note", "note": "analyzer: painted-metal rough 0.5; observed moulded plastic, dielectric, roughness 0.45."}},
    options
  );
  materialMap["liner-black"] = createSculptMaterial(
    "liner-black",
    {"id": "liner-black", "name": "Black interior taping and mesh", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#15161A", "color": "#15161A", "albedo": {"dominant": "#15161A", "secondary": ["#0E0F12", "#22242A"], "samplingNotes": "sampled from reconstruction/crops"}, "colorVariation": {"palette": ["#0A0C0B", "#090B0A", "#1B1D18"], "pattern": "woven", "amplitude": 0.06, "heightCorrelation": 0.25}, "textureResolution": 2048, "textureProjection": {"mode": "uv", "repeat": [6.0, 6.0], "anisotropy": 8, "texelDensityIntent": "weave grain at constant object scale; do not stretch with component scale"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.06, "role": "broad tonal breakup across panels"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.12, "role": "weave direction bands and seam shading"}, {"id": "micro", "frequency": 64.0, "amplitude": 0.1, "role": "thread grain visible under grazing light"}], "roughness": {"base": 0.9, "variation": 0.05, "map": "independent-procedural-field", "localResponse": "slightly lower roughness on convex panel crests, higher in seams"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "fine mesh weave", "strength": 0.25, "scale": 70.0, "space": "tangent"}, "bump": {"pattern": "fine mesh weave", "amplitude": 0.02, "scale": 70.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.35, "contactShadowBias": 0.4, "notes": "darken seams, the band under the visor and the rear opening"}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "tape-print", "region": "centre of the inner rear tape", "changes": "painted decal ONE COMMUNITY in light grey (#9A9EA8), no relief", "strength": 0.6, "evidenceRefs": ["view-back"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Black interior taping and mesh", "referencePbr": {"usable": true, "confidence": 0.765, "estimatedFidelity": 0.765, "sourceCrop": "/home/user/Gorras/reconstruction/crops/interior-mesh.png", "extractedBy": "forge/stage1_intake/extract_pbr_evidence.py", "palette": ["#0A0C0B", "#090B0A", "#1B1D18"], "maps": {"albedo": {"path": "/home/user/Gorras/reconstruction/material-evidence/liner-black/liner-black_albedo.png", "url": "liner-black_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/user/Gorras/reconstruction/material-evidence/liner-black/liner-black_roughness.png", "url": "liner-black_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/user/Gorras/reconstruction/material-evidence/liner-black/liner-black_height.png", "url": "liner-black_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/user/Gorras/reconstruction/material-evidence/liner-black/liner-black_normal.png", "url": "liner-black_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/user/Gorras/reconstruction/material-evidence/liner-black/liner-black_ao.png", "url": "liner-black_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "limitation": "single-image inference, not inverse rendering"}, "textureAnalysis": {"finishClass": "worn-composite", "recipe": {"metalness": 0.0, "roughness": 0.9, "clearcoat": 0.0, "clearcoatRoughness": 0.0, "transmission": 0.0, "ior": 1.5, "envMapIntensity": 0.5, "anisotropy": 0.0, "procedural": "mottle"}, "palette": ["#1A1B17", "#0D0E0D", "#0C0C0C", "#0D0E0E", "#0B0C0B"], "appliedScalars": "observed values kept; see note", "note": "analyzer: worn-composite rough 0.9; consistent with black taping/mesh."}},
    options
  );
  materialMap["patch-flag"] = createSculptMaterial(
    "patch-flag",
    {"id": "patch-flag", "name": "Woven tricolour flag patch", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#1F8A4C", "color": "#1F8A4C", "albedo": {"dominant": "#1F8A4C", "secondary": ["#F2F2EE", "#C8202E"], "samplingNotes": "sampled from reconstruction/crops"}, "colorVariation": {"palette": ["#1F8A4C", "#F2F2EE", "#C8202E"], "pattern": "banded", "amplitude": 0.06, "heightCorrelation": 0.25}, "textureResolution": 2048, "textureProjection": {"mode": "uv", "repeat": [6.0, 6.0], "anisotropy": 8, "texelDensityIntent": "weave grain at constant object scale; do not stretch with component scale"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.06, "role": "broad tonal breakup across panels"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.12, "role": "weave direction bands and seam shading"}, {"id": "micro", "frequency": 64.0, "amplitude": 0.1, "role": "thread grain visible under grazing light"}], "roughness": {"base": 0.55, "variation": 0.08, "map": "independent-procedural-field", "localResponse": "slightly lower roughness on convex panel crests, higher in seams"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "fine woven thread", "strength": 0.35, "scale": 80.0, "space": "tangent"}, "bump": {"pattern": "fine woven thread", "amplitude": 0.02, "scale": 80.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.35, "contactShadowBias": 0.4, "notes": "darken seams, the band under the visor and the rear opening"}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "flag-bands", "region": "three equal vertical bands green / white / red with a brown-gold eagle in the centre band", "changes": "albedo decal, merrowed edge ridge 0.005", "strength": 1.0, "evidenceRefs": ["view-left"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Woven tricolour flag patch", "referencePbr": {"usable": true, "confidence": 0.86, "estimatedFidelity": 0.86, "sourceCrop": "/home/user/Gorras/reconstruction/crops/flag-patch.png", "extractedBy": "forge/stage1_intake/extract_pbr_evidence.py", "palette": ["#9B2423", "#2C6146", "#52755D", "#72503B", "#C0B0A5"], "maps": {"albedo": {"path": "/home/user/Gorras/reconstruction/material-evidence/patch-flag/patch-flag_albedo.png", "url": "patch-flag_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/user/Gorras/reconstruction/material-evidence/patch-flag/patch-flag_roughness.png", "url": "patch-flag_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/user/Gorras/reconstruction/material-evidence/patch-flag/patch-flag_height.png", "url": "patch-flag_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/user/Gorras/reconstruction/material-evidence/patch-flag/patch-flag_normal.png", "url": "patch-flag_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/user/Gorras/reconstruction/material-evidence/patch-flag/patch-flag_ao.png", "url": "patch-flag_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "limitation": "single-image inference, not inverse rendering"}, "textureAnalysis": {"finishClass": "candy-coat", "recipe": {"metalness": 0.35, "roughness": 0.18, "clearcoat": 0.6, "clearcoatRoughness": 0.15, "transmission": 0.0, "ior": 1.5, "envMapIntensity": 0.7, "anisotropy": 0.0, "procedural": "gradient-smoke"}, "palette": ["#6D8D7B", "#31694D", "#9A8A7D", "#9D2725", "#C6A49E"], "appliedScalars": "observed values kept; see note", "note": "analyzer: candy-coat metal 0.35 rough 0.18 from saturated bands; observed woven polyester patch, dielectric, roughness 0.55."}},
    options
  );
  materialMap["monogram-green"] = createSculptMaterial(
    "monogram-green",
    {"id": "monogram-green", "name": "Green script monogram thread", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#2E9E63", "color": "#2E9E63", "albedo": {"dominant": "#2E9E63", "secondary": ["#23804F", "#3FB577"], "samplingNotes": "sampled from reconstruction/crops"}, "colorVariation": {"palette": ["#2E9E63", "#23804F", "#3FB577"], "pattern": "striated", "amplitude": 0.06, "heightCorrelation": 0.25}, "textureResolution": 2048, "textureProjection": {"mode": "uv", "repeat": [6.0, 6.0], "anisotropy": 8, "texelDensityIntent": "weave grain at constant object scale; do not stretch with component scale"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.06, "role": "broad tonal breakup across panels"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.12, "role": "weave direction bands and seam shading"}, {"id": "micro", "frequency": 64.0, "amplitude": 0.1, "role": "thread grain visible under grazing light"}], "roughness": {"base": 0.6, "variation": 0.08, "map": "independent-procedural-field", "localResponse": "slightly lower roughness on convex panel crests, higher in seams"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "satin stitch ridges", "strength": 0.45, "scale": 90.0, "space": "tangent"}, "bump": {"pattern": "satin stitch ridges", "amplitude": 0.02, "scale": 90.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.35, "contactShadowBias": 0.4, "notes": "darken seams, the band under the visor and the rear opening"}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Green script monogram thread", "referencePbr": {"usable": true, "confidence": 0.855, "estimatedFidelity": 0.855, "sourceCrop": "/home/user/Gorras/reconstruction/crops/monogram-green.png", "extractedBy": "forge/stage1_intake/extract_pbr_evidence.py", "palette": ["#809D8F", "#6D9482", "#96A99F", "#B0C0B7", "#568672"], "maps": {"albedo": {"path": "/home/user/Gorras/reconstruction/material-evidence/monogram-green/monogram-green_albedo.png", "url": "monogram-green_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/user/Gorras/reconstruction/material-evidence/monogram-green/monogram-green_roughness.png", "url": "monogram-green_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/user/Gorras/reconstruction/material-evidence/monogram-green/monogram-green_height.png", "url": "monogram-green_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/user/Gorras/reconstruction/material-evidence/monogram-green/monogram-green_normal.png", "url": "monogram-green_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/user/Gorras/reconstruction/material-evidence/monogram-green/monogram-green_ao.png", "url": "monogram-green_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "limitation": "single-image inference, not inverse rendering"}, "textureAnalysis": {"finishClass": "brushed-steel", "recipe": {"metalness": 1.0, "roughness": 0.35, "clearcoat": 0.0, "clearcoatRoughness": 0.0, "transmission": 0.0, "ior": 1.5, "envMapIntensity": 1.0, "anisotropy": 1.0, "procedural": "brushed"}, "palette": ["#EDEFED", "#D6DCD7", "#D4D7D4", "#C8CFC7", "#D8D7D2"], "appliedScalars": "observed values kept; see note", "note": "analyzer: brushed-steel because the crop is mostly bone background; observed green satin thread, dielectric, roughness 0.6."}},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_root_0 = makeAttachmentEndpoint(null);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "Crown (five-panel dome)__pivot";
  node_root_0.scale.set(1, 1, 1);
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "Crown (five-panel dome)", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "A single revolved fabric shell: the dome profile varies smoothly from the band to the apex with no independent faces, so it is a lathe, never a box or sphere.", "geometryDescriptor": {"topologyIntent": "A single revolved fabric shell: the dome profile varies smoothly from the band to the apex with no independent faces, so it is a lathe, never a box or sphere.", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "lathe UVs (u around, v along profile)", "normalStrategy": "vertex normals from generated geometry", "latheProfile": {"points": [[0.52, -0.28], [0.523, -0.15], [0.518, 0.0], [0.5, 0.1], [0.462, 0.18], [0.4, 0.25], [0.3, 0.3], [0.17, 0.335], [0.0001, 0.346]], "segments": 96}}, "parent": null, "attachment": null, "dimensions": {"width": 1.0, "height": 0.62, "depth": 1.0, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "twill-bone"}}, "material": "twill-bone", "materialLayers": ["twill-bone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "panel-seams", "type": "seam line", "placement": "five meridian seams: two delimiting the front panel at +-32 degrees, two at +-108 degrees, one at the rear centre", "approximateSize": "width 0.006, full crown height", "orientation": "follows the parent surface", "materialEffect": "painted topstitch line + AO darkening + 0.004 raised ridge", "geometryEffect": "painted topstitch line + AO darkening + 0.004 raised ridge", "confidence": 0.85}, {"id": "eyelet-row", "type": "hole or socket", "placement": "four embroidered eyelets at y=0 at azimuths 55, 125, 235 and 305 degrees (side and rear panels)", "approximateSize": "outer diameter 0.032", "orientation": "follows the parent surface", "materialEffect": "raised thread ring around a dark hole", "geometryEffect": "raised thread ring around a dark hole", "confidence": 0.85}, {"id": "front-panel-flat", "type": "raised ridge", "placement": "the front panel between the two front seams is flatter and 0.02 taller than the revolved profile", "approximateSize": "width 0.48", "orientation": "follows the parent surface", "materialEffect": "geometry flattening of the lathe within the front sector", "geometryEffect": "geometry flattening of the lathe within the front sector", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["view-front", "view-left", "view-right", "view-back"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"materialClass": "fabric", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(243, 240, 232, 1.0)", "secondaryAlbedo": "rgba(226, 221, 209, 1.0)", "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(243, 240, 232, 1.0)"}, {"position": 1.0, "color": "rgba(226, 221, 209, 1.0)"}]}, "finishStyle": "matte"}};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "twill-bone"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 32, 12)
    : buildLatheGeometry({"points": [[0.52, -0.28], [0.523, -0.15], [0.518, 0.0], [0.5, 0.1], [0.462, 0.18], [0.4, 0.25], [0.3, 0.3], [0.17, 0.335], [0.0001, 0.346]], "segments": 96});
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["twill-bone"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "Crown (five-panel dome)";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "Crown (five-panel dome)", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "A single revolved fabric shell: the dome profile varies smoothly from the band to the apex with no independent faces, so it is a lathe, never a box or sphere.", "geometryDescriptor": {"topologyIntent": "A single revolved fabric shell: the dome profile varies smoothly from the band to the apex with no independent faces, so it is a lathe, never a box or sphere.", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "lathe UVs (u around, v along profile)", "normalStrategy": "vertex normals from generated geometry", "latheProfile": {"points": [[0.52, -0.28], [0.523, -0.15], [0.518, 0.0], [0.5, 0.1], [0.462, 0.18], [0.4, 0.25], [0.3, 0.3], [0.17, 0.335], [0.0001, 0.346]], "segments": 96}}, "parent": null, "attachment": null, "dimensions": {"width": 1.0, "height": 0.62, "depth": 1.0, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "twill-bone"}}, "material": "twill-bone", "materialLayers": ["twill-bone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "panel-seams", "type": "seam line", "placement": "five meridian seams: two delimiting the front panel at +-32 degrees, two at +-108 degrees, one at the rear centre", "approximateSize": "width 0.006, full crown height", "orientation": "follows the parent surface", "materialEffect": "painted topstitch line + AO darkening + 0.004 raised ridge", "geometryEffect": "painted topstitch line + AO darkening + 0.004 raised ridge", "confidence": 0.85}, {"id": "eyelet-row", "type": "hole or socket", "placement": "four embroidered eyelets at y=0 at azimuths 55, 125, 235 and 305 degrees (side and rear panels)", "approximateSize": "outer diameter 0.032", "orientation": "follows the parent surface", "materialEffect": "raised thread ring around a dark hole", "geometryEffect": "raised thread ring around a dark hole", "confidence": 0.85}, {"id": "front-panel-flat", "type": "raised ridge", "placement": "the front panel between the two front seams is flatter and 0.02 taller than the revolved profile", "approximateSize": "width 0.48", "orientation": "follows the parent surface", "materialEffect": "geometry flattening of the lathe within the front sector", "geometryEffect": "geometry flattening of the lathe within the front sector", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["view-front", "view-left", "view-right", "view-back"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"materialClass": "fabric", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(243, 240, 232, 1.0)", "secondaryAlbedo": "rgba(226, 221, 209, 1.0)", "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(243, 240, 232, 1.0)"}, {"position": 1.0, "color": "rgba(226, 221, 209, 1.0)"}]}, "finishStyle": "matte"}};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_root_0);

  const endpoint_visor_1 = makeAttachmentEndpoint(null);
  const node_visor_1 = new THREE.Group();
  node_visor_1.name = "Visor (curved plate)__pivot";
  node_visor_1.scale.set(1, 1, 1);
  if (endpoint_visor_1) {
    node_visor_1.position.copy(endpoint_visor_1.start);
    node_visor_1.rotation.set(-1.5707963267948966, 0.0, 0.0);
  } else {
    node_visor_1.position.set(0.0, -0.282, 0.0);
    node_visor_1.rotation.set(-1.5707963267948966, 0.0, 0.0);
  }
  node_visor_1.userData.sculptComponent = {"id": "visor", "name": "Visor (curved plate)", "level": "macro", "role": "plate", "importance": 0.95, "confidence": 0.9, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "A thin plate 0.02 thick, arched (hand refinement src/refine.ts, recorded in deformationStack): the plan is bounded by the crown circle (r 0.45) and a forward circle (r 0.58 centred 0.36 ahead) so the tip sits 0.42 beyond the band, the widest point is 1.16 crown widths and the plate meets the crown at its sides (about +-88 degrees), so the arched wings sweep down beside the crown as the front view shows; extruded to its thickness; the lateral arch (sides drooping 0.10) is a bend applied in form-refinement, recorded in deformationStack.", "geometryDescriptor": {"topologyIntent": "annular-sector plate with rounded tip, arched downward at the sides", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"type": "bend", "axis": "lateral", "formula": "dy = -0.42*x^2 (ends at x=+-0.54 drop 0.12)", "appliedIn": "src/refine.ts applyRefinements"}, {"type": "bend", "axis": "forward", "formula": "dy = -0.15*(fwd-0.45)^2 beyond the band (tip drops 0.04)", "appliedIn": "src/refine.ts applyRefinements"}], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "profile2D": {"points": [[-0.4878, -0.0462], [-0.5275, -0.1189], [-0.5565, -0.1964], [-0.5741, -0.2773], [-0.58, -0.3598], [-0.5741, -0.4424], [-0.5565, -0.5233], [-0.5276, -0.6008], [-0.488, -0.6735], [-0.4384, -0.7398], [-0.3799, -0.7983], [-0.3136, -0.8479], [-0.241, -0.8876], [-0.1634, -0.9165], [-0.0826, -0.9341], [0.0, -0.94], [0.0826, -0.9341], [0.1634, -0.9165], [0.241, -0.8876], [0.3136, -0.8479], [0.3799, -0.7983], [0.4384, -0.7398], [0.488, -0.6735], [0.5276, -0.6008], [0.5565, -0.5233], [0.5741, -0.4424], [0.58, -0.3598], [0.5741, -0.2773], [0.5565, -0.1964], [0.5275, -0.1189], [0.4878, -0.0462], [0.4878, -0.0463], [0.4809, -0.094], [0.4693, -0.1408], [0.4532, -0.1862], [0.4328, -0.2298], [0.4081, -0.2712], [0.3795, -0.31], [0.3472, -0.3458], [0.3115, -0.3782], [0.2728, -0.407], [0.2315, -0.4319], [0.188, -0.4525], [0.1426, -0.4688], [0.0958, -0.4805], [0.0481, -0.4876], [0.0, -0.49], [-0.0481, -0.4876], [-0.0958, -0.4805], [-0.1426, -0.4688], [-0.188, -0.4525], [-0.2315, -0.4319], [-0.2728, -0.407], [-0.3115, -0.3782], [-0.3472, -0.3458], [-0.3795, -0.31], [-0.4081, -0.2712], [-0.4328, -0.2298], [-0.4532, -0.1862], [-0.4693, -0.1408], [-0.4809, -0.094], [-0.4878, -0.0463]], "depth": 0.02}}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "band-front", "contactType": "butt", "contactNormal": [0, 0, 1], "overlap": 0.02, "gapTolerance": 0.005, "evidenceRefs": ["view-right", "view-left"]}, "dimensions": {"width": 1.0, "height": 0.02, "depth": 0.5, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, -0.282, 0], "rotation": [-1.5707963267948966, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "twill-bone"}}, "material": "twill-bone", "materialLayers": ["twill-bone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "stitch-rows", "type": "fabric stitch", "placement": "six concentric stitch arcs on the top face, 0.06 apart, following the outer edge", "approximateSize": "line width 0.003", "orientation": "follows the parent surface", "materialEffect": "painted linework in darker bone + 0.01 bump", "geometryEffect": "painted linework in darker bone + 0.01 bump", "confidence": 0.85}, {"id": "visor-edge-binding", "type": "raised ridge", "placement": "outer edge of the plate", "approximateSize": "radius 0.008", "orientation": "follows the parent surface", "materialEffect": "rounded edge treatment (chamfer segments 3)", "geometryEffect": "rounded edge treatment (chamfer segments 3)", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["view-front", "view-right", "view-left"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"materialClass": "fabric", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(243, 240, 232, 1.0)", "secondaryAlbedo": "rgba(226, 221, 209, 1.0)", "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(243, 240, 232, 1.0)"}, {"position": 1.0, "color": "rgba(226, 221, 209, 1.0)"}]}, "finishStyle": "matte"}};
  node_visor_1.userData.actionProfile = {"animationRole": "static-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "twill-bone"}};
  (nodes["root"] ?? root).add(node_visor_1);
  nodes["visor"] = node_visor_1;
  const mesh_visor_1Geometry = endpoint_visor_1
    ? new THREE.CylinderGeometry(endpoint_visor_1.endRadius, endpoint_visor_1.baseRadius, endpoint_visor_1.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.4878, -0.0462], [-0.5275, -0.1189], [-0.5565, -0.1964], [-0.5741, -0.2773], [-0.58, -0.3598], [-0.5741, -0.4424], [-0.5565, -0.5233], [-0.5276, -0.6008], [-0.488, -0.6735], [-0.4384, -0.7398], [-0.3799, -0.7983], [-0.3136, -0.8479], [-0.241, -0.8876], [-0.1634, -0.9165], [-0.0826, -0.9341], [0.0, -0.94], [0.0826, -0.9341], [0.1634, -0.9165], [0.241, -0.8876], [0.3136, -0.8479], [0.3799, -0.7983], [0.4384, -0.7398], [0.488, -0.6735], [0.5276, -0.6008], [0.5565, -0.5233], [0.5741, -0.4424], [0.58, -0.3598], [0.5741, -0.2773], [0.5565, -0.1964], [0.5275, -0.1189], [0.4878, -0.0462], [0.4878, -0.0463], [0.4809, -0.094], [0.4693, -0.1408], [0.4532, -0.1862], [0.4328, -0.2298], [0.4081, -0.2712], [0.3795, -0.31], [0.3472, -0.3458], [0.3115, -0.3782], [0.2728, -0.407], [0.2315, -0.4319], [0.188, -0.4525], [0.1426, -0.4688], [0.0958, -0.4805], [0.0481, -0.4876], [0.0, -0.49], [-0.0481, -0.4876], [-0.0958, -0.4805], [-0.1426, -0.4688], [-0.188, -0.4525], [-0.2315, -0.4319], [-0.2728, -0.407], [-0.3115, -0.3782], [-0.3472, -0.3458], [-0.3795, -0.31], [-0.4081, -0.2712], [-0.4328, -0.2298], [-0.4532, -0.1862], [-0.4693, -0.1408], [-0.4809, -0.094], [-0.4878, -0.0463]], "depth": 0.02});
  if (!endpoint_visor_1) {
    mesh_visor_1Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_visor_1 = new THREE.Mesh(
    mesh_visor_1Geometry,
    materialMap["twill-bone"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_visor_1.name = "Visor (curved plate)";
  if (endpoint_visor_1) {
    mesh_visor_1.position.copy(endpoint_visor_1.midpoint);
    mesh_visor_1.quaternion.copy(endpoint_visor_1.quaternion);
  }
  mesh_visor_1.castShadow = options.castShadow ?? true;
  mesh_visor_1.receiveShadow = options.receiveShadow ?? true;
  mesh_visor_1.userData.sculptComponent = {"id": "visor", "name": "Visor (curved plate)", "level": "macro", "role": "plate", "importance": 0.95, "confidence": 0.9, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "A thin plate 0.02 thick, arched (hand refinement src/refine.ts, recorded in deformationStack): the plan is bounded by the crown circle (r 0.45) and a forward circle (r 0.58 centred 0.36 ahead) so the tip sits 0.42 beyond the band, the widest point is 1.16 crown widths and the plate meets the crown at its sides (about +-88 degrees), so the arched wings sweep down beside the crown as the front view shows; extruded to its thickness; the lateral arch (sides drooping 0.10) is a bend applied in form-refinement, recorded in deformationStack.", "geometryDescriptor": {"topologyIntent": "annular-sector plate with rounded tip, arched downward at the sides", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"type": "bend", "axis": "lateral", "formula": "dy = -0.42*x^2 (ends at x=+-0.54 drop 0.12)", "appliedIn": "src/refine.ts applyRefinements"}, {"type": "bend", "axis": "forward", "formula": "dy = -0.15*(fwd-0.45)^2 beyond the band (tip drops 0.04)", "appliedIn": "src/refine.ts applyRefinements"}], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "profile2D": {"points": [[-0.4878, -0.0462], [-0.5275, -0.1189], [-0.5565, -0.1964], [-0.5741, -0.2773], [-0.58, -0.3598], [-0.5741, -0.4424], [-0.5565, -0.5233], [-0.5276, -0.6008], [-0.488, -0.6735], [-0.4384, -0.7398], [-0.3799, -0.7983], [-0.3136, -0.8479], [-0.241, -0.8876], [-0.1634, -0.9165], [-0.0826, -0.9341], [0.0, -0.94], [0.0826, -0.9341], [0.1634, -0.9165], [0.241, -0.8876], [0.3136, -0.8479], [0.3799, -0.7983], [0.4384, -0.7398], [0.488, -0.6735], [0.5276, -0.6008], [0.5565, -0.5233], [0.5741, -0.4424], [0.58, -0.3598], [0.5741, -0.2773], [0.5565, -0.1964], [0.5275, -0.1189], [0.4878, -0.0462], [0.4878, -0.0463], [0.4809, -0.094], [0.4693, -0.1408], [0.4532, -0.1862], [0.4328, -0.2298], [0.4081, -0.2712], [0.3795, -0.31], [0.3472, -0.3458], [0.3115, -0.3782], [0.2728, -0.407], [0.2315, -0.4319], [0.188, -0.4525], [0.1426, -0.4688], [0.0958, -0.4805], [0.0481, -0.4876], [0.0, -0.49], [-0.0481, -0.4876], [-0.0958, -0.4805], [-0.1426, -0.4688], [-0.188, -0.4525], [-0.2315, -0.4319], [-0.2728, -0.407], [-0.3115, -0.3782], [-0.3472, -0.3458], [-0.3795, -0.31], [-0.4081, -0.2712], [-0.4328, -0.2298], [-0.4532, -0.1862], [-0.4693, -0.1408], [-0.4809, -0.094], [-0.4878, -0.0463]], "depth": 0.02}}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "band-front", "contactType": "butt", "contactNormal": [0, 0, 1], "overlap": 0.02, "gapTolerance": 0.005, "evidenceRefs": ["view-right", "view-left"]}, "dimensions": {"width": 1.0, "height": 0.02, "depth": 0.5, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, -0.282, 0], "rotation": [-1.5707963267948966, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "twill-bone"}}, "material": "twill-bone", "materialLayers": ["twill-bone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "stitch-rows", "type": "fabric stitch", "placement": "six concentric stitch arcs on the top face, 0.06 apart, following the outer edge", "approximateSize": "line width 0.003", "orientation": "follows the parent surface", "materialEffect": "painted linework in darker bone + 0.01 bump", "geometryEffect": "painted linework in darker bone + 0.01 bump", "confidence": 0.85}, {"id": "visor-edge-binding", "type": "raised ridge", "placement": "outer edge of the plate", "approximateSize": "radius 0.008", "orientation": "follows the parent surface", "materialEffect": "rounded edge treatment (chamfer segments 3)", "geometryEffect": "rounded edge treatment (chamfer segments 3)", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["view-front", "view-right", "view-left"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"materialClass": "fabric", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(243, 240, 232, 1.0)", "secondaryAlbedo": "rgba(226, 221, 209, 1.0)", "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(243, 240, 232, 1.0)"}, {"position": 1.0, "color": "rgba(226, 221, 209, 1.0)"}]}, "finishStyle": "matte"}};
  node_visor_1.add(mesh_visor_1);
  meshes["visor"] = mesh_visor_1;
  colliders["visor"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_visor_1);

  const endpoint_strap_2 = makeAttachmentEndpoint(null);
  const node_strap_2 = new THREE.Group();
  node_strap_2.name = "Snapback strap__pivot";
  node_strap_2.scale.set(1, 1, 1);
  if (endpoint_strap_2) {
    node_strap_2.position.copy(endpoint_strap_2.start);
    node_strap_2.rotation.set(0.0, 3.141592653589793, 0.0);
  } else {
    node_strap_2.position.set(0.0, -0.205, -0.536);
    node_strap_2.rotation.set(0.0, 3.141592653589793, 0.0);
  }
  node_strap_2.userData.sculptComponent = {"id": "strap", "name": "Snapback strap", "level": "macro", "role": "closure", "importance": 0.85, "confidence": 0.9, "primitive": "extrude", "topologyClass": "assembled-solid", "topologyRationale": "A flat moulded plastic bar with seven round holes: a rounded-rectangle profile extruded 0.012, holes as real cutouts because they read as dark discs in the rear view.", "geometryDescriptor": {"topologyIntent": "A flat moulded plastic bar with seven round holes: a rounded-rectangle profile extruded 0.012, holes as real cutouts because they read as dark discs in the rear view.", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"type": "bend", "axis": "y", "radius": 0.53, "formula": "x -> R sin(x/R), z -> z - R(1-cos(x/R))", "appliedIn": "src/refine.ts applyRefinements"}], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "profile2D": {"points": [[0.2, 0.011], [0.1993, 0.0162], [0.1973, 0.021], [0.1941, 0.0251], [0.19, 0.0283], [0.1852, 0.0303], [0.18, 0.031], [-0.18, 0.031], [-0.1852, 0.0303], [-0.19, 0.0283], [-0.1941, 0.0251], [-0.1973, 0.021], [-0.1993, 0.0162], [-0.2, 0.011], [-0.2, -0.011], [-0.1993, -0.0162], [-0.1973, -0.021], [-0.1941, -0.0251], [-0.19, -0.0283], [-0.1852, -0.0303], [-0.18, -0.031], [0.18, -0.031], [0.1852, -0.0303], [0.19, -0.0283], [0.1941, -0.0251], [0.1973, -0.021], [0.1993, -0.0162], [0.2, -0.011]], "depth": 0.012, "ovalHoles": [{"cx": -0.15, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": -0.1, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": -0.05, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.0, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.05, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.1, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.15, "cy": 0.0, "rx": 0.011, "ry": 0.011}]}}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "band-rear", "contactType": "overlap", "contactNormal": [0, 0, -1], "overlap": 0.006, "gapTolerance": 0.004, "evidenceRefs": ["view-back"]}, "dimensions": {"width": 0.4, "height": 0.062, "depth": 0.012, "units": "relative", "confidence": 0.9}, "transform": {"position": [0.0, -0.205, -0.536], "rotation": [0, 3.141592653589793, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "plastic-navy"}}, "material": "plastic-navy", "materialLayers": ["plastic-navy"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "holes-7", "type": "hole or socket", "placement": "seven holes on the strap centreline, 0.05 apart", "approximateSize": "diameter 0.022", "orientation": "follows the parent surface", "materialEffect": "through cutouts with a moulding-gloss rim", "geometryEffect": "through cutouts with a moulding-gloss rim", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["view-back", "view-right"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"materialClass": "plastic", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(47, 58, 95, 1.0)", "secondaryAlbedo": "rgba(27, 34, 56, 1.0)", "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(47, 58, 95, 1.0)"}, {"position": 1.0, "color": "rgba(27, 34, 56, 1.0)"}]}, "finishStyle": "satin"}};
  node_strap_2.userData.actionProfile = {"animationRole": "static-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "plastic-navy"}};
  (nodes["root"] ?? root).add(node_strap_2);
  nodes["strap"] = node_strap_2;
  const mesh_strap_2Geometry = endpoint_strap_2
    ? new THREE.CylinderGeometry(endpoint_strap_2.endRadius, endpoint_strap_2.baseRadius, endpoint_strap_2.length, 32, 12)
    : buildExtrudeGeometry({"points": [[0.2, 0.011], [0.1993, 0.0162], [0.1973, 0.021], [0.1941, 0.0251], [0.19, 0.0283], [0.1852, 0.0303], [0.18, 0.031], [-0.18, 0.031], [-0.1852, 0.0303], [-0.19, 0.0283], [-0.1941, 0.0251], [-0.1973, 0.021], [-0.1993, 0.0162], [-0.2, 0.011], [-0.2, -0.011], [-0.1993, -0.0162], [-0.1973, -0.021], [-0.1941, -0.0251], [-0.19, -0.0283], [-0.1852, -0.0303], [-0.18, -0.031], [0.18, -0.031], [0.1852, -0.0303], [0.19, -0.0283], [0.1941, -0.0251], [0.1973, -0.021], [0.1993, -0.0162], [0.2, -0.011]], "depth": 0.012, "ovalHoles": [{"cx": -0.15, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": -0.1, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": -0.05, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.0, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.05, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.1, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.15, "cy": 0.0, "rx": 0.011, "ry": 0.011}]});
  if (!endpoint_strap_2) {
    mesh_strap_2Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_strap_2 = new THREE.Mesh(
    mesh_strap_2Geometry,
    materialMap["plastic-navy"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_strap_2.name = "Snapback strap";
  if (endpoint_strap_2) {
    mesh_strap_2.position.copy(endpoint_strap_2.midpoint);
    mesh_strap_2.quaternion.copy(endpoint_strap_2.quaternion);
  }
  mesh_strap_2.castShadow = options.castShadow ?? true;
  mesh_strap_2.receiveShadow = options.receiveShadow ?? true;
  mesh_strap_2.userData.sculptComponent = {"id": "strap", "name": "Snapback strap", "level": "macro", "role": "closure", "importance": 0.85, "confidence": 0.9, "primitive": "extrude", "topologyClass": "assembled-solid", "topologyRationale": "A flat moulded plastic bar with seven round holes: a rounded-rectangle profile extruded 0.012, holes as real cutouts because they read as dark discs in the rear view.", "geometryDescriptor": {"topologyIntent": "A flat moulded plastic bar with seven round holes: a rounded-rectangle profile extruded 0.012, holes as real cutouts because they read as dark discs in the rear view.", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"type": "bend", "axis": "y", "radius": 0.53, "formula": "x -> R sin(x/R), z -> z - R(1-cos(x/R))", "appliedIn": "src/refine.ts applyRefinements"}], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "profile2D": {"points": [[0.2, 0.011], [0.1993, 0.0162], [0.1973, 0.021], [0.1941, 0.0251], [0.19, 0.0283], [0.1852, 0.0303], [0.18, 0.031], [-0.18, 0.031], [-0.1852, 0.0303], [-0.19, 0.0283], [-0.1941, 0.0251], [-0.1973, 0.021], [-0.1993, 0.0162], [-0.2, 0.011], [-0.2, -0.011], [-0.1993, -0.0162], [-0.1973, -0.021], [-0.1941, -0.0251], [-0.19, -0.0283], [-0.1852, -0.0303], [-0.18, -0.031], [0.18, -0.031], [0.1852, -0.0303], [0.19, -0.0283], [0.1941, -0.0251], [0.1973, -0.021], [0.1993, -0.0162], [0.2, -0.011]], "depth": 0.012, "ovalHoles": [{"cx": -0.15, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": -0.1, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": -0.05, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.0, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.05, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.1, "cy": 0.0, "rx": 0.011, "ry": 0.011}, {"cx": 0.15, "cy": 0.0, "rx": 0.011, "ry": 0.011}]}}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "band-rear", "contactType": "overlap", "contactNormal": [0, 0, -1], "overlap": 0.006, "gapTolerance": 0.004, "evidenceRefs": ["view-back"]}, "dimensions": {"width": 0.4, "height": 0.062, "depth": 0.012, "units": "relative", "confidence": 0.9}, "transform": {"position": [0.0, -0.205, -0.536], "rotation": [0, 3.141592653589793, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "plastic-navy"}}, "material": "plastic-navy", "materialLayers": ["plastic-navy"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "holes-7", "type": "hole or socket", "placement": "seven holes on the strap centreline, 0.05 apart", "approximateSize": "diameter 0.022", "orientation": "follows the parent surface", "materialEffect": "through cutouts with a moulding-gloss rim", "geometryEffect": "through cutouts with a moulding-gloss rim", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["view-back", "view-right"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"materialClass": "plastic", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(47, 58, 95, 1.0)", "secondaryAlbedo": "rgba(27, 34, 56, 1.0)", "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(47, 58, 95, 1.0)"}, {"position": 1.0, "color": "rgba(27, 34, 56, 1.0)"}]}, "finishStyle": "satin"}};
  node_strap_2.add(mesh_strap_2);
  meshes["strap"] = mesh_strap_2;
  colliders["strap"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_strap_2);
  // repetition system "eyelet-ring" describes 4 parts that are already built individually; not instanced.

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createGorraMakeCumbresChingonAgainLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Gorra Make Cumbres Chingon Again look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"id": "key", "type": "directional", "direction": "top-front, ~35 degrees elevation, slightly camera-left", "intensity": 2.2, "color": "#FFFFFF", "notes": "soft studio key; ACES filmic tone mapping, exposure 1.0"}, {"id": "fill", "type": "hemisphere", "direction": "sky white / ground light grey", "intensity": 0.9, "color": "#F4F5F7", "notes": "broad fill from the white sweep; exposure kept at 1.0 so bone stays below clipping"}, {"id": "rim", "type": "directional", "direction": "rear-top, camera-right", "intensity": 0.6, "color": "#EEF1F5", "notes": "separates the crown from the background; tone mapping ACES"}, {"id": "environment", "type": "environment", "direction": "procedural studio softbox", "intensity": 1.0, "color": "#FFFFFF", "notes": "soft reflections on the plastic strap; contact shadow under the visor and the band (ground shadow, ambient occlusion in seams)"}];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createGorraMakeCumbresChingonAgainEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameGorraMakeCumbresChingonAgainCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createGorraMakeCumbresChingonAgainPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureGorraMakeCumbresChingonAgainRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createGorraMakeCumbresChingonAgainInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
