/* ============================================================
   Cumbres Supply. Catálogo, bolsa, configurador 3D y vista rápida.
   Sin dependencias; three.js se carga en segundo plano.
   ============================================================ */

const products = [
  { id:'orizaba',  name:'Orizaba',  sub:'Snapback, suede blanco',     tag:'Más vendida',   price:849, crown:'#f3f5f8', brim:'#e6eaf0', thread:'#41607f' },
  { id:'nevado',   name:'Nevado',   sub:'Dad hat, suede gris',        tag:'Nuevo',         price:699, crown:'#ced5de', brim:'#bfc8d3', thread:'#232f3e' },
  { id:'tacana',   name:'Tacaná',   sub:'Trucker, suede hueso',       tag:'Edición de 300', price:779, crown:'#eae5da', brim:'#ded8ca', thread:'#4c586e' },
  { id:'malinche', name:'Malinche', sub:'5 panel, suede azul acero',  tag:'Quedan 12',     price:899, crown:'#465d78', brim:'#3a4f68', thread:'#eef1f5' }
];
const byId = id => products.find(p => p.id === id);
const render = (p, angle) => `assets/renders/${p.id}-${angle}.webp`;
const MXN = n => '$' + n.toLocaleString('es-MX') + ' MXN';
const FREE_SHIP = 1200, SHIP_COST = 129;
const finePointer = matchMedia('(hover:hover) and (pointer:fine)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_OUT = 'cubic-bezier(.23,1,.32,1)';

/* ---------- colección ---------- */
const grid = document.getElementById('grid');
grid.innerHTML = products.map(p => `
  <article class="card" data-id="${p.id}">
    <div class="card__art" tabindex="0" role="button" aria-label="Ver ${p.name}">
      <img src="${render(p, 'front')}" width="800" height="889" loading="lazy" alt="Gorra ${p.name}, ${p.sub.toLowerCase()}" />
      <img class="alt" src="${render(p, 'side')}" width="800" height="889" loading="lazy" alt="" aria-hidden="true" />
      <button class="btn card__quick" data-add="${p.id}">Agregar a la bolsa</button>
    </div>
    <div class="card__body">
      <div class="card__row"><h3 class="card__name">${p.name}</h3><span class="card__price">${MXN(p.price)}</span></div>
      <p class="card__sub"><span>${p.sub}</span><span class="card__tag">${p.tag}</span></p>
    </div>
  </article>`).join('');

/* tilt decorativo con seguimiento suavizado (sólo con puntero fino) */
if (finePointer && !reduceMotion) grid.querySelectorAll('.card__art').forEach(art => {
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, active = false;
  const step = () => {
    cx += (tx - cx) * .14; cy += (ty - cy) * .14;
    art.style.transform = `perspective(1100px) rotateX(${cy.toFixed(2)}deg) rotateY(${cx.toFixed(2)}deg)`;
    if (Math.abs(tx - cx) > .02 || Math.abs(ty - cy) > .02 || active) raf = requestAnimationFrame(step);
    else { raf = 0; if (!tx && !ty) art.style.transform = ''; }
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
  art.addEventListener('pointerenter', () => { active = true; kick(); });
  art.addEventListener('pointermove', e => {
    const r = art.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - .5) * 10;
    ty = (.5 - (e.clientY - r.top) / r.height) * 8;
  });
  art.addEventListener('pointerleave', () => { active = false; tx = 0; ty = 0; kick(); });
});

/* ---------- 3D en segundo plano; las imágenes cubren mientras carga ---------- */
const stages = {};
const loadScript = src => new Promise((ok, err) => {
  const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = err;
  document.head.appendChild(s);
});
// assets/cap3d.js trae three.js r170 y la gorra reconstruida (img2threejs) en un solo archivo
const ready3D = loadScript('assets/cap3d.js')
  .then(() => !!(window.Cap3D && Cap3D.supported))
  .catch(() => false);

ready3D.then(ok => {
  if (!ok) return;
  document.querySelectorAll('.stage[data-cap]').forEach(el => {
    try { stages[el.id] = Cap3D.mount(el, JSON.parse(el.dataset.cap)); } catch (e) { console.warn('Cap3D', e); }
  });
});

/* ---------- hero: colorway ---------- */
const swatchBox = document.getElementById('heroSwatches');
swatchBox.innerHTML = products.map((p, i) => `
  <button class="swatch" role="radio" aria-checked="${i === 0}" aria-label="${p.name}" data-swatch="${p.id}" style="--c:${p.crown}"><span></span></button>`).join('');
function pickColorway(id) {
  const p = byId(id); if (!p) return;
  swatchBox.querySelectorAll('.swatch').forEach(b => b.setAttribute('aria-checked', String(b.dataset.swatch === id)));
  document.getElementById('heroPickName').textContent = p.name;
  document.getElementById('heroPickPrice').textContent = MXN(p.price);
  const fb = document.getElementById('heroFallback');
  fb.src = render(p, 'front'); fb.alt = `Gorra ${p.name}, ${p.sub.toLowerCase()}`;
  if (stages.heroCap) { stages.heroCap.setColors(p); if (!reduceMotion) stages.heroCap.spin(Math.PI * 2); }
}
swatchBox.addEventListener('click', e => { const b = e.target.closest('[data-swatch]'); if (b) pickColorway(b.dataset.swatch); });

/* ---------- bolsa ---------- */
const cart = new Map();
const drawer = document.getElementById('drawer');
const itemsBox = document.getElementById('cartItems');
const countEl = document.getElementById('cartCount');
const totalEl = document.getElementById('cartTotal');
const shipNote = document.getElementById('shipNote');

function addToCart(id) {
  cart.set(id, (cart.get(id) || 0) + 1);
  renderCart();
  toast(`${byId(id).name} agregada a tu bolsa`);
}
function setQty(id, delta) {
  const next = (cart.get(id) || 0) + delta;
  next <= 0 ? cart.delete(id) : cart.set(id, next);
  renderCart();
}
function renderCart() {
  const entries = [...cart.entries()];
  const units = entries.reduce((n, [, q]) => n + q, 0);
  const total = entries.reduce((n, [id, q]) => n + byId(id).price * q, 0);
  if (String(units) !== countEl.textContent && !reduceMotion) {
    countEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], { duration: 320, easing: EASE_OUT });
  }
  countEl.textContent = units;
  totalEl.textContent = MXN(total);
  itemsBox.innerHTML = entries.length
    ? entries.map(([id, qty]) => { const p = byId(id); return `
      <div class="line">
        <div class="line__art"><img src="${render(p, 'front')}" alt="" width="72" height="72" /></div>
        <div class="line__info">
          <p class="line__name">${p.name}</p>
          <p class="line__sub">${p.sub}</p>
          <div class="line__qty">
            <button data-qty="${id}" data-d="-1" aria-label="Quitar una">−</button>
            <span>${qty}</span>
            <button data-qty="${id}" data-d="1" aria-label="Agregar una">+</button>
          </div>
        </div>
        <span class="line__price">${MXN(p.price * qty)}</span>
      </div>`; }).join('')
    : '<p class="drawer__empty">Tu bolsa está vacía. Elige un colorway en la colección.</p>';
  shipNote.textContent = total >= FREE_SHIP
    ? 'Envío estándar gratis a todo México.'
    : `Envío estándar ${MXN(SHIP_COST)}. Te faltan ${MXN(FREE_SHIP - total)} para envío gratis.`;
}
renderCart();

function openDrawer(open) {
  drawer.classList.toggle('is-open', open);
  drawer.setAttribute('aria-hidden', String(!open));
}

/* ---------- vista rápida ---------- */
const qv = document.getElementById('qv');
const qvStage = document.getElementById('qvStage');
let qvHandle = null, qvProduct = null, qvTimer = 0;
function openQuickView(id) {
  const p = byId(id); if (!p) return;
  qvProduct = p; clearTimeout(qvTimer);
  document.getElementById('qvTag').textContent = p.tag;
  document.getElementById('qvName').textContent = p.name;
  document.getElementById('qvSub').textContent = p.sub;
  document.getElementById('qvPrice').textContent = MXN(p.price);
  const fb = document.getElementById('qvFallback');
  fb.src = render(p, 'side'); fb.alt = `Gorra ${p.name}, ${p.sub.toLowerCase()}`;
  qvStage.classList.remove('is-3d');
  qv.classList.add('is-open'); qv.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  ready3D.then(ok => {
    if (!ok || !qv.classList.contains('is-open') || qvProduct !== p) return;
    if (qvHandle) qvHandle.dispose();
    try { qvHandle = Cap3D.mount(qvStage, { crown: p.crown, brim: p.brim, thread: p.thread, yaw: .55, tilt: .14 }); } catch (e) { qvHandle = null; }
  });
}
function closeQuickView() {
  if (!qv.classList.contains('is-open')) return;
  qv.classList.remove('is-open'); qv.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  qvTimer = setTimeout(() => { if (qvHandle) { qvHandle.dispose(); qvHandle = null; } }, 260);
}
document.getElementById('qvAdd').addEventListener('click', () => {
  if (!qvProduct) return;
  addToCart(qvProduct.id); closeQuickView(); openDrawer(true);
});
grid.addEventListener('click', e => {
  if (e.target.closest('[data-add]')) return;
  const art = e.target.closest('.card__art'); if (art) openQuickView(art.closest('.card').dataset.id);
});
grid.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card__art')) {
    e.preventDefault(); openQuickView(e.target.closest('.card').dataset.id);
  }
});

/* ---------- eventos globales ---------- */
document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) { addToCart(add.dataset.add); return; }
  const qty = e.target.closest('[data-qty]');
  if (qty) { setQty(qty.dataset.qty, Number(qty.dataset.d)); return; }
  if (e.target.closest('[data-close]')) openDrawer(false);
  if (e.target.closest('[data-qv-close]')) closeQuickView();
});
document.getElementById('cartBtn').addEventListener('click', () => openDrawer(true));
document.addEventListener('keydown', e => { if (e.key === 'Escape') { openDrawer(false); closeQuickView(); } });

/* ---------- aviso ---------- */
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2400);
}

/* ---------- avisos del drop ---------- */
const newsForm = document.getElementById('newsForm');
const newsMsg = document.getElementById('newsMsg');
newsForm.addEventListener('submit', e => {
  e.preventDefault();
  const input = newsForm.email;
  if (!input.value || !input.checkValidity()) {
    newsMsg.textContent = 'Escribe un correo válido, por ejemplo nombre@correo.com.';
    newsMsg.classList.add('is-error'); input.focus(); return;
  }
  newsMsg.classList.remove('is-error');
  newsMsg.textContent = 'Listo. Te avisamos 24 horas antes del Drop 02.';
  newsForm.reset();
});

/* ---------- nav: borde al despegarse (sin listener de scroll) ---------- */
const nav = document.getElementById('nav');
const sentinel = document.createElement('div');
sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;pointer-events:none';
document.body.prepend(sentinel);
new IntersectionObserver(([en]) => nav.classList.toggle('is-stuck', !en.isIntersecting), { rootMargin: '-88px 0px 0px 0px' }).observe(sentinel);

/* ---------- mapa de cobertura ---------- */
const MX_PATH = "M251.2,89.1 247.0,99.3 245.2,107.6 244.4,123.1 243.4,128.7 245.2,135.0 248.5,140.6 250.6,149.6 257.7,158.2 260.1,164.8 264.3,170.5 275.5,173.5 279.9,178.4 289.2,175.1 297.3,174.0 305.2,171.9 311.9,169.9 318.6,165.2 321.1,158.5 322.0,148.8 323.8,145.4 331.0,142.4 342.2,139.7 351.6,140.1 358.0,139.1 360.6,141.5 360.2,147.1 354.5,154.0 352.0,161.0 353.9,163.0 352.3,168.0 349.7,177.0 347.0,174.1 344.8,174.2 342.8,174.4 339.0,181.4 337.1,180.0 335.8,180.5 335.9,182.2 326.1,182.1 316.2,182.1 316.2,188.6 311.4,188.7 315.3,192.5 319.2,195.2 320.4,197.7 322.1,198.4 321.9,202.3 308.3,202.4 303.2,211.8 304.7,213.9 303.4,216.6 303.2,220.0 291.2,207.6 285.7,203.8 277.1,200.8 271.2,201.6 262.7,206.0 257.3,207.1 249.8,204.1 241.9,201.9 232.0,196.6 224.1,195.0 212.1,189.6 203.2,184.1 200.5,181.0 194.6,180.3 183.8,176.6 179.4,171.4 168.0,164.8 162.7,157.5 160.2,151.9 163.7,150.8 162.6,147.5 165.0,144.5 165.1,140.5 161.5,135.3 160.6,130.7 157.0,124.9 147.7,113.4 137.0,104.4 131.9,97.2 122.8,92.5 120.8,89.6 122.4,82.5 117.0,79.8 110.8,74.2 108.2,66.1 102.5,65.2 96.3,59.1 91.3,53.5 90.9,49.9 85.2,41.2 81.4,32.3 81.6,27.9 73.9,23.3 70.4,23.8 64.4,20.6 62.7,25.3 64.4,30.9 65.4,39.5 69.1,44.3 76.9,52.3 78.7,55.0 80.3,55.8 81.7,59.8 83.6,59.6 85.7,67.1 88.9,70.0 91.2,74.1 97.8,80.0 101.3,90.7 104.5,95.8 107.4,101.2 108.0,107.3 113.1,107.7 117.4,112.9 121.2,118.1 120.9,120.1 116.5,124.4 114.6,124.3 111.8,117.3 104.9,110.7 97.3,105.1 91.8,102.2 92.2,93.7 90.6,87.5 85.5,83.9 78.2,78.8 76.8,80.2 74.2,77.2 67.6,74.4 61.4,67.7 62.2,66.9 66.5,67.5 70.5,63.2 70.9,58.0 62.7,49.7 56.5,46.5 52.6,39.3 48.7,31.8 43.8,22.5 39.4,12.1 51.5,11.3 64.9,10.0 63.9,12.3 79.9,17.9 104.1,26.0 125.2,25.9 133.6,25.9 133.6,21.2 151.9,21.2 155.8,25.3 161.2,28.9 167.5,34.0 171.0,40.0 173.7,46.4 179.1,49.9 187.9,53.3 194.6,44.2 203.3,44.0 210.7,48.6 216.0,56.5 219.7,63.3 225.9,69.8 228.3,77.9 231.2,83.4 239.5,86.9 247.0,89.5 251.2,89.1Z";

const cities = [
  { name:'Tijuana', x:40.8, y:12.2 },
  { name:'Monterrey', x:217.6, y:91.4 },
  { name:'Guadalajara', x:185.4, y:149.2 },
  { name:'CDMX', x:230.1, y:163.5 },
  { name:'Mérida', x:330.8, y:145.7, anchor:'end', dx:-9 }
];
document.getElementById('map').innerHTML = `
<svg viewBox="0 0 400 230" role="img" aria-label="Mapa de cobertura de envíos en México">
  <path class="mx" d="${MX_PATH}"/>
  ${cities.map((c, i) => `
    <circle class="pulse" cx="${c.x}" cy="${c.y}" r="3" style="animation-delay:${i * .5}s"/>
    <circle class="pin" cx="${c.x}" cy="${c.y}" r="3.4"/>
    <text x="${c.x + (c.dx || 9)}" y="${c.y + 3.5}" text-anchor="${c.anchor || 'start'}"
          fill="#6d7683" font-size="8.5" font-family="Jost,system-ui,sans-serif">${c.name}</text>
  `).join('')}
</svg>`;
