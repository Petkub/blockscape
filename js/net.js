'use strict';
// Multiplayer client. The dedicated server (server.js) simulates the world like a Minecraft server;
// this file sends what you do and draws what the server says is happening.

// 67
const NET = {
  ws: null, connected: false, id: 0, remotes: new Map(), proxies: new Map(), items: new Map(), projs: new Map(), tnts: new Map(),
  stateClock: 0, dataClock: 0, onWelcome: null, onClose: null, name: 'Player', address: ''
};
GAME.net = NET;
GAME.onlineNames = function () { return [player.name].concat(Array.from(NET.remotes.values()).map(function (r) { return r.name; })); };

// 67
NET.connect = function (address, name, onWelcome, onError) {
  NET.name = name; NET.address = address;
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + address.replace(/^wss?:\/\//, '').replace(/\/.*$/, '') + '/ws';
  let ws;
  try { ws = new WebSocket(url); } catch (e) { onError('That address is not valid.'); return; }
  NET.ws = ws;
  NET.onWelcome = onWelcome;
  let opened = false;
  ws.onopen = function () { opened = true; NET.connected = true; NET.send({ t: 'hello', name: name }); };
  ws.onerror = function () { if (!opened) onError('Could not reach a server at ' + address + '. Check the address and that the server is running.'); };
  ws.onclose = function () {
    const was = NET.connected;
    NET.connected = false;
    if (was && NET.onClose) NET.onClose();
  };
  ws.onmessage = function (ev) { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } NET.handle(m); };
};
NET.send = function (obj) { if (NET.ws && NET.ws.readyState === 1) NET.ws.send(JSON.stringify(obj)); };
NET.disconnect = function () { if (NET.ws) { NET.sendPlayerData(); NET.ws.close(); } NET.connected = false; NET.clearAll(); };

// 67
// ---------- what the player sends ----------
NET.playerData = function () {
  const p = player;
  return { pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, pitch: p.pitch, inv: p.inv, sel: p.sel, health: p.health, food: p.food, saturation: p.saturation,
    xpLevel: p.xpLevel, xpPoints: p.xpPoints, effects: p.effects, spawn: p.spawn ? [p.spawn.x, p.spawn.y, p.spawn.z] : null, gamemode: p.gamemode, absorption: p.absorption };
};
NET.sendPlayerData = function () { NET.send({ t: 'pdata', data: NET.playerData() }); };
NET.update = function (dt) {
  if (!NET.connected) return;
  const p = player, w = GAME.world;
  NET.stateClock -= dt;
  if (NET.stateClock <= 0) {
    NET.stateClock = 0.1;
    NET.send({ t: 's', p: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)], yaw: +p.yaw.toFixed(2), pitch: +p.pitch.toFixed(2), gm: p.gamemode, dead: p.dead,
      sn: p.sneaking, gl: p.gliding, held: heldStack() ? heldStack().id : 0, armor: p.inv.armor.map(function (s) { return s ? s.id : 0; }), sw: NET.swung ? 1 : 0, mv: p.moving });
    NET.swung = false;
  }
  NET.dataClock -= dt;
  if (NET.dataClock <= 0) { NET.dataClock = 20; NET.sendPlayerData(); }
  if (w.changes.length) {
    const c = [];
    for (const i of w.changes) { const e = w.edits.get(i); if (e) c.push([i, e[0], e[1]]); }
    w.changes.length = 0;
    if (c.length) NET.send({ t: 'e', c: c });
  }
  NET.animate(dt);
};

// 67
// ---------- what the server sends ----------
NET.handle = function (m) {
  const w = GAME.world;
  switch (m.t) {
    case 'welcome': NET.id = m.id; player.id = m.id; if (NET.onWelcome) NET.onWelcome(m); break;
    case 'deny': GAME.toast(m.reason); if (NET.onClose) NET.onClose(m.reason); break;
    case 'e': {
      if (!w) break;
      const list = m.c.map(function (e) { return [e[0], e[1], e[2]]; });
      w.applyEdits(list);
      for (const e of list) { const x = e[0] % WX, z = Math.floor(e[0] / WX) % WZ, y = Math.floor(e[0] / WXZ); GAME.markDirty(x, y, z); }
      break;
    }
    case 'ps': for (const s of m.l) NET.updateRemote(s); break;
    case 'join': GAME.chat(m.name + ' joined the game', 'cmd'); NET.updateRemote({ id: m.id, name: m.name, p: m.p || [0, -100, 0] }); break;
    case 'leave': { const r = NET.remotes.get(m.id); if (r) { GAME.chat(r.name + ' left the game', 'cmd'); GAME.remove(r.root); NET.remotes.delete(m.id); } break; }
    case 'chat': GAME.chat(m.text, m.cls); break;
    case 'ent': NET.applyEntities(m); break;
    case 'fx': for (const f of m.l) GAME.particles(f[0], f[1], f[2], f[3], f[4], f[5]); break;
    case 'snd': for (const s of m.l) AUDIO.play(s[0], s[1], s[2] !== null ? { x: s[2], y: s[3], z: s[4] } : null); break;
    case 'hurt': {
      const src = m.src || {};
      if (src.from) src.from = new THREE.Vector3(src.from[0], src.from[1], src.from[2]);
      if (src.mobName) src.mob = { sp: { name: src.mobName }, kx: 0, kz: 0 };
      if (src.attackerName) src.mob = { sp: { name: src.attackerName }, kx: 0, kz: 0 };
      hurtPlayer(m.dmg, src);
      break;
    }
    case 'kill': if (!player.dead) killPlayer(m.msg || 'Player fell out of the world'); break;
    case 'eff': applyEffect(m.k, m.lvl, m.secs); break;
    case 'give': { const left = addItem(m.s); if (left > 0) GAME.dropStack(Object.assign({}, m.s, { n: left }), player.pos.clone().setY(player.pos.y + 1), null); GAME.sound('pop'); UI.refresh(); break; }
    case 'xp': addXp(m.n); break;
    case 'tp': player.pos.set(m.pos[0], m.pos[1], m.pos[2]); player.vel.set(0, 0, 0); player.fallDistance = 0; break;
    case 'push': player.vel.x += m.v[0]; player.vel.y += m.v[1]; player.vel.z += m.v[2]; break;
    case 'shake': GAME.shake(player, m.a); break;
    case 'time': GAME.dayTime = m.dayTime; GAME.weather = m.weather; GAME.difficulty = m.difficulty; Object.assign(GAME.rules, m.rules); break;
    case 'chest': if (w) { w.chests.set(m.idx, m.slots); UI.refresh(); } break;
    case 'furn': if (w) for (const f of m.l) { const cur = w.furnaces.get(f[0]); if (cur) Object.assign(cur, f[1]); else w.furnaces.set(f[0], f[1]); } UI.refresh(); break;
    case 'juke': GAME.playJukebox(m.idx, m.disc); break;
  }
};

// 67
// ---------- other players ----------
function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 28px sans-serif';
  const w = Math.min(250, ctx.measureText(text).width + 20);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect((256 - w) / 2, 6, w, 36);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 25);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.3, 1);
  s.renderOrder = 998;
  return s;
}
class RemotePlayer {
  constructor(id, name) {
    this.id = id; this.name = name;
    this.sp = { key: 'player', name: name, r: 0.3, h: 1.8, move: 'walk' };
    this.pos = new THREE.Vector3(0, -100, 0); this.target = this.pos.clone();
    this.yaw = 0; this.pitch = 0; this.gamemode = 'survival'; this.dead = false; this.t = 0;
    this.model = buildModel(PLAYER_SPEC);
    this.root = this.model.root;
    this.tag = nameTag(name); this.tag.position.y = 2.15; this.root.add(this.tag);
    this.armor = [];
    GAME.add(this.root);
  }
  get centerY() { return this.pos.y + 0.9; }
  box(out) { out.min.set(this.pos.x - 0.3, this.pos.y, this.pos.z - 0.3); out.max.set(this.pos.x + 0.3, this.pos.y + 1.8, this.pos.z + 0.3); return out; }
  hurt(dmg, src) { NET.send({ t: 'hit', pid: this.id, dmg: dmg, knock: src.knock || 1, fire: src.fire || 0 }); GAME.sound('hit', null, this.pos); return true; }
}
NET.updateRemote = function (s) {
  if (s.id === NET.id) return;
  let r = NET.remotes.get(s.id);
  if (!r) { r = new RemotePlayer(s.id, s.name || 'Player'); NET.remotes.set(s.id, r); r.pos.set(s.p[0], s.p[1], s.p[2]); }
  r.target.set(s.p[0], s.p[1], s.p[2]);
  if (s.yaw !== undefined) { r.yaw = s.yaw; r.pitch = s.pitch; r.gamemode = s.gm; r.dead = s.dead; r.sneak = s.sn; r.glide = s.gl; r.moving = s.mv; if (s.sw) r.swing = 1; }
  if (s.armor) r.armorIds = s.armor;
};

// 67
// ---------- server entities ----------
class MobProxy {
  constructor(id, sp) {
    this.id = id; this.sp = sp; this.pos = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.yaw = 0; this.targetYaw = 0; this.dead = 0; this.t = Math.random() * 10; this.flags = 0; this.hp = sp.hp; this.maxHp = sp.hp; this.angry = 0; this.fuse = 0;
    this.model = buildModel(sp);
    GAME.add(this.model.root);
  }
  get centerY() { return this.sp.move === 'walk' || this.sp.move === 'hop' ? this.pos.y + this.sp.h / 2 : this.pos.y; }
  box(out) { return Mob.prototype.box.call(this, out); }
  hurt(dmg, src) { NET.send({ t: 'hit', id: this.id, dmg: dmg, knock: src.knock || 1, fire: src.fire || 0, looting: src.looting || 0 }); return true; }
  addEffect() {}
}
NET.applyEntities = function (m) {
  const seenMobs = new Set(), seenItems = new Set(), seenProj = new Set(), seenTnt = new Set();
  for (const s of m.mobs) {
    seenMobs.add(s[0]);
    let p = NET.proxies.get(s[0]);
    if (!p) {
      const sp = speciesByKey(s[1]);
      if (!sp) continue;
      p = new MobProxy(s[0], sp);
      p.pos.set(s[2], s[3], s[4]); p.yaw = s[5];
      NET.proxies.set(s[0], p);
      GAME.mobs.push(p);
    }
    p.target.set(s[2], s[3], s[4]); p.targetYaw = s[5]; p.flags = s[6]; p.hp = s[7]; p.fuse = s[8];
    if (p.sp.key === 'wolf' && (p.flags & 32)) dressWolf(p.model, p.flags & 128);
    p.dead = s[6] & 8 ? (p.dead || 0.001) : 0; p.angry = s[6] & 16 ? 1 : 0;
  }
  NET.proxies.forEach(function (p, id) { if (!seenMobs.has(id)) { GAME.remove(p.model.root); NET.proxies.delete(id); const i = GAME.mobs.indexOf(p); if (i >= 0) GAME.mobs.splice(i, 1); } });
  const sync = function (map, list, seen, make, update) {
    for (const s of list) {
      seen.add(s[0]);
      let e = map.get(s[0]);
      if (!e) { e = make(s); map.set(s[0], e); GAME.add(e.mesh); }
      update(e, s);
    }
    map.forEach(function (e, id) { if (!seen.has(id)) { GAME.remove(e.mesh); map.delete(id); } });
  };
  sync(NET.items, m.items, seenItems, function (s) { return { mesh: GAME.makeItemMesh({ id: s[1], n: s[2] }), pos: new THREE.Vector3(s[3], s[4], s[5]), age: 0 }; },
    function (e, s) { e.pos.set(s[3], s[4], s[5]); });
  sync(NET.projs, m.projs, seenProj, function (s) { return { mesh: GAME.makeProjectileMesh(s[1], {}), pos: new THREE.Vector3(s[2], s[3], s[4]), vel: new THREE.Vector3() }; },
    function (e, s) { e.pos.set(s[2], s[3], s[4]); e.vel.set(s[5], s[6], s[7]); e.stuck = s[8]; });
  sync(NET.tnts, m.tnts, seenTnt, function (s) { return { mesh: GAME.makeBlockEntityMesh(B.tnt, { compressed: s[5] }), pos: new THREE.Vector3(s[1], s[2], s[3]), fuse: s[4], compressed: s[5] }; },
    function (e, s) { e.target = new THREE.Vector3(s[1], s[2], s[3]); e.fuse = s[4]; });
};
NET.animate = function (dt) {
  const k = Math.min(1, dt * 10);
  NET.remotes.forEach(function (r) {
    r.pos.lerp(r.target, k);
    r.root.position.copy(r.pos);
    r.root.visible = r.gamemode !== 'spectator' && !r.dead;
    r.root.rotation.y = r.yaw + Math.PI;
    r.model.body.rotation.x = r.glide ? Math.PI / 2 - 0.25 : r.sneak ? 0.35 : 0;
    r.model.rig.head.rotation.x = -r.pitch * 0.8;
    r.t += dt * (r.moving ? 9 : 0);
    r.model.rig.legs.forEach(function (L) { L.p.rotation.x = Math.sin(r.t + L.phase) * (r.moving ? 0.8 : 0); });
    if (r.swing > 0) { r.model.rig.legs[3].p.rotation.x = r.model.rig.legs[5].p.rotation.x = -Math.sin(r.swing * Math.PI) * 1.4; r.swing -= dt * 4; }
  });
  for (const p of NET.proxies.values()) {
    const moved = p.pos.distanceTo(p.target);
    p.pos.lerp(p.target, k);
    p.yaw += angleDiff(p.targetYaw, p.yaw) * k;
    const root = p.model.root;
    root.position.copy(p.pos); root.rotation.y = p.yaw;
    if (p.dead) { p.dead += dt; root.rotation.z = Math.min(1, p.dead / 0.35) * Math.PI / 2; }
    if (p.flags & 4) { for (const m of p.model.rig.meshes) { if (!m.userData.orig) m.userData.orig = m.material; m.material = hurtMat(m.userData.orig); } p.flashed = true; }
    else if (p.flashed) { for (const m of p.model.rig.meshes) if (m.userData.orig) m.material = m.userData.orig; p.flashed = false; }
    if (p.sp.explodes) { const s = 1 + p.fuse * 0.18; p.model.body.scale.set(s / 16, (1 + p.fuse * 0.08) / 16, s / 16); }
    const moving = !!(p.flags & 1) || moved > 0.02;
    p.t += dt * (2 + (moving ? 8 : 0));
    animateRig(p.model, p.sp, p.t, moving ? 1 : 0, moving, dt, !!(p.flags & 2));
  }
  NET.items.forEach(function (e) { e.age += dt; e.mesh.position.set(e.pos.x, e.pos.y + 0.12 + Math.sin(e.age * 2.5) * 0.05, e.pos.z); e.mesh.rotation.y += dt * 1.6; });
  NET.projs.forEach(function (e) {
    if (!e.stuck) e.pos.addScaledVector(e.vel, dt);
    e.mesh.position.copy(e.pos);
    if (e.vel.lengthSq() > 0.01 && !e.stuck) e.mesh.lookAt(e.pos.x + e.vel.x, e.pos.y + e.vel.y, e.pos.z + e.vel.z);
  });
  NET.tnts.forEach(function (e) {
    if (e.target) e.pos.lerp(e.target, k);
    e.mesh.position.set(e.pos.x, e.pos.y + 0.5, e.pos.z);
    if (!e.compressed && GAME.flashMat) e.mesh.material = Math.floor(e.fuse * 5) % 2 === 0 ? GAME.flashMat : GAME.blockEntityMat;
  });
};
NET.clearAll = function () {
  NET.remotes.forEach(function (r) { GAME.remove(r.root); }); NET.remotes.clear();
  NET.proxies.forEach(function (p) { GAME.remove(p.model.root); }); NET.proxies.clear();
  for (const map of [NET.items, NET.projs, NET.tnts]) { map.forEach(function (e) { GAME.remove(e.mesh); }); map.clear(); }
};

// 67