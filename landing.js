/* ============================================================
   Landing. El wordmark baja contigo y se encoge hasta el header.
   Sólo transform, calculado por frame a partir de scrollY.
   ============================================================ */

const mark = document.getElementById('mark');
const markText = document.getElementById('markText');
const space = document.getElementById('markSpace');
const bar = document.querySelector('.bar');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const BAR = 56;           // alto del header
const LOGO_H = 20;        // alto final del wordmark, en px
const TOP_START = 0.06;   // arranque del wordmark, como fracción del alto de pantalla

let bigW = 0, bigH = 0, padX = 0, travel = 1, lastY = -1, lastW = 0;

// El wordmark ocupa todo el ancho: se ajusta el tamaño de fuente al ancho disponible.
function fit() {
  padX = parseFloat(getComputedStyle(mark).paddingLeft);
  const avail = innerWidth - padX * 2;
  markText.style.fontSize = '100px';
  const w100 = markText.getBoundingClientRect().width;
  let size = Math.floor(avail / w100 * 100 * 100) / 100;
  markText.style.fontSize = size + 'px';
  // segunda pasada: el ancho no escala de forma exactamente lineal, se corrige lo que sobre
  const w1 = markText.getBoundingClientRect().width;
  if (w1 > avail) { size = Math.floor(size * avail / w1 * 100) / 100; markText.style.fontSize = size + 'px'; }
  const r = markText.getBoundingClientRect();
  bigW = r.width; bigH = r.height;
  const startY = innerHeight * TOP_START;
  space.style.height = Math.round(startY + bigH + innerHeight * .06) + 'px';
  travel = Math.max(1, innerHeight * .9);   // distancia de scroll en la que termina la transición
  lastY = -1; lastW = innerWidth;
}

const clamp01 = v => Math.min(1, Math.max(0, v));
// suavizado: rápido al principio, se asienta al final
const ease = t => 1 - Math.pow(1 - t, 2.2);

function place() {
  const y = scrollY;
  if (y === lastY) return;
  lastY = y;
  if (!bigH) return;
  const p = reduceMotion ? (y > 8 ? 1 : 0) : ease(clamp01(y / travel));
  const scale = 1 + (LOGO_H / bigH - 1) * p;
  // el wordmark no se va con la página: se queda en pantalla y se encoge hasta el header
  const startTop = innerHeight * TOP_START;
  const topEnd = (BAR - LOGO_H) / 2;
  const top = startTop + (topEnd - startTop) * p;
  mark.style.transform = `translate3d(0, ${top.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
  bar.classList.toggle('is-solid', p > .98);
}

/* ---------- la frase se llena de tinta de izquierda a derecha con el scroll ---------- */
const statement = document.getElementById('statement');
let lastFill = -1;
function fillStatement() {
  if (!statement || reduceMotion) return;
  const r = statement.getBoundingClientRect();
  // empieza cuando la frase asoma por abajo y termina cuando llega al centro de la pantalla
  const p = clamp01((innerHeight - r.top) / (innerHeight * .5 + r.height));
  const f = Math.round(p * 1000) / 10;
  if (f === lastFill) return;
  lastFill = f;
  statement.style.setProperty('--fill', f + '%');
}
// la frase también se ajusta al ancho con la fuente real cargada
function fitStatement() {
  if (!statement) return;
  if (innerWidth <= 600) { statement.style.fontSize = ''; return; }   // en móvil se parte en líneas desde CSS
  const avail = innerWidth - padX * 2;
  statement.style.fontSize = '100px';
  const w = statement.getBoundingClientRect().width || 1164;
  statement.style.fontSize = (Math.floor(avail / w * 100 * 100) / 100) + 'px';
}
document.fonts.load('400 100px "Cormorant Garamond"').then(fitStatement).catch(fitStatement);

function tick() { place(); fillStatement(); requestAnimationFrame(tick); }
// El CSS ya deja el wordmark del ancho correcto; JS sólo afina la medida cuando la fuente real está lista
// (si se midiera con la fuente de respaldo, el texto podría salirse de la pantalla).
function measure() { bigH = markText.getBoundingClientRect().height; travel = Math.max(1, innerHeight * .9); lastY = -1; lastW = innerWidth; }
measure(); tick();
document.fonts.load('600 100px Jost').then(() => { fit(); place(); }).catch(() => { fit(); place(); });
document.fonts.addEventListener('loadingdone', () => { fit(); place(); });
addEventListener('resize', () => { if (innerWidth !== lastW) { fit(); fitStatement(); place(); } });
addEventListener('orientationchange', () => { fit(); place(); });

/* ---------- 3D en segundo plano ---------- */
const loadScript = src => new Promise((ok, err) => {
  const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = err;
  document.head.appendChild(s);
});
loadScript('assets/vendor/three.min.js')
  .then(() => loadScript('assets/cap3d.js'))
  .then(() => {
    if (window.Cap3D && Cap3D.supported)
      document.querySelectorAll('.stage[data-cap]').forEach(el => Cap3D.mount(el, JSON.parse(el.dataset.cap)));
    return loadScript('assets/shipmap3d.js');
  })
  .then(() => {
    const el = document.getElementById('shipMap');
    if (!(el && window.ShipMap3D && ShipMap3D.supported)) return;
    // el mapa se monta cuando se acerca a la pantalla
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect(); ShipMap3D.mount(el);
    }, { rootMargin: '300px 0px' });
    io.observe(el);
  })
  .catch(() => {});

/* ---------- una sola pieza: bolsa ---------- */
const PIECE = { name: 'Make Cumbres Chingón Again', sub: 'Hueso, bordado azul marino', price: 849, edition: 300, left: 112 };
const MXN = n => '$' + n.toLocaleString('es-MX') + ' MXN';
const FREE_SHIP = 1200, SHIP_COST = 129;
const EASE_OUT = 'cubic-bezier(.23,1,.32,1)';
let qty = 0;
const drawer = document.getElementById('drawer');
const bagBtn = document.getElementById('bagBtn'), bagCount = document.getElementById('bagCount');
const bagItems = document.getElementById('bagItems'), bagTotal = document.getElementById('bagTotal'), shipNote = document.getElementById('shipNote');
document.getElementById('leftCount').textContent = PIECE.left;
document.getElementById('serialNext').textContent = String(PIECE.edition - PIECE.left + 1).padStart(3, '0');

function renderBag() {
  if (String(qty) !== bagCount.textContent && !reduceMotion)
    bagCount.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], { duration: 320, easing: EASE_OUT });
  bagCount.textContent = qty;
  const total = qty * PIECE.price;
  bagTotal.textContent = MXN(total);
  bagItems.innerHTML = qty
    ? `<div class="line">
        <div class="line__art"><img src="assets/photos/frente.webp" alt="" width="96" height="64" /></div>
        <div class="line__info">
          <p class="line__name">${PIECE.name}</p>
          <p class="line__sub">${PIECE.sub}. Talla única.</p>
          <div class="line__qty">
            <button data-d="-1" aria-label="Quitar una">−</button>
            <span>${qty}</span>
            <button data-d="1" aria-label="Agregar una">+</button>
          </div>
        </div>
        <span class="line__price">${MXN(total)}</span>
      </div>`
    : '<p class="drawer__empty">Tu bolsa está vacía.</p>';
  shipNote.textContent = !qty ? '' : total >= FREE_SHIP
    ? 'Envío estándar gratis a todo México.'
    : `Envío estándar ${MXN(SHIP_COST)}. Te faltan ${MXN(FREE_SHIP - total)} para envío gratis.`;
}
let lastTrigger = null;
function openDrawer(open, trigger) {
  if (open === drawer.classList.contains('is-open')) return;
  drawer.classList.toggle('is-open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) { lastTrigger = trigger || document.activeElement; document.getElementById('drawerClose').focus(); }
  else if (lastTrigger) { lastTrigger.focus(); lastTrigger = null; }
}
document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) { qty = Math.min(qty + 1, PIECE.left); renderBag(); openDrawer(true, add); return; }
  const d = e.target.closest('[data-d]');
  if (d) { qty = Math.max(0, Math.min(PIECE.left, qty + Number(d.dataset.d))); renderBag(); return; }
  if (e.target.closest('[data-close]')) openDrawer(false);
});
bagBtn.addEventListener('click', () => openDrawer(true, bagBtn));
document.addEventListener('keydown', e => { if (e.key === 'Escape') openDrawer(false); });
renderBag();

/* ---------- barra de compra: aparece cuando el botón de la ficha ya quedó arriba ---------- */
const buybar = document.getElementById('buybar');
const addBtn = document.getElementById('addBtn');
new IntersectionObserver(([en]) => {
  const on = !en.isIntersecting && en.boundingClientRect.top < 0;
  buybar.classList.toggle('is-on', on);
  buybar.setAttribute('aria-hidden', String(!on));
  buybar.querySelector('button').tabIndex = on ? 0 : -1;
}).observe(addBtn);

/* ---------- avisos ---------- */
const form = document.getElementById('newsForm'), msg = document.getElementById('newsMsg');
form.addEventListener('submit', e => {
  e.preventDefault();
  const input = form.email;
  if (!input.value || !input.checkValidity()) {
    msg.textContent = 'Escribe un correo válido, por ejemplo nombre@correo.com.';
    msg.classList.add('is-error'); input.focus(); return;
  }
  msg.classList.remove('is-error');
  msg.textContent = 'Listo. Te avisamos 24 horas antes del Drop 02.';
  form.reset();
});
