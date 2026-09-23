// Renders de producto (respaldo sin WebGL y catálogo) a partir de la gorra reconstruida.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const OUT = '/home/user/Gorras/assets/renders';
const P = [
  { id: 'pieza', crown: '#ece8de', brim: '#e4dfd3', thread: '#1f2a44', angles: { front: .12, side: .78, back: 3.05 } },
  { id: 'orizaba', crown: '#f3f5f8', brim: '#e6eaf0', thread: '#41607f' },
  { id: 'nevado', crown: '#ced5de', brim: '#bfc8d3', thread: '#232f3e' },
  { id: 'tacana', crown: '#eae5da', brim: '#ded8ca', thread: '#4c586e' },
  { id: 'malinche', crown: '#465d78', brim: '#3a4f68', thread: '#eef1f5' },
];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8123/reconstruction/site/render.html', { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.load('700 40px "Cormorant Garamond"'));
  for (const prod of P) for (const [name, yaw] of Object.entries(prod.angles || { front: .12, side: .78 })) {
    await p.evaluate(o => renderCap(o), { crown: prod.crown, brim: prod.brim, thread: prod.thread, yaw });
    await p.waitForTimeout(2500);
    const png = await p.locator('#s').screenshot({ omitBackground: true });
    const dataUrl = await p.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = 800; c.height = Math.round(img.height * 800 / img.width);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.86);
    }, png.toString('base64'));
    fs.writeFileSync(`${OUT}/${prod.id}-${name}.webp`, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('rendered', prod.id, name);
  }
  await b.close();
})();
