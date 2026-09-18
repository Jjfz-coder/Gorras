/* ============================================================
   Cap3D — gorra procedural en three.js, acabado suede
   Uso: Cap3D.mount(elemento, { crown, brim, thread, spin, yaw, tilt })
   Devuelve { setColors, spin, dispose }. Si no hay WebGL devuelve null
   y no toca el DOM: se queda el SVG de respaldo.
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
  if (!Cap3D.supported) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // los hex del catálogo son sRGB: que three los convierta a lineal
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;

  /* ============================================================
     TEXTURAS
     ============================================================ */

  /* ---------- bordado (canvas, se repinta al cambiar de color) ---------- */
  function drawTracked(ctx, text, cx, cy, tracking) {
    const widths = [...text].map(ch => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1);
    let x = cx - total / 2;
    [...text].forEach((ch, i) => { ctx.fillText(ch, x + widths[i] / 2, cy); x += widths[i] + tracking; });
  }
  function embroideryTexture(thread) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 1024;
    const x = c.getContext('2d');
    let color = thread;
    const paint = () => {
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = color;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '500 54px Jost, system-ui, sans-serif';
      drawTracked(x, 'MAKE', 512, 380, 26);
      x.font = '500 150px Jost, system-ui, sans-serif';
      drawTracked(x, 'CUMBRES', 512, 500, 10);
      x.font = '500 50px Jost, system-ui, sans-serif';
      drawTracked(x, 'CHINGÓN AGAIN', 512, 610, 14);
    };
    paint();
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { paint(); tex.needsUpdate = true; });
    tex.recolor = (next) => { color = next; paint(); tex.needsUpdate = true; };
    return tex;
  }

  /* ---------- sombra de contacto ---------- */
  function shadowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, 'rgba(21,26,33,.55)');
    g.addColorStop(.45, 'rgba(21,26,33,.16)');
    g.addColorStop(1, 'rgba(21,26,33,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return new T.CanvasTexture(c);
  }

  /* ---------- pelo del suede: ruido → mapa de normales ---------- */
  let napCache = null;
  function napNormalMap() {
    if (napCache) return napCache;
    const S = 256;
    const noise = document.createElement('canvas'); noise.width = noise.height = S;
    const nx = noise.getContext('2d');
    // capas de ruido a distintas escalas (grano fino + manchas suaves del pelo)
    [[32, 1], [64, .55], [128, .35]].forEach(([res, alpha]) => {
      const l = document.createElement('canvas'); l.width = l.height = res;
      const lx = l.getContext('2d'), img = lx.createImageData(res, res);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (Math.random() - .5) * 200;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      lx.putImageData(img, 0, 0);
      nx.globalAlpha = alpha; nx.imageSmoothingEnabled = true;
      nx.drawImage(l, 0, 0, S, S);
    });
    const h = nx.getImageData(0, 0, S, S).data;
    const out = document.createElement('canvas'); out.width = out.height = S;
    const ox = out.getContext('2d'), o = ox.createImageData(S, S);
    const H = (x, y) => h[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
    const k = 2.2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y + 1) - H(x, y - 1)) * k;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      o.data[i] = (-dx / len * .5 + .5) * 255;
      o.data[i + 1] = (-dy / len * .5 + .5) * 255;
      o.data[i + 2] = (1 / len * .5 + .5) * 255;
      o.data[i + 3] = 255;
    }
    ox.putImageData(o, 0, 0);
    const tex = new T.CanvasTexture(out);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(10, 1.7);
    napCache = tex;
    return tex;
  }

  /* ---------- entorno de estudio (equirectangular procedural → PMREM) ---------- */
  function studioEnvironment(renderer) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#f6f7f9'); sky.addColorStop(.48, '#d3d9e1'); sky.addColorStop(.52, '#aeb7c2'); sky.addColorStop(1, '#5d6773');
    x.fillStyle = sky; x.fillRect(0, 0, 1024, 512);
    const panel = (cx, cy, rx, ry, a) => {
      x.save(); x.translate(cx, cy); x.scale(rx, ry);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.6, `rgba(255,255,255,${a * .5})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, Math.PI * 2); x.fill(); x.restore();
    };
    panel(300, 120, 260, 110, 1);      // softbox principal, arriba-izquierda
    panel(820, 170, 150, 90, .8);      // luz de contra, derecha
    panel(560, 60, 400, 50, .6);       // cenital suave
    panel(120, 300, 90, 160, .35);     // rebote lateral
    const tex = new T.CanvasTexture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.encoding = T.sRGBEncoding;
    const pmrem = new T.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose(); tex.dispose();
    return env;
  }

  /* ============================================================
     GEOMETRÍA
     ============================================================ */

  /* ---------- perfil de la copa: laterales casi verticales y remate abombado ---------- */
  const PROFILE = [[1.00, 0], [1.00, .16], [.995, .34], [.975, .48], [.935, .60], [.87, .70],
                   [.78, .78], [.66, .85], [.51, .905], [.34, .945], [.17, .965], [0, .97]];
  const profileCurve = new T.CatmullRomCurve3(PROFILE.map(([r, y]) => new T.Vector3(r, y, 0)));
  const sampleProfile = (n, y0 = 0, y1 = .97) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const y = y0 + (y1 - y0) * i / n;
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; profileCurve.getPoint(m).y < y ? lo = m : hi = m; }
      pts.push(new T.Vector2(profileCurve.getPoint((lo + hi) / 2).x, y));
    }
    return pts;
  };
  const radiusAt = (y) => sampleProfile(1, y, y)[0].x;

  /* ---------- visera en "D": malla paramétrica con caída y curva ---------- */
  const BRIM = { inner: .965, A: 1.15, rx: 1.40, ry: 1.32, cy: .30, th: .04, U: 56, V: 14 };
  const brimPoint = (u, v, y0 = 0) => {
    const { inner, A, rx, ry, cy } = BRIM;
    const a = -A + 2 * A * u;
    const ix = inner * Math.sin(a), iz = inner * Math.cos(a);
    const ox = rx * Math.sin(a), oz = cy + ry * Math.cos(a);
    const x = ix + (ox - ix) * v, z = iz + (oz - iz) * v;
    const tip = cy + ry - inner;
    const d = Math.max(0, Math.hypot(x, z) - inner), k = Math.min(1, d / tip);
    return [x, -0.46 * d * d + 0.07 * x * x * k + y0, z];
  };
  function brimGeometry() {
    const { U, V, th } = BRIM;
    const verts = [], uvs = [], index = [];
    const grid = (y0, flip) => {
      const base = verts.length / 3;
      for (let i = 0; i <= U; i++) for (let j = 0; j <= V; j++) { verts.push(...brimPoint(i / U, j / V, y0)); uvs.push(i / U * 4, j / V * 1.2); }
      for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
        const a = base + i * (V + 1) + j, b = a + V + 1;
        flip ? index.push(a, a + 1, b, a + 1, b + 1, b) : index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    };
    grid(0, false); grid(-th, true);
    const strip = (pts) => {
      const base = verts.length / 3;
      pts.forEach(([t, bt], i) => { verts.push(...t, ...bt); uvs.push(i / pts.length * 4, 0, i / pts.length * 4, .06); });
      for (let i = 0; i < pts.length - 1; i++) { const a = base + i * 2; index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    };
    const outer = []; for (let i = 0; i <= U; i++) outer.push([brimPoint(i / U, 1, 0), brimPoint(i / U, 1, -th)]);
    strip(outer);
    const endA = []; for (let j = V; j >= 0; j--) endA.push([brimPoint(0, j / V, 0), brimPoint(0, j / V, -th)]);
    strip(endA);
    const endB = []; for (let j = 0; j <= V; j++) endB.push([brimPoint(1, j / V, 0), brimPoint(1, j / V, -th)]);
    strip(endB);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    geo.translate(0, -0.006, 0);
    return geo;
  }
  // hileras de pespunte sobre la visera (siguen el borde exterior)
  function brimStitchCurve(v) {
    const pts = [];
    for (let i = 0; i <= BRIM.U; i++) { const p = brimPoint(i / BRIM.U, v, .004); pts.push(new T.Vector3(p[0], p[1] - .006, p[2])); }
    return new T.CatmullRomCurve3(pts);
  }

  /* ---------- pelusa del suede: capa fresnel sobre la copa ---------- */
  function fuzzMaterial(color) {
    return new T.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: color.clone() }, uAlpha: { value: .62 }, uPower: { value: 2.9 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uAlpha; uniform float uPower;
        varying vec3 vN; varying vec3 vV;
        void main(){
          float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), uPower);
          gl_FragColor = vec4(uColor, f * uAlpha);
        }`
    });
  }

  /* ============================================================
     GORRA
     ============================================================ */
  function buildCap(opts, renderer) {
    const crown = new T.Color(opts.crown);
    const brimC = new T.Color(opts.brim);
    const nap = napNormalMap();

    const sheenFor = (color) => {
      const dark = color.getHSL({}).l < 0.5;
      return { sheen: 1, sheenColor: color.clone().lerp(new T.Color('#ffffff'), dark ? .42 : .55) };
    };
    // suede: sin brillo especular, roughness al máximo, sheen alto y pelo en las normales
    const suede = (color) => new T.MeshPhysicalMaterial(Object.assign({
      color, roughness: 1, metalness: 0, specularIntensity: .12,
      sheenRoughness: .38, envMapIntensity: .95,
      normalMap: nap, normalScale: new T.Vector2(.28, .28)
    }, sheenFor(color)));
    const seamColorFor = (c) => c.clone().multiplyScalar(c.getHSL({}).l < .5 ? 1.18 : .84);

    const crownMat = suede(crown), brimMat = suede(brimC);
    const seamMat = new T.MeshStandardMaterial({ color: seamColorFor(crown), roughness: .85 });
    const stitchMat = new T.MeshStandardMaterial({ color: seamColorFor(brimC), roughness: .8 });
    const eyeMat = new T.MeshStandardMaterial({ color: seamColorFor(crown).multiplyScalar(.95), roughness: .75, metalness: .1 });
    const darkMat = new T.MeshStandardMaterial({ color: '#1b222c', roughness: .9, side: T.DoubleSide });

    const group = new T.Group();

    // copa + banda inferior + cierre interior
    const domeGeo = new T.LatheGeometry(sampleProfile(56), 144);
    group.add(new T.Mesh(domeGeo, crownMat));
    const bandGeo = new T.CylinderGeometry(1, 1, .06, 128, 1, true);
    const band = new T.Mesh(bandGeo, crownMat); band.position.y = -.03; group.add(band);
    const inner = new T.Mesh(new T.CircleGeometry(1, 96), darkMat);
    inner.rotation.x = Math.PI / 2; inner.position.y = -.058; group.add(inner);

    // pelusa: mismas mallas, un pelo más grandes, con fresnel
    const fuzz = fuzzMaterial(sheenFor(crown).sheenColor.clone().convertLinearToSRGB());
    const fuzzDome = new T.Mesh(domeGeo, fuzz); fuzzDome.scale.setScalar(1.012); group.add(fuzzDome);
    const fuzzBand = new T.Mesh(bandGeo, fuzz); fuzzBand.scale.set(1.012, 1, 1.012); fuzzBand.position.y = -.03; group.add(fuzzBand);

    // costuras de los seis paneles (el frente queda limpio para el bordado)
    const prof = sampleProfile(40);
    [Math.PI / 6, Math.PI / 2, 5 * Math.PI / 6].forEach(a => {
      const side = (ang, list) => list.map(p => new T.Vector3(Math.sin(ang) * p.x * 1.005, p.y + .003, Math.cos(ang) * p.x * 1.005));
      const pts = side(a, prof).concat(side(a + Math.PI, prof.slice().reverse()).slice(1));
      group.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 120, .008, 8, false), seamMat));
    });

    // botón
    const button = new T.Mesh(new T.SphereGeometry(.078, 32, 20), crownMat);
    button.scale.y = .55; button.position.y = .975; group.add(button);

    // ojales en los paneles laterales
    [Math.PI / 2 + Math.PI / 6, Math.PI / 2 - Math.PI / 6, -Math.PI / 2 + Math.PI / 6, -Math.PI / 2 - Math.PI / 6].forEach(a => {
      const r = radiusAt(.62), y = .62;
      const ring = new T.Mesh(new T.TorusGeometry(.028, .007, 8, 24), eyeMat);
      ring.position.set(Math.sin(a) * r * 1.004, y, Math.cos(a) * r * 1.004);
      ring.lookAt(new T.Vector3(Math.sin(a) * 3, y + .9, Math.cos(a) * 3));
      group.add(ring);
    });

    // visera + pespunte
    group.add(new T.Mesh(brimGeometry(), brimMat));
    [.94, .875, .81].forEach(v => {
      group.add(new T.Mesh(new T.TubeGeometry(brimStitchCurve(v), 140, .0042, 6, false), stitchMat));
    });

    // cierre trasero: abertura + correa snapback
    const opening = new T.LatheGeometry(
      sampleProfile(12, 0, .36).map(p => new T.Vector2(p.x * 1.003, p.y)), 20, Math.PI - .22, .44);
    group.add(new T.Mesh(opening, darkMat));
    const strap = new T.LatheGeometry(
      sampleProfile(4, .15, .27).map(p => new T.Vector2(p.x * 1.014, p.y)), 40, Math.PI - .48, .96);
    group.add(new T.Mesh(strap, brimMat));
    for (let i = -2; i <= 2; i++) {
      const a = Math.PI + i * .11, r = radiusAt(.21) * 1.018;
      const snap = new T.Mesh(new T.CylinderGeometry(.016, .016, .01, 16), eyeMat);
      snap.position.set(Math.sin(a) * r, .21, Math.cos(a) * r);
      snap.lookAt(new T.Vector3(Math.sin(a) * 3, .21, Math.cos(a) * 3)); snap.rotateX(Math.PI / 2);
      group.add(snap);
    }

    // bordado frontal: lathe parcial que abraza la copa; hilo satinado con relieve
    const tex = embroideryTexture(opts.thread);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const phiLen = 1.5;
    const patch = new T.LatheGeometry(
      sampleProfile(40, .16, .80).map(p => new T.Vector2(p.x * 1.007, p.y)), 64, -phiLen / 2, phiLen);
    group.add(new T.Mesh(patch, new T.MeshPhysicalMaterial({
      map: tex, bumpMap: tex, bumpScale: .014,
      transparent: true, alphaTest: .05, roughness: .5, metalness: .05,
      sheen: .6, sheenRoughness: .5, sheenColor: new T.Color('#ffffff'),
      polygonOffset: true, polygonOffsetFactor: -2
    })));

    // sombra de contacto
    const shadow = new T.Mesh(new T.PlaneGeometry(4.2, 4.2), new T.MeshBasicMaterial({
      map: shadowTexture(), transparent: true, depthWrite: false
    }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.24; shadow.scale.set(1.05, .9, 1);

    const mats = { crown: crownMat, brim: brimMat, seam: seamMat, stitch: stitchMat, eye: eyeMat, fuzz, tex, sheenFor, seamColorFor };
    return { group, shadow, mats };
  }

  /* ============================================================
     MONTAJE, LUZ Y ANIMACIÓN
     ============================================================ */
  Cap3D.mount = function (el, opts) {
    opts = Object.assign({ crown: '#f4f6f9', brim: '#e6eaf0', thread: '#41607f', spin: false, tilt: .16, yaw: .38 }, opts);

    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.className = 'cap3d';
    canvas.setAttribute('aria-hidden', 'true');

    const scene = new T.Scene();
    scene.environment = studioEnvironment(renderer);
    const camera = new T.PerspectiveCamera(26, 1, .1, 40);
    camera.position.set(0, 1.55, 7.6);
    camera.lookAt(0, .12, 0);

    // el entorno da la luz base; las direccionales definen volumen y el borde
    const key = new T.DirectionalLight(0xffffff, 1.15); key.position.set(-3, 4.5, 3); scene.add(key);
    const rim = new T.DirectionalLight(0xdde7f2, .6); rim.position.set(3.5, 2, -4); scene.add(rim);

    const { group, shadow, mats } = buildCap(opts, renderer);
    const pivot = new T.Group(); pivot.add(group); pivot.position.y = .04;
    const rig = new T.Group(); rig.add(pivot, shadow); scene.add(rig);
    el.appendChild(canvas);

    const state = {
      mx: 0, my: 0, drag: 0, vel: 0, dragging: false, lastX: 0, lastT: 0,
      ry: opts.yaw, rx: opts.tilt, t0: performance.now(), visible: true, scroll: 0, scale: 1
    };

    const resize = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 300;
      renderer.setSize(w, h, false);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      camera.aspect = w / h; camera.updateProjectionMatrix();
      state.scale = .64 + .14 * Math.min(1, Math.min(w, h) / 560);
    };
    const onResize = new ResizeObserver(resize); onResize.observe(el);
    resize();

    // interacción: el puntero inclina; arrastrar gira con inercia al soltar
    const onMove = e => {
      state.mx = (e.clientX / innerWidth) * 2 - 1;
      state.my = (e.clientY / innerHeight) * 2 - 1;
      if (state.dragging) {
        const now = performance.now(), dx = e.clientX - state.lastX;
        state.vel = dx * .009; state.drag += state.vel;
        state.lastX = e.clientX; state.lastT = now;
      }
    };
    addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerdown', e => {
      state.dragging = true; state.vel = 0; state.lastX = e.clientX; state.lastT = performance.now();
      canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing';
    });
    const release = () => {
      if (!state.dragging) return;
      state.dragging = false; canvas.style.cursor = 'grab';
      if (performance.now() - state.lastT > 80) state.vel = 0;   // soltó quieto: sin inercia
    };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
    canvas.style.cursor = 'grab';

    const io = new IntersectionObserver(([en]) => { state.visible = en.isIntersecting; }, { threshold: 0 });
    io.observe(el);
    const onScroll = () => { state.scroll = scrollY; };
    addEventListener('scroll', onScroll, { passive: true });

    const lerp = (a, b, k) => a + (b - a) * k;

    // transición de colorway: interpola materiales y repinta el bordado a mitad de camino
    const tween = { t: 1, from: null, to: null, thread: null, swapped: true };
    const setColors = (next) => {
      const crownTo = new T.Color(next.crown), brimTo = new T.Color(next.brim);
      tween.from = { crown: mats.crown.color.clone(), brim: mats.brim.color.clone(),
                     seam: mats.seam.color.clone(), stitch: mats.stitch.color.clone(),
                     sheen: mats.crown.sheenColor.clone(), bsheen: mats.brim.sheenColor.clone() };
      tween.to = { crown: crownTo, brim: brimTo,
                   seam: mats.seamColorFor(crownTo), stitch: mats.seamColorFor(brimTo),
                   sheen: mats.sheenFor(crownTo).sheenColor, bsheen: mats.sheenFor(brimTo).sheenColor };
      tween.thread = next.thread; tween.t = 0; tween.swapped = false;
    };
    const stepTween = () => {
      if (tween.t >= 1) return;
      tween.t = Math.min(1, tween.t + .04);
      const k = 1 - Math.pow(1 - tween.t, 3);
      mats.crown.color.copy(tween.from.crown).lerp(tween.to.crown, k);
      mats.brim.color.copy(tween.from.brim).lerp(tween.to.brim, k);
      mats.seam.color.copy(tween.from.seam).lerp(tween.to.seam, k);
      mats.stitch.color.copy(tween.from.stitch).lerp(tween.to.stitch, k);
      mats.eye.color.copy(mats.seam.color).multiplyScalar(.95);
      mats.crown.sheenColor.copy(tween.from.sheen).lerp(tween.to.sheen, k);
      mats.brim.sheenColor.copy(tween.from.bsheen).lerp(tween.to.bsheen, k);
      mats.fuzz.uniforms.uColor.value.copy(mats.crown.sheenColor).convertLinearToSRGB();
      if (!tween.swapped && tween.t > .45) { mats.tex.recolor(tween.thread); tween.swapped = true; }
    };

    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!state.visible) return;
      const t = (performance.now() - state.t0) / 1000;

      // entrada: sube, gira y se asienta
      const u = Math.min(1, t / 1.6);
      const intro = reduceMotion ? 1 : 1 - Math.pow(2, -10 * u) * (1 - u);

      // inercia del arrastre
      if (!state.dragging && Math.abs(state.vel) > .0004) { state.drag += state.vel; state.vel *= .94; }

      const auto = reduceMotion ? 0 : (opts.spin ? t * .26 : Math.sin(t * .30) * .40);
      const scrollTwist = opts.spin ? 0 : state.scroll * .0012;
      const targetY = opts.yaw + auto + state.drag + state.mx * .30 + scrollTwist;
      const targetX = opts.tilt + state.my * .15 + (reduceMotion ? 0 : Math.sin(t * .53) * .025);
      state.ry = lerp(state.ry, targetY, state.dragging ? .35 : .06);
      state.rx = lerp(state.rx, targetX, .06);
      stepTween();

      pivot.rotation.set(state.rx, state.ry - (1 - intro) * 1.3, (reduceMotion ? 0 : Math.sin(t * .41) * .02));
      const floatY = reduceMotion ? 0 : Math.sin(t * .9) * .035;
      pivot.position.y = .04 + floatY - (1 - intro) * .9;
      rig.scale.setScalar(state.scale * (.9 + .1 * intro));
      shadow.material.opacity = intro * (1 - floatY * 2.2);
      shadow.scale.set(1.05 - floatY * .8, .9 - floatY * .6, 1);
      renderer.render(scene, camera);
      if (!el.classList.contains('is-3d')) el.classList.add('is-3d');
    };
    tick();

    return {
      setColors,
      spin(dx) { state.drag += dx; },
      dispose() {
        cancelAnimationFrame(raf); onResize.disconnect(); io.disconnect();
        removeEventListener('pointermove', onMove); removeEventListener('scroll', onScroll);
        scene.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
        });
        if (scene.environment) scene.environment.dispose();
        renderer.dispose(); canvas.remove(); el.classList.remove('is-3d');
      }
    };
  };
})();
