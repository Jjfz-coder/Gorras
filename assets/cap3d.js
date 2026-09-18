/* ============================================================
   Cap3D — gorra procedural en three.js (sin modelos externos)
   Uso: Cap3D.mount(elemento, { crown, brim, thread, spin })
   Si no hay WebGL, no toca el DOM y se queda el SVG de respaldo.
   ============================================================ */
(function () {
  const Cap3D = (window.Cap3D = {});
  const T = window.THREE;

  Cap3D.supported = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(T && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  })();

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // los hex del catálogo son sRGB: que three los convierta a lineal
  if (T && T.ColorManagement) T.ColorManagement.legacyMode = false;

  /* ---------- textura del bordado ---------- */
  function drawTracked(ctx, text, cx, cy, tracking) {
    const widths = [...text].map(ch => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1);
    let x = cx - total / 2;
    [...text].forEach((ch, i) => {
      ctx.fillText(ch, x + widths[i] / 2, cy);
      x += widths[i] + tracking;
    });
  }

  function embroideryTexture(thread) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 1024;
    const x = c.getContext('2d');
    const paint = () => {
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = thread;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '500 54px Jost, system-ui, sans-serif';
      drawTracked(x, 'MAKE', 512, 380, 26);
      x.font = '500 150px Jost, system-ui, sans-serif';
      drawTracked(x, 'CUMBRES', 512, 500, 10);
      x.font = '500 50px Jost, system-ui, sans-serif';
      drawTracked(x, 'CHING\u00d3N AGAIN', 512, 610, 14);
    };
    paint();
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = 8;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { paint(); tex.needsUpdate = true; });
    }
    return tex;
  }

  function shadowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(21,26,33,.5)');
    g.addColorStop(.55, 'rgba(21,26,33,.12)');
    g.addColorStop(1, 'rgba(21,26,33,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return new T.CanvasTexture(c);
  }

  /* ---------- geometría de la visera (superficie paramétrica) ---------- */
  function brimGeometry() {
    // forma de "D": borde interior circular (unión con la copa) y borde exterior elíptico,
    // con caída hacia la punta y ligera curva lateral. Malla propia para normales suaves.
    const inner = 0.965, A = 1.15, rx = 1.40, ry = 1.32, cy = 0.30, th = .04;
    const U = 56, V = 14;
    const tip = cy + ry - inner;
    const bend = (x, z) => {
      const d = Math.max(0, Math.hypot(x, z) - inner), k = Math.min(1, d / tip);
      return -0.46 * d * d + 0.07 * x * x * k;
    };
    const pt = (i, j, y0) => {
      const a = -A + 2 * A * i / U, v = j / V;
      const ix = inner * Math.sin(a), iz = inner * Math.cos(a);
      const ox = rx * Math.sin(a), oz = cy + ry * Math.cos(a);
      const x = ix + (ox - ix) * v, z = iz + (oz - iz) * v;
      return [x, bend(x, z) + y0, z];
    };
    const verts = [], index = [];
    const grid = (y0, flip) => {
      const base = verts.length / 3;
      for (let i = 0; i <= U; i++) for (let j = 0; j <= V; j++) verts.push(...pt(i, j, y0));
      for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
        const a = base + i * (V + 1) + j, b = a + V + 1;
        flip ? index.push(a, a + 1, b, a + 1, b + 1, b) : index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    };
    grid(0, false);        // cara superior
    grid(-th, true);       // cara inferior
    // canto exterior y extremos
    const strip = (pts) => {
      const base = verts.length / 3;
      pts.forEach(([t, bt]) => { verts.push(...t, ...bt); });
      for (let i = 0; i < pts.length - 1; i++) {
        const a = base + i * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    };
    const outer = []; for (let i = 0; i <= U; i++) outer.push([pt(i, V, 0), pt(i, V, -th)]);
    strip(outer);
    const endA = []; for (let j = V; j >= 0; j--) endA.push([pt(0, j, 0), pt(0, j, -th)]);
    strip(endA);
    const endB = []; for (let j = 0; j <= V; j++) endB.push([pt(U, j, 0), pt(U, j, -th)]);
    strip(endB);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    geo.translate(0, -0.006, 0);
    return geo;
  }

  /* ---------- perfil de la copa ---------- */
  // (radio, altura): laterales casi verticales y remate abombado, como una gorra estructurada
  const PROFILE = [[1.00, 0], [1.00, .16], [.995, .34], [.975, .48], [.935, .60], [.87, .70],
                   [.78, .78], [.66, .85], [.51, .905], [.34, .945], [.17, .965], [0, .97]];
  const profileCurve = new T.CatmullRomCurve3(PROFILE.map(([r, y]) => new T.Vector3(r, y, 0)));
  const sampleProfile = (n, y0 = 0, y1 = .97) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      // buscamos por altura para poder recortar el frente del bordado
      const y = y0 + (y1 - y0) * i / n;
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; profileCurve.getPoint(m).y < y ? lo = m : hi = m; }
      const p = profileCurve.getPoint((lo + hi) / 2);
      pts.push(new T.Vector2(p.x, y));
    }
    return pts;
  };

  function buildCap(opts, renderer) {
    const crown = new T.Color(opts.crown);
    const brimC = new T.Color(opts.brim);
    const seamC = crown.clone().multiplyScalar(0.82);
    const isDark = crown.getHSL({}).l < 0.5;

    const fabric = (color) => new T.MeshPhysicalMaterial({
      color, roughness: .78, metalness: 0,
      sheen: isDark ? .5 : .9, sheenRoughness: .6,
      sheenColor: color.clone().lerp(new T.Color('#ffffff'), isDark ? .35 : .6),
      clearcoat: 0
    });

    const group = new T.Group();

    // copa
    const dome = new T.LatheGeometry(sampleProfile(48), 128);
    group.add(new T.Mesh(dome, fabric(crown)));

    // banda inferior + cierre interior
    const band = new T.Mesh(new T.CylinderGeometry(1, 1, .06, 96, 1, true), fabric(crown));
    band.position.y = -.03;
    group.add(band);
    const inner = new T.Mesh(
      new T.CircleGeometry(1, 96),
      new T.MeshStandardMaterial({ color: '#1b222c', roughness: .9, side: T.DoubleSide })
    );
    inner.rotation.x = Math.PI / 2; inner.position.y = -.058;
    group.add(inner);

    // costuras (6 paneles)
    const seamMat = new T.MeshStandardMaterial({ color: seamC, roughness: .9 });
    const prof = sampleProfile(40);
    [Math.PI / 6, Math.PI / 2, 5 * Math.PI / 6].forEach(a => {
      const side = (ang, list) => list.map(p => new T.Vector3(Math.sin(ang) * p.x * 1.004, p.y + .003, Math.cos(ang) * p.x * 1.004));
      const pts = side(a, prof).concat(side(a + Math.PI, prof.slice().reverse()).slice(1));
      const tube = new T.TubeGeometry(new T.CatmullRomCurve3(pts), 96, .0065, 8, false);
      group.add(new T.Mesh(tube, seamMat));
    });

    // botón
    const button = new T.Mesh(new T.SphereGeometry(.075, 32, 20), fabric(crown));
    button.scale.y = .55; button.position.y = .975;
    group.add(button);

    // ojales (paneles laterales)
    const eyeMat = new T.MeshStandardMaterial({ color: seamC.clone().multiplyScalar(.9), roughness: .8 });
    [Math.PI / 2 + Math.PI / 6, Math.PI / 2 - Math.PI / 6, -Math.PI / 2 + Math.PI / 6, -Math.PI / 2 - Math.PI / 6].forEach(a => {
      const p = sampleProfile(1, .62, .62)[0];
      const ring = new T.Mesh(new T.TorusGeometry(.028, .007, 8, 24), eyeMat);
      ring.position.set(Math.sin(a) * p.x * 1.004, p.y, Math.cos(a) * p.x * 1.004);
      ring.lookAt(new T.Vector3(Math.sin(a) * 3, p.y + .9, Math.cos(a) * 3));
      group.add(ring);
    });

    // visera
    const brim = new T.Mesh(brimGeometry(), fabric(brimC));
    group.add(brim);

    // bordado frontal (segmento de esfera con textura)
    const tex = embroideryTexture(opts.thread);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const phiLen = 1.5;
    const patch = new T.LatheGeometry(
      sampleProfile(40, .16, .80).map(p => new T.Vector2(p.x * 1.006, p.y)), 64, -phiLen / 2, phiLen);
    const thread = new T.Mesh(patch, new T.MeshStandardMaterial({
      map: tex, bumpMap: tex, bumpScale: .012,
      transparent: true, alphaTest: .05, roughness: .55, metalness: .08,
      polygonOffset: true, polygonOffsetFactor: -2
    }));
    group.add(thread);

    // sombra de contacto
    const shadow = new T.Mesh(new T.PlaneGeometry(4.2, 4.2), new T.MeshBasicMaterial({
      map: shadowTexture(), transparent: true, depthWrite: false
    }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.3; shadow.scale.set(1.05, .9, 1);

    return { group, shadow };
  }

  /* ---------- montaje ---------- */
  Cap3D.mount = function (el, opts) {
    if (!Cap3D.supported) return null;
    opts = Object.assign({ crown: '#f4f6f9', brim: '#e6eaf0', thread: '#41607f', spin: false, tilt: .16, yaw: .38 }, opts);

    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .92;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.className = 'cap3d';
    canvas.setAttribute('aria-hidden', 'true');

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(26, 1, .1, 40);
    camera.position.set(0, 1.55, 7.6);
    camera.lookAt(0, .12, 0);

    // luces: cielo suave + key + rim azulado + relleno
    scene.add(new T.HemisphereLight(0xffffff, 0x66717f, .42));
    const key = new T.DirectionalLight(0xffffff, 1.7); key.position.set(-3, 4.5, 3); scene.add(key);
    const rim = new T.DirectionalLight(0xd6e2f0, .9); rim.position.set(3.5, 2, -4); scene.add(rim);
    const fill = new T.DirectionalLight(0xffffff, .35); fill.position.set(3, .2, 3.5); scene.add(fill);

    const { group, shadow } = buildCap(opts, renderer);
    const pivot = new T.Group();
    pivot.add(group);
    pivot.position.y = -.05;
    const rig = new T.Group();
    rig.add(pivot, shadow);
    scene.add(rig);

    // el respaldo SVG se queda debajo hasta que renderizamos el primer frame
    el.appendChild(canvas);

    const state = {
      mx: 0, my: 0, drag: 0, dragging: false, lastX: 0,
      ry: opts.yaw, rx: opts.tilt, t0: performance.now(), visible: true, scroll: 0
    };

    const resize = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 300;
      renderer.setSize(w, h, false);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      camera.aspect = w / h; camera.updateProjectionMatrix();
      const s = Math.min(1, Math.min(w, h) / 560);
      rig.scale.setScalar(.70 + .16 * s);
    };
    new ResizeObserver(resize).observe(el);
    resize();

    // interacción: el puntero inclina, arrastrar gira
    const onMove = e => {
      state.mx = (e.clientX / innerWidth) * 2 - 1;
      state.my = (e.clientY / innerHeight) * 2 - 1;
      if (state.dragging) { state.drag += (e.clientX - state.lastX) * .008; state.lastX = e.clientX; }
    };
    addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerdown', e => { state.dragging = true; state.lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    const stop = () => { state.dragging = false; };
    canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', () => canvas.style.cursor = 'grabbing');
    canvas.addEventListener('pointerup', () => canvas.style.cursor = 'grab');

    new IntersectionObserver(([en]) => { state.visible = en.isIntersecting; }, { threshold: 0 }).observe(el);
    addEventListener('scroll', () => { state.scroll = scrollY; }, { passive: true });

    const lerp = (a, b, k) => a + (b - a) * k;
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!state.visible) return;
      const t = (performance.now() - state.t0) / 1000;
      const auto = reduceMotion ? 0 : (opts.spin ? t * .28 : Math.sin(t * .32) * .42);
      const scrollTwist = opts.spin ? 0 : state.scroll * .0012;
      const targetY = opts.yaw + auto + state.drag + state.mx * .32 + scrollTwist;
      const targetX = opts.tilt + state.my * .16;
      state.ry = lerp(state.ry, targetY, .06);
      state.rx = lerp(state.rx, targetX, .06);
      pivot.rotation.set(state.rx, state.ry, 0);
      pivot.position.y = -.05 + (reduceMotion ? 0 : Math.sin(t * .9) * .035);
      shadow.scale.x = 1.05 - Math.abs(Math.sin(t * .9)) * .04;
      renderer.render(scene, camera);
      if (!el.classList.contains('is-3d')) el.classList.add('is-3d');
    };
    tick();

    return {
      dispose() { cancelAnimationFrame(raf); renderer.dispose(); canvas.remove(); el.classList.remove('is-3d'); }
    };
  };
})();
