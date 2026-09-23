const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { execSync } = require('child_process');
const R = '/home/user/Gorras/reconstruction', SK = '/root/.claude/skills/img2threejs';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const view = process.argv[2] || 'front', w = Number(process.argv[3] || 700), h = Number(process.argv[4] || 340);
  const cands = JSON.parse(process.argv[5]);
  for (const c of cands) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const q = Object.entries(c).map(([k, v]) => `${k}=${v}`).join('&');
    await p.goto(`http://localhost:8123/reconstruction/viewer/index.html?view=${view}&w=${w}&h=${h}&${q}`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__IMG2THREEJS_READY__ === true, null, { timeout: 60000 });
    const bbox = await p.evaluate(() => { const T = window.__IMG2THREEJS_CAPTURE__; const gl = T.renderer.getContext(); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); let x0 = W, x1 = 0, y0 = H, y1 = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (px[(y * W + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; const yy = H - 1 - y; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } } return [x0 / W, x1 / W, y0 / H, y1 / H].map(v => v.toFixed(3)); });
    const out = `${R}/renders/fit-${view}.png`;
    await p.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
    await p.close();
    let iou = '?';
    try { const j = JSON.parse(execSync(`python3 ${SK}/forge/stage4_review/diagnose_render.py --reference ${R}/views/${view}${process.argv[6]||''}.png --render ${out} --json`, { encoding: 'utf8' })); iou = `iou=${j.checks.silhouetteIoU} aspect=${j.checks.aspectRatioDelta} scale=${j.checks.scaleDelta} pass=${j.passed}`; } catch (e) { iou = 'diag-error ' + (e.stdout || '').slice(0, 200); }
    console.log(JSON.stringify(c), 'bbox', bbox.join(','), iou);
  }
  await b.close();
})();
