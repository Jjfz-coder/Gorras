/* ============================================================
   ShipMap3D. Mapa de México en relieve con rutas de envío que salen
   de Ciudad de México como arcos en 3D. Lee la geometría del SVG de
   respaldo que ya está en el HTML (contorno y ciudades).
   ============================================================ */
(() => {
  const ShipMap3D = (window.ShipMap3D = {});
  ShipMap3D.supported = (() => {
    if (!window.THREE) return false;
    try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); }   // three r170 ya no soporta WebGL 1
    catch (e) { return false; }
  })();
  if (!ShipMap3D.supported) return;

  const T = THREE;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ACCENT = 0x41607f, LAND = 0xffffff, SIDE = 0xdfe4ea, EDGE = 0xc6cfda;
  const TOP = .06;                       // grosor del relieve
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  // "M x,y x,y ... Z" -> [[x,y],...]
  const parsePath = d => {
    const n = d.replace(/[MZz]/g, ' ').trim().split(/[\s,]+/).map(Number), out = [];
    for (let i = 0; i < n.length - 1; i += 2) out.push([n[i], n[i + 1]]);
    return out;
  };
  // coordenadas del svg (400x230) -> mundo, centrado y en metros de escena
  const wx = x => (x - 200) / 100, wz = y => (y - 118) / 100;

  ShipMap3D.mount = function (el) {
    const svg = el.querySelector('svg');
    const pts = parsePath(svg.querySelector('path').getAttribute('d'));
    const cities = [...svg.querySelectorAll('[data-city]')].map(c => ({
      name: c.dataset.city, x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), hub: c.hasAttribute('data-hub')
    }));
    const hub = cities.find(c => c.hub) || cities[0];

    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.domElement.className = 'map3d';
    el.appendChild(renderer.domElement);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(26, 1, .1, 40);
    // three r170: luces físicas, las intensidades del modo antiguo se multiplican por PI
    scene.add(new T.HemisphereLight(0xffffff, 0xcfd6df, 1.05 * Math.PI));
    const key = new T.DirectionalLight(0xffffff, .5 * Math.PI); key.position.set(-2.5, 4, 2.5); scene.add(key);

    const rig = new T.Group(); scene.add(rig);

    /* ---- territorio en relieve ---- */
    const shape = new T.Shape(pts.map(([x, y]) => new T.Vector2(wx(x), -wz(y))));
    const geo = new T.ExtrudeGeometry(shape, { depth: TOP, bevelEnabled: false, curveSegments: 1 });
    const land = new T.Mesh(geo, [
      new T.MeshStandardMaterial({ color: LAND, roughness: .95, metalness: 0 }),
      new T.MeshStandardMaterial({ color: SIDE, roughness: .95, metalness: 0 })
    ]);
    land.rotation.x = -Math.PI / 2;      // (x, y, z) -> (x, z, -y): la profundidad de la extrusión sube en Y
    rig.add(land);
    const edge = new T.LineLoop(
      new T.BufferGeometry().setFromPoints(pts.map(([x, y]) => new T.Vector3(wx(x), TOP + .002, wz(y)))),
      new T.LineBasicMaterial({ color: EDGE })
    );
    rig.add(edge);
    // sombra suave debajo del relieve
    const shadow = new T.Mesh(new T.ShapeGeometry(shape), new T.MeshBasicMaterial({ color: 0x9aa4b1, transparent: true, opacity: .16 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(.03, -.012, .05); shadow.scale.set(1.015, 1.015, 1);
    rig.add(shadow);

    /* ---- ciudades ---- */
    const accentMat = new T.MeshBasicMaterial({ color: ACCENT });
    const softMat = new T.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: .28 });
    const pos = c => new T.Vector3(wx(c.x), TOP + .004, wz(c.y));
    cities.forEach(c => {
      const p = pos(c);
      const dot = new T.Mesh(new T.CircleGeometry(c.hub ? .022 : (c.name ? .014 : .009), 24), accentMat);
      dot.rotation.x = -Math.PI / 2; dot.position.copy(p); rig.add(dot);
      if (c.hub || c.name) {
        const ring = new T.Mesh(new T.RingGeometry(c.hub ? .036 : .022, c.hub ? .042 : .026, 32), softMat);
        ring.rotation.x = -Math.PI / 2; ring.position.copy(p); rig.add(ring);
      }
    });

    /* ---- arcos desde el hub ---- */
    const SEG = 56, RAD = 6;
    const arcs = cities.filter(c => !c.hub).map((c, i) => {
      const a = pos(hub), b = pos(c);
      const d = a.distanceTo(b);
      const mid = a.clone().lerp(b, .5); mid.y += .1 + d * .45;
      const curve = new T.QuadraticBezierCurve3(a, mid, b);
      const tube = new T.TubeGeometry(curve, SEG, .0042, RAD, false);
      tube.setDrawRange(0, 0);
      const mesh = new T.Mesh(tube, new T.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: c.name ? .55 : .32 }));
      rig.add(mesh);
      const pulse = new T.Mesh(new T.SphereGeometry(.011, 12, 8), accentMat);
      pulse.visible = false; rig.add(pulse);
      return { curve, mesh, pulse, delay: i * .09, period: 2.2 + d * .9, phase: Math.random(), d };
    });
    const perSeg = RAD * 6;              // índices por segmento del tubo

    /* ---- etiquetas HTML proyectadas ---- */
    const labels = cities.filter(c => c.name).map(c => {
      const s = document.createElement('span');
      s.className = 'map3d__label' + (c.hub ? ' map3d__label--hub' : '');
      s.textContent = c.name; el.appendChild(s);
      return { el: s, p: pos(c).add(new T.Vector3(0, .05, 0)) };
    });
    const v = new T.Vector3();

    /* ---- cámara: encuadra el país completo en cualquier proporción ---- */
    const center = new T.Vector3(), tmp = new T.Vector3();
    let R = 0;
    pts.forEach(([x, y]) => center.add(tmp.set(wx(x), 0, wz(y))));
    center.divideScalar(pts.length);
    pts.forEach(([x, y]) => { R = Math.max(R, tmp.set(wx(x), 0, wz(y)).distanceTo(center)); });
    rig.position.copy(center).negate();   // el país gira sobre su propio centro
    const dir = new T.Vector3(0, .78, .63).normalize();
    let W = 1, H = 1;
    function resize() {
      const r = el.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      // se acerca hasta que el contorno y la cima de los arcos ocupan el 87% del encuadre
      let dist = R * 2.2;
      for (let i = 0; i < 3; i++) {
        camera.position.copy(dir).multiplyScalar(dist); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
        let m = 0;
        const take = () => { tmp.add(rig.position).project(camera); m = Math.max(m, Math.abs(tmp.x), Math.abs(tmp.y)); };
        pts.forEach(([x, y]) => { tmp.set(wx(x), TOP, wz(y)); take(); });
        arcs.forEach(a => { tmp.copy(a.curve.getPoint(.5)); take(); });
        dist *= m / .87;
      }
      camera.position.copy(dir).multiplyScalar(dist); camera.lookAt(0, 0, 0);
    }
    resize();
    new ResizeObserver(resize).observe(el);

    /* ---- puntero: paralaje sutil ---- */
    let px = 0, py = 0, tx = 0, ty = 0;
    if (matchMedia('(hover:hover) and (pointer:fine)').matches && !reduce) {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - .5) * 2; ty = ((e.clientY - r.top) / r.height - .5) * 2;
      });
      el.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
    }

    /* ---- animación ---- */
    const t0 = performance.now();
    let visible = true, raf = 0;
    new IntersectionObserver(en => { visible = en.some(e => e.isIntersecting); if (visible && !raf) raf = requestAnimationFrame(tick); }).observe(el);

    function tick(now) {
      raf = 0;
      const t = (now - t0) / 1000;
      // el arco se dibuja desde CDMX; luego viaja un punto por él
      arcs.forEach(a => {
        const p = reduce ? 1 : easeOut(Math.min(1, Math.max(0, (t - .2 - a.delay) / 1.6)));
        a.mesh.geometry.setDrawRange(0, Math.floor(p * SEG) * perSeg);
        if (p >= 1 && !reduce) {
          const k = ((t + a.phase * a.period) % a.period) / a.period;
          a.pulse.visible = k < .78;
          if (a.pulse.visible) a.pulse.position.copy(a.curve.getPointAt(Math.min(1, k / .78)));
        }
      });
      // deriva lenta + paralaje
      px += (tx - px) * .06; py += (ty - py) * .06;
      rig.rotation.y = (reduce ? 0 : Math.sin(t * .22) * .045) + px * .07;
      rig.rotation.x = py * .035;
      renderer.render(scene, camera);
      // etiquetas
      labels.forEach(l => {
        v.copy(l.p).applyMatrix4(rig.matrixWorld).project(camera);
        l.el.style.transform = `translate(${((v.x + 1) / 2 * W).toFixed(1)}px, ${((1 - v.y) / 2 * H).toFixed(1)}px) translate(-50%,-100%)`;
      });
      if (visible) raf = requestAnimationFrame(tick);
    }
    el.classList.add('is-3d');
    raf = requestAnimationFrame(tick);
  };
})();
