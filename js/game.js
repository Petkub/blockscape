'use strict';
// Game glue: rendering, chunk streaming, saving, the game loop, input, and the title, pause and manual screens.
(function () {
  const $ = function (id) { return document.getElementById(id); };

// 67
  if (!window.THREE) {
    const lede = document.querySelector('.lede');
    lede.textContent = "The 3D engine (three.js) didn't load. Use Blockscape.html, which has it built in.";
    lede.style.color = 'var(--warn)';
    return;
  }

  // ---------- settings ----------
  const settings = { sens: 1, fov: 75, renderDist: 8, invertY: false, showInfo: false, volume: 0.7, music: 0.5 };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('blockscape.settings') || '{}')); } catch (e) { /* storage blocked */ }
  function saveSettings() { try { localStorage.setItem('blockscape.settings', JSON.stringify(settings)); } catch (e) { /* storage blocked */ } }
  AUDIO.volume = settings.volume; AUDIO.musicVolume = settings.music;
  const seen = new Set();
  try { JSON.parse(localStorage.getItem('blockscape.seen') || '[]').forEach(function (k) { seen.add(k); }); } catch (e) { /* storage blocked */ }
  function saveSeen() { try { localStorage.setItem('blockscape.seen', JSON.stringify(Array.from(seen))); } catch (e) { /* storage blocked */ } }

  Atlas.build();

  // ---------- renderer and scene ----------
  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = GAME.scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 900);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  // The first-person hand is drawn in its own pass after the world, like Minecraft does, so clouds,
  // water and other see-through blocks never draw over it. The underwater tint goes between the two.
  const handScene = new THREE.Scene(), handCam = new THREE.PerspectiveCamera(settings.fov, 1, 0.01, 10);
  handScene.add(handCam);
  handScene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const handSun = new THREE.DirectionalLight(0xffffff, 0.45); handSun.position.set(1, 2, 1); handScene.add(handSun);
  const tintScene = new THREE.Scene(), tintCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tintMat = new THREE.MeshBasicMaterial({ color: 0x1c4aa8, transparent: true, opacity: 0.32, depthTest: false, depthWrite: false });
  tintScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tintMat));
  let tintOn = false;

  const SKY_DAY = new THREE.Color(0x8ec8f0), SKY_NIGHT = new THREE.Color(0x0a1028), SKY_DUSK = new THREE.Color(0xf29a6a), SKY_RAIN = new THREE.Color(0x6a7684);
  const WATER_FOG = new THREE.Color(0x1c3f80), LAVA_FOG = new THREE.Color(0xc84a10);
  const skyColor = new THREE.Color(0x8ec8f0);
  scene.background = skyColor;
  scene.fog = new THREE.Fog(0x8ec8f0, 60, 120);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6a7a58, 0.8);
  const sunLight = new THREE.DirectionalLight(0xffffff, 0.5);
  sunLight.position.set(0.5, 1, 0.3);
  scene.add(hemi, sunLight);

  const atlasTex = new THREE.CanvasTexture(Atlas.canvas);
  atlasTex.magFilter = THREE.NearestFilter; atlasTex.minFilter = THREE.NearestFilter; atlasTex.generateMipmaps = false;
  const solidMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5 });
  const waterMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const transMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: true, depthWrite: false });
  const glowMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const compressedMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, color: 0x553333 });
  GAME.blockEntityMat = solidMat;
  GAME.flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

// 67
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ color: 0xfff2a8, fog: false }));
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ color: 0xe6ecf6, fog: false }));
  scene.add(sun, moon);
  const starGeo = new THREE.BufferGeometry();
  (function () {
    const r = mulberry32(99), pts = [];
    for (let i = 0; i < 700; i++) {
      const a = r() * Math.PI * 2, e = Math.asin(r() * 1.1 - 0.1);
      pts.push(Math.cos(a) * Math.cos(e) * 400, Math.sin(e) * 400, Math.sin(a) * Math.cos(e) * 400);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  })();
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
  const cloudTex = (function () {
    const N = 64, r = mulberry32(4242);
    let g = new Float32Array(N * N);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let pass = 0; pass < 3; pass++) {
      const o = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += g[((y + dy + N) % N) * N + (x + dx + N) % N];
        o[y * N + x] = s / 9;
      }
      g = o;
    }
    const c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d');
    for (let i = 0; i < g.length; i++) if (g[i] > 0.53) { ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(i % N, Math.floor(i / N), 1, 1); }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
    return t;
  })();
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85 });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(1280, 1280), cloudMat);
  clouds.rotation.x = -Math.PI / 2;
  scene.add(clouds);
  const RAIN_N = 1400;
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_N * 6), 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb8e0, transparent: true, opacity: 0.55 }));
  rain.frustumCulled = false; rain.visible = false;
  scene.add(rain);
  const rainDrops = [];
  for (let i = 0; i < RAIN_N; i++) rainDrops.push([Math.random() * 40 - 20, Math.random() * 30, Math.random() * 40 - 20]);

  const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
  selBox.visible = false;
  scene.add(selBox);
  const crackTex = [];
  (function () {
    const r = mulberry32(31), lines = [];
    for (let k = 0; k < 10; k++) { let x = 8, y = 8; const seg = []; for (let i = 0; i < 9; i++) { x += Math.round((r() - 0.5) * 4); y += Math.round((r() - 0.5) * 4); seg.push([x, y]); } lines.push(seg); }
    for (let stage = 0; stage < 10; stage++) {
      const c = document.createElement('canvas'); c.width = c.height = 16;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      for (let l = 0; l <= stage; l++) {
        let px0 = 8, py0 = 8;
        for (const p of lines[l]) {
          const n = Math.max(Math.abs(p[0] - px0), Math.abs(p[1] - py0)) || 1;
          for (let i = 0; i <= n; i++) ctx.fillRect(((px0 + (p[0] - px0) * i / n) | 0) & 15, ((py0 + (p[1] - py0) * i / n) | 0) & 15, 1, 1);
          px0 = p[0]; py0 = p[1];
        }
      }
      const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      crackTex.push(t);
    }
  })();
  const crackMat = new THREE.MeshBasicMaterial({ map: crackTex[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const crack = new THREE.Mesh(new THREE.BoxGeometry(1.002, 1.002, 1.002), crackMat);
  crack.visible = false;
  scene.add(crack);

  function makeGeometry(r) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(r.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(r.col, 3));
    g.setIndex(new THREE.BufferAttribute(r.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  const blockGeoCache = {};
  function blockGeometry(id) { return blockGeoCache[id] || (blockGeoCache[id] = makeGeometry(buildBlockBuffer(id, 0))); }
  const itemTexCache = {};
  function itemTexture(id) {
    if (itemTexCache[id]) return itemTexCache[id];
    const t = new THREE.CanvasTexture(itemCanvas(id));
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return (itemTexCache[id] = t);
  }
  const flatBlock = function (b) { return b.cross || b.shape === 'torch' || b.shape === 'ladder' || b.shape === 'door' || b.shape === 'fire' || b.shape === 'rod'; };
  GAME.makeItemMesh = function (s) {
    const it = ITEMS[s.id];
    if (it && it.block && !flatBlock(BLOCKS[it.block])) { const m = new THREE.Mesh(blockGeometry(it.block), solidMat); m.scale.setScalar(0.26); return m; }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: itemTexture(it ? s.id : I.stick), alphaTest: 0.5 }));
    sp.scale.setScalar(0.36);
    return sp;
  };
  GAME.makeBlockEntityMesh = function (id, opts) {
    const m = new THREE.Mesh(blockGeometry(id), opts && opts.compressed ? compressedMat : solidMat);
    if (opts && opts.compressed) m.scale.setScalar(1.02);
    return m;
  };
  const projGeo = { arrow: new THREE.BoxGeometry(0.05, 0.05, 0.7), trident: new THREE.BoxGeometry(0.06, 0.06, 1.3), bobber: new THREE.BoxGeometry(0.16, 0.16, 0.16), pearl: new THREE.BoxGeometry(0.2, 0.2, 0.2), snowball: new THREE.BoxGeometry(0.18, 0.18, 0.18), potion: new THREE.BoxGeometry(0.22, 0.28, 0.22), skull: new THREE.BoxGeometry(0.32, 0.32, 0.32) };
  const projMat = {
    arrow: new THREE.MeshLambertMaterial({ color: 0x9a7a4a }), trident: new THREE.MeshLambertMaterial({ color: 0x3a9a8a }), bobber: new THREE.MeshLambertMaterial({ color: 0xd83a3a }),
    pearl: new THREE.MeshLambertMaterial({ color: 0x1d6f60 }), snowball: new THREE.MeshLambertMaterial({ color: 0xf4f8fc }), potion: new THREE.MeshLambertMaterial({ color: 0x8a40c0 }),
    skull: new THREE.MeshBasicMaterial({ color: 0x3a6ae0 }), skull_black: new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
    fireball: new THREE.MeshBasicMaterial({ color: 0xf08a20 }), small_fireball: new THREE.MeshBasicMaterial({ color: 0xffb030 }), wind: new THREE.MeshBasicMaterial({ color: 0xd0e0ff, transparent: true, opacity: 0.7 }),
    bullet: new THREE.MeshBasicMaterial({ color: 0xf4f0e0 }), eye: new THREE.MeshLambertMaterial({ color: 0x2aa070 }), xp_bottle: new THREE.MeshLambertMaterial({ color: 0x8ae060 })
  };
  projGeo.fireball = new THREE.BoxGeometry(1, 1, 1); projGeo.small_fireball = new THREE.BoxGeometry(0.31, 0.31, 0.31); projGeo.wind = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  projGeo.bullet = new THREE.BoxGeometry(0.3, 0.3, 0.3); projGeo.eye = new THREE.BoxGeometry(0.25, 0.25, 0.25); projGeo.xp_bottle = projGeo.potion;
  const skullEyeGeo = new THREE.BoxGeometry(0.34, 0.08, 0.1), skullEyeMat = new THREE.MeshBasicMaterial({ color: 0x0a1030 });
  GAME.makeProjectileMesh = function (type, opts) {
    const black = type === 'skull' && opts && opts.black;
    const m = new THREE.Mesh(projGeo[type] || projGeo.snowball, black ? projMat.skull_black : projMat[type] || projMat.snowball);
    if (type === 'arrow' || type === 'trident') {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.14), new THREE.MeshLambertMaterial({ color: type === 'trident' ? 0x6ae0d0 : 0xb0b0b8 }));
      head.position.z = type === 'trident' ? 0.66 : 0.36; m.add(head);
    }
    if (type === 'skull') { const eye = new THREE.Mesh(skullEyeGeo, skullEyeMat); eye.position.set(0, 0.04, 0.2); m.add(eye); }
    return m;
  };

  // First-person hands
  const handRig = new THREE.Group();
  handCam.add(handRig);
  const heldMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5, depthTest: false, depthWrite: false, fog: false });
  const armMat = new THREE.MeshBasicMaterial({ color: 0xc8946c, depthTest: false, depthWrite: false, fog: false });
  const hands = { main: { group: new THREE.Group(), id: -2 }, off: { group: new THREE.Group(), id: -2 } };
  handRig.add(hands.main.group, hands.off.group);
  function setHandItem(h, s) {
    const id = s ? s.id : -1;
    if (h.id === id) return;
    h.id = id;
    while (h.group.children.length) h.group.remove(h.group.children[0]);
    let m;
    if (id < 0) { m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.7), armMat); m.position.set(0.05, -0.1, 0.1); m.rotation.set(-0.2, 0.1, 0); }
    else if (ITEMS[id].block && !flatBlock(BLOCKS[ITEMS[id].block])) { m = new THREE.Mesh(blockGeometry(id), heldMat); m.scale.setScalar(0.3); m.rotation.set(0.25, 0.75, 0); }
    else if (id === I.shield) {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.06), new THREE.MeshBasicMaterial({ color: 0x9a7040, depthTest: false, depthWrite: false, fog: false }));
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), new THREE.MeshBasicMaterial({ color: 0xc0c0c8, depthTest: false, depthWrite: false, fog: false }));
      rim.position.z = 0.04; m.add(rim); m.rotation.set(0, 0.3, 0);
    } else { m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: itemTexture(id), alphaTest: 0.5, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false })); m.rotation.set(0, -0.5, 0.15); }
    m.renderOrder = 999;
    m.traverse(function (o) { o.renderOrder = 999; });
    h.group.add(m);
  }

  // The player's body for third-person views, with armour and elytra overlays
  function dressModel(model) {
    const rig = model.rig, body = model.body, parts = [];
    const add = function (parent, slot, w, h, d, x, y, z) {
      const m = new THREE.Mesh(partGeo(w, h, d), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      m.position.set(x, y, z); m.visible = false; parent.add(m); parts.push({ slot: slot, mesh: m });
    };
    add(rig.head, 0, 9, 9, 9, 0, 4, 0);
    add(body, 1, 9, 12.6, 5, 0, 18, 0);
    add(rig.legs[2].p, 1, 5, 5, 5, 0, -2, 0); add(rig.legs[3].p, 1, 5, 5, 5, 0, -2, 0);
    add(body, 2, 8.8, 4, 4.8, 0, 13, 0);
    add(rig.legs[0].p, 2, 4.6, 9, 4.6, 0, -4.5, 0); add(rig.legs[1].p, 2, 4.6, 9, 4.6, 0, -4.5, 0);
    add(rig.legs[0].p, 3, 4.8, 4, 4.8, 0, -10.2, 0); add(rig.legs[1].p, 3, 4.8, 4, 4.8, 0, -10.2, 0);
    const wings = [0, 1].map(function (i) {
      const p = new THREE.Group(), w = new THREE.Mesh(partGeo(10, 18, 1.4), new THREE.MeshLambertMaterial({ color: 0x9890b8 }));
      p.position.set(i ? -1 : 1, 23, -2.6); w.position.set(i ? -5 : 5, -9, 0); p.add(w); body.add(p); p.visible = false; return p;
    });
    model.dress = function (armorIds) {
      parts.forEach(function (a) {
        const it = armorIds[a.slot] && ITEMS[armorIds[a.slot]];
        a.mesh.visible = !!(it && it.armor && it.armor.color);
        if (a.mesh.visible) a.mesh.material.color.setRGB(it.armor.color[0] / 255, it.armor.color[1] / 255, it.armor.color[2] / 255);
      });
      wings.forEach(function (p) { p.visible = armorIds[1] === I.elytra; });
    };
    model.wings = wings;
    return model;
  }
  const playerModel = dressModel(buildModel(PLAYER_SPEC));
  playerModel.root.visible = false;
  scene.add(playerModel.root);
  // A small 3D portrait of you, for the inventory screen.
  let portraitRenderer = null;
  const portraitModel = dressModel(buildModel(PLAYER_SPEC));
  GAME.playerPortrait = function () {
    try {
      if (!portraitRenderer) { portraitRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); portraitRenderer.setSize(160, 220, false); }
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight(0xffffff, 0x556070, 0.95));
      const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(1, 2, 2); sc.add(dl);
      portraitModel.dress(player.inv.armor.map(function (s) { return s ? s.id : 0; }));
      portraitModel.root.rotation.y = 0.45;
      sc.add(portraitModel.root);
      const cam = new THREE.PerspectiveCamera(30, 160 / 220, 0.1, 50);
      cam.position.set(0, 1.05, 4.6); cam.lookAt(0, 0.95, 0);
      portraitRenderer.render(sc, cam);
      return portraitRenderer.domElement.toDataURL();
    } catch (e) { return ''; }
  };

// 67
  // ---------- particles ----------
  const pGeo = new THREE.BoxGeometry(1, 1, 1);
  const pMats = {};
  function pMat(c) {
    const k = c.join(',');
    return pMats[k] || (pMats[k] = new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255), transparent: true }));
  }
  const particles = [];
  function addParticle(x, y, z, c, size, vel, life, grav) {
    if (particles.length > 1200) return;
    const m = new THREE.Mesh(pGeo, pMat(c));
    m.position.set(x, y, z); m.scale.setScalar(size);
    m.userData = { v: vel, life: life, max: life, g: grav, size: size };
    scene.add(m); particles.push(m);
  }
  const rnd = Math.random, sr = function (k) { return (rnd() - 0.5) * k; };
  // Minecraft-style sprite particles: pixel-art puffs that play an 8-frame animation as they age.
  const PUFF_FRAMES = 8, sprites = [];
  function puffTexture(frame, tone) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d'), r = mulberry32(frame * 31 + tone * 7 + 3), t = frame / (PUFF_FRAMES - 1);
    for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
      const d = Math.hypot(px - 7.5, py - 7.5) / 8;
      // Early frames: a dense bright ball. Later: bigger, broken up, darker edges, mostly holes.
      const edge = 0.55 + t * 0.45, keep = d < edge && r() > t * 0.75 * (0.4 + d);
      if (!keep) continue;
      const g = tone === 2 ? 255 : (tone === 0 ? 240 : 196) - t * (tone === 0 ? 90 : 80) - d * 40 + (r() - 0.5) * 30;
      x.fillStyle = tone === 2 ? 'rgb(255,' + (240 - t * 120 | 0) + ',' + (180 - t * 160 | 0) + ')' : 'rgb(' + (g | 0) + ',' + (g | 0) + ',' + (g | 0) + ')';
      x.fillRect(px, py, 1, 1);
    }
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  }
  const puffMats = [0, 1, 2].map(function (tone) { const a = []; for (let f = 0; f < PUFF_FRAMES; f++) a.push(puffTexture(f, tone)); return a; });
  // tone: 0 light explosion cloud, 1 dark smoke, 2 hot flash
  function addSprite(x, y, z, tone, size, vel, life, grow, grav) {
    if (sprites.length > 700) return;
    const m = new THREE.Sprite(puffMats[tone][0]);
    m.position.set(x, y, z); m.scale.setScalar(size);
    m.userData = { v: vel, life: life, max: life, size: size, grow: grow || 0, tone: tone, g: grav || 0 };
    scene.add(m); sprites.push(m);
  }
  function updateSprites(dt) {
    for (let i = sprites.length - 1; i >= 0; i--) {
      const m = sprites[i], u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { scene.remove(m); sprites.splice(i, 1); continue; }
      const age = 1 - u.life / u.max;
      m.material = puffMats[u.tone][Math.min(PUFF_FRAMES - 1, Math.floor(age * PUFF_FRAMES))];
      u.v.multiplyScalar(Math.exp(-2.5 * dt)); u.v.y += u.g * dt;
      m.position.addScaledVector(u.v, dt);
      m.scale.setScalar(u.size * (1 + age * u.grow));
    }
  }
  GAME.updateSprites = updateSprites;
  function itemColor(id) {
    if (ITEMS[id] && ITEMS[id].block) return Atlas.avgColor[ITEMS[id].block] || [200, 200, 200];
    const c = itemCanvas(id).getContext('2d').getImageData(0, 0, 16, 16).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < c.length; i += 4) if (c[i + 3] > 100) { r += c[i]; g += c[i + 1]; b += c[i + 2]; n++; }
    return n ? [r / n, g / n, b / n] : [200, 200, 200];
  }
  const POTION_COLOR = { instant_damage: [120, 20, 20], poison: [78, 147, 49], slowness: [90, 108, 129], weakness: [72, 77, 72] };
  GAME.particles = function (type, x, y, z, n, arg) {
    n = n || 8;
    for (let i = 0; i < n; i++) {
      switch (type) {
        case 'block': addParticle(x + rnd(), y + rnd(), z + rnd(), Atlas.avgColor[arg] || [180, 180, 180], 0.13, new THREE.Vector3(sr(4), rnd() * 4 + 1, sr(4)), 0.5 + rnd() * 0.4, 18); break;
        case 'poof': addParticle(x + sr(0.8), y + sr(0.8), z + sr(0.8), [236, 236, 236], 0.18, new THREE.Vector3(sr(1.5), rnd() * 1.5, sr(1.5)), 0.6, -1); break;
        case 'flame': addParticle(x, y, z, rnd() < 0.5 ? [255, 190, 60] : [240, 110, 30], 0.09, new THREE.Vector3(sr(0.3), 1 + rnd(), sr(0.3)), 0.4, -1); break;
        case 'crit': addParticle(x + sr(0.6), y + sr(0.6), z + sr(0.6), [255, 250, 200], 0.08, new THREE.Vector3(sr(6), sr(6), sr(6)), 0.35, 6); break;
        case 'smash': { const a = i / n * Math.PI * 2, s = 5 + rnd() * 3; addParticle(x, y + 0.1, z, Atlas.avgColor[arg] || [150, 120, 90], 0.16 + rnd() * 0.08, new THREE.Vector3(Math.cos(a) * s, 2 + rnd() * 3, Math.sin(a) * s), 0.6, 14); break; }
        case 'explosion': {
          // Vanilla look: a flash, a cluster of big grey clouds that bloom and break apart, rising smoke and sparks.
          const big = n >= 10;
          if (i === 0) addSprite(x, y, z, 2, big ? 3.2 : 1.6, new THREE.Vector3(), 0.25, 0.6);
          if (i % 3 === 0) addSprite(x + sr(big ? 4 : 1.5), y + sr(big ? 3 : 1.2), z + sr(big ? 4 : 1.5), 0, (big ? 1.6 : 0.8) + rnd() * 1.2, new THREE.Vector3(sr(3), rnd() * 2, sr(3)), 0.5 + rnd() * 0.4, 1.4);
          else if (i % 3 === 1) addSprite(x + sr(2), y + sr(2) + 0.5, z + sr(2), 1, 0.7 + rnd() * 0.8, new THREE.Vector3(sr(1), 1.5 + rnd() * 1.5, sr(1)), 1.4 + rnd() * 1.2, 1.2, 0.4);
          else addParticle(x + sr(1), y + sr(1), z + sr(1), rnd() < 0.5 ? [255, 210, 120] : [250, 160, 60], 0.08, new THREE.Vector3(sr(14), rnd() * 9, sr(14)), 0.4 + rnd() * 0.4, 18);
          break;
        }
        case 'smoke': addSprite(x + sr(0.2), y, z + sr(0.2), 1, 0.25 + rnd() * 0.15, new THREE.Vector3(sr(0.4), 1 + rnd() * 0.6, sr(0.4)), 0.6 + rnd() * 0.4, 1.5); break;
        case 'sonic': addSprite(x, y, z, 0, 1.4, new THREE.Vector3(), 0.5, 1); break;
        case 'fangs': addParticle(x + sr(0.6), y, z + sr(0.6), [200, 200, 190], 0.18, new THREE.Vector3(0, 3, 0), 0.4, 8); break;
        case 'debris': addParticle(x + rnd(), y + rnd(), z + rnd(), Atlas.avgColor[arg] || [150, 150, 150], 0.12 + rnd() * 0.1, new THREE.Vector3(sr(10), 3 + rnd() * 7, sr(10)), 0.8 + rnd() * 0.6, 22); break;
        case 'firework': addParticle(x + sr(1), y + sr(1), z + sr(1), [[255, 80, 80], [80, 200, 255], [255, 230, 80], [180, 90, 255]][i % 4], 0.08, new THREE.Vector3(sr(8), sr(8), sr(8)), 0.8, 2); break;
        case 'portal': addParticle(x + sr(1), y + sr(2), z + sr(1), [160, 60, 220], 0.08, new THREE.Vector3(sr(2), sr(2), sr(2)), 0.6, 0); break;
        case 'skull': addParticle(x + sr(1), y + sr(1), z + sr(1), rnd() < 0.5 ? [40, 50, 90] : [70, 80, 120], 0.2 + rnd() * 0.2, new THREE.Vector3(sr(1.5), rnd() * 1.5, sr(1.5)), 0.7, -1); break;
        case 'snow': addParticle(x, y, z, [244, 248, 252], 0.08, new THREE.Vector3(sr(4), rnd() * 3, sr(4)), 0.4, 14); break;
        case 'splash': addParticle(x + sr(0.6), y, z + sr(0.6), [200, 220, 255], 0.07, new THREE.Vector3(sr(2), 2 + rnd() * 2, sr(2)), 0.5, 14); break;
        case 'happy': addParticle(x + sr(1.5), y + rnd(), z + sr(1.5), [90, 220, 90], 0.08, new THREE.Vector3(0, 0.8, 0), 0.8, 0); break;
        case 'totem': addParticle(x + sr(1), y + sr(1.5), z + sr(1), rnd() < 0.5 ? [80, 220, 80] : [250, 220, 60], 0.1, new THREE.Vector3(sr(5), 2 + rnd() * 5, sr(5)), 1.2, 4); break;
        case 'crumbs': addParticle(x + sr(0.3), y, z + sr(0.3), itemColor(arg), 0.06, new THREE.Vector3(sr(1.5), 1 + rnd(), sr(1.5)), 0.4, 14); break;
        case 'break_item': addParticle(x + sr(0.3), y, z + sr(0.3), itemColor(arg), 0.08, new THREE.Vector3(sr(3), 2 + rnd() * 2, sr(3)), 0.5, 14); break;
        case 'note': addParticle(x, y, z, [[90, 220, 90], [250, 90, 90], [90, 150, 250]][rnd() * 3 | 0], 0.14, new THREE.Vector3(0, 1.2, 0), 0.8, 0); break;
        case 'potion': addParticle(x + sr(1), y + rnd(), z + sr(1), POTION_COLOR[arg] || [180, 80, 200], 0.1, new THREE.Vector3(sr(3), 1 + rnd() * 2, sr(3)), 0.7, 4); break;
      }
    }
  };
  const heartTex = (function () {
    const rows = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const ctx = c.getContext('2d');
    rows.forEach(function (row, y) { for (let x = 0; x < 7; x++) if (row[x] === '1') { ctx.fillStyle = y === 1 && x === 1 ? '#ffb3c0' : '#e8304a'; ctx.fillRect(x, y + 1, 1, 1); } });
    const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return t;
  })();
  GAME.hearts = function (mob) {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
      s.scale.setScalar(0.35);
      s.position.set(mob.pos.x + sr(0.8), mob.centerY + mob.sp.h / 2 + rnd() * 0.4, mob.pos.z + sr(0.8));
      s.userData = { v: new THREE.Vector3(0, 0.9 + rnd() * 0.5, 0), life: 1.2 + i * 0.15, max: 1.4, g: 0, heart: true };
      scene.add(s); particles.push(s);
    }
  };
  const shockwaves = [];
  GAME.shockwave = function (x, y, z) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.95, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.userData.t = 0;
    scene.add(m); shockwaves.push(m);
  };
  let shake = 0;
  GAME.shake = function (p, a) { if (p === player) shake = Math.max(shake, a); };
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const m = particles[i], u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { scene.remove(m); if (u.heart) m.material.dispose(); particles.splice(i, 1); continue; }
      u.v.y -= u.g * dt;
      const nx = m.position.x + u.v.x * dt, ny = m.position.y + u.v.y * dt, nz = m.position.z + u.v.z * dt;
      if (!u.heart && u.g > 0 && IS_SOLID[GAME.world.get(Math.floor(nx), Math.floor(ny), Math.floor(nz))]) { u.v.multiplyScalar(0.3); u.v.y = 0; }
      else m.position.set(nx, ny, nz);
      if (u.heart) m.material.opacity = Math.min(1, u.life); else m.scale.setScalar(u.size * Math.min(1, u.life / u.max * 2));
    }
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i];
      s.userData.t += dt;
      const t = s.userData.t / 0.45;
      s.scale.setScalar(1 + t * 4.5); s.material.opacity = 0.8 * (1 - t);
      if (t >= 1) { scene.remove(s); s.geometry.dispose(); s.material.dispose(); shockwaves.splice(i, 1); }
    }
  }

  // ---------- sound ----------
  GAME.sound = function (name, arg, pos, broadcast) {
    AUDIO.play(name, arg, pos);
    if (broadcast && GAME.online) NET.send({ t: 'snd', name: name, arg: arg, pos: pos ? [pos.x, pos.y, pos.z] : null });
  };
  const DISC_SONGS = {
    '13': [0, 3, 7, 3, -2, 0, 3, -5, -2, 0], cat: [0, 4, 7, 12, 11, 7, 4, 2, 4, 7, 9, 7], pigstep: [0, 0, 3, 5, 3, 0, -2, 0, 7, 5, 3, 0]
  };
  const playing = new Map();
  GAME.playJukebox = function (idx, disc) {
    if (playing.has(idx)) { clearInterval(playing.get(idx)); playing.delete(idx); }
    if (!disc) return;
    const song = DISC_SONGS[ITEMS[disc] && ITEMS[disc].disc] || DISC_SONGS.cat;
    const pos = { x: idx % WX + 0.5, y: Math.floor(idx / WXZ) + 0.5, z: Math.floor(idx / WX) % WZ + 0.5 };
    let i = 0;
    playing.set(idx, setInterval(function () { if (state === 'play') { AUDIO.play('note', song[i % song.length], pos); i++; } }, 300));
    toast('Now playing: ' + ITEMS[disc].name);
  };
  GAME.jukebox = function (x, y, z, discId) {
    const idx = world.idx(x, y, z), cur = world.jukeboxes.get(idx);
    if (GAME.online) { NET.send({ t: 'juke', idx: idx, disc: cur ? 0 : discId }); return !cur && !!discId; }
    if (cur) { world.jukeboxes.delete(idx); GAME.playJukebox(idx, 0); GAME.dropStack(stack(cur, 1), new THREE.Vector3(x + 0.5, y + 1.2, z + 0.5), null); return false; }
    if (!discId) return false;
    world.jukeboxes.set(idx, discId); GAME.playJukebox(idx, discId);
    return true;
  };

  // ---------- chunks, streamed in around you ----------
  let world = null;
  const chunks = new Map();     // key -> meshes
  const dirty = new Set();
  function chunkKey(cx, cy, cz) { return cx + cy * CX + cz * CX * CY; }
  function rebuildChunk(cx, cy, cz) {
    const key = chunkKey(cx, cy, cz);
    const old = chunks.get(key);
    if (old) old.forEach(function (m) { scene.remove(m); m.geometry.dispose(); });
    const res = buildChunk(world, cx, cy, cz), meshes = [];
    const add = function (buf, mat, order) { if (!buf.n) return; const m = new THREE.Mesh(makeGeometry(buf), mat); m.renderOrder = order; meshes.push(m); scene.add(m); };
    add(res.solid, solidMat, 0); add(res.glow, glowMat, 0); add(res.water, waterMat, 1); add(res.trans, transMat, 2);
    chunks.set(key, meshes);
  }
  function dropChunk(key) {
    const old = chunks.get(key);
    if (old) old.forEach(function (m) { scene.remove(m); m.geometry.dispose(); });
    chunks.delete(key);
  }
  function markDirty(x, y, z) {
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.floor((x + dx) / CS), cy = Math.floor((y + dy) / CS), cz = Math.floor((z + dz) / CS);
      if (cx >= 0 && cy >= 0 && cz >= 0 && cx < CX && cy < CY && cz < CZ) { const k = chunkKey(cx, cy, cz); if (chunks.has(k)) dirty.add(k); }
    }
  }
  // Rebuild changed chunks, nearest first, a limited number per frame so big explosions don't freeze the game.
  function flushDirty(limit) {
    if (!dirty.size) return;
    let list = Array.from(dirty);
    if (limit !== undefined && list.length > limit) {
      const pcx = player.pos.x / CS, pcz = player.pos.z / CS;
      const d = function (k) { const cx = k % CX, cz = Math.floor(k / (CX * CY)); return (cx - pcx) * (cx - pcx) + (cz - pcz) * (cz - pcz); };
      list.sort(function (a, b) { return d(a) - d(b); });
      list = list.slice(0, limit);
    }
    for (const key of list) { dirty.delete(key); if (chunks.has(key)) rebuildChunk(key % CX, Math.floor(key / CX) % CY, Math.floor(key / (CX * CY))); }
  }
  GAME.markDirty = markDirty;
  GAME.flush = function () { flushDirty(64); };
  // Build missing columns of chunks inside the render distance, closest first, for up to `budget` ms.
  let streamQueue = [], lastStreamCell = null;
  function streamChunks(budget) {
    const R = settings.renderDist, pcx = Math.floor(camera.position.x / CS), pcz = Math.floor(camera.position.z / CS);
    const cell = pcx + ',' + pcz + ',' + R;
    if (cell !== lastStreamCell) {
      lastStreamCell = cell;
      streamQueue = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        if (cx < 0 || cz < 0 || cx >= CX || cz >= CZ || dx * dx + dz * dz > R * R + 1) continue;
        if (!chunks.has(chunkKey(cx, 0, cz))) streamQueue.push([cx, cz, dx * dx + dz * dz]);
      }
      streamQueue.sort(function (a, b) { return b[2] - a[2]; });
      chunks.forEach(function (_, key) {
        const cx = key % CX, cz = Math.floor(key / (CX * CY));
        if ((cx - pcx) * (cx - pcx) + (cz - pcz) * (cz - pcz) > (R + 2) * (R + 2)) dropChunk(key);
      });
    }
    const t0 = performance.now();
    while (streamQueue.length && performance.now() - t0 < budget) {
      const c = streamQueue.pop();
      if (chunks.has(chunkKey(c[0], 0, c[1]))) continue;
      for (let cy = 0; cy < CY; cy++) rebuildChunk(c[0], cy, c[1]);
    }
    return streamQueue.length;
  }

  // ---------- changing blocks ----------
  function inWorld(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < WX && z < WZ && y < WY; }
  GAME.removeBlockState = function (x, y, z) {
    const idx = world.idx(x, y, z), c = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
    if (world.chests.has(idx)) { for (const s of world.chests.get(idx)) if (s) GAME.dropStack(s, c, null); world.chests.delete(idx); if (GAME.online) NET.send({ t: 'chest', idx: idx, slots: new Array(27).fill(null) }); }
    if (world.furnaces.has(idx)) { const f = world.furnaces.get(idx); for (const s of [f.input, f.fuel, f.output]) if (s) GAME.dropStack(s, c, null); world.furnaces.delete(idx); }
    if (world.jukeboxes.has(idx)) { if (!GAME.online) GAME.dropStack(stack(world.jukeboxes.get(idx), 1), c, null); world.jukeboxes.delete(idx); GAME.playJukebox(idx, 0); }
    world.timers.delete(idx);
  };
  function setBlock(x, y, z, id, meta) {
    if (!inWorld(x, y, z)) return;
    const cur = world.get(x, y, z);
    if (cur && cur !== id) GAME.removeBlockState(x, y, z, cur);
    world.set(x, y, z, id);
    world.setMeta(x, y, z, meta || 0);
    markDirty(x, y, z);
  }
  GAME.setBlock = function (x, y, z, id, meta) { setBlock(x, y, z, id, meta); flushDirty(); };
  const NEAR6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  GAME.placeAt = function (x, y, z, id, meta) {
    setBlock(x, y, z, id, meta);
    const idx = world.idx(x, y, z), b = BLOCKS[id];
    if (b.sapling) world.timers.set(idx, 40 + Math.random() * 80);
    if (id === B.fire && world.get(x, y - 1, z) !== B.netherrack && world.get(x, y - 1, z) !== B.magma_block) world.timers.set(idx, 4 + Math.random() * 6);
    if (IS_LAVA[id] && NEAR6.some(function (n) { return IS_WATER[world.get(x + n[0], y + n[1], z + n[2])]; })) setBlock(x, y, z, B.obsidian, 0);
    if (IS_WATER[id]) for (const n of NEAR6) {
      const nx = x + n[0], ny = y + n[1], nz = z + n[2], nb = world.get(nx, ny, nz);
      if (IS_LAVA[nb]) setBlock(nx, ny, nz, B.obsidian, 0);
      if (nb === B.fire) setBlock(nx, ny, nz, 0, 0);
    }
    if (b.gravity) settle(x, y, z);
    concreteCheck(x, y, z);
    flushDirty();
  };
  function concreteCheck(x, y, z) {
    const id = world.get(x, y, z), b = BLOCKS[id];
    if (!b || !/^concrete_powder_/.test(b.key)) return;
    if (NEAR6.some(function (n) { return IS_WATER[world.get(x + n[0], y + n[1], z + n[2])]; })) setBlock(x, y, z, B[b.key.replace('powder_', '')], 0);
  }
  function settle(x, y, z) {
    let id = world.get(x, y, z);
    while (id && BLOCKS[id].gravity && y > 0) {
      const below = world.get(x, y - 1, z);
      if (below && !IS_LIQUID[below] && !IS_CROSS[below]) break;
      setBlock(x, y, z, IS_WATER[world.get(x + 1, y, z)] || IS_WATER[world.get(x, y + 1, z)] ? B.water : 0, 0);
      let ny = y - 1;
      while (ny > 0) { const b2 = world.get(x, ny - 1, z); if (b2 && !IS_LIQUID[b2] && !IS_CROSS[b2]) break; ny--; }
      setBlock(x, ny, z, id, 0);
      concreteCheck(x, ny, z);
      y++;
      id = world.get(x, y, z);
    }
  }
  GAME.breakBlock = function (x, y, z, drops) {
    const id = world.get(x, y, z);
    if (!id) return;
    const b = BLOCKS[id], meta = world.getMeta(x, y, z);
    if (drops && GAME.rules.doTileDrops) {
      const d = blockDrops(id, heldStack(), Math.random);
      for (const s of d.items) GAME.dropStack(s, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), null);
      if (d.xp) addXp(d.xp);
    }
    GAME.particles('block', x, y, z, 12, id);
    GAME.sound('break', id, { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    setBlock(x, y, z, 0, 0);
    if (b.shape === 'door') { const oy = meta & META_TOP ? y - 1 : y + 1; if (world.get(x, oy, z) === id) setBlock(x, oy, z, 0, 0); }
    if (NEAR6.some(function (n) { return n[1] !== -1 && IS_WATERLIKE[world.get(x + n[0], y + n[1], z + n[2])]; })) setBlock(x, y, z, B.water, 0);
    let up = y + 1;
    while (true) {
      const a = world.get(x, up, z), ab = BLOCKS[a];
      if (!a || !((IS_CROSS[a] && !IS_WATERLIKE[a]) || ab.key === 'sugar_cane' || ab.key === 'cactus' || (ab.shape === 'torch' && !(world.getMeta(x, up, z) & META_WALL)) || ab.shape === 'carpet' || ab.shape === 'cake' || (ab.shape === 'door' && !(world.getMeta(x, up, z) & META_TOP)))) break;
      if (drops && GAME.rules.doTileDrops) for (const s of blockDrops(a, null, Math.random).items) GAME.dropStack(s, new THREE.Vector3(x + 0.5, up + 0.5, z + 0.5), null);
      setBlock(x, up, z, 0, 0);
      if (ab.shape === 'door') setBlock(x, up + 1, z, 0, 0);
      if (ab.key !== 'sugar_cane' && ab.key !== 'cactus') break;
      up++;
    }
    settle(x, y + 1, z);
    flushDirty();
  };
  GAME.growSapling = function (x, y, z) { const ok = growSapling(x, y, z); flushDirty(); return ok; };

  // ---------- things you create (sent to the server when online) ----------
  GAME.dropStack = function (s, pos, vel, delay) {
    if (!s || !s.n) return;
    if (GAME.online) { NET.send({ t: 'drop', s: s, pos: [pos.x, pos.y, pos.z], vel: vel ? [vel.x, vel.y, vel.z] : null, delay: delay }); return; }
    const e = new ItemEntity(Object.assign({}, s), pos, vel);
    if (delay) e.delay = delay;
    GAME.items.push(e);
  };
  const localProjectiles = [];
  GAME.throwProjectile = function (type, speed, opts) {
    const d = lookDirection();
    const from = eyePos().addScaledVector(d, 0.5);
    const vel = d.clone().multiplyScalar(speed);
    if (type === 'bobber') vel.y += 3;
    vel.add(player.vel.clone().multiplyScalar(0.5));
    if (GAME.online && type !== 'bobber') { NET.send({ t: 'proj', type: type, pos: [from.x, from.y, from.z], vel: [vel.x, vel.y, vel.z], opts: opts || {} }); return null; }
    const p = new Projectile(type, from, vel, player, opts);
    (type === 'bobber' && GAME.online ? localProjectiles : GAME.projectiles).push(p);
    return p;
  };
  GAME.spawnTnt = function (x, y, z) { if (GAME.online) NET.send({ t: 'tnt', x: x, y: y, z: z }); else GAME.tnts.push(new PrimedTnt(x, y, z, 4)); };
  GAME.summonMob = function (key, x, y, z) {
    if (GAME.online) { NET.send({ t: 'cmd', text: '/summon ' + key + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + z.toFixed(1) }); return; }
    const sp = speciesByKey(key); if (!sp) return;
    const m = spawnMob(sp, x, y, z); m.persistent = true; GAME.particles('poof', x, y + 0.5, z, 6);
    return m;
  };
  GAME.setFire = function (x, y, z) { if (!world.get(x, y, z)) setBlock(x, y, z, B.fire, 0); };
  GAME.startStrike = function (kind, target, owner) { if (GAME.online) NET.send({ t: 'strike', kind: kind, target: target }); else startStrike(kind, target, owner); };
  GAME.nameMob = function (m, name) { if (GAME.online) NET.send({ t: 'name', id: m.id, name: name }); else m.customName = name; toast('Named ' + m.sp.name + ' "' + name + '"'); };
  GAME.containerChanged = function (kind, idx) {
    if (!GAME.online) return;
    if (kind === 'chest') NET.send({ t: 'chest', idx: idx, slots: world.chests.get(idx) });
    else { const f = world.furnaces.get(idx); NET.send({ t: 'furn', idx: idx, f: { input: f.input, fuel: f.fuel, output: f.output, xpTaken: f.xp < 1 } }); }
  };
  GAME.explode = explode;
  const fishLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x202020 }));
  fishLine.frustumCulled = false; fishLine.visible = false;
  scene.add(fishLine);

  function unloadWorld() {
    Array.from(chunks.keys()).forEach(dropChunk);
    dirty.clear(); streamQueue = []; lastStreamCell = null;
    for (const list of [GAME.mobs, GAME.items, GAME.projectiles, GAME.tnts, localProjectiles]) { list.forEach(function (e) { if (e.model) scene.remove(e.model.root); if (e.mesh) scene.remove(e.mesh); }); list.length = 0; }
    GAME.strikes.length = 0;
    particles.forEach(function (m) { scene.remove(m); }); particles.length = 0;
    playing.forEach(function (t) { clearInterval(t); }); playing.clear();
    NET.clearAll();
    world = null; GAME.world = null;
  }

// 67
  // ---------- day, night and weather ----------
  function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  let flashT = 0, thunderClock = 8, dayLight = 1;
  function updateSky(dt, medium) {
    if (!GAME.online && GAME.rules.doDaylightCycle) GAME.dayTime = (GAME.dayTime + dt / 1200) % 1;
    if (!GAME.online && GAME.rules.doWeatherCycle && dt > 0) {
      GAME.weatherTimer -= dt;
      if (GAME.weatherTimer <= 0) {
        GAME.weather = GAME.weather === 'clear' ? (Math.random() < 0.15 ? 'thunder' : 'rain') : 'clear';
        GAME.weatherTimer = GAME.weather === 'clear' ? 600 + Math.random() * 900 : 180 + Math.random() * 240;
      }
    }
    const ang = GAME.dayTime * Math.PI * 2, h = Math.sin(ang);
    const wet = GAME.weather !== 'clear';
    const day = smooth(-0.2, 0.25, h) * (wet ? 0.7 : 1);
    dayLight = day;
    const dusk = Math.max(0, 1 - Math.abs(h) / 0.3) * 0.55 * (wet ? 0.3 : 1);
    skyColor.copy(SKY_NIGHT).lerp(wet ? SKY_RAIN : SKY_DAY, day).lerp(SKY_DUSK, dusk * (0.4 + day * 0.6));
    if (flashT > 0) { flashT -= dt; skyColor.lerp(new THREE.Color(0xffffff), Math.max(0, flashT) * 2); }
    let light = 0.24 + 0.76 * day + (flashT > 0 ? flashT : 0);
    if (hasEffect('night_vision')) light = Math.max(light, 0.95);
    light = Math.min(1, light);
    solidMat.color.setScalar(light); waterMat.color.setScalar(light); transMat.color.setScalar(light); compressedMat.color.setRGB(light * 0.4, light * 0.25, light * 0.25);
    heldMat.color.setScalar(Math.max(light, 0.55));
    cloudMat.color.setScalar(0.35 + 0.65 * day);
    hemi.intensity = 0.25 + 0.6 * day; sunLight.intensity = 0.05 + 0.5 * day;
    starMat.opacity = wet ? 0 : clamp(1 - day * 1.6, 0, 1);
    const c = camera.position;
    sun.position.set(c.x + Math.cos(ang) * 300, c.y + Math.sin(ang) * 300, c.z + 40);
    moon.position.set(c.x - Math.cos(ang) * 300, c.y - Math.sin(ang) * 300, c.z - 40);
    sun.scale.setScalar(1.6); moon.scale.setScalar(1.6);
    sun.lookAt(c); moon.lookAt(c);
    sun.visible = h > -0.15 && !wet; moon.visible = h < 0.15 && !wet;
    stars.position.copy(c); stars.rotation.z = ang;
    clouds.position.set(c.x, 128, c.z);
    clouds.material.map.offset.set((c.x / 128 + performance.now() / 600000) % 1, (-c.z / 128) % 1);
    const bx = clamp(Math.floor(player.pos.x), 0, WX - 1), bz = clamp(Math.floor(player.pos.z), 0, WZ - 1);
    const showRain = wet && world.biomes[bx + bz * WX] !== DESERT && !medium;
    rain.visible = showRain;
    if (showRain) {
      const arr = rainGeo.attributes.position.array;
      for (let i = 0; i < RAIN_N; i++) {
        const d = rainDrops[i];
        d[1] -= dt * 22;
        if (d[1] < -8) { d[1] += 30; d[0] = Math.random() * 40 - 20; d[2] = Math.random() * 40 - 20; }
        const x = c.x + d[0], y = c.y + d[1], z = c.z + d[2];
        const blocked = world.topSolid(x, z) > y;
        arr[i * 6] = x; arr[i * 6 + 1] = blocked ? -999 : y; arr[i * 6 + 2] = z;
        arr[i * 6 + 3] = x; arr[i * 6 + 4] = blocked ? -999 : y + 0.6; arr[i * 6 + 5] = z;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    if (GAME.weather === 'thunder' && dt > 0) { thunderClock -= dt; if (thunderClock <= 0) { thunderClock = 6 + Math.random() * 14; flashT = 0.35; setTimeout(function () { AUDIO.play('thunder'); }, 400 + Math.random() * 1200); } }
    const far = settings.renderDist * CS;
    if (medium) {
      scene.fog.color.copy(medium === 'lava' ? LAVA_FOG : WATER_FOG).multiplyScalar(medium === 'lava' ? 1 : 0.4 + 0.6 * day);
      scene.background = scene.fog.color;
      scene.fog.near = medium === 'lava' ? 0.1 : 0.5; scene.fog.far = medium === 'lava' ? 3 : (hasEffect('night_vision') ? 50 : 22);
    } else {
      scene.fog.color.copy(skyColor);
      scene.background = skyColor;
      scene.fog.near = far * (wet ? 0.35 : 0.55); scene.fog.far = far * (wet ? 0.8 : 0.98);
    }
  }

  // ---------- camera ----------
  let view = 0;
  const VIEW_NAMES = ['First person', 'Third person (behind)', 'Third person (front)', "Bird's-eye"];
  const eye = new THREE.Vector3(), dir = new THREE.Vector3(), tmp = new THREE.Vector3();
  function clearDistance(from, d, max) {
    for (let t = 0.3; t <= max; t += 0.1) {
      tmp.copy(from).addScaledVector(d, t);
      if (IS_OPAQUE[world.get(Math.floor(tmp.x), Math.floor(tmp.y), Math.floor(tmp.z))]) return Math.max(0.3, t - 0.35);
    }
    return max;
  }
  let fovNow = settings.fov, swing = 0;
  GAME.swing = function () { swing = 1; NET.swung = true; };
  function updateCamera(dt) {
    const p = player;
    eye.set(p.pos.x, p.pos.y + EYE - (p.sneaking ? 0.3 : 0) - p.stepSmooth, p.pos.z);
    dir.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
    const spectator = p.gamemode === 'spectator';
    if (view === 0) {
      camera.position.copy(eye);
      if (p.onGround && p.moving && !spectator) camera.position.y += Math.abs(Math.sin(p.walkT)) * 0.06;
      camera.rotation.set(p.pitch, p.yaw, 0);
    } else if (view === 1) {
      camera.position.copy(eye).addScaledVector(dir, -(spectator ? 4.5 : clearDistance(eye, dir.clone().negate(), 4.5)));
      camera.rotation.set(p.pitch, p.yaw, 0);
    } else if (view === 2) {
      camera.position.copy(eye).addScaledVector(dir, spectator ? 4.5 : clearDistance(eye, dir, 4.5));
      camera.lookAt(eye);
    } else {
      camera.position.set(eye.x + Math.sin(p.yaw) * 16, eye.y + 30, eye.z + Math.cos(p.yaw) * 16);
      camera.lookAt(eye);
    }
    if (shake > 0) { camera.position.x += sr(shake * 0.4); camera.position.y += sr(shake * 0.4); shake = Math.max(0, shake - dt * 1.8); }
    if (p.hurtFlash > 0 && view === 0) camera.rotation.z = Math.sin(p.hurtFlash * Math.PI) * 0.06;
    if (hasEffect('nausea')) camera.rotation.z += Math.sin(performance.now() / 400) * 0.08;
    const zoom = p.use && p.use.type === 'spyglass';
    let targetFov = settings.fov * (p.sprinting || (p.flying && p.runLock) ? 1.12 : 1);
    if (p.gliding) targetFov *= 1 + Math.min(0.2, p.vel.length() / 200);
    if (p.use && (p.use.type === 'bow' || p.use.type === 'crossbow')) targetFov *= 1 - 0.15 * Math.min(1, p.use.t);
    if (zoom) targetFov = 10;
    fovNow += (targetFov - fovNow) * Math.min(1, dt * (zoom ? 14 : 8));
    if (Math.abs(camera.fov - fovNow) > 0.01) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
    $('spyglass').hidden = !zoom;

    const pm = playerModel;
    pm.root.visible = view !== 0 && !spectator;
    pm.root.position.copy(p.pos);
    if (p.sneaking) pm.root.position.y -= 0.15;
    pm.root.rotation.y = p.yaw + Math.PI;
    pm.body.rotation.x = p.gliding ? Math.PI / 2 - 0.25 : p.sneaking ? 0.35 : 0;
    pm.rig.head.rotation.x = p.gliding ? -1.2 : -p.pitch * 0.8;
    const swingAmt = p.moving && !p.gliding ? 0.8 : 0;
    pm.rig.legs.forEach(function (L) { L.p.rotation.x = Math.sin(p.walkT + L.phase) * swingAmt; });
    if (swing > 0) pm.rig.legs[3].p.rotation.x = pm.rig.legs[5].p.rotation.x = -Math.sin(swing * Math.PI) * 1.4;
    pm.wings[0].rotation.z = p.gliding ? 0.9 : 0.15; pm.wings[1].rotation.z = p.gliding ? -0.9 : -0.15;

    setHandItem(hands.main, heldStack());
    setHandItem(hands.off, offStack());
    handRig.visible = view === 0 && !spectator && !p.dead && !zoom;
    hands.off.group.visible = !!offStack();
    const bob = p.moving && p.onGround ? Math.sin(p.walkT) * 0.025 : 0;
    const sw = Math.sin(swing * Math.PI);
    const u = p.use, mg = hands.main.group, og = hands.off.group;
    mg.position.set(0.42 + bob, -0.36 - Math.abs(bob) - sw * 0.08, -0.7 - sw * 0.12);
    mg.rotation.set(-sw * 0.7, 0, 0);
    og.position.set(-0.42 - bob, -0.36 - Math.abs(bob), -0.7);
    og.rotation.set(0, 0, 0);
    if (u) {
      const g = u.hand === 'off' ? og : mg, s = u.hand === 'off' ? -1 : 1;
      if (u.type === 'eat') { g.position.set(0.15 * s, -0.3 + Math.abs(Math.sin(u.t * 14)) * 0.04, -0.5); g.rotation.set(0.3, -0.5 * s, 0); }
      else if (u.type === 'bow' || u.type === 'crossbow') { g.position.set(0.12 * s, -0.28, -0.6 + Math.min(1, u.t) * 0.08); g.rotation.set(0, -0.7 * s, 0.3 * s); }
      else if (u.type === 'shield') { g.position.set(0.2 * s, -0.25, -0.55); g.rotation.set(0, 0.4 * s, 0); }
      else if (u.type === 'spear' || u.type === 'trident') { g.position.set(0.32 * s, -0.3 + (u.type === 'trident' ? 0.15 : 0), -0.65); g.rotation.set(u.type === 'trident' ? 1.2 : -1.1, 0, 0); }
    }
    swing = Math.max(0, swing - dt * 4);
    AUDIO.listener = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: p.yaw };
  }

  // ---------- targeting ----------
  const ray = new THREE.Ray(), hitBox = new THREE.Box3(), hitPoint = new THREE.Vector3();
  function pickMob(o, d, maxDist) {
    ray.set(o, d);
    let best = null, bestD = maxDist;
    const check = function (a) {
      if (a.dead || a.pos.distanceToSquared(o) > (maxDist + 3) * (maxDist + 3)) return;
      if (ray.intersectBox(a.box(hitBox), hitPoint)) { const dd = hitPoint.distanceTo(o); if (dd < bestD) { bestD = dd; best = a; } }
    };
    GAME.mobs.forEach(check);
    NET.remotes.forEach(function (r) { if (r.gamemode !== 'spectator') check(r); });
    return best ? { mob: best, t: bestD } : null;
  }
  let target = null, targetMob = null;
  function updateTarget() {
    const p = player;
    if (p.gamemode === 'spectator' || p.dead) { target = null; targetMob = null; selBox.visible = false; crack.visible = false; $('target-label').hidden = true; return; }
    const o = eyePos(), d = lookDirection();
    const held = heldStack();
    const reach = p.gamemode === 'creative' ? 5 : 4.5;
    const mobReach = p.gamemode === 'creative' ? 5 : held && (ITEMS[held.id].kind === 'spear' || ITEMS[held.id].kind === 'trident') ? 4.5 : 3;
    target = world.raycast(o, d, reach, false);
    const pm = pickMob(o, d, mobReach);
    targetMob = pm && (!target || pm.t < target.t) ? pm.mob : null;
    const label = $('target-label');
    if (targetMob) {
      selBox.visible = false;
      const sp = targetMob.sp;
      if (sp.key !== 'player' && !seen.has(sp.key)) { seen.add(sp.key); saveSeen(); toast('New in the bestiary: ' + sp.name); }
      const hostile = isHostileSpecies(sp) || targetMob.angry > 0 ? ' <em>hostile</em>' : '';
      const nm = targetMob.customName ? esc(targetMob.customName) + ' <small>(' + sp.name + ')</small>' : sp.key === 'player' ? esc(targetMob.name) : sp.name;
      label.innerHTML = '<b>' + nm + '</b>' + hostile + (targetMob.hp !== undefined ? ' <small>' + Math.ceil(targetMob.hp) + ' / ' + targetMob.maxHp + ' HP</small>' : '');
      label.hidden = hudHidden;
    } else if (target) {
      const boxes = IS_SHAPED[target.id] ? shapeBoxes(target.id, world.getMeta(target.x, target.y, target.z), world, target.x, target.y, target.z, false) : [[0, 0, 0, 1, 1, 1]];
      let x0 = 1, y0 = 1, z0 = 1, x1 = 0, y1 = 0, z1 = 0;
      boxes.forEach(function (b) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]); });
      selBox.visible = !hudHidden;
      selBox.position.set(target.x + (x0 + x1) / 2, target.y + (y0 + y1) / 2, target.z + (z0 + z1) / 2);
      selBox.scale.set(x1 - x0 + 0.004, y1 - y0 + 0.004, z1 - z0 + 0.004);
      label.textContent = BLOCKS[target.id].name;
      label.hidden = hudHidden;
    } else { selBox.visible = false; label.hidden = true; }
    const br = p.breaking;
    crack.visible = !!(br && target && br.x === target.x && br.y === target.y && br.z === target.z && br.total > 0);
    if (crack.visible) { crackMat.map = crackTex[Math.min(9, Math.floor(br.t / br.total * 10))]; crack.position.copy(selBox.position); crack.scale.copy(selBox.scale); }
    // Hint when an orbital shot is in hand.
    const shot = held && ITEMS[held.id].orbital;
    $('aim-hint').hidden = !shot || hudHidden;
    if (shot) {
      const far = world.raycast(o, d, 512, false);
      $('aim-hint').textContent = ITEMS[held.id].name + (far ? ' · target ' + far.x + ', ' + far.y + ', ' + far.z + ' (' + Math.round(far.t) + ' blocks)' : ' · no block in sight') + ' · right click to pull';
    }
  }

  // ---------- chat and toasts ----------
  const chatLog = $('chat-log');
  GAME.chat = function (text, cls) {
    const line = document.createElement('div');
    line.className = 'chat-line ' + (cls || '');
    if (cls === 'html') line.innerHTML = text; else line.textContent = text;
    chatLog.appendChild(line);
    while (chatLog.children.length > 100) chatLog.removeChild(chatLog.firstChild);
    setTimeout(function () { line.classList.add('old'); }, 10000);
    chatLog.scrollTop = chatLog.scrollHeight;
  };
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.hidden = false; el.style.opacity = 1;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = 0; setTimeout(function () { el.hidden = true; }, 300); }, 2200);
  }
  GAME.toast = toast;

// 67
  // ---------- states, menus and pointer lock ----------
  let state = 'title', modal = null, modalReturn = null;
  let locked = false, dragLook = false, lastUnlock = 0, lockFromClick = false, hudHidden = false;
  if (!('requestPointerLock' in canvas)) dragLook = true;
  function show(id, on) { $(id).hidden = !on; }
  function setScreen(name) {
    show('title-screen', name === 'title');
    show('loading-screen', name === 'loading' || name === 'ready');
    show('pause-screen', name === 'paused');
    show('hud', name === 'play' || name === 'paused');
    document.body.classList.toggle('in-game', name === 'play' || name === 'paused');
  }
  function menuActive() { return UI.isOpen() || Chat.open || !!modal || player.dead; }
  function requestLock(fromClick) {
    if (dragLook) return;
    lockFromClick = !!fromClick;
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(function () { lockFailed(); }); } catch (e) { lockFailed(); }
  }
  function lockFailed() {
    if (state !== 'play' || menuActive() || dragLook) return;
    const tooSoon = performance.now() - lastUnlock < 1600;
    if (lockFromClick && !tooSoon) { dragLook = true; toast("Mouse capture isn't available here. Hold a button and drag to look."); return; }
    pause(tooSoon ? 'The browser needs a second before it can capture the mouse again. Click "Back to the world" again.' : null);
  }
  document.addEventListener('pointerlockchange', function () {
    locked = document.pointerLockElement === canvas;
    if (!locked) { lastUnlock = performance.now(); if (state === 'play' && !menuActive() && !dragLook) pause(); }
  });
  document.addEventListener('pointerlockerror', lockFailed);
  GAME.menuOpened = function () { releaseInput(); if (locked) document.exitPointerLock(); };
  GAME.closeMenus = function (fromClick) {
    if (UI.isOpen()) UI.close();
    if (Chat.open) Chat.hide();
    if (state === 'play' && !player.dead) requestLock(fromClick);
  };
  GAME.chatClosed = function () { if (state === 'play' && !player.dead) requestLock(false); };
  GAME.openManual = function (tab) { if (UI.isOpen()) UI.close(); currentTab = tab || currentTab; openModal('manual'); };
  function releaseInput() { for (const k in keys) keys[k] = false; mouse.left = mouse.right = false; useRelease(); player.breaking = null; }
  function play(fromClick) { state = 'play'; setScreen('play'); $('pause-note').hidden = true; requestLock(fromClick); UI.refresh(); }
  function pause(note) {
    state = 'paused';
    releaseInput();
    setScreen('paused');
    const n = $('pause-note'); n.hidden = !note; n.textContent = note || '';
    $('pause-meta').innerHTML =
      '<span>' + (GAME.online ? 'Server <b>' + esc(NET.address) + '</b>' : 'World <b>' + esc(current ? current.name : '') + '</b>') + '</span>' +
      '<span>Seed <b>' + esc(world.seedText) + '</b></span>' +
      '<span>Game mode <b>' + player.gamemode + '</b> &middot; Difficulty <b>' + GAME.difficulty + '</b></span>' +
      '<span>Bestiary <b>' + seen.size + ' of ' + ALL_SPECIES.filter(function (s) { return !s.hidden; }).length + '</b> &middot; Time <b>' + clockText() + '</b></span>';
    $('pause-mode').textContent = 'Game mode: ' + player.gamemode.charAt(0).toUpperCase() + player.gamemode.slice(1);
    $('pause-quit').textContent = GAME.online ? 'Disconnect' : 'Save and quit to title';
    if (locked) document.exitPointerLock();
    if (!GAME.online) saveWorld();
  }
  function openModal(name) {
    if (modal) closeModal(true);
    if (UI.isOpen()) UI.close();
    modalReturn = state;
    modal = name;
    releaseInput();
    $(name).hidden = false;
    if (name === 'manual') openTab(currentTab);
    if (name === 'settings') syncSettingsUI();
    if (locked) document.exitPointerLock();
  }
  function closeModal(silent, fromClick) {
    if (!modal) return;
    $(modal).hidden = true;
    modal = null;
    if (!silent && modalReturn === 'play') play(fromClick);
  }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closeModal(false, true); }); });
  document.querySelectorAll('.modal').forEach(function (m) { m.addEventListener('mousedown', function (e) { if (e.target === m) closeModal(false, true); }); });
  $('screen').addEventListener('mousedown', function (e) { if (e.target === $('screen')) GAME.closeMenus(true); });
  $('inv-button').addEventListener('click', function () { if (state === 'play' && player.gamemode !== 'spectator' && !player.dead) UI.openInventory(); });

  // ---------- input ----------
  const keys = GAME.keys = {};
  const mouse = { left: false, right: false };
  document.addEventListener('mousedown', function () { AUDIO.init(); }, true);
  document.addEventListener('keydown', function () { AUDIO.init(); }, true);
  addEventListener('keydown', function (e) {
    const tag = e.target.tagName;
    if (e.code === 'F1' || e.code === 'F3' || e.code === 'F5') e.preventDefault();
    if (tag === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') {
      if (e.code === 'Escape') { e.target.blur(); if (modal) closeModal(); else if (UI.isOpen()) GAME.closeMenus(false); }
      return;
    }
    if (modal) { if (e.code === 'Escape' || (modal === 'manual' && e.code === 'KeyH')) { e.preventDefault(); closeModal(); } return; }
    if (UI.isOpen()) {
      if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); GAME.closeMenus(false); }
      else if (/^Digit[1-9]$/.test(e.code)) UI.hoverSwap(+e.code.slice(5) - 1);
      return;
    }
    if (state !== 'play' || player.dead) return;
    if (e.code === 'F3') { if (!e.repeat) { f3Down = true; f3Combo = false; } return; }
    if (f3Down) {
      // F3 + key, as in Minecraft.
      f3Combo = true;
      if (e.code === 'KeyB') { debug.hitboxes = !debug.hitboxes; toast(debug.hitboxes ? 'Hitboxes: shown' : 'Hitboxes: hidden'); }
      else if (e.code === 'KeyG') { debug.borders = !debug.borders; toast(debug.borders ? 'Chunk borders: shown' : 'Chunk borders: hidden'); }
      else if (e.code === 'KeyQ') GAME.chat('F3 + B: hitboxes · F3 + G: chunk borders · F3 alone: debug screen', 'cmd');
      return;
    }
    keys[e.code] = true;
    if (/^Digit[1-9]$/.test(e.code)) { player.sel = +e.code.slice(5) - 1; UI.refresh(); showSlotName(); }
    switch (e.code) {
      case 'KeyE': if (player.gamemode !== 'spectator') UI.openInventory(); break;
      case 'KeyT': e.preventDefault(); GAME.menuOpened(); Chat.show(''); break;
      case 'Slash': e.preventDefault(); GAME.menuOpened(); Chat.show('/'); break;
      case 'KeyH': openModal('manual'); break;
      case 'KeyQ': dropHeld(keys.ShiftLeft || keys.ShiftRight); break;
      case 'KeyF': swapHands(); break;
      case 'F5': view = (view + 1) % 4; toast(VIEW_NAMES[view]); break;
      case 'F1': hudHidden = !hudHidden; document.body.classList.toggle('hud-hidden', hudHidden); break;
      case 'KeyI': settings.showInfo = !settings.showInfo; saveSettings(); break;
      case 'KeyR': player.runLock = !player.runLock; toast(player.runLock ? 'Sprint lock on' : 'Sprint lock off'); break;
      case 'Escape': if (dragLook) pause(); break;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();
  });
  addEventListener('keyup', function (e) {
    keys[e.code] = false;
    if (e.code === 'F3') { e.preventDefault(); if (f3Down && !f3Combo && state === 'play') { debug.on = !debug.on; $('debug').hidden = !debug.on; } f3Down = false; }
  });
  addEventListener('blur', function () { releaseInput(); });
  let drag = null, holdPlace = 0;
  canvas.addEventListener('mousedown', function (e) {
    if (state !== 'play' || menuActive()) return;
    if (!dragLook && !locked) { requestLock(true); return; }
    if (dragLook) { drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button }; return; }
    e.preventDefault();
    pressButton(e.button);
  });
  function pressButton(b) {
    if (b === 0) {
      mouse.left = true;
      if (targetMob && player.gamemode !== 'spectator') { attackMob(targetMob); GAME.swing(); }
      else if (!target && player.gamemode !== 'spectator') { player.attackTimer = 0; GAME.swing(); }
    } else if (b === 2) { mouse.right = true; useStart(target, targetMob); holdPlace = 0.3; }
    else if (b === 1) pickBlock(target);
  }
  addEventListener('mouseup', function (e) {
    if (e.button === 0) { mouse.left = false; player.breaking = null; }
    if (e.button === 2) { mouse.right = false; useRelease(); }
    if (drag && state === 'play') {
      if (drag.moved < 6) { pressButton(drag.button); setTimeout(function () { mouse.left = false; mouse.right = false; useRelease(); }, 120); }
      drag = null;
    }
  });
  addEventListener('mousemove', function (e) {
    if (state !== 'play' || menuActive()) return;
    if (locked) applyMouse(e.movementX || 0, e.movementY || 0);
    else if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
      if (drag.moved >= 6) applyMouse(dx * 1.6, dy * 1.6);
    }
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  addEventListener('wheel', function (e) {
    if (state !== 'play' || menuActive()) return;
    if (player.gamemode === 'spectator') {
      player.flySpeed = clamp(player.flySpeed * (e.deltaY > 0 ? 0.85 : 1.18), 0.1, 10);
      const el = $('speed-pop');
      el.textContent = 'Flying speed ' + player.flySpeed.toFixed(1) + '×';
      el.hidden = false; el.style.opacity = 1;
      clearTimeout(el._t); el._t = setTimeout(function () { el.style.opacity = 0; }, 900);
      return;
    }
    player.sel = (player.sel + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
    UI.refresh(); showSlotName();
  }, { passive: true });
  function applyMouse(dx, dy) {
    const zoom = player.use && player.use.type === 'spyglass' ? 0.15 : 1;
    const s = 0.0022 * settings.sens * zoom;
    player.yaw -= dx * s;
    player.pitch = clamp(player.pitch - dy * s * (settings.invertY ? -1 : 1), -1.55, 1.55);
  }
  // ---------- touch controls (iPad and phones), laid out like Minecraft Bedrock ----------
  // Left half: a joystick that appears where you put your thumb. Right half: drag to look,
  // tap to place/use (or hit a mob), hold to break. Buttons for jump, sneak, inventory and the rest.
  const touch = { on: false, stick: null, look: null };
  function enableTouch() {
    if (touch.on) return;
    touch.on = true; dragLook = true;
    document.body.classList.add('touch');
    const ui = document.createElement('div'); ui.id = 'touch-ui';
    ui.innerHTML = '<div id="t-stick" hidden><i></i></div>' +
      '<button type="button" class="t-btn" id="t-jump" aria-label="Jump">&#9650;</button>' +
      '<button type="button" class="t-btn" id="t-sneak" aria-label="Sneak">&#9660;</button>' +
      '<div class="t-top">' +
        '<button type="button" class="t-btn small" id="t-pause" aria-label="Pause">II</button>' +
        '<button type="button" class="t-btn small" id="t-chat" aria-label="Chat">Chat</button>' +
        '<button type="button" class="t-btn small" id="t-view" aria-label="Change view">F5</button>' +
      '</div>' +
      '<button type="button" class="t-btn small" id="t-inv" aria-label="Inventory">&#8943;</button>' +
      '<button type="button" class="t-btn small" id="t-drop" aria-label="Drop item">Q</button>';
    $('hud').appendChild(ui);
    const hold = function (id, code) {
      const b = $(id);
      b.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); keys[code] = true; b.classList.add('down'); }, { passive: false });
      const up = function (e) { e.preventDefault(); keys[code] = false; b.classList.remove('down'); };
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
    };
    const press = function (id, code) {
      $(id).addEventListener('touchstart', function (e) {
        e.preventDefault(); e.stopPropagation();
        dispatchEvent(new KeyboardEvent('keydown', { code: code, key: code, bubbles: true }));
        dispatchEvent(new KeyboardEvent('keyup', { code: code, key: code, bubbles: true }));
      }, { passive: false });
    };
    hold('t-jump', 'Space'); hold('t-sneak', 'ShiftLeft');
    press('t-inv', 'KeyE'); press('t-drop', 'KeyQ'); press('t-view', 'F5'); press('t-chat', 'KeyT');
    $('t-pause').addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (state === 'play') pause(); }, { passive: false });
  }
  addEventListener('touchstart', function () { AUDIO.init(); enableTouch(); }, { capture: true, passive: true });
  // Tap a hotbar slot to pick it (works with a mouse too).
  $('hotbar').addEventListener('click', function (e) {
    const slot = e.target.closest('.slot'); if (!slot) return;
    player.sel = Array.prototype.indexOf.call($('hotbar').children, slot); UI.refresh(); showSlotName();
  });
  const usesHold = function () {
    const s = heldStack(); if (!s) return false;
    const it = ITEMS[s.id];
    return !!(it.food || ['bow', 'shield', 'crossbow', 'trident', 'spyglass', 'milk'].indexOf(it.use) >= 0 || it.kind === 'spear');
  };
  canvas.addEventListener('touchstart', function (e) {
    if (state !== 'play' || menuActive()) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.4 && !touch.stick) {
        touch.stick = { id: t.identifier, x: t.clientX, y: t.clientY };
        const el = $('t-stick'); el.hidden = false; el.style.left = t.clientX + 'px'; el.style.top = t.clientY + 'px'; el.firstChild.style.transform = '';
      } else if (!touch.look) {
        touch.look = { id: t.identifier, x: t.clientX, y: t.clientY, moved: 0, t0: performance.now(), holding: false };
        touch.look.timer = setTimeout(function () {
          const L = touch.look;
          if (!L || L.moved > 14 || state !== 'play') return;
          // Hold: break the block (or keep hitting), or use items that need holding (eat, bow, shield...).
          L.holding = true;
          if (usesHold()) pressButton(2); else pressButton(0);
        }, 280);
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    if (state !== 'play') return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (touch.stick && t.identifier === touch.stick.id) {
        const S = touch.stick, R = 55;
        let dx = t.clientX - S.x, dy = t.clientY - S.y; const len = Math.hypot(dx, dy);
        if (len > R) { dx *= R / len; dy *= R / len; }
        $('t-stick').firstChild.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        const fx = dx / R, fy = dy / R;
        keys.KeyW = fy < -0.3; keys.KeyS = fy > 0.3; keys.KeyA = fx < -0.3; keys.KeyD = fx > 0.3;
        // Push the stick all the way forward to sprint.
        if (fy < -0.92 && Math.abs(fx) < 0.5) player.sprintIntent = true;
      } else if (touch.look && t.identifier === touch.look.id) {
        const L = touch.look, dx = t.clientX - L.x, dy = t.clientY - L.y;
        L.moved += Math.abs(dx) + Math.abs(dy); L.x = t.clientX; L.y = t.clientY;
        applyMouse(dx * 1.6, dy * 1.6);
      }
    }
  }, { passive: false });
  const touchEnd = function (e) {
    for (const t of e.changedTouches) {
      if (touch.stick && t.identifier === touch.stick.id) {
        touch.stick = null; $('t-stick').hidden = true;
        keys.KeyW = keys.KeyS = keys.KeyA = keys.KeyD = false;
      } else if (touch.look && t.identifier === touch.look.id) {
        const L = touch.look; touch.look = null; clearTimeout(L.timer);
        if (L.holding) { mouse.left = false; player.breaking = null; if (mouse.right) { mouse.right = false; useRelease(); } }
        else if (L.moved < 14 && performance.now() - L.t0 < 280 && state === 'play' && !menuActive()) {
          // Tap: hit the mob you're looking at, otherwise place the block or use the item.
          if (targetMob) { pressButton(0); mouse.left = false; }
          else { pressButton(2); setTimeout(function () { mouse.right = false; useRelease(); }, 60); }
        }
      }
    }
  };
  canvas.addEventListener('touchend', touchEnd); canvas.addEventListener('touchcancel', touchEnd);

  function updateLook(dt) {
    const turn = 2.2 * dt;
    if (keys.ArrowLeft) player.yaw += turn;
    if (keys.ArrowRight) player.yaw -= turn;
    if (keys.ArrowUp) player.pitch += turn * 0.8;
    if (keys.ArrowDown) player.pitch -= turn * 0.8;
    player.pitch = clamp(player.pitch, -1.55, 1.55);
  }
  function updateButtons(dt) {
    const p = player;
    p.attackTimer += dt;
    p.placeCd = Math.max(0, p.placeCd - dt);
    if (mouse.left && !targetMob && p.gamemode !== 'spectator') breakTick(dt, target);
    else { p.breaking = null; p.breakCd = Math.max(0, p.breakCd - dt); }
    if (mouse.right && !p.use) {
      holdPlace -= dt;
      if (holdPlace <= 0 && p.placeCd <= 0) { holdPlace = 0.2; const h = heldStack(); if (h && ITEMS[h.id].block) useStart(target, null); }
    }
    useHoldTick(dt);
    fishingTick(dt);
  }
  let slotNameTimer = 0;
  function showSlotName() {
    const el = $('slot-name'), s = heldStack();
    el.textContent = s ? stackName(s) : '';
    el.style.opacity = 1;
    clearTimeout(slotNameTimer);
    slotNameTimer = setTimeout(function () { el.style.opacity = 0; }, 1600);
  }

  // ---------- saving (single player, in this browser) ----------
  let current = null; // the world record being played
  const DB = {
    open: function () {
      return new Promise(function (resolve, reject) {
        let req;
        try { req = indexedDB.open('blockscape', 1); } catch (e) { reject(e); return; }
        req.onupgradeneeded = function () { req.result.createObjectStore('worlds', { keyPath: 'id' }); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    },
    run: function (mode, fn) {
      return DB.open().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction('worlds', mode), store = tx.objectStore('worlds');
          const req = fn(store);
          tx.oncomplete = function () { resolve(req && req.result); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    },
    list: function () { return DB.run('readonly', function (s) { return s.getAll(); }).catch(function () { return []; }); },
    put: function (rec) { return DB.run('readwrite', function (s) { return s.put(rec); }); },
    get: function (id) { return DB.run('readonly', function (s) { return s.get(id); }); },
    del: function (id) { return DB.run('readwrite', function (s) { return s.delete(id); }); }
  };
  let saving = false;
  function saveWorld() {
    if (!current || !world || GAME.online || saving || player.dead) return;
    saving = true;
    current.played = Date.now();
    current.mode = player.gamemode;
    current.data = {
      edits: world.exportEdits(), chests: Array.from(world.chests.entries()), furnaces: Array.from(world.furnaces.entries()),
      jukeboxes: Array.from(world.jukeboxes.entries()), timers: Array.from(world.timers.entries()),
      dayTime: GAME.dayTime, weather: GAME.weather, rules: GAME.rules, difficulty: GAME.difficulty, player: NET.playerData()
    };
    DB.put(current).then(function () { saving = false; }, function () { saving = false; toast("Couldn't save: this browser blocks storage for the page."); });
  }
  addEventListener('beforeunload', saveWorld);
  function applyPlayerData(d) {
    if (!d) return;
    const p = player;
    if (d.pos) p.pos.set(d.pos[0], d.pos[1], d.pos[2]);
    if (d.yaw !== undefined) { p.yaw = d.yaw; p.pitch = d.pitch; }
    if (d.inv) p.inv = d.inv;
    ['sel', 'health', 'food', 'saturation', 'xpLevel', 'xpPoints', 'effects', 'absorption'].forEach(function (k) { if (d[k] !== undefined) p[k] = d[k]; });
    for (const k in p.effects) if (p.effects[k].t === null) p.effects[k].t = Infinity;
    if (d.spawn) p.spawn = new THREE.Vector3(d.spawn[0], d.spawn[1], d.spawn[2]);
    if (d.gamemode) setGamemode(d.gamemode, true);
  }

  // ---------- loading a world ----------
  function wait() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function setProgress(frac, step) {
    $('load-bar').style.width = Math.round(frac * 100) + '%';
    document.querySelectorAll('#load-steps li').forEach(function (li, i) { li.className = i < step ? 'done' : i === step ? 'now' : ''; });
  }
  // opts: { seed, mode, difficulty, record (saved world), online (welcome message) }
  async function loadWorld(opts) {
    state = 'loading';
    setScreen('loading');
    $('enter-world').hidden = true; $('enter-hint').hidden = true;
    $('load-title').textContent = opts.online ? 'Joining ' + NET.address : 'Building your world';
    $('load-seed').textContent = 'Seed ' + opts.seed;
    setProgress(0.02, 0);
    await wait();
    unloadWorld();
    setWorldSize(opts.size || 512);
    const w = new World();
    w.generate(opts.seed);
    world = GAME.world = w;
    setProgress(0.3, 3);
    await wait();
    const data = opts.online || (opts.record && opts.record.data) || null;
    if (data) {
      w.applyEdits(data.edits || []);
      (data.chests || []).forEach(function (c) { w.chests.set(c[0], c[1]); });
      (data.furnaces || []).forEach(function (f) { w.furnaces.set(f[0], f[1]); });
      (data.jukeboxes || []).forEach(function (j) { w.jukeboxes.set(j[0], j[1]); });
      (data.timers || []).forEach(function (t) { w.timers.set(t[0], t[1]); });
    }
    w.tracking = true;
    GAME.online = !!opts.online;
    Object.assign(player, createPlayer());
    player.name = GAME.online ? NET.name : 'Player';
    player.id = GAME.online ? NET.id : 0;
    const sp = findSpawnColumn(w);
    player.pos.set(sp.x + 0.5, w.topSolid(sp.x, sp.z) + 1, sp.z + 0.5);
    if (opts.online && opts.online.spawn) player.pos.set(opts.online.spawn[0], opts.online.spawn[1], opts.online.spawn[2]);
    player.spawn = player.pos.clone();
    player.yaw = Math.PI * 0.75; player.pitch = -0.15;
    GAME.difficulty = (data && data.difficulty) || opts.difficulty || 'normal';
    Object.assign(GAME.rules, { keepInventory: false, doDaylightCycle: true, doMobSpawning: true, naturalRegeneration: true, doTileDrops: true, doWeatherCycle: true }, (data && data.rules) || {});
    GAME.dayTime = data && data.dayTime !== undefined ? data.dayTime : 0.08;
    GAME.weather = (data && data.weather) || 'clear'; GAME.weatherTimer = 600 + Math.random() * 600;
    setGamemode(opts.mode || 'survival', true);
    const pd = opts.online ? opts.online.data : data && data.player;
    if (pd) applyPlayerData(pd);
    else if (player.gamemode === 'creative') ['grass', 'dirt', 'stone', 'cobblestone', 'oak_planks', 'oak_log', 'glass', 'oak_door', 'torch'].forEach(function (k, i) { player.inv.main[i] = stack(k, 64); });
    if (opts.online) (opts.online.players || []).forEach(function (pl) { NET.updateRemote({ id: pl.id, name: pl.name, p: pl.p }); });
    // Build the chunks around you before you enter.
    camera.position.set(player.pos.x, player.pos.y, player.pos.z);
    lastStreamCell = null;
    streamChunks(0);
    const total = streamQueue.length || 1;
    while (streamChunks(40) > 0) { setProgress(0.35 + 0.6 * (1 - streamQueue.length / total), 4); await wait(); }
    setProgress(0.97, 5);
    await wait();
    if (!GAME.online) populateAround(player.pos);
    view = 0;
    chatLog.innerHTML = '';
    setProgress(1, 6);
    $('load-title').textContent = GAME.online ? 'Connected' : 'Your world is ready';
    $('enter-world').hidden = false; $('enter-hint').hidden = dragLook;
    $('enter-world').focus();
    state = 'ready';
  }
  $('enter-world').addEventListener('click', function () {
    play(true);
    if (GAME.online) GAME.chat('Connected to ' + NET.address + '. Press T to chat, / for commands.', 'cmd');
    else GAME.chat('Welcome to Blockscape. Press H for the manual, E for your inventory, T to chat, / for commands.', 'cmd');
    if (player.gamemode === 'survival' && !player.inv.main.some(Boolean)) GAME.chat('Survival tip: hold left click on a tree to collect logs, then press E and turn them into planks.');
  });

  // ---------- title screen ----------
  const SEED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  function randomSeed() { const a = new Uint32Array(16); (window.crypto || { getRandomValues: function (x) { for (let i = 0; i < x.length; i++) x[i] = Math.random() * 1e9; return x; } }).getRandomValues(a); let s = ''; for (let i = 0; i < 16; i++) s += SEED_CHARS[a[i] % SEED_CHARS.length]; return s; }
  function cleanSeed(v) { return v.replace(/[^A-Za-z0-9]/g, '').slice(0, 32); }
  const seedInput = $('seed-input');
  let titleMode = 'survival', titleDifficulty = 'normal';
  try { titleMode = localStorage.getItem('blockscape.mode') || 'survival'; titleDifficulty = localStorage.getItem('blockscape.difficulty') || 'normal'; } catch (e) { /* storage blocked */ }
  seedInput.value = randomSeed();
  let previewTimer = 0;
  function seedChanged() {
    const raw = seedInput.value, clean = cleanSeed(raw);
    const note = $('seed-note');
    if (clean !== raw) {
      const pos = Math.max(0, seedInput.selectionStart - (raw.length - clean.length));
      seedInput.value = clean;
      try { seedInput.setSelectionRange(pos, pos); } catch (e) { /* not focused */ }
      note.textContent = 'Seeds use letters and numbers only. Other characters were removed.';
      note.className = 'seed-note warn';
    } else {
      note.textContent = clean ? clean.length + ' of 32 characters' : 'Leave it empty for a random 16-character seed.';
      note.className = 'seed-note';
    }
    $('seed-number').textContent = hashString(clean || 'blockscape');
    clearTimeout(previewTimer);
    previewTimer = setTimeout(drawPreview, 150);
  }
  seedInput.addEventListener('input', seedChanged);
  $('seed-random').addEventListener('click', function () { seedInput.value = randomSeed(); seedChanged(); });
  function syncModeButtons() {
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === titleMode); });
    $('mode-desc').textContent = { survival: 'Health, hunger, crafting and hostile mobs at night. Mine to collect blocks.', creative: 'Fly (double-tap Space), break blocks instantly and take anything from the creative inventory.', spectator: 'Fly through everything and just look. Scroll to change flying speed.' }[titleMode];
    $('difficulty').value = titleDifficulty;
  }
  document.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { titleMode = b.dataset.mode; syncModeButtons(); }); });
  $('difficulty').addEventListener('change', function () { titleDifficulty = this.value; });
  $('seed-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const text = cleanSeed(seedInput.value) || randomSeed();
    const name = ($('world-name').value.trim() || 'New World').slice(0, 32);
    try { localStorage.setItem('blockscape.mode', titleMode); localStorage.setItem('blockscape.difficulty', titleDifficulty); } catch (err) { /* storage blocked */ }
    current = { id: 'w' + Date.now().toString(36), name: name, seed: text, created: Date.now(), played: Date.now(), mode: titleMode, difficulty: titleDifficulty, data: null };
    DB.put(current).catch(function () {});
    loadWorld({ seed: text, mode: titleMode, difficulty: titleDifficulty });
  });
  $('title-manual').addEventListener('click', function () { openModal('manual'); });
  document.querySelectorAll('[data-title-tab]').forEach(function (b) {
    b.addEventListener('click', function () { openTitleTab(b.dataset.titleTab); });
  });
  function openTitleTab(name) {
    document.querySelectorAll('[data-title-tab]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.titleTab === name); });
    document.querySelectorAll('[data-title-pane]').forEach(function (p) { p.hidden = p.dataset.titlePane !== name; });
    if (name === 'worlds') renderWorldList();
  }
  function ago(t) { const s = (Date.now() - t) / 1000; return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' minutes ago' : s < 129600 ? Math.round(s / 3600) + ' hours ago' : Math.round(s / 86400) + ' days ago'; }
  function renderWorldList() {
    DB.list().catch(function () { return []; }).then(function (list) {
      const el = $('world-list');
      list.sort(function (a, b) { return b.played - a.played; });
      if (!list.length) { el.innerHTML = '<p class="hint">No saved worlds yet. Create one and it will appear here.</p>'; return; }
      el.innerHTML = list.map(function (w) {
        return '<div class="world-card" data-id="' + esc(w.id) + '"><div><b>' + esc(w.name) + '</b><span>' + esc(w.mode) + ' &middot; seed <code>' + esc(w.seed) + '</code> &middot; ' + ago(w.played) + '</span></div>' +
          '<button type="button" class="btn btn-grass small" data-play>Play</button><button type="button" class="btn small danger" data-del>Delete</button></div>';
      }).join('');
    });
  }
  $('world-list').addEventListener('click', function (e) {
    const card = e.target.closest('.world-card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('[data-play]')) DB.get(id).then(function (rec) { if (!rec) return; current = rec; loadWorld({ seed: rec.seed, mode: rec.mode, difficulty: rec.difficulty, record: rec }); });
    if (e.target.closest('[data-del]')) {
      const b = e.target.closest('[data-del]');
      if (b.dataset.confirm) DB.del(id).then(renderWorldList);
      else { b.dataset.confirm = '1'; b.textContent = 'Click again to delete'; }
    }
  });
  // Multiplayer join form
  const mpName = $('mp-name'), mpAddr = $('mp-address');
  try { mpName.value = localStorage.getItem('blockscape.name') || ''; } catch (e) { /* storage blocked */ }
  const servedByServer = location.protocol.indexOf('http') === 0 && location.port;
  mpAddr.value = servedByServer ? location.host : (function () { try { return localStorage.getItem('blockscape.server') || ''; } catch (e) { return ''; } })();
  $('mp-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const name = (mpName.value.trim() || 'Player').replace(/[^\w ]/g, '').slice(0, 16) || 'Player', addr = mpAddr.value.trim();
    if (!addr) { $('mp-status').textContent = 'Type the server address, like 192.168.1.20:25565.'; return; }
    try { localStorage.setItem('blockscape.name', name); localStorage.setItem('blockscape.server', addr); } catch (err) { /* storage blocked */ }
    $('mp-status').textContent = 'Connecting to ' + addr + ' ...';
    NET.onClose = function (reason) {
      if (state === 'title') { $('mp-status').textContent = reason || 'The connection closed.'; return; }
      GAME.online = false; NET.clearAll();
      state = 'title'; setScreen('title'); openTitleTab('multiplayer');
      $('mp-status').textContent = reason || 'Disconnected from the server.';
      if (locked) document.exitPointerLock();
    };
    NET.connect(addr, name, function (m) {
      current = null;
      loadWorld({ seed: m.seed, size: m.size, mode: m.gamemode, difficulty: m.difficulty, online: m });
    }, function (err) { $('mp-status').textContent = err; });
  });
  function drawPreview() {
    const text = cleanSeed(seedInput.value) || 'blockscape';
    setWorldSize(512);
    const cols = computeColumns(text);
    $('preview-seed').textContent = text;
    const cv = $('preview-map');
    cv.width = WX; cv.height = WZ;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(WX, WZ);
    const counts = [0, 0, 0, 0];
    for (let z = 0; z < WZ; z++) for (let x = 0; x < WX; x++) {
      const i = x + z * WX, h = cols.heights[i], b = cols.biomes[i];
      counts[b]++;
      let c;
      if (h < SEA) { const f = 1 - (SEA - h) * 0.045; c = [46 * f, 108 * f, 208 * f]; }
      else {
        c = b === DESERT ? [227, 207, 141] : h <= SEA + 1 ? [226, 210, 154] : b === FOREST ? [47, 122, 60] : [147, 201, 94];
        const west = cols.heights[Math.max(0, x - 1) + z * WX], north = cols.heights[x + Math.max(0, z - 1) * WX];
        const f = 1 + (h - SEA) * 0.01 + (h - west + h - north) * 0.05;
        c = [c[0] * f, c[1] * f, c[2] * f];
      }
      img.data[i * 4] = clamp(c[0], 0, 255); img.data[i * 4 + 1] = clamp(c[1], 0, 255); img.data[i * 4 + 2] = clamp(c[2], 0, 255); img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const s = findSpawnColumn(cols);
    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x - 6, s.z - 1, 13, 3); ctx.fillRect(s.x - 1, s.z - 6, 3, 13);
    $('preview-legend').innerHTML = BIOME_INFO.map(function (bi, i) {
      return '<li><span class="swatch" style="background:' + bi.color + '"></span>' + bi.name + '<b>' + Math.round(counts[i] / WXZ * 100) + '%</b></li>';
    }).join('');
    const st = $('title-strata');
    st.width = 256;
    const sctx = st.getContext('2d');
    sctx.clearRect(0, 0, st.width, st.height);
    const topY = SEA + 22, r = mulberry32(5);
    for (let x = 0; x < 256; x++) {
      const wx = clamp(s.x - 128 + x, 0, WX - 1), i = wx + s.z * WX, h = cols.heights[i], b = cols.biomes[i];
      for (let row = 0; row < st.height; row++) {
        const y = topY - row;
        let col = null;
        if (y > h) { if (y <= SEA) col = '#2f63b8'; }
        else if (y === h) col = h < SEA || b === DESERT || h <= SEA + 1 ? '#e0cd92' : '#6fb24a';
        else if (y >= h - 3) col = h < SEA || b === DESERT || h <= SEA + 1 ? '#c9b47a' : '#7a5536';
        else col = r() < 0.06 ? '#3c3f44' : '#5c6066';
        if (col) { sctx.fillStyle = col; sctx.fillRect(x, row, 1, 1); }
      }
    }
  }
  syncModeButtons();
  seedChanged();
  openTitleTab(servedByServer ? 'multiplayer' : 'create');
  DB.list().then(function (list) { if (list.length && !servedByServer) openTitleTab('worlds'); }).catch(function () { /* saves unavailable (private window) */ });

// 67
  // ---------- pause menu ----------
  $('resume').addEventListener('click', function () { play(true); });
  $('pause-manual').addEventListener('click', function () { openModal('manual'); });
  $('pause-settings').addEventListener('click', function () { openModal('settings'); });
  $('pause-mode').addEventListener('click', function () {
    setGamemode(GAMEMODES[(GAMEMODES.indexOf(player.gamemode) + 1) % 3]);
    this.textContent = 'Game mode: ' + player.gamemode.charAt(0).toUpperCase() + player.gamemode.slice(1);
  });
  $('pause-copy').addEventListener('click', function () {
    const btn = this;
    const done = function (ok) { btn.textContent = ok ? 'Seed copied' : 'Seed: ' + world.seedText; setTimeout(function () { btn.textContent = 'Copy seed'; }, 2500); };
    try { navigator.clipboard.writeText(world.seedText).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
  });
  function toTitle() {
    if (GAME.online) { NET.onClose = null; NET.disconnect(); GAME.online = false; }
    else saveWorld();
    UI.hideDeath(); player.dead = false;
    unloadWorld();
    state = 'title'; setScreen('title');
    seedChanged();
    openTitleTab(servedByServer ? 'multiplayer' : 'worlds');
  }
  $('pause-quit').addEventListener('click', toTitle);
  $('respawn').addEventListener('click', function () { respawnPlayer(); play(true); });
  $('death-title').addEventListener('click', toTitle);
  setInterval(function () { if (state === 'play' && !GAME.online) saveWorld(); }, 60000);

  // ---------- settings ----------
  function syncSettingsUI() {
    $('set-sens').value = settings.sens; $('out-sens').textContent = settings.sens.toFixed(1) + '×';
    $('set-fov').value = settings.fov; $('out-fov').textContent = settings.fov + '°';
    $('set-rd').value = settings.renderDist; $('out-rd').textContent = settings.renderDist + ' chunks (' + settings.renderDist * CS + ' blocks)';
    $('set-vol').value = settings.volume; $('out-vol').textContent = Math.round(settings.volume * 100) + '%';
    $('set-music').value = settings.music; $('out-music').textContent = Math.round(settings.music * 100) + '%';
    $('set-invert').checked = settings.invertY;
    $('set-day').checked = GAME.rules.doDaylightCycle;
    $('set-info').checked = settings.showInfo;
  }
  [['set-sens', 'sens'], ['set-fov', 'fov'], ['set-rd', 'renderDist'], ['set-vol', 'volume'], ['set-music', 'music']].forEach(function (p) {
    $(p[0]).addEventListener('input', function () {
      settings[p[1]] = parseFloat(this.value); saveSettings(); syncSettingsUI();
      AUDIO.setVolumes(settings.volume, settings.music);
      if (p[1] === 'renderDist') lastStreamCell = null;
    });
  });
  $('set-invert').addEventListener('change', function () { settings.invertY = this.checked; saveSettings(); });
  $('set-info').addEventListener('change', function () { settings.showInfo = this.checked; saveSettings(); });
  $('set-day').addEventListener('change', function () { GAME.rules.doDaylightCycle = this.checked; });

  // ---------- manual ----------
  let currentTab = 'basics';
  const rendered = {};
  function openTab(name) {
    currentTab = name;
    document.querySelectorAll('.tab').forEach(function (t) { t.setAttribute('aria-selected', t.dataset.tab === name); });
    document.querySelectorAll('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== name; });
    if (!rendered[name] && MANUAL[name]) { MANUAL[name](); rendered[name] = name !== 'animals'; }
    if (name === 'animals') MANUAL.animals();
  }
  document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { openTab(t.dataset.tab); }); });
  function iconImg(id, title) { return '<img alt="" title="' + esc(title || ITEMS[id].name) + '" src="' + itemIcon(id) + '">'; }
  function ingIcon(ing) {
    if (!ing) return '<span class="cell"></span>';
    const key = ing.charAt(0) === '#' ? TAGS[ing][0] : ing;
    return '<span class="cell">' + iconImg(I[key], ing.charAt(0) === '#' ? 'Any ' + ing.slice(1).replace('_', ' ') : ITEMS[I[key]].name) + '</span>';
  }
  const BIOME_TEXT = [
    { blurb: 'Deep blue water over sand, gravel and clay, with kelp, seagrass and coral reefs. Drowned rise from it at night.', ground: 'Sand, gravel and clay under water', life: 'Kelp, seagrass, coral, sea pickles, sugar cane on the shore' },
    { blurb: 'Wide, gentle grassland with the odd oak or pink cherry tree. Flowers and tall grass everywhere.', ground: 'Grass over three layers of dirt', life: 'Oak and cherry trees, ten kinds of flower, pumpkins, melons' },
    { blurb: 'Hilly ground packed with oak, birch, spruce and dark oak trees. Wolves fight back if you hit them.', ground: 'Grass and podzol over dirt', life: 'Four kinds of tree, mushrooms, ferns, lily of the valley' },
    { blurb: 'Rolling dunes of sand over sandstone. Husks replace zombies here.', ground: 'Four layers of sand over sandstone', life: 'Cacti up to three blocks tall, dead bushes' }
  ];
  const portraits = {};
  function renderPortraits() {
    if (Object.keys(portraits).length) return;
    let r;
    try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return; }
    r.setSize(128, 128, false);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x556070, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(1, 2, 1.5); sc.add(dl);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    const box = new THREE.Box3(), size = new THREE.Vector3(), center = new THREE.Vector3();
    ALL_SPECIES.forEach(function (sp) {
      if (sp.hidden) return;
      const m = buildModel(sp);
      sc.add(m.root);
      box.setFromObject(m.root); box.getSize(size); box.getCenter(center);
      const d = Math.max(size.x, size.y, size.z) * 2.4 + 0.2;
      cam.position.set(center.x + d * 0.75, center.y + d * 0.4, center.z + d * 0.8);
      cam.lookAt(center);
      r.render(sc, cam);
      portraits[sp.key] = r.domElement.toDataURL();
      sc.remove(m.root);
    });
    r.dispose();
  }
  const MANUAL = {
    biomes: function () {
      $('biome-grid').innerHTML = BIOME_INFO.map(function (bi, i) {
        const names = SPECIES.filter(function (s) { return s.biome === i; }).map(function (s) { return s.name; }).join(', ');
        return '<div class="biome"><h4><span class="swatch" style="background:' + bi.color + '"></span>' + bi.name + '</h4><p style="font-size:14px">' + BIOME_TEXT[i].blurb + '</p><dl>' +
          '<dt>Ground</dt><dd>' + BIOME_TEXT[i].ground + '</dd><dt>Plants</dt><dd>' + BIOME_TEXT[i].life + '</dd><dt>Animals</dt><dd>' + names + '</dd></dl></div>';
      }).join('');
    },
    animals: function () {
      renderPortraits();
      const visible = ALL_SPECIES.filter(function (s) { return !s.hidden; });
      $('bestiary-title').textContent = 'Bestiary · ' + visible.filter(function (s) { return seen.has(s.key); }).length + ' of ' + visible.length + ' seen';
      const moveName = { walk: 'Walks', hop: 'Hops', swim: 'Swims', fly: 'Flies' };
      const card = function (sp) {
        const pic = portraits[sp.key] ? '<img alt="" src="' + portraits[sp.key] + '">' : '<div class="ph"></div>';
        const mood = sp.hostile === 'always' ? 'hostile' : sp.hostile === 'neutral' ? 'fights back' : sp.hostile === 'stare' ? "don't stare" : sp.hostile === 'touch' ? 'stings on touch' : sp.shy ? 'shy' : 'passive';
        const drops = (sp.drops || []).map(function (d) { return ITEMS[I[d.key]].name; }).join(', ') || 'nothing';
        return '<div class="beast">' + pic + '<h4>' + sp.name + (seen.has(sp.key) ? ' <span class="seen">SEEN</span>' : '') + '</h4>' +
          '<span class="meta">' + (sp.biome !== undefined ? BIOME_INFO[sp.biome].name : sp.where === 'cave' ? 'Caves' : sp.where === 'water' ? 'Oceans at night' : sp.where === 'desert' ? 'Deserts at night' : 'Night and caves') + ' &middot; ' + moveName[sp.move] + ' &middot; ' + mood + ' &middot; ' + sp.hp + ' HP</span>' +
          '<p>' + sp.desc + ' Drops: ' + drops + '.</p></div>';
      };
      $('bestiary').innerHTML = SPECIES.map(card).join('');
      $('mobs-list').innerHTML = MOB_SPECIES.filter(function (s) { return !s.hidden; }).map(card).join('');
    },
    blocks: function () {
      $('block-catalog').innerHTML = '<h3>All ' + BLOCKS.filter(function (b) { return b.cat && !b.hidden; }).length + ' blocks</h3><p>Every block is in the creative inventory, or use <code>/give @s &lt;name&gt;</code>. The number is the ID the world stores.</p>' +
        BLOCK_CATEGORIES.map(function (cat) {
          const items = BLOCKS.filter(function (b) { return b.cat === cat && !b.hidden; });
          return '<h3>' + cat + ' <span class="hint">' + items.length + '</span></h3><div class="block-list">' +
            items.map(function (b) { return '<div>' + iconImg(b.id) + '<span>' + b.name + ' <span class="hint">' + b.key + '</span></span></div>'; }).join('') + '</div>';
        }).join('');
    },
    items: function () {
      $('item-catalog').innerHTML = ITEM_CATEGORIES.map(function (cat) {
        const list = ITEMS.filter(function (it) { return it && !it.block && it.cat === cat; });
        return '<h3>' + cat + ' <span class="hint">' + list.length + '</span></h3><div class="block-list">' +
          list.map(function (it) { return '<div>' + iconImg(it.id) + '<span>' + it.name + '<span class="hint"> ' + it.key + '</span></span></div>'; }).join('') + '</div>';
      }).join('');
    },
    crafting: function () {
      const el = $('recipe-list'), q = $('recipe-search');
      const fill = function () {
        const term = q.value.trim().toLowerCase();
        el.innerHTML = RECIPES.filter(function (r) { return !term || ITEMS[I[r.out]].name.toLowerCase().indexOf(term) >= 0; }).slice(0, 500).map(function (r) {
          let g = '';
          if (r.ings) g = '<span class="rgrid shapeless">' + r.ings.map(ingIcon).join('') + '</span>';
          else {
            const w = Math.max(2, r.w), h = Math.max(2, r.h);
            g = '<span class="rgrid" style="grid-template-columns:repeat(' + w + ',22px)">';
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g += ingIcon(r.pat[y] && r.pat[y][x] || null);
            g += '</span>';
          }
          return '<div class="recipe">' + g + '<span class="arrow">→</span><span class="cell">' + iconImg(I[r.out]) + '</span><span>' + ITEMS[I[r.out]].name + (r.n > 1 ? ' &times;' + r.n : '') + (r.ings ? ' <span class="hint">any shape</span>' : '') + (r.w === 3 || r.h === 3 ? ' <span class="hint">table</span>' : '') + '</span></div>';
        }).join('');
      };
      q.addEventListener('input', fill);
      fill();
      $('smelt-list').innerHTML = Object.keys(SMELT).filter(function (k) { return I[k] && I[SMELT[k].out]; }).map(function (k) {
        return '<div class="recipe"><span class="cell">' + iconImg(I[k]) + '</span><span class="arrow">→</span><span class="cell">' + iconImg(I[SMELT[k].out]) + '</span><span>' + ITEMS[I[k]].name + ' &rarr; ' + ITEMS[I[SMELT[k].out]].name + '</span></div>';
      }).join('');
    },
    enchanting: function () {
      $('enchant-list').innerHTML = '<table class="controls"><tbody>' + Object.keys(ENCHANTS).map(function (k) {
        const e = ENCHANTS[k];
        return '<tr><td><b>' + e.name + '</b><br><span class="hint">max ' + ROMAN[e.max] + '</span></td><td>' + e.desc + '<br><span class="hint">Works on: ' + e.on.join(', ') + '</span></td></tr>';
      }).join('') + '</tbody></table>';
    },
    commands: function () {
      $('command-list').innerHTML = '<table class="controls"><tbody>' + Object.keys(COMMANDS).map(function (k) {
        return '<tr><td><code>' + esc(COMMANDS[k].usage) + '</code></td><td>' + esc(COMMANDS[k].desc) + '</td></tr>';
      }).join('') + '</tbody></table>';
    }
  };

  // ---------- info panel ----------
  function clockText() {
    const hours = (6 + GAME.dayTime * 24) % 24, h = Math.floor(hours), m = Math.floor((hours - h) * 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function facingName() {
    const dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw);
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'East (+X)' : 'West (−X)';
    return dz < 0 ? 'North (−Z)' : 'South (+Z)';
  }
  // ---------- F3 debug screen ----------
  let f3Down = false, f3Combo = false;
  const debug = { on: false, hitboxes: false, borders: false, timer: 0, frames: [], gpu: null };
  const DIR_NAMES = [['south', 'Towards positive Z'], ['west', 'Towards negative X'], ['north', 'Towards negative Z'], ['east', 'Towards positive X']];
  function gpuName() {
    if (debug.gpu !== null) return debug.gpu;
    try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); debug.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) { debug.gpu = 'unknown'; }
    return debug.gpu;
  }
  function metaText(id, meta) {
    const b = BLOCKS[id], out = [];
    if (!meta) return out;
    if (b.shape === 'door' || b.shape === 'trapdoor' || b.shape === 'gate' || b.facing || b.shape === 'stairs' || b.shape === 'chest') out.push('facing: ' + ['north', 'east', 'south', 'west'][meta & 3]);
    if (meta & META_OPEN) out.push('open: true');
    if (meta & META_TOP) out.push('half: top');
    if (meta & META_WALL) out.push('attached: wall');
    if (!out.length) out.push('state: ' + meta);
    return out;
  }
  function line(t) { return '<span>' + esc(t) + '</span>'; }
  function updateDebug(dt) {
    debug.frames.push(dt * 1000);
    if (debug.frames.length > 120) debug.frames.shift();
    updateDebugWorld();
    if (!debug.on) return;
    debug.timer -= dt;
    if (debug.timer > 0) return;
    debug.timer = 0.1;
    const p = player.pos, fr = debug.frames;
    const avg = fr.reduce(function (a, b) { return a + b; }, 0) / (fr.length || 1);
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const yawDeg = ((-player.yaw * 180 / Math.PI) % 360 + 540) % 360 - 180, pitchDeg = player.pitch * 180 / Math.PI;
    const dir = DIR_NAMES[((Math.round(yawDeg / 90) % 4) + 4) % 4];
    const inWorld = bx >= 0 && bz >= 0 && bx < WX && bz < WZ;
    const ents = GAME.mobs.length + GAME.items.length + GAME.projectiles.length + GAME.tnts.length + (GAME.online ? NET.remotes.size : 0);
    let shown = 0; for (const a of GAME.mobs) if (a.model && a.model.root.visible) shown++;
    let visibleChunks = 0; chunks.forEach(function (ms) { if (ms.length) visibleChunks++; });
    const info = renderer.info.render;
    const moving = player.gliding ? 'gliding' : player.flying ? 'flying' : player.inWater ? 'swimming' : player.sprinting ? 'sprinting' : player.sneaking ? 'sneaking' : player.onGround ? 'walking' : 'airborne';
    const left = [
      'Blockscape (' + (GAME.online ? 'multiplayer' : 'singleplayer') + ')',
      fps + ' fps T: ' + (settings.renderDist) + ' chunks  frame ' + avg.toFixed(1) + ' ms (max ' + Math.max.apply(null, fr).toFixed(1) + ')',
      (GAME.online ? 'Server: ' + NET.address + ' · ' + (NET.remotes.size + 1) + ' players' : 'Integrated server @ 20 TPS'),
      'C: ' + visibleChunks + '/' + chunks.size + ' D: ' + settings.renderDist + ' pending: ' + dirty.size,
      'E: ' + shown + '/' + ents + ' (mobs ' + GAME.mobs.length + ', items ' + GAME.items.length + ', projectiles ' + GAME.projectiles.length + ', TNT ' + GAME.tnts.length + ')',
      'P: ' + particles.length + ' particles · draw calls ' + info.calls + ' · ' + (info.triangles / 1000).toFixed(0) + 'k tris',
      '',
      'XYZ: ' + p.x.toFixed(3) + ' / ' + p.y.toFixed(5) + ' / ' + p.z.toFixed(3),
      'Block: ' + bx + ' ' + by + ' ' + bz + '  [' + (((bx % CS) + CS) % CS) + ' ' + (((by % CS) + CS) % CS) + ' ' + (((bz % CS) + CS) % CS) + ']',
      'Chunk: ' + Math.floor(bx / CS) + ' ' + Math.floor(by / CS) + ' ' + Math.floor(bz / CS),
      'Facing: ' + dir[0] + ' (' + dir[1] + ') (' + yawDeg.toFixed(1) + ' / ' + pitchDeg.toFixed(1) + ')',
      'Velocity: ' + player.vel.length().toFixed(2) + ' blocks/s (' + moving + ')',
      inWorld ? 'Biome: ' + BIOME_INFO[world.biomes[bx + bz * WX]].name : 'Biome: (outside the world)',
      inWorld ? 'Surface: y ' + world.topSolid(bx, bz) + (world.topSolid(bx, bz) >= by ? ' (under cover)' : ' (open sky)') : '',
      'Day time: ' + clockText() + ' (' + Math.floor(GAME.dayTime * 24000) + ' ticks) · weather: ' + GAME.weather,
      'Difficulty: ' + GAME.difficulty + ' · mode: ' + player.gamemode,
      'Seed: ' + world.seedText + ' · world ' + WX + 'x' + WZ + 'x' + WY,
      '',
      'F3 + B: hitboxes ' + (debug.hitboxes ? 'on' : 'off') + ' · F3 + G: chunk borders ' + (debug.borders ? 'on' : 'off') + ' · F5: ' + VIEW_NAMES[view]
    ];
    const mem = performance.memory;
    const right = [
      'JS: ' + (navigator.userAgent.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/) || ['browser'])[0],
      mem ? 'Mem: ' + Math.round(mem.usedJSHeapSize / mem.jsHeapSizeLimit * 100) + '% ' + Math.round(mem.usedJSHeapSize / 1048576) + '/' + Math.round(mem.jsHeapSizeLimit / 1048576) + ' MB' : 'Mem: not reported by this browser',
      'CPU: ' + (navigator.hardwareConcurrency || '?') + ' threads',
      '',
      'Display: ' + renderer.domElement.width + 'x' + renderer.domElement.height + ' (' + devicePixelRatio + 'x)',
      'GPU: ' + gpuName(),
      'three.js r' + THREE.REVISION + ' · WebGL',
      ''
    ];
    if (target) {
      const b = BLOCKS[target.id];
      right.push('Targeted Block: ' + target.x + ', ' + target.y + ', ' + target.z, 'blockscape:' + b.key + ' (id ' + target.id + ')');
      metaText(target.id, world.getMeta(target.x, target.y, target.z)).forEach(function (t) { right.push(t); });
      right.push('hardness: ' + (b.unbreakable ? 'unbreakable' : b.hardness) + (b.tool ? ' · tool: ' + b.tool : ''), '');
    }
    const fluid = world.raycast(eyePos(), lookDirection(), 5, true);
    if (fluid && IS_LIQUID[fluid.id]) right.push('Targeted Fluid: ' + fluid.x + ', ' + fluid.y + ', ' + fluid.z, 'blockscape:' + BLOCKS[fluid.id].key, '');
    if (targetMob) {
      const m = targetMob;
      right.push('Targeted Entity', 'blockscape:' + m.sp.key + (m.id !== undefined ? ' #' + m.id : ''));
      if (m.hp !== undefined) right.push('health: ' + Math.ceil(m.hp) + ' / ' + (m.maxHp || m.sp.hp));
      if (m.owner !== null && m.owner !== undefined) right.push('tamed (owner #' + m.owner + ')' + (m.wolfArmor ? ' · wolf armour ' + m.wolfArmor + '/64' : ''));
      if (m.effects) { const fx = Object.keys(m.effects); if (fx.length) right.push('effects: ' + fx.join(', ')); }
    }
    $('debug-left').innerHTML = left.filter(function (t, i) { return t || i; }).map(line).join('');
    $('debug-right').innerHTML = right.map(line).join('');
  }
  // F3 + B hitboxes and F3 + G chunk borders.
  const hitboxPool = [], hitboxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), hitboxMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  let borderLines = null, borderChunk = '';
  function updateDebugWorld() {
    let used = 0;
    if (debug.hitboxes) {
      const list = GAME.mobs.concat(GAME.online ? Array.from(NET.remotes.values()) : []);
      for (const m of list) {
        if (!m.box || (m.model && !m.model.root.visible)) continue;
        const bb = m.box(new THREE.Box3());
        let h = hitboxPool[used];
        if (!h) { h = new THREE.LineSegments(hitboxGeo, hitboxMat); hitboxPool.push(h); scene.add(h); }
        bb.getCenter(h.position); bb.getSize(h.scale); h.visible = true; used++;
      }
    }
    for (let i = used; i < hitboxPool.length; i++) hitboxPool[i].visible = false;
    const key = debug.borders ? Math.floor(player.pos.x / CS) + ',' + Math.floor(player.pos.z / CS) : '';
    if (key === borderChunk) return;
    borderChunk = key;
    if (borderLines) { scene.remove(borderLines); borderLines.geometry.dispose(); borderLines = null; }
    if (!key) return;
    const x0 = Math.floor(player.pos.x / CS) * CS, z0 = Math.floor(player.pos.z / CS) * CS, pts = [], cols = [];
    const seg = function (a, b, c) { pts.push(a[0], a[1], a[2], b[0], b[1], b[2]); cols.push(c[0], c[1], c[2], c[0], c[1], c[2]); };
    const YEL = [1, 0.85, 0.1], BLU = [0.25, 0.45, 1], RED = [1, 0.15, 0.15];
    for (const cx of [0, CS]) for (const cz of [0, CS]) seg([x0 + cx, 0, z0 + cz], [x0 + cx, WY, z0 + cz], YEL);
    for (const cx of [-CS, 2 * CS]) for (const cz of [-CS, 0, CS, 2 * CS]) seg([x0 + cx, 0, z0 + cz], [x0 + cx, WY, z0 + cz], RED);
    for (const cz of [-CS, 2 * CS]) for (const cx of [0, CS]) seg([x0 + cx, 0, z0 + cz], [x0 + cx, WY, z0 + cz], RED);
    for (let y = 0; y <= WY; y += 2) {
      const c = y % CS === 0 ? BLU : YEL;
      seg([x0, y, z0], [x0 + CS, y, z0], c); seg([x0 + CS, y, z0], [x0 + CS, y, z0 + CS], c);
      seg([x0 + CS, y, z0 + CS], [x0, y, z0 + CS], c); seg([x0, y, z0 + CS], [x0, y, z0], c);
    }
    for (let k = 2; k < CS; k += 2) {
      seg([x0 + k, 0, z0], [x0 + k, WY, z0], YEL); seg([x0 + k, 0, z0 + CS], [x0 + k, WY, z0 + CS], YEL);
      seg([x0, 0, z0 + k], [x0, WY, z0 + k], YEL); seg([x0 + CS, 0, z0 + k], [x0 + CS, WY, z0 + k], YEL);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    borderLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 }));
    scene.add(borderLines);
  }
  let fps = 0, fpsFrames = 0, fpsTime = 0, infoTimer = 0;
  function updateInfo(dt) {
    fpsFrames++; fpsTime += dt;
    if (fpsTime >= 0.5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }
    infoTimer -= dt;
    if (infoTimer > 0) return;
    infoTimer = 0.2;
    const el = $('info');
    el.hidden = !settings.showInfo || player.gamemode === 'spectator';
    if (el.hidden) return;
    const p = player.pos;
    const bx = clamp(Math.floor(p.x), 0, WX - 1), bz = clamp(Math.floor(p.z), 0, WZ - 1);
    const moving = player.gliding ? 'Gliding' : player.flying ? 'Flying' : player.inWater ? 'Swimming' : player.sprinting ? 'Sprinting' : player.sneaking ? 'Sneaking' : 'Walking';
    el.textContent = 'Seed    ' + world.seedText + '\n' +
      'X Y Z   ' + p.x.toFixed(1) + '  ' + p.y.toFixed(1) + '  ' + p.z.toFixed(1) + '\n' +
      'Biome   ' + BIOME_INFO[world.biomes[bx + bz * WX]].name + '\n' +
      'Facing  ' + facingName() + '\n' +
      'Mode    ' + player.gamemode + ' · ' + moving + '\n' +
      'Speed   ' + player.vel.length().toFixed(1) + ' blocks/s\n' +
      'Time    ' + clockText() + ' · ' + GAME.weather + '\n' +
      fps + ' fps · ' + GAME.mobs.length + ' mobs · ' + chunks.size + ' chunks' + (GAME.online ? ' · ' + (NET.remotes.size + 1) + ' players' : '');
  }

  // ---------- footsteps and ambience ----------
  let lastStep = 0, wasInWater = false, wasOnGround = true, ambClock = 0, ambCtx = { inGame: false };
  function updateFootsteps() {
    const p = player;
    if (p.gamemode === 'spectator' || p.dead) return;
    const under = world.get(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.1), Math.floor(p.pos.z));
    const step = Math.floor(p.walkT / Math.PI);
    if (step !== lastStep && p.onGround && p.moving && !p.sneaking) AUDIO.play('step', under);
    lastStep = step;
    if (p.onGround && !wasOnGround && p.vel.y <= 0) AUDIO.play('land', under);
    wasOnGround = p.onGround;
    if (p.inWater && !wasInWater && !p.flying) AUDIO.play('splash');
    wasInWater = p.inWater;
  }
  function updateAmbience(dt, medium) {
    ambClock -= dt;
    if (ambClock <= 0) {
      ambClock = 0.5;
      const p = player.pos, bx = clamp(Math.floor(p.x), 0, WX - 1), bz = clamp(Math.floor(p.z), 0, WZ - 1);
      let nearWater = false;
      for (let i = 0; i < 6 && !nearWater; i++) { const a = i * 1.05; if (IS_WATER[world.get(Math.floor(p.x + Math.cos(a) * 10), SEA, Math.floor(p.z + Math.sin(a) * 10))]) nearWater = true; }
      ambCtx = { inGame: true, biome: world.biomes[bx + bz * WX], day: dayLight, underground: world.topSolid(p.x, p.z) > p.y + 4, nearWater: nearWater, underwater: medium === 'water', rain: GAME.weather !== 'clear', altitude: p.y };
    }
    AUDIO.update(dt, ambCtx);
  }

  // ---------- main loop ----------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();
  let last = performance.now(), tickAcc = 0, secAcc = 0, lastArmorKey = '', cullClock = 0;
  let tntSmoke = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    AUDIO.musicTick(dt, state === 'play');
    if (!world || state === 'title' || state === 'loading') { if (AUDIO.ctx) AUDIO.update(dt, { inGame: false }); return; }
    const running = state === 'play' && !modal;
    if (running) {
      if (!menuActive()) updateLook(dt);
      if (!player.dead) {
        if (Chat.open || UI.isOpen()) { for (const k in keys) keys[k] = false; }
        updatePlayerPhysics(dt);
        updateButtons(dt);
        updateFootsteps();
      }
      tickAcc += dt;
      while (tickAcc >= 0.05) {
        tickAcc -= 0.05;
        tickPlayer();
        if (!GAME.online) tickFurnaces();
        player.invuln = Math.max(0, player.invuln - 0.05);
      }
      secAcc += dt;
      if (secAcc >= 1) { secAcc -= 1; if (!GAME.online) tickWorldTimers(world); }
      if (GAME.online) {
        NET.update(dt);
        for (let i = localProjectiles.length - 1; i >= 0; i--) { const e = localProjectiles[i]; e.update(dt, world); if (e.remove) { scene.remove(e.mesh); localProjectiles.splice(i, 1); } }
      } else {
        updateSpawning(dt);
        updateEntities(dt, world);
      }
      updateParticles(dt);
      updateSprites(dt);
    } else if (GAME.online) NET.update(dt);
    if (running) {
      tntSmoke -= dt;
      if (tntSmoke <= 0) {
        tntSmoke = 0.08;
        let n = 0;
        const smoke = function (e) { if (n++ < 40 && !(e.opts && (e.opts.impact || e.opts.compressed)) && !e.compressed) GAME.particles('smoke', e.pos.x, e.pos.y + 1.05, e.pos.z, 1); };
        GAME.tnts.forEach(smoke); NET.tnts.forEach(smoke);
      }
    }
    updateCamera(dt);
    streamChunks(6);
    flushDirty(24);
    const camCell = world.get(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z));
    const medium = IS_WATERLIKE[camCell] ? 'water' : IS_LAVA[camCell] ? 'lava' : null;
    $('water-tint').hidden = true;
    tintOn = !!medium && state === 'play';
    if (tintOn) { tintMat.color.setHex(medium === 'water' ? 0x1c4aa8 : 0xd04a10); tintMat.opacity = medium === 'water' ? 0.32 : 0.6; }
    updateSky(running ? dt : 0, medium);
    updateAmbience(dt, medium);
    cullClock -= dt;
    if (cullClock <= 0) {
      cullClock = 0.25;
      const r2 = Math.pow(settings.renderDist * CS + 8, 2);
      for (const a of GAME.mobs) if (a.model) a.model.root.visible = (a.pos.x - camera.position.x) ** 2 + (a.pos.z - camera.position.z) ** 2 < r2;
    }
    if (player.fishing && !player.fishing.bobber.remove) {
      const tip = new THREE.Vector3(view === 0 ? 0.45 : 0, view === 0 ? -0.1 : 0, -0.9).applyMatrix4(camera.matrixWorld);
      if (view !== 0) tip.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
      fishLine.geometry.setFromPoints([tip, player.fishing.bobber.pos]);
      fishLine.visible = true;
    } else fishLine.visible = false;
    if (state === 'play') {
      updateTarget();
      updateInfo(dt);
      updateDebug(dt);
      updateHudFrame(dt);
      const spec = player.gamemode === 'spectator';
      document.body.classList.toggle('spectator', spec);
      $('crosshair').hidden = view === 2 || view === 3 || spec;
      const armorKey = player.inv.armor.map(function (s) { return s ? s.id : 0; }).join(',');
      if (armorKey !== lastArmorKey) { lastArmorKey = armorKey; playerModel.dress(player.inv.armor.map(function (s) { return s ? s.id : 0; })); }
      NET.remotes.forEach(function (r) { if (r.armorIds && r.armorKey !== r.armorIds.join()) { r.armorKey = r.armorIds.join(); if (!r.model.dress) dressModel(r.model); r.model.dress(r.armorIds); } });
    }
    renderer.render(scene, camera);
    renderer.autoClear = false;
    if (tintOn) renderer.render(tintScene, tintCam);
    if (handRig.visible && state !== 'title') {
      renderer.clearDepth();
      if (handCam.fov !== camera.fov || handCam.aspect !== camera.aspect) { handCam.fov = camera.fov; handCam.aspect = camera.aspect; handCam.updateProjectionMatrix(); }
      renderer.render(handScene, handCam);
    }
    renderer.autoClear = true;
  }
  requestAnimationFrame(frame);
})();

// 67