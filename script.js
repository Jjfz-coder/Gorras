/* ============================================================
   Cumbres Supply — prototipo (sin dependencias)
   ============================================================ */

/* ---------- ilustración de gorra (frente) ---------- */
const capSVG = (uid) => `
<svg viewBox="0 0 400 300" role="img" aria-label="Gorra bordada">
  <defs>
    <linearGradient id="g-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="var(--crown)"/>
      <stop offset="48%"  stop-color="var(--crown)"/>
      <stop offset="100%" stop-color="var(--shade)"/>
    </linearGradient>
  </defs>

  <!-- sombra -->
  <ellipse cx="200" cy="222" rx="128" ry="11" fill="rgba(21,26,33,.10)"/>

  <!-- copa -->
  <path d="M68,192 C68,86 128,40 200,40 C272,40 332,86 332,192 Z"
        fill="url(#g-${uid})" stroke="var(--stroke)"/>
  <!-- costuras -->
  <g stroke="var(--seam)" fill="none" stroke-width="1.5">
    <path d="M200,41 L200,192"/>
    <path d="M136,55 C118,100 114,150 116,192"/>
    <path d="M264,55 C282,100 286,150 284,192"/>
  </g>
  <!-- botón -->
  <circle cx="200" cy="43" r="7" fill="var(--crown)" stroke="var(--stroke)"/>
  <!-- eyelets -->
  <g fill="var(--seam)">
    <circle cx="100" cy="150" r="3.2"/><circle cx="300" cy="150" r="3.2"/>
  </g>

  <!-- bordado -->
  <g fill="var(--thread)" text-anchor="middle" font-weight="500"
     font-family="'Jost',system-ui,sans-serif">
    <text x="200" y="112" font-size="14" letter-spacing="6">MAKE</text>
    <text x="200" y="150" font-size="35" letter-spacing="2.5">CUMBRES</text>
    <text x="200" y="174" font-size="12.5" letter-spacing="3.4">CHINGÓN AGAIN</text>
  </g>

  <!-- visera -->
  <path d="M62,190 C62,200 72,206 86,209 C132,220 268,220 314,209 C328,206 338,200 338,190 Z"
        fill="var(--brim)" stroke="var(--stroke)"/>
  <path d="M70,193 C78,203 130,210 200,210 C270,210 322,203 330,193"
        fill="none" stroke="var(--seam)" stroke-width="1.5"/>
</svg>`;

/* ---------- catálogo ---------- */
const LIGHT = { stroke:'rgba(21,26,33,.18)', seam:'rgba(21,26,33,.10)', shade:'rgba(21,26,33,.10)' };
const DARK  = { stroke:'rgba(10,16,24,.35)', seam:'rgba(255,255,255,.16)', shade:'rgba(9,14,21,.42)' };

const products = [
  { id:'orizaba', name:'Orizaba',     sub:'Snapback · lana 80/20',     price:849, tag:'Más vendida', hot:true,
    crown:'#f3f5f8', brim:'#e6eaf0', thread:'#41607f', ...LIGHT },
  { id:'nevado',  name:'Nevado',       sub:'Dad hat · algodón lavado',  price:699, tag:'Nuevo', hot:false,
    crown:'#ced5de', brim:'#bfc8d3', thread:'#232f3e', ...LIGHT },
  { id:'tacana',  name:'Tacaná',       sub:'Trucker · malla premium',   price:779, tag:'Edición 300', hot:false,
    crown:'#eae5da', brim:'#ded8ca', thread:'#4c586e', ...LIGHT },
  { id:'malinche',name:'Malinche',     sub:'5 panel · nylon técnico',   price:899, tag:'Últimas 12', hot:true,
    crown:'#465d78', brim:'#3a4f68', thread:'#eef1f5', ...DARK }
];

const capVars = p =>
  `--crown:${p.crown};--brim:${p.brim};--thread:${p.thread};` +
  `--stroke:${p.stroke};--seam:${p.seam};--shade:${p.shade}`;

const MXN = n => '$' + n.toLocaleString('es-MX') + ' MXN';
const FREE_SHIP = 1200;
const SHIP_COST = 129;

/* ---------- render de catálogo ---------- */
const grid = document.getElementById('grid');
grid.innerHTML = products.map(p => `
  <article class="card reveal">
    <div class="card__art" style="${capVars(p)}">
      <span class="card__tag ${p.hot ? 'is-hot' : ''}">${p.tag}</span>
      <div class="cap">${capSVG(p.id)}</div>
    </div>
    <div class="card__body">
      <h3 class="card__name">${p.name}</h3>
      <p class="card__sub">${p.sub}</p>
      <div class="card__row">
        <span class="card__price">${MXN(p.price)}</span>
        <button class="card__add" data-add="${p.id}">Agregar</button>
      </div>
    </div>
  </article>`).join('');

/* gorras decorativas (hero y detalle) */
document.querySelectorAll('.cap--hero, .cap--detail')
  .forEach((el, i) => el.innerHTML = capSVG('deco' + i));

/* ---------- bolsa ---------- */
const cart = new Map();
const drawer   = document.getElementById('drawer');
const itemsBox = document.getElementById('cartItems');
const countEl  = document.getElementById('cartCount');
const totalEl  = document.getElementById('cartTotal');
const shipNote = document.getElementById('shipNote');

function addToCart(id){
  cart.set(id, (cart.get(id) || 0) + 1);
  renderCart();
  toast(`${products.find(p => p.id === id).name} agregada a tu bolsa`);
}

function setQty(id, delta){
  const next = (cart.get(id) || 0) + delta;
  next <= 0 ? cart.delete(id) : cart.set(id, next);
  renderCart();
}

function renderCart(){
  const entries = [...cart.entries()];
  const units   = entries.reduce((n, [, q]) => n + q, 0);
  const total   = entries.reduce((n, [id, q]) => n + products.find(p => p.id === id).price * q, 0);

  countEl.textContent = units;
  totalEl.textContent = MXN(total);

  itemsBox.innerHTML = entries.length
    ? entries.map(([id, qty]) => {
        const p = products.find(x => x.id === id);
        return `
        <div class="line">
          <div class="line__art" style="${capVars(p)}">
            <div class="cap">${capSVG('bag-' + p.id)}</div>
          </div>
          <div class="line__info">
            <p class="line__name">${p.name}</p>
            <p class="line__sub">${p.sub}</p>
            <div class="line__qty">
              <button data-qty="${id}" data-d="-1" aria-label="Quitar uno">−</button>
              <span>${qty}</span>
              <button data-qty="${id}" data-d="1" aria-label="Agregar uno">+</button>
            </div>
          </div>
          <span class="line__price">${MXN(p.price * qty)}</span>
        </div>`;
      }).join('')
    : '<p class="drawer__empty">Tu bolsa está vacía.<br />La Obsidiana no se va a comprar sola.</p>';

  shipNote.textContent = total >= FREE_SHIP
    ? 'Envío estándar gratis a todo México. 🇲🇽'
    : `Envío estándar ${MXN(SHIP_COST)} — te faltan ${MXN(FREE_SHIP - total)} para envío gratis.`;
}
renderCart();

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add){ addToCart(add.dataset.add); return; }

  const qty = e.target.closest('[data-qty]');
  if (qty){ setQty(qty.dataset.qty, Number(qty.dataset.d)); return; }

  if (e.target.closest('[data-close]')) openDrawer(false);
});

document.getElementById('cartBtn').addEventListener('click', () => openDrawer(true));
document.addEventListener('keydown', e => { if (e.key === 'Escape') openDrawer(false); });

function openDrawer(open){
  drawer.classList.toggle('is-open', open);
  drawer.setAttribute('aria-hidden', String(!open));
}

/* ---------- toast ---------- */
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2200);
}

/* ---------- newsletter ---------- */
document.getElementById('newsForm').addEventListener('submit', e => {
  e.preventDefault();
  e.target.reset();
  document.getElementById('newsMsg').textContent = 'Listo. Te escribimos antes que a nadie.';
});

/* ---------- nav pegajoso ---------- */
const nav = document.getElementById('nav');
addEventListener('scroll', () => nav.classList.toggle('is-stuck', scrollY > 12), { passive:true });

/* ---------- mapa de envíos ---------- */
/* silueta simplificada de México (proyección equirectangular, 400x230) */
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
    <circle class="pulse" cx="${c.x}" cy="${c.y}" r="3" style="animation-delay:${i * 0.5}s"/>
    <circle class="pin"   cx="${c.x}" cy="${c.y}" r="3.4" style="animation-delay:${i * 0.15}s"/>
    <text x="${c.x + (c.dx || 9)}" y="${c.y + 3.5}" text-anchor="${c.anchor || 'start'}"
          fill="#6d7683" font-size="8" font-family="Jost,system-ui,sans-serif"
          letter-spacing=".08em">${c.name.toUpperCase()}</text>
  `).join('')}
</svg>`;

/* ---------- reveal al hacer scroll ---------- */
document.querySelectorAll('.section__head, .split__copy, .split__art, .quote blockquote, .news__box, .card')
  .forEach(el => el.classList.add('reveal'));

const io = new IntersectionObserver((entries, obs) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    el.classList.add(el.classList.contains('pin') || el.classList.contains('pulse') ? 'on' : 'is-in');
    obs.unobserve(el);
  });
}, { threshold:.16 });

document.querySelectorAll('.reveal').forEach(el => io.observe(el));
document.querySelectorAll('#map .pin, #map .pulse').forEach(p => io.observe(p));
