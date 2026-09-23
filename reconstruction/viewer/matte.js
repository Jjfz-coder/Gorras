// Deriva un mate de silueta: crece la región de fondo desde las esquinas siguiendo el degradado suave del
// estudio; lo que no es fondo es la gorra. El fondo se sustituye por gris medio; los píxeles del objeto no cambian.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const R = '/home/user/Gorras/reconstruction';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:8123/reconstruction/viewer/index.html', { waitUntil: 'load' });
  for (const v of ['front', 'right', 'left', 'back']) {
    const res = await p.evaluate(async (v) => {
      const img = new Image(); img.src = `/reconstruction/views/${v}.png`; await img.decode();
      const W = img.width, H = img.height; const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, W, H); const px = d.data;
      const lum = i => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const sat = i => Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);
      // modelo de fondo por fila: media de los 3 px extremos de cada fila (el sweep es un degradado vertical)
      const bgRow = new Float32Array(H);
      for (let yy = 0; yy < H; yy++) { let sum = 0, n = 0; for (let xx = 0; xx < 3; xx++) { sum += lum((yy * W + xx) * 4) + lum((yy * W + (W - 1 - xx)) * 4); n += 2; } bgRow[yy] = sum / n; }
      const cand = new Uint8Array(W * H);
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { const k = yy * W + xx; const i = k * 4; if (Math.abs(lum(i) - bgRow[yy]) <= 5 && sat(i) <= 10) cand[k] = 1; }
      // solo cuenta como fondo lo conectado con el borde
      const bg = new Uint8Array(W * H); const q = [];
      const push = (xx, yy) => { const k = yy * W + xx; if (xx < 0 || yy < 0 || xx >= W || yy >= H || bg[k] || !cand[k]) return; bg[k] = 1; q.push(k); };
      for (let xx = 0; xx < W; xx++) { push(xx, 0); push(xx, H - 1); } for (let yy = 0; yy < H; yy++) { push(0, yy); push(W - 1, yy); }
      while (q.length) { const k = q.pop(); const xx = k % W, yy = (k / W) | 0; push(xx + 1, yy); push(xx - 1, yy); push(xx, yy + 1); push(xx, yy - 1); }
      // cierre: rellena huecos pequeños de fondo dentro del objeto (componentes de fondo no conectadas a los bordes ya no existen por construcción)
      // suavizado morfológico simple: erosiona/dilata el objeto 2 px para quitar hilos
      const obj = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) obj[i] = bg[i] ? 0 : 1;
      const morph = (src, val) => { const out = new Uint8Array(W * H); for (let yy = 1; yy < H - 1; yy++) for (let xx = 1; xx < W - 1; xx++) { let hit = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (src[(yy + dy) * W + xx + dx] === val) hit = 1; out[yy * W + xx] = val ? hit : (hit ? 0 : 1); } return out; };
      let m = morph(morph(obj, 0), 1); // apertura
      // elimina motas: componentes de objeto menores al 0.5% del área
      const lab = new Int32Array(W * H).fill(-1); const sizes = []; const st = [];
      for (let k0 = 0; k0 < W * H; k0++) { if (!m[k0] || lab[k0] >= 0) continue; const id = sizes.length; sizes.push(0); lab[k0] = id; st.push(k0); while (st.length) { const k = st.pop(); sizes[id]++; const xx = k % W, yy = (k / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = xx + dx, ny = yy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const nk = ny * W + nx; if (m[nk] && lab[nk] < 0) { lab[nk] = id; st.push(nk); } } } }
      for (let k = 0; k < W * H; k++) if (m[k] && sizes[lab[k]] < 0.005 * W * H) m[k] = 0;
      let area = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { const k = yy * W + xx; if (m[k]) { area++; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } else { px[k * 4] = 128; px[k * 4 + 1] = 128; px[k * 4 + 2] = 128; } }
      x.putImageData(d, 0, 0);
      return { png: c.toDataURL('image/png'), area: (area / (W * H)).toFixed(3), bbox: [x0 / W, y0 / H, x1 / W, y1 / H].map(v => v.toFixed(3)) };
    }, v);
    fs.writeFileSync(`${R}/views/${v}-matte.png`, Buffer.from(res.png.split(',')[1], 'base64'));
    console.log(v, 'area', res.area, 'bbox', res.bbox.join(','));
  }
  await b.close();
})();
