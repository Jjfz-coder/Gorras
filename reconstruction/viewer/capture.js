const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const R = '/home/user/Gorras/reconstruction';
const views = { front: [700, 340], right: [669, 340], left: [700, 348], back: [669, 348], quarter: [700, 420], top: [700, 420] };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const tag = process.argv[2] || 'pass';
  for (const [v, [w, h]] of Object.entries(views)) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => console.log('PAGEERROR', e.message));
    p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
    await p.goto(`http://localhost:8123/reconstruction/viewer/index.html?view=${v}&w=${w}&h=${h}`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__IMG2THREEJS_READY__ === true, null, { timeout: 60000 });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${R}/renders/${tag}-${v}.png`, clip: { x: 0, y: 0, width: w, height: h } });
    await p.close();
  }
  await b.close(); console.log('captured', tag);
})();
