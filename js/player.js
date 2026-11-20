'use strict';
// The player: movement and collision, survival stats, combat, elytra flight,
// and everything that happens when you click on a block, a mob or the air.

// 67
const PW = 0.3, PH = 1.8, EYE = 1.62;
const GAMEMODES = ['survival', 'creative', 'spectator'];

const EFFECTS = {
  speed: { name: 'Speed', color: '#7cc8f0', good: true },
  slowness: { name: 'Slowness', color: '#5a6c81' },
  strength: { name: 'Strength', color: '#c8342c', good: true },
  weakness: { name: 'Weakness', color: '#484d48' },
  jump_boost: { name: 'Jump Boost', color: '#22ff4c', good: true },
  regeneration: { name: 'Regeneration', color: '#cd5cab', good: true },
  resistance: { name: 'Resistance', color: '#99453a', good: true },
  fire_resistance: { name: 'Fire Resistance', color: '#e49a3a', good: true },
  water_breathing: { name: 'Water Breathing', color: '#2e5299', good: true },
  night_vision: { name: 'Night Vision', color: '#1f1fa1', good: true },
  absorption: { name: 'Absorption', color: '#2552a5', good: true },
  saturation: { name: 'Saturation', color: '#f82423', good: true },
  slow_falling: { name: 'Slow Falling', color: '#f3cfb9', good: true },
  instant_health: { name: 'Instant Health', color: '#f82423', good: true, instant: true },
  instant_damage: { name: 'Instant Damage', color: '#430a09', instant: true },
  poison: { name: 'Poison', color: '#4e9331' },
  hunger: { name: 'Hunger', color: '#587653' },
  nausea: { name: 'Nausea', color: '#551d4a' },
  wither: { name: 'Wither', color: '#352a27' },
  levitation: { name: 'Levitation', color: '#ceffff' },
  luck: { name: 'Luck', color: '#59c106', good: true }
};

function createPlayer() {
  return {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
    onGround: false, flying: false, gliding: false, inWater: false, headInWater: false, inLava: false, climbing: false,
    sneaking: false, sprinting: false, moving: false, walkT: 0, stepSmooth: 0,
    id: 0, name: 'Player', gamemode: 'survival', health: 20, absorption: 0, food: 20, saturation: 5, exhaustion: 0, air: 15,
    xpLevel: 0, xpPoints: 0, fallDistance: 0, fire: 0, invuln: 0, hurtFlash: 0, effects: {},
    spawn: null, dead: false, deathMsg: '',
    inv: { main: new Array(36).fill(null), armor: new Array(4).fill(null), offhand: null }, sel: 0,
    attackTimer: 10, breakCd: 0, placeCd: 0, breaking: null, use: null, rocket: 0, flySpeed: 1,
    tickClock: 0, regenClock: 0, starveClock: 0, drownClock: 0, hurtClock: 0, effectClocks: {}, fishing: null, pearlCd: 0
  };
}
const player = GAME.player = createPlayer();

// ---------- inventory ----------
function heldStack() { return player.inv.main[player.sel]; }
function offStack() { return player.inv.offhand; }
function setHeld(s) { player.inv.main[player.sel] = s && s.n > 0 ? s : null; }

// Put a stack into the inventory (hotbar first). Returns how many didn't fit.
function addItem(s) {
  if (!s) return 0;
  let left = s.n;
  const max = maxStack(s.id), m = player.inv.main;
  for (let i = 0; i < 36 && left > 0; i++) if (m[i] && sameItem(m[i], s) && m[i].n < max) { const k = Math.min(left, max - m[i].n); m[i].n += k; left -= k; }
  for (let i = 0; i < 36 && left > 0; i++) if (!m[i]) { const k = Math.min(left, max); m[i] = Object.assign({}, s, { n: k }); left -= k; }
  return left;
}
function giveItem(s) {
  const left = addItem(s);
  if (left > 0) GAME.dropStack(Object.assign({}, s, { n: left }), player.pos.clone().setY(player.pos.y + 1.2), null);
  UI.refresh();
}
function countItem(id) { let n = 0; for (const s of player.inv.main) if (s && s.id === id) n += s.n; return n; }
function removeItem(id, n) {
  for (let i = 35; i >= 0 && n > 0; i--) {
    const s = player.inv.main[i];
    if (!s || s.id !== id) continue;
    const k = Math.min(n, s.n); s.n -= k; n -= k;
    if (!s.n) player.inv.main[i] = null;
  }
  UI.refresh();
}
function consumeHeld(n, hand) {
  if (player.gamemode === 'creative') return;
  const s = hand === 'off' ? player.inv.offhand : heldStack();
  if (!s) return;
  s.n -= n || 1;
  if (s.n <= 0) { if (hand === 'off') player.inv.offhand = null; else setHeld(null); }
  UI.refresh();
}
// Swap the used stack for its leftover (empty bucket, bowl).
function replaceHeld(hand, key) {
  if (player.gamemode === 'creative') return;
  const s = hand === 'off' ? player.inv.offhand : heldStack();
  const r = stack(key, 1);
  if (s && s.n > 1) { s.n--; giveItem(r); return; }
  if (hand === 'off') player.inv.offhand = r; else setHeld(r);
  UI.refresh();
}

// Wear an item down. Returns true if it broke.
function damageStack(s, amount, armor) {
  if (!s || player.gamemode === 'creative') return false;
  const it = ITEMS[s.id];
  if (!it.dur) return false;
  const ub = enchLevel(s, 'unbreaking');
  for (let i = 0; i < amount; i++) {
    const skip = armor ? Math.random() > 0.6 + 0.4 / (ub + 1) : Math.random() > 1 / (ub + 1);
    if (!skip) s.dmg = (s.dmg || 0) + 1;
  }
  if ((s.dmg || 0) >= it.dur) {
    GAME.sound('item_break');
    GAME.particles('break_item', player.pos.x, player.pos.y + 1.2, player.pos.z, 8, s.id);
    return true;
  }
  return false;
}
function damageHeld(amount) {
  const s = heldStack();
  if (damageStack(s, amount)) setHeld(null);
  UI.refresh();
}

// 67
// ---------- experience ----------
function xpNeeded(level) { return level >= 31 ? 9 * level - 158 : level >= 16 ? 5 * level - 38 : 2 * level + 7; }
function addXp(points) {
  if (player.gamemode === 'spectator') return;
  // Mending repairs damaged gear first, 2 durability per point.
  const gear = [heldStack(), player.inv.offhand].concat(player.inv.armor).filter(function (s) { return s && s.dmg && enchLevel(s, 'mending'); });
  while (points > 0 && gear.length) {
    const s = gear[0];
    s.dmg = Math.max(0, s.dmg - 2); points--;
    if (!s.dmg) gear.shift();
  }
  player.xpPoints += points;
  while (player.xpPoints >= xpNeeded(player.xpLevel)) { player.xpPoints -= xpNeeded(player.xpLevel); player.xpLevel++; if (player.xpLevel % 5 === 0) GAME.sound('levelup'); }
  if (points > 0) GAME.sound('xp');
  UI.refresh();
}
function addLevels(n) {
  player.xpLevel = Math.max(0, player.xpLevel + n);
  if (n < 0) player.xpPoints = Math.min(player.xpPoints, xpNeeded(player.xpLevel) - 1);
  UI.refresh();
}
// Hooks the simulation uses to reach the local player. The server and the network client replace these.
GAME.addXpTo = function (p, n) { if (p === player) addXp(n); };
GAME.applyEffectTo = function (p, k, lvl, secs) { if (p === player) applyEffect(k, lvl, secs); };
GAME.giveTo = function (p, s) {
  if (p !== player) return false;
  const left = addItem(s);
  if (left === s.n) return false;
  GAME.sound('pop');
  UI.refresh();
  if (left > 0) { s.n = left; return false; }
  return true;
};
GAME.teleportPlayer = function (p, pos) { if (p === player) { player.pos.copy(pos); player.vel.set(0, 0, 0); player.fallDistance = 0; } };
GAME.pushPlayer = function (p, v) { if (p === player) player.vel.add(v); };

// ---------- effects ----------
function applyEffect(key, lvl, secs) {
  const E = EFFECTS[key];
  if (!E) return false;
  if (E.instant) {
    if (key === 'instant_health') healPlayer(4 << (lvl - 1));
    else hurtPlayer(6 << (lvl - 1), { type: 'magic' });
    return true;
  }
  const cur = player.effects[key];
  if (!cur || cur.lvl < lvl || (cur.lvl === lvl && cur.t < secs)) player.effects[key] = { lvl: lvl, t: secs };
  if (key === 'absorption') player.absorption = Math.max(player.absorption, 4 * lvl);
  UI.refresh();
  return true;
}
function hasEffect(key) { return player.effects[key] ? player.effects[key].lvl : 0; }
function clearEffects() { player.effects = {}; player.absorption = 0; UI.refresh(); }

// ---------- health ----------
function armorPoints() {
  let pts = 0, tough = 0;
  player.inv.armor.forEach(function (s) { if (s && ITEMS[s.id].armor) { pts += ITEMS[s.id].armor.pts; tough += ITEMS[s.id].armor.tough; } });
  return { pts: pts, tough: tough };
}
function healPlayer(n) {
  if (player.dead) return;
  player.health = Math.min(20, player.health + n);
  UI.refresh();
}
const DEATH_MESSAGES = {
  fall: 'fell from a high place', lava: 'tried to swim in lava', fire: 'went up in flames', drown: 'drowned', starve: 'starved to death',
  cactus: 'was pricked to death', void: 'fell out of the world', explosion: 'blew up', magic: 'was killed by magic', kinetic: 'experienced kinetic energy',
  hot_floor: 'discovered the floor was lava', suffocate: 'suffocated in a wall', kill: 'fell out of the world', poison: 'was poisoned', wither: 'withered away', trident: 'was impaled'
};
// Damage the player. src: { type, from (Vector3), mob, projectile }
function hurtPlayer(amount, src) {
  const p = player;
  if (p.gamemode !== 'survival' || p.dead || !(amount > 0)) return false;
  const bypass = src.type === 'void' || src.type === 'kill' || src.type === 'starve' || src.type === 'drown' || src.type === 'wither' || src.type === 'poison';
  if (p.invuln > 0 && !bypass) return false;
  // A raised shield blocks hits from in front.
  if (p.use && p.use.type === 'shield' && p.use.t > 0.25 && src.from && (src.type === 'mob' || src.type === 'arrow' || src.type === 'explosion')) {
    const dx = src.from.x - p.pos.x, dz = src.from.z - p.pos.z, len = Math.hypot(dx, dz) || 1;
    if ((dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / len > 0) {
      const hand = p.use.hand, s = hand === 'off' ? p.inv.offhand : heldStack();
      if (amount >= 3 && damageStack(s, 1 + Math.floor(amount))) { if (hand === 'off') p.inv.offhand = null; else setHeld(null); p.use = null; }
      if (src.mob && src.type === 'mob') { src.mob.kx = -dx / len * 4; src.mob.kz = -dz / len * 4; }
      GAME.sound('shield');
      UI.refresh();
      return false;
    }
  }
  if ((src.type === 'fire' || src.type === 'lava' || src.type === 'hot_floor') && hasEffect('fire_resistance')) return false;
  let dmg = amount;
  const armorTypes = ['mob', 'arrow', 'explosion', 'cactus', 'kinetic'];
  if (armorTypes.indexOf(src.type) >= 0) {
    const a = armorPoints();
    dmg = dmg * (1 - Math.min(20, Math.max(a.pts / 5, a.pts - 4 * dmg / (a.tough + 8))) / 25);
    p.inv.armor.forEach(function (s, i) { if (s && ITEMS[s.id].kind !== 'elytra' && damageStack(s, Math.max(1, Math.floor(amount / 4)), true)) p.inv.armor[i] = null; });
  }
  const res = hasEffect('resistance');
  if (res) dmg *= Math.max(0, 1 - 0.2 * res);
  let epf = 0;
  p.inv.armor.forEach(function (s) {
    if (!s) return;
    if (!bypass && src.type !== 'magic') epf += enchLevel(s, 'protection');
    if (src.type === 'fire' || src.type === 'lava') epf += 2 * enchLevel(s, 'fire_protection');
    if (src.type === 'explosion') epf += 2 * enchLevel(s, 'blast_protection');
    if (src.projectile) epf += 2 * enchLevel(s, 'projectile_protection');
    if (src.type === 'fall') epf += 3 * enchLevel(s, 'feather_falling');
  });
  dmg *= 1 - Math.min(20, epf) * 0.04;
  if (src.mob && src.type === 'mob') {
    p.inv.armor.forEach(function (s) { const t = enchLevel(s, 'thorns'); if (t && Math.random() < 0.15 * t) src.mob.hurt(1 + Math.floor(Math.random() * 4), { type: 'thorns', from: p.pos }); });
  }
  if (p.absorption > 0) { const a = Math.min(p.absorption, dmg); p.absorption -= a; dmg -= a; }
  p.health -= dmg;
  p.exhaustion += 0.1;
  p.invuln = 0.5;
  p.hurtFlash = 1;
  GAME.sound('hurt');
  if (src.from && src.type !== 'fall') {
    const dx = p.pos.x - src.from.x, dz = p.pos.z - src.from.z, len = Math.hypot(dx, dz) || 1;
    p.vel.x += dx / len * 5; p.vel.z += dz / len * 5;
    if (p.onGround) p.vel.y = Math.max(p.vel.y, 4);
  }
  if (p.health <= 0) {
    // Totem of Undying saves you once.
    const hand = heldStack() && heldStack().id === I.totem_of_undying ? 'main' : p.inv.offhand && p.inv.offhand.id === I.totem_of_undying ? 'off' : null;
    if (hand) {
      if (hand === 'main') setHeld(null); else p.inv.offhand = null;
      p.health = 1;
      for (const k in p.effects) if (!EFFECTS[k].good) delete p.effects[k];
      applyEffect('regeneration', 2, 45); applyEffect('absorption', 2, 5); applyEffect('fire_resistance', 1, 40);
      GAME.particles('totem', p.pos.x, p.pos.y + 1, p.pos.z, 40);
      GAME.sound('totem');
      UI.totemFlash();
    } else {
      const who = src.mob ? (src.type === 'arrow' || src.projectile ? 'was shot by ' : src.type === 'explosion' ? 'was blown up by ' : 'was slain by ') + src.mob.sp.name : DEATH_MESSAGES[src.type] || 'died';
      killPlayer('Player ' + who);
    }
  }
  UI.refresh();
  return true;
}
GAME.hurtPlayer = function (p, amount, src) {
  if (p !== player) return false;
  if (src.mob && !GAME.online) ownerHurtBy(player, src.mob);
  return hurtPlayer(amount, src);
};

function killPlayer(msg) {
  const p = player;
  p.health = 0; p.dead = true; p.deathMsg = msg; p.gliding = false; p.use = null; p.breaking = null;
  if (!GAME.rules.keepInventory) {
    const all = p.inv.main.concat(p.inv.armor, [p.inv.offhand]);
    for (const s of all) if (s) GAME.dropStack(s, p.pos.clone().setY(p.pos.y + 1), new THREE.Vector3((Math.random() - 0.5) * 5, 3, (Math.random() - 0.5) * 5));
    p.inv.main.fill(null); p.inv.armor.fill(null); p.inv.offhand = null;
    p.xpLevel = 0; p.xpPoints = 0;
  }
  if (GAME.online) GAME.net.send({ t: 'sys', text: msg }); else GAME.chat(msg);
  UI.showDeath(msg);
}
function respawnPlayer() {
  const p = player;
  p.dead = false; p.health = 20; p.food = 20; p.saturation = 5; p.exhaustion = 0; p.air = 15; p.fire = 0; p.absorption = 0;
  p.effects = {}; p.fallDistance = 0; p.vel.set(0, 0, 0); p.invuln = 1;
  p.pos.copy(p.spawn);
  UI.hideDeath();
  UI.refresh();
}

function setGamemode(mode, quiet) {
  if (GAMEMODES.indexOf(mode) < 0) return false;
  const p = player;
  p.gamemode = mode;
  p.flying = mode === 'spectator' || (mode === 'creative' && p.flying);
  p.gliding = false; p.use = null; p.breaking = null; p.fire = 0;
  if (mode !== 'survival') { p.health = 20; p.food = 20; p.air = 15; }
  if (!quiet) GAME.chat('Set own game mode to ' + mode.charAt(0).toUpperCase() + mode.slice(1) + ' Mode');
  UI.refresh();
  return true;
}

// ---------- collision ----------
// Every solid box (full cubes and shaped blocks) overlapping a region.
function collisionBoxes(x0, y0, z0, x1, y1, z1) {
  const out = [], world = GAME.world;
  for (let y = Math.floor(y0) - 1; y <= Math.floor(y1); y++) for (let z = Math.floor(z0); z <= Math.floor(z1); z++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
    const id = world.get(x, y, z);
    if (!IS_SOLID[id]) continue;
    if (!IS_SHAPED[id]) { if (y >= Math.floor(y0)) out.push([x, y, z, x + 1, y + 1, z + 1]); continue; }
    for (const b of shapeBoxes(id, world.getMeta(x, y, z), world, x, y, z, true)) out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
  }
  return out;
}
// Move along one axis, stopping flush against whatever is in the way. Returns true if blocked.
function moveAxis(axis, amount) {
  if (!amount) return false;
  const p = player.pos, a = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const lo = [p.x - PW, p.y, p.z - PW], hi = [p.x + PW, p.y + PH, p.z + PW];
  const rlo = lo.slice(), rhi = hi.slice();
  if (amount > 0) rhi[a] += amount; else rlo[a] += amount;
  const boxes = collisionBoxes(rlo[0], rlo[1], rlo[2], rhi[0], rhi[1], rhi[2]);
  const e = 1e-7;
  let allowed = amount;
  for (const b of boxes) {
    let overlap = true;
    for (let k = 0; k < 3; k++) if (k !== a && (b[k + 3] <= lo[k] + e || b[k] >= hi[k] - e)) { overlap = false; break; }
    if (!overlap) continue;
    if (amount > 0 && b[a] >= hi[a] - 1e-4) allowed = Math.min(allowed, b[a] - hi[a]);
    else if (amount < 0 && b[a + 3] <= lo[a] + 1e-4) allowed = Math.max(allowed, b[a + 3] - lo[a]);
  }
  p[axis] += allowed;
  const blocked = Math.abs(allowed - amount) > 1e-6;
  if (blocked) {
    if (axis === 'y' && amount < 0) player.onGround = true;
    player.vel[axis] = 0;
  }
  return blocked;
}
function boxInside(px, py, pz) {
  return collisionBoxes(px - PW, py, pz - PW, px + PW, py + PH, pz + PW).some(function (b) {
    return b[0] < px + PW && b[3] > px - PW && b[1] < py + PH && b[4] > py && b[2] < pz + PW && b[5] > pz - PW;
  });
}
function groundBelow(px, pz) {
  const py = player.pos.y;
  return collisionBoxes(px - PW, py - 0.6, pz - PW, px + PW, py, pz + PW).some(function (b) {
    return b[0] < px + PW && b[3] > px - PW && b[2] < pz + PW && b[5] > pz - PW && b[4] <= py + 1e-3 && b[4] > py - 0.6;
  });
}
// Horizontal move that climbs up to 0.6 blocks (slabs, stairs, carpets) when on the ground.
function moveHorizontal(axis, amount, canStep) {
  const p = player.pos;
  if (player.sneaking && player.onGround && amount) {
    const tx = axis === 'x' ? p.x + amount : p.x, tz = axis === 'z' ? p.z + amount : p.z;
    if (!groundBelow(tx, tz)) { player.vel[axis] = 0; return true; }
  }
  const start = p[axis], sx = p.x, sy = p.y, sz = p.z, v = player.vel[axis];
  const blocked = moveAxis(axis, amount);
  if (!blocked || !canStep) return blocked;
  const done = p[axis] - start;
  p.set(sx, sy, sz);
  const ground = player.onGround;
  moveAxis('y', 0.6);
  const lifted = p.y - sy;
  player.vel[axis] = v;
  const b2 = moveAxis(axis, amount);
  player.onGround = false;
  moveAxis('y', -lifted - 0.01);
  if (Math.abs(p[axis] - start) > Math.abs(done) + 1e-3) { player.stepSmooth += p.y - sy; player.onGround = true; return b2; }
  p.set(sx, sy, sz); p[axis] = start + done; player.onGround = ground; player.vel[axis] = 0;
  return true;
}

function cellAt(x, y, z) { return GAME.world.get(Math.floor(x), Math.floor(y), Math.floor(z)); }
function touching(test) {
  const p = player.pos, w = GAME.world;
  for (let y = Math.floor(p.y); y <= Math.floor(p.y + PH - 0.01); y++) for (let z = Math.floor(p.z - PW - 0.01); z <= Math.floor(p.z + PW + 0.01); z++) for (let x = Math.floor(p.x - PW - 0.01); x <= Math.floor(p.x + PW + 0.01); x++)
    if (test(w.get(x, y, z), x, y, z)) return true;
  return false;
}

// 67
// ---------- movement (every frame) ----------
let lastSpace = -1e9, lastW = -1e9, wWasDown = false, spaceWasDown = false, horizontalBlocked = false;
function updatePlayerPhysics(dt) {
  const p = player, k = GAME.keys, gm = p.gamemode;
  if (p.dead) return;
  const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  let mx = -sin * f + cos * r, mz = -cos * f - sin * r;
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  p.moving = ml > 0;
  const now = performance.now();

  // Double-tap W (and hold) to sprint. Double-tap Space to fly in Creative.
  if (k.KeyW && !wWasDown) { if (now - lastW < 300) p.sprintIntent = true; lastW = now; }
  if (!k.KeyW) p.sprintIntent = false;
  wWasDown = !!k.KeyW;
  if (k.Space && !spaceWasDown) {
    if (gm === 'creative' && now - lastSpace < 300) { p.flying = !p.flying; p.gliding = false; p.vel.y = 0; lastSpace = -1e9; }
    else lastSpace = now;
    if (!p.onGround && !p.flying && !p.inWater && !p.climbing && !p.gliding && gm !== 'spectator') tryStartGlide();
  }
  spaceWasDown = !!k.Space;

  const shift = k.ShiftLeft || k.ShiftRight;
  p.sneaking = shift && !p.flying && !p.gliding && gm !== 'spectator';
  const usingItem = p.use && (p.use.type === 'eat' || p.use.type === 'bow' || p.use.type === 'shield');
  const canSprint = f > 0 && !p.sneaking && !usingItem && (gm !== 'survival' || p.food > 6) && !p.headInWater;
  p.sprinting = (p.sprintIntent || p.runLock) && canSprint;

  p.inWater = !!IS_WATERLIKE[cellAt(p.pos.x, p.pos.y + 0.4, p.pos.z)];
  p.headInWater = !!IS_WATERLIKE[cellAt(p.pos.x, p.pos.y + EYE, p.pos.z)];
  p.inLava = !!IS_LAVA[cellAt(p.pos.x, p.pos.y + 0.3, p.pos.z)];
  p.climbing = gm !== 'spectator' && !p.flying && touching(function (id) { return id && BLOCKS[id].climb; });
  const inWeb = gm !== 'spectator' && touching(function (id) { return id && BLOCKS[id].web; });
  if (p.inWater || p.inLava) p.fallDistance = 0;

  const before = p.pos.clone();
  if (gm === 'spectator') {
    const speed = 11 * p.flySpeed * (p.sprintIntent || p.runLock ? 2 : 1);
    const vy = ((k.Space ? 1 : 0) - (shift ? 1 : 0)) * speed * 0.75;
    const a = Math.min(1, dt * 8);
    p.vel.x += (mx * speed - p.vel.x) * a; p.vel.z += (mz * speed - p.vel.z) * a; p.vel.y += (vy - p.vel.y) * a;
    p.pos.addScaledVector(p.vel, dt);
    p.pos.x = clamp(p.pos.x, -20, WX + 20); p.pos.z = clamp(p.pos.z, -20, WZ + 20); p.pos.y = clamp(p.pos.y, -10, WY + 40);
    return;
  }
  if (p.gliding) {
    const hv0 = Math.hypot(p.vel.x, p.vel.z);
    p.onGround = false;
    moveAxis('y', p.vel.y * dt);
    const bx = moveAxis('x', p.vel.x * dt), bz = moveAxis('z', p.vel.z * dt);
    if (bx || bz) {
      const hv1 = Math.hypot(p.pos.x - before.x, p.pos.z - before.z) / dt;
      const kin = (hv0 - hv1) / 20 * 10 - 3;
      if (kin > 0) hurtPlayer(kin, { type: 'kinetic' });
    }
    if (p.vel.y / 20 > -0.5) p.fallDistance = Math.min(p.fallDistance, 1);
    else p.fallDistance += Math.max(0, before.y - p.pos.y);
    if (p.onGround || p.inWater || p.inLava) { p.gliding = false; if (p.onGround) land(); }
  } else if (p.flying) {
    const speed = 10.9 * (p.sprinting || p.runLock ? 2 : 1);
    const vy = ((k.Space ? 1 : 0) - (shift ? 1 : 0)) * 7.5;
    const a = Math.min(1, dt * 10);
    p.vel.x += (mx * speed - p.vel.x) * a; p.vel.z += (mz * speed - p.vel.z) * a; p.vel.y += (vy - p.vel.y) * a;
    p.onGround = false;
    moveAxis('y', p.vel.y * dt);
    moveHorizontal('x', p.vel.x * dt, false); moveHorizontal('z', p.vel.z * dt, false);
    if (p.onGround && gm === 'creative' && shift) p.flying = false;
    p.fallDistance = 0;
  } else {
    const under = BLOCKS[cellAt(p.pos.x, p.pos.y - 0.2, p.pos.z)];
    let speed = 4.317 * (p.sprinting ? 1.3 : 1) * (p.sneaking ? 0.3 : 1) * (usingItem ? 0.25 : 1);
    speed *= 1 + 0.2 * hasEffect('speed') - 0.15 * hasEffect('slowness');
    if (p.inWater) speed *= 0.5;
    if (p.inLava) speed *= 0.3;
    if (under && (under.slow || under.sticky) && p.onGround) speed *= 0.4;
    const slip = under && under.slip && p.onGround;
    const a = Math.min(1, dt * (p.onGround ? (slip ? 2 : 14) : p.inWater ? 6 : 3));
    p.vel.x += (mx * speed - p.vel.x) * a;
    p.vel.z += (mz * speed - p.vel.z) * a;
    if (p.climbing) {
      p.fallDistance = 0;
      if (k.Space || (p.moving && touching(function (id) { return id && BLOCKS[id].climb; }) && horizontalBlocked)) p.vel.y = 2.35;
      else if (p.sneaking) p.vel.y = 0;
      else p.vel.y = Math.max(p.vel.y - 28 * dt, -3);
    } else if (p.inWater || p.inLava) {
      p.vel.y = Math.max(p.vel.y - 9 * dt, -3);
      if (k.Space) p.vel.y = Math.min(p.vel.y + 24 * dt, 3.4);
      if (shift) p.vel.y = Math.max(p.vel.y - 10 * dt, -4);
    } else {
      const slowFall = hasEffect('slow_falling');
      p.vel.y = Math.max(p.vel.y - (slowFall ? 4 : 28) * dt, slowFall ? -2 : -78);
      const lev = hasEffect('levitation');
      if (lev) p.vel.y += ((0.9 * lev) - p.vel.y) * Math.min(1, dt * 4) + 28 * dt; // shulker bullets lift you up
      if (k.Space && p.onGround) {
        p.vel.y = 8.6 + 2 * hasEffect('jump_boost');
        if (gm === 'survival') p.exhaustion += p.sprinting ? 0.2 : 0.05;
        if (p.sprinting) { p.vel.x += -sin * 4; p.vel.z += -cos * 4; }
      }
    }
    if (inWeb) { p.vel.multiplyScalar(0.25); p.fallDistance = 0; }
    const vy0 = p.vel.y;
    const wasGround = p.onGround;
    p.onGround = false;
    moveAxis('y', p.vel.y * dt);
    const hx = moveHorizontal('x', p.vel.x * dt, wasGround || p.onGround);
    const hz = moveHorizontal('z', p.vel.z * dt, wasGround || p.onGround);
    horizontalBlocked = hx || hz;
    if (horizontalBlocked && (p.inWater || p.inLava) && k.Space) p.vel.y = 5.5;
    if (horizontalBlocked && p.sprinting && f > 0) p.sprintIntent = false;
    const dropped = before.y - p.pos.y;
    if (!p.onGround && dropped > 0 && !p.climbing) p.fallDistance += dropped;
    if (p.onGround && !wasGround) land(vy0);
    else if (p.onGround) p.fallDistance = 0;
  }
  p.pos.x = clamp(p.pos.x, PW, WX - PW);
  p.pos.z = clamp(p.pos.z, PW, WZ - PW);
  if (p.pos.y > WY + 30) { p.pos.y = WY + 30; p.vel.y = Math.min(0, p.vel.y); }
  const moved = Math.hypot(p.pos.x - before.x, p.pos.z - before.z);
  if (gm === 'survival' && !p.flying) p.exhaustion += moved * (p.sprinting ? 0.1 : p.inWater ? 0.01 : 0.01);
  if (p.moving && (p.onGround || p.flying || p.inWater)) p.walkT += dt * (p.sprinting ? 13 : 9);
  p.stepSmooth *= Math.exp(-dt * 14);
}

function land(vy0) {
  const p = player, dist = p.fallDistance;
  p.fallDistance = 0;
  const under = cellAt(p.pos.x, p.pos.y - 0.05, p.pos.z), b = BLOCKS[under];
  if (b && b.bouncy && !p.sneaking && vy0 < -3) { p.vel.y = -vy0 * 0.8; return; }
  if (p.gamemode !== 'survival' || dist <= 3 || p.inWater) return;
  let mult = 1;
  if (b && (b.bouncy)) mult = 0;
  if (b && (b.key === 'hay_bale' || b.sticky)) mult = 0.2;
  if (b && b.shape === 'bed') mult = 0.5;
  const jump = hasEffect('jump_boost');
  const dmg = Math.ceil((dist - 3 - jump) * mult);
  if (dmg > 0) { hurtPlayer(dmg, { type: 'fall' }); GAME.sound('fall'); }
}

// 67
// ---------- elytra ----------
function chestElytra() { const s = player.inv.armor[1]; return s && s.id === I.elytra && (s.dmg || 0) < ITEMS[I.elytra].dur - 1 ? s : null; }
function tryStartGlide() {
  if (!chestElytra()) return;
  player.gliding = true; player.flying = false;
  GAME.sound('elytra');
}
// Minecraft's elytra formula, run 20 times a second in blocks per tick.
function elytraTick() {
  const p = player;
  if (!p.gliding) return;
  if (!chestElytra()) { p.gliding = false; return; }
  const cp = Math.cos(p.pitch);
  const lx = -Math.sin(p.yaw) * cp, ly = Math.sin(p.pitch), lz = -Math.cos(p.yaw) * cp;
  let vx = p.vel.x / 20, vy = p.vel.y / 20, vz = p.vel.z / 20;
  const pitchRad = -p.pitch;
  const hl = Math.hypot(lx, lz), hv = Math.hypot(vx, vz);
  let c = Math.cos(pitchRad); c = c * c;
  vy += (hasEffect('slow_falling') ? 0.01 : 0.08) * (-1 + c * 0.75);
  if (vy < 0 && hl > 0) { const d = vy * -0.1 * c; vx += lx * d / hl; vy += d; vz += lz * d / hl; }
  if (pitchRad < 0 && hl > 0) { const d = hv * -Math.sin(pitchRad) * 0.04; vx += -lx * d / hl; vy += d * 3.2; vz += -lz * d / hl; }
  if (hl > 0) { vx += (lx / hl * hv - vx) * 0.1; vz += (lz / hl * hv - vz) * 0.1; }
  vx *= 0.99; vy *= 0.98; vz *= 0.99;
  if (p.rocket > 0) {
    p.rocket--;
    vx += lx * 0.1 + (lx * 1.5 - vx) * 0.5; vy += ly * 0.1 + (ly * 1.5 - vy) * 0.5; vz += lz * 0.1 + (lz * 1.5 - vz) * 0.5;
    if (p.rocket % 2 === 0) GAME.particles('firework', p.pos.x, p.pos.y + 0.5, p.pos.z, 2);
  }
  p.vel.set(vx * 20, vy * 20, vz * 20);
  p.glideTicks = (p.glideTicks || 0) + 1;
  if (p.glideTicks % 20 === 0 && damageStack(chestElytra(), 1, true)) { p.inv.armor[1] = null; p.gliding = false; UI.refresh(); }
}

// ---------- survival ticks (20 per second) ----------
function tickPlayer() {
  const p = player;
  elytraTick();
  if (p.dead) return;
  p.pearlCd = Math.max(0, p.pearlCd - 0.05);
  if (p.gamemode !== 'survival') { p.fire = 0; p.air = 15; tickEffects(true); return; }
  // hunger
  while (p.exhaustion >= 4) { p.exhaustion -= 4; if (p.saturation > 0) p.saturation = Math.max(0, p.saturation - 1); else p.food = Math.max(0, p.food - 1); }
  if (GAME.rules.naturalRegeneration && p.health < 20 && p.food >= 18) {
    p.regenClock++;
    if (p.food === 20 && p.saturation > 0 && p.regenClock >= 10) { p.regenClock = 0; const f = Math.min(p.saturation, 6); healPlayer(f / 6); p.exhaustion += f; }
    else if (p.regenClock >= 80) { p.regenClock = 0; healPlayer(1); p.exhaustion += 6; }
  } else p.regenClock = 0;
  if (p.food === 0) {
    if (++p.starveClock >= 80) {
      p.starveClock = 0;
      const floor = GAME.difficulty === 'hard' ? 0 : GAME.difficulty === 'normal' ? 1 : 10;
      if (p.health > floor) hurtPlayer(1, { type: 'starve' });
    }
  } else p.starveClock = 0;
  // breath (a turtle shell gives 10 seconds of water breathing after you dive)
  if (p.inv.armor[0] && p.inv.armor[0].id === I.turtle_helmet && !p.headInWater) p.effects.water_breathing = { lvl: 1, t: 10 };
  if (p.headInWater && !hasEffect('water_breathing')) {
    const resp = p.inv.armor[0] ? enchLevel(p.inv.armor[0], 'respiration') : 0;
    if (Math.random() > resp / (resp + 1)) p.air -= 0.05;
    if (p.air <= 0) { p.air = 0; if (++p.drownClock >= 20) { p.drownClock = 0; hurtPlayer(2, { type: 'drown' }); } }
  } else { p.air = Math.min(15, p.air + 0.25); p.drownClock = 0; }
  // fire, lava and other hazards
  const inFire = touching(function (id) { return id === B.fire; });
  if (p.inWater || (GAME.weather !== 'clear' && GAME.world.topSolid(p.pos.x, p.pos.z) < p.pos.y)) p.fire = 0;
  p.hurtClock++;
  if (p.inLava) { p.fire = 15; if (p.hurtClock % 10 === 0) hurtPlayer(4, { type: 'lava' }); }
  else if (inFire) { p.fire = Math.max(p.fire, 8); if (p.hurtClock % 10 === 0) hurtPlayer(1, { type: 'fire' }); }
  else if (p.fire > 0) { p.fire -= 0.05; if (p.hurtClock % 20 === 0 && !hasEffect('fire_resistance')) hurtPlayer(1, { type: 'fire' }); }
  if (p.hurtClock % 10 === 0) {
    if (touching(function (id) { return id === B.cactus; }) || (function () {
      const pp = p.pos; for (const dx of [-PW - 0.02, PW + 0.02]) for (const dz of [-PW - 0.02, PW + 0.02]) if (cellAt(pp.x + dx, pp.y + 0.5, pp.z + dz) === B.cactus) return true; return false;
    })()) hurtPlayer(1, { type: 'cactus' });
    const under = BLOCKS[cellAt(p.pos.x, p.pos.y - 0.05, p.pos.z)];
    if (under && under.hot && !IS_LIQUID[under.id] && !p.sneaking && p.onGround) hurtPlayer(1, { type: 'hot_floor' });
    if (IS_OPAQUE[cellAt(p.pos.x, p.pos.y + EYE, p.pos.z)]) hurtPlayer(1, { type: 'suffocate' });
    if (p.pos.y < -10) hurtPlayer(4, { type: 'void' });
  }
  tickEffects(false);
}
function tickEffects(peaceful) {
  const p = player;
  for (const key in p.effects) {
    const e = p.effects[key];
    p.effectClocks[key] = (p.effectClocks[key] || 0) + 1;
    const c = p.effectClocks[key];
    if (!peaceful) {
      if (key === 'regeneration' && c % Math.max(1, 50 >> (e.lvl - 1)) === 0) healPlayer(1);
      if (key === 'poison' && c % Math.max(1, 25 >> (e.lvl - 1)) === 0 && p.health > 1) { p.invuln = 0; hurtPlayer(1, { type: 'poison' }); }
      if (key === 'wither' && c % Math.max(1, 40 >> (e.lvl - 1)) === 0) { p.invuln = 0; hurtPlayer(1, { type: 'wither' }); }
      if (key === 'hunger') p.exhaustion += 0.005 * e.lvl;
      if (key === 'saturation') { p.food = Math.min(20, p.food + e.lvl); p.saturation = Math.min(p.food, p.saturation + e.lvl * 2); }
    }
    if (e.t !== Infinity) e.t -= 0.05;
    if (e.t <= 0) { delete p.effects[key]; if (key === 'absorption') p.absorption = 0; UI.refresh(); }
  }
}

// ---------- combat ----------
function attackCooldown() { return 1 / attackSpeed(heldStack()); }
function attackCharge() { return clamp(player.attackTimer / attackCooldown(), 0, 1); }

function attackMob(m) {
  const p = player, held = heldStack(), it = held && ITEMS[held.id];
  const charge = attackCharge();
  let base = attackDamage(held) + 3 * hasEffect('strength') - 4 * hasEffect('weakness');
  let bonus = 0;
  const sharp = enchLevel(held, 'sharpness');
  if (sharp) bonus += 0.5 * sharp + 0.5;
  if (m.sp.undead) bonus += 2.5 * enchLevel(held, 'smite');
  if (m.sp.arthropod) bonus += 2.5 * enchLevel(held, 'bane_of_arthropods');
  let dmg = Math.max(0, base) * (0.2 + charge * charge * 0.8) + bonus * charge;
  const crit = charge > 0.9 && p.fallDistance > 0 && !p.onGround && !p.climbing && !p.inWater && !p.sprinting && !p.gliding;
  if (crit) dmg *= 1.5;
  let smash = false;
  if (it && it.kind === 'mace' && p.fallDistance > 1.5) {
    const fd = p.fallDistance;
    dmg += fd <= 3 ? 4 * fd : fd <= 8 ? 12 + 2 * (fd - 3) : 22 + (fd - 8);
    dmg += 0.5 * enchLevel(held, 'density') * fd;
    smash = true;
  }
  if (it && it.kind === 'spear') {
    const speed = p.vel.length();
    dmg *= 1 + speed / 5;
    const lunge = enchLevel(held, 'lunge');
    if (lunge && charge > 0.9) {
      const cp = Math.cos(p.pitch);
      p.vel.x += -Math.sin(p.yaw) * cp * 4 * lunge; p.vel.z += -Math.cos(p.yaw) * cp * 4 * lunge; p.vel.y += Math.sin(p.pitch) * 2 * lunge;
      if (p.gamemode === 'survival') p.exhaustion += 1.25 * lunge;
    }
  }
  const knock = 1 + enchLevel(held, 'knockback') + (p.sprinting && charge > 0.9 ? 1 : 0);
  const hit = m.hurt(dmg, { type: 'player', from: p.pos.clone(), knock: knock, fire: 4 * enchLevel(held, 'fire_aspect'), attacker: p, looting: enchLevel(held, 'looting') });
  if (!GAME.online) ownerAttacked(p, m);
  if (hit) {
    if (crit) GAME.particles('crit', m.pos.x, m.centerY, m.pos.z, 10);
    if (smash) {
      smashEffect(m);
      p.fallDistance = 0;
      const wb = enchLevel(held, 'wind_burst');
      p.vel.y = wb ? 8 + 4 * wb : Math.max(p.vel.y, 0);
    }
    if (it && it.dur) damageHeld(it.kind === 'sword' || it.kind === 'spear' || it.kind === 'mace' ? 1 : 2);
    if (knock > 1) p.sprintIntent = false;
    GAME.sound(smash ? 'smash' : crit ? 'crit' : 'hit');
  }
  if (p.gamemode === 'survival') p.exhaustion += 0.1;
  p.attackTimer = 0;
}

// The mace's ground-pound: dust ring, shockwave and knock-back for everything nearby.
function smashEffect(target) {
  const c = target.pos, world = GAME.world;
  const groundId = world.get(Math.floor(c.x), Math.floor(c.y - 0.5), Math.floor(c.z)) || B.dirt;
  GAME.particles('smash', c.x, c.y, c.z, 36, groundId);
  GAME.shockwave(c.x, c.y + 0.05, c.z);
  GAME.shake(0.7);
  for (const m of GAME.mobs) {
    if (m === target || m.dead) continue;
    const dx = m.pos.x - c.x, dz = m.pos.z - c.z, d = Math.hypot(dx, dz);
    if (d > 3.5 || Math.abs(m.pos.y - c.y) > 2) continue;
    const k = (3.5 - d) * 2.4;
    m.kx = dx / (d || 1) * k; m.kz = dz / (d || 1) * k; m.vel.y = Math.max(m.vel.y, 4 + k * 0.4); m.onGround = false;
  }
}

// While charging a spear (hold right-click), anything you run into gets hit by your speed.
function spearChargeTick(dt) {
  const p = player;
  if (!p.use || p.use.type !== 'spear') return;
  const held = heldStack();
  if (!held || ITEMS[held.id].kind !== 'spear') { p.use = null; return; }
  const speed = p.vel.length();
  if (speed < 5) return;
  const cp = Math.cos(p.pitch), lx = -Math.sin(p.yaw) * cp, ly = Math.sin(p.pitch), lz = -Math.cos(p.yaw) * cp;
  for (const m of GAME.mobs) {
    if (m.dead || (m.spearCd || 0) > performance.now()) continue;
    const dx = m.pos.x - p.pos.x, dy = m.centerY - (p.pos.y + 1), dz = m.pos.z - p.pos.z, d = Math.hypot(dx, dy, dz);
    if (d > 2.4 + m.sp.r || (dx * lx + dy * ly + dz * lz) / (d || 1) < 0.5) continue;
    m.spearCd = performance.now() + 500;
    const dmg = attackDamage(held) * (1 + speed / 5) + (enchLevel(held, 'sharpness') ? 0.5 * enchLevel(held, 'sharpness') + 0.5 : 0);
    if (m.hurt(dmg, { type: 'player', from: p.pos.clone(), knock: 1 + speed / 10, attacker: p, looting: enchLevel(held, 'looting'), fire: 4 * enchLevel(held, 'fire_aspect') })) {
      GAME.particles('crit', m.pos.x, m.centerY, m.pos.z, 8);
      GAME.sound('crit');
      damageHeld(1);
    }
  }
}

// 67
// ---------- breaking ----------
function canBreakWith(held) {
  if (player.gamemode === 'creative') return !(held && ITEMS[held.id].kind === 'sword');
  return player.gamemode === 'survival';
}
// Called every frame while the attack button is held over a block.
function breakTick(dt, target) {
  const p = player;
  p.breakCd = Math.max(0, p.breakCd - dt);
  if (!target || !canBreakWith(heldStack())) { p.breaking = null; return; }
  const b = BLOCKS[target.id];
  if (b.unbreakable && p.gamemode !== 'creative') { p.breaking = null; return; }
  if (p.breakCd > 0) return;
  if (p.gamemode === 'creative') {
    if (b.unbreakable && target.y === 0) { UI.toast("Bedrock at the bottom of the world can't be broken"); p.breakCd = 0.25; return; }
    GAME.breakBlock(target.x, target.y, target.z, false);
    p.breakCd = 0.25;
    GAME.swing();
    return;
  }
  const br = p.breaking;
  if (!br || br.x !== target.x || br.y !== target.y || br.z !== target.z || br.id !== target.id) {
    p.breaking = { x: target.x, y: target.y, z: target.z, id: target.id, t: 0, total: breakSeconds(target.id, heldStack(), p.headInWater, p.onGround || p.inWater || p.climbing) };
  }
  const cur = p.breaking;
  cur.t += dt;
  if ((cur.t * 4 | 0) !== ((cur.t - dt) * 4 | 0)) { GAME.swing(); GAME.sound('dig', target.id); }
  if (cur.t >= cur.total) {
    GAME.breakBlock(cur.x, cur.y, cur.z, true);
    const held = heldStack();
    if (held && ITEMS[held.id].dur && cur.total > 0) damageHeld(ITEMS[held.id].kind === 'sword' ? 2 : ITEMS[held.id].tool ? 1 : 0);
    p.exhaustion += 0.005;
    p.breaking = null;
    p.breakCd = 0.25;
  }
}

// ---------- using items and blocks (right click) ----------
function lookDirection() {
  const cp = Math.cos(player.pitch);
  return new THREE.Vector3(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
}
function lookFacing() {
  const dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw);
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 3 : 1) : (dz > 0 ? 0 : 2);
}
function eyePos() { return new THREE.Vector3(player.pos.x, player.pos.y + EYE - (player.sneaking ? 0.3 : 0), player.pos.z); }

// Right click pressed. Tries the block, then the main hand, then the off hand.
function useStart(target, targetMob) {
  const p = player;
  if (p.gamemode === 'spectator' || p.dead || p.placeCd > 0) return;
  if (targetMob) {
    const held = heldStack();
    if (held && held.id === I.bucket && (targetMob.sp.key === 'cow' || targetMob.sp.key === 'mooshroom')) { replaceHeld('main', 'milk_bucket'); GAME.sound('milk'); return; }
    if (held && held.id === I.bowl && targetMob.sp.key === 'mooshroom') { replaceHeld('main', 'mushroom_stew'); GAME.sound('milk'); return; }
    if (held && held.id === I.name_tag && held.name) { GAME.nameMob(targetMob, held.name); consumeHeld(1, 'main'); return; }
    if (held && held.id === I.water_bucket && I[targetMob.sp.key + '_bucket'] && ITEMS[I[targetMob.sp.key + '_bucket']].fish) {
      GAME.removeMob ? GAME.removeMob(targetMob) : (targetMob.remove = true);
      replaceHeld('main', targetMob.sp.key + '_bucket'); GAME.sound('bucket_fill'); return;
    }
    if (held && held.id === I.wolf_armor && targetMob.sp.key === 'wolf' && targetMob.owner === p.id && !targetMob.wolfArmor) {
      targetMob.wolfArmor = 64; if (targetMob.model) dressWolf(targetMob.model, true); consumeHeld(1, 'main'); GAME.sound('equip'); return;
    }
    GAME.hearts(targetMob);
    return;
  }
  if (target && !p.sneaking && interactBlock(target)) { p.placeCd = 0.2; GAME.swing(); return; }
  if (useItem('main', target)) return;
  if (useItem('off', target)) return;
}
function useItem(hand, target) {
  const p = player, s = hand === 'off' ? p.inv.offhand : heldStack();
  if (!s) return false;
  const it = ITEMS[s.id];
  if (it.block) return placeBlock(s, hand, target);
  if (it.food) {
    if (p.gamemode === 'creative' || p.food < 20 || it.food.always) { p.use = { type: 'eat', hand: hand, t: 0, total: it.food.time || 1.6, id: s.id }; return true; }
    return false;
  }
  if (it.armor && it.kind) {
    const slot = it.armor.slot, old = p.inv.armor[slot];
    p.inv.armor[slot] = s;
    if (hand === 'off') p.inv.offhand = old; else setHeld(old);
    GAME.sound('equip'); UI.refresh();
    return true;
  }
  switch (it.use) {
    case 'bow':
      if (p.gamemode === 'creative' || countItem(I.arrow) > 0) { p.use = { type: 'bow', hand: hand, t: 0 }; return true; }
      return false;
    case 'shield': p.use = { type: 'shield', hand: hand, t: 0 }; return true;
    case 'milk': p.use = { type: 'eat', hand: hand, t: 0, total: 1.6, id: s.id, milk: true }; return true;
    case 'rod': return useRod(hand);
    case 'rocket':
      if (p.gliding) { p.rocket = 22 + (Math.random() * 10 | 0); consumeHeld(1, hand); GAME.sound('rocket'); }
      else { GAME.particles('firework', p.pos.x - Math.sin(p.yaw) * 1.5, p.pos.y + 2, p.pos.z - Math.cos(p.yaw) * 1.5, 30); GAME.sound('rocket'); consumeHeld(1, hand); }
      p.placeCd = 0.2;
      return true;
    case 'pearl':
      if (p.pearlCd > 0) return false;
      p.pearlCd = 1;
      GAME.throwProjectile('pearl', 30); consumeHeld(1, hand); return true;
    case 'snowball': GAME.throwProjectile('snowball', 30); consumeHeld(1, hand); p.placeCd = 0.2; return true;
    case 'bucket': return useBucket(hand, null);
    case 'water_bucket': return useBucket(hand, B.water);
    case 'lava_bucket': return useBucket(hand, B.lava);
    case 'flint': return useFlint(hand, target);
    case 'fire_charge': { const ok = useFlint(hand, target, true); if (ok && p.gamemode !== 'creative') consumeHeld(1, hand); return ok; }
    case 'throw': GAME.throwProjectile(it.throws, it.throws === 'eye' ? 14 : 20); if (p.gamemode !== 'creative') consumeHeld(1, hand); p.placeCd = 0.25; GAME.sound('throw'); return true;
    case 'spawn_egg': {
      if (!target) return false;
      const sp = speciesByKey(it.spawns); if (!sp) return false;
      const x = target.x + target.nx + 0.5, y = target.y + target.ny, z = target.z + target.nz + 0.5;
      GAME.summonMob(sp.key, x, y + (sp.move === 'fly' ? 1 : 0), z);
      if (p.gamemode !== 'creative') consumeHeld(1, hand);
      p.placeCd = 0.25; GAME.swing(); return true;
    }
    case 'fish_bucket': {
      if (!useBucket(hand, B.water)) return false;
      const hit = target ? [target.x + target.nx + 0.5, target.y + target.ny + 0.3, target.z + target.nz + 0.5] : [p.pos.x, p.pos.y, p.pos.z];
      GAME.summonMob(it.fish, hit[0], hit[1], hit[2]);
      return true;
    }
    case 'orbital': return useOrbital(hand, s, it);
    case 'trident': p.use = { type: 'trident', hand: hand, t: 0 }; return true;
    case 'crossbow':
      if (s.loaded) {
        s.loaded = false;
        GAME.throwProjectile('arrow', 63, { dmg: 9, pickup: p.gamemode === 'survival' });
        GAME.sound('crossbow');
        if (damageStack(s, 1)) { if (hand === 'off') p.inv.offhand = null; else setHeld(null); }
        p.placeCd = 0.3; UI.refresh();
        return true;
      }
      if (p.gamemode === 'creative' || countItem(I.arrow) > 0) { p.use = { type: 'crossbow', hand: hand, t: 0 }; GAME.sound('crossbow_load'); return true; }
      return false;
    case 'spyglass': p.use = { type: 'spyglass', hand: hand, t: 0 }; GAME.sound('spyglass'); return true;
    case 'horn':
      if ((p.hornCd || 0) > performance.now()) return false;
      p.hornCd = performance.now() + 7000;
      GAME.sound('horn', null, p.pos, true);
      return true;
  }
  if (s.id === I.glass_bottle && target && (target.id === B.beehive || target.id === B.bee_nest)) { replaceHeld(hand, 'honey_bottle'); GAME.sound('bucket_fill'); return true; }
  if (it.kind === 'spear') { p.use = { type: 'spear', hand: hand, t: 0 }; return true; }
  if (s.id === I.bone_meal && target) return useBoneMeal(hand, target);
  return false;
}

function interactBlock(t) {
  const b = BLOCKS[t.id], world = GAME.world, p = player;
  switch (b.interact) {
    case 'craft': UI.openCrafting(); return true;
    case 'furnace': UI.openFurnace(world.idx(t.x, t.y, t.z), b.key); return true;
    case 'chest': UI.openChest(world.idx(t.x, t.y, t.z), b.name); return true;
    case 'anvil': UI.openAnvil(); return true;
    case 'enchant': UI.openEnchanting(t.x, t.y, t.z); return true;
    case 'toggle': {
      const m = world.getMeta(t.x, t.y, t.z) ^ META_OPEN;
      world.setMeta(t.x, t.y, t.z, m);
      GAME.markDirty(t.x, t.y, t.z);
      if (b.shape === 'door') {
        const oy = m & META_TOP ? t.y - 1 : t.y + 1;
        if (world.get(t.x, oy, t.z) === t.id) { world.setMeta(t.x, oy, t.z, world.getMeta(t.x, oy, t.z) ^ META_OPEN); GAME.markDirty(t.x, oy, t.z); }
      }
      GAME.flush(); GAME.sound(m & META_OPEN ? 'door_open' : 'door_close');
      return true;
    }
    case 'bed': {
      p.spawn = new THREE.Vector3(t.x + 0.5, t.y + 1, t.z + 0.5);
      if (!isNight()) { UI.toast('Respawn point set. You can only sleep at night.'); return true; }
      if (GAME.mobs.some(function (m) { return MOB_SPECIES.indexOf(m.sp) >= 0 && m.pos.distanceTo(p.pos) < 8; })) { UI.toast('You may not rest now; there are monsters nearby'); return true; }
      UI.sleep(function () { GAME.dayTime = 0.0; GAME.weather = 'clear'; });
      return true;
    }
    case 'bell': {
      GAME.sound('bell', null, new THREE.Vector3(t.x + 0.5, t.y + 0.5, t.z + 0.5), true);
      // Like vanilla, ringing a bell makes nearby villagers run inside and shows raiders.
      for (const m of GAME.mobs) if (m.sp && m.sp.villager && m.pos.distanceTo(p.pos) < 32 && m.startFlee) m.startFlee(p.pos, 4);
      return true;
    }
    case 'note': {
      const m = (world.getMeta(t.x, t.y, t.z) + 1) % 25;
      world.setMeta(t.x, t.y, t.z, m);
      GAME.note(m); GAME.particles('note', t.x + 0.5, t.y + 1.2, t.z + 0.5, 1);
      return true;
    }
    case 'jukebox': {
      const held = heldStack(), disc = held && ITEMS[held.id].disc;
      if (GAME.jukebox(t.x, t.y, t.z, disc ? held.id : 0) && disc) consumeHeld(1, 'main');
      return true;
    }
    case 'cake': {
      if (p.gamemode !== 'creative' && p.food >= 20) return false;
      p.food = Math.min(20, p.food + 2); p.saturation = Math.min(p.food, p.saturation + 0.4);
      const bites = (world.getMeta(t.x, t.y, t.z) & 7) + 1;
      if (bites >= 7) GAME.setBlock(t.x, t.y, t.z, 0); else { world.setMeta(t.x, t.y, t.z, bites); GAME.markDirty(t.x, t.y, t.z); GAME.flush(); }
      GAME.sound('eat'); UI.refresh();
      return true;
    }
  }
  return false;
}

function placeBlock(s, hand, t) {
  const p = player, world = GAME.world;
  if (!t) return false;
  const id = s.id, b = BLOCKS[id];
  let x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
  const tb = BLOCKS[t.id];
  if (IS_CROSS[t.id] && !IS_WATERLIKE[t.id] && !tb.sapling) { x = t.x; y = t.y; z = t.z; }
  // Slab on slab of the same kind makes a full block.
  if (b.shape === 'slab' && t.id === id && b.base) {
    const m = world.getMeta(t.x, t.y, t.z);
    if ((t.ny === 1 && !(m & META_TOP)) || (t.ny === -1 && (m & META_TOP))) { GAME.placeAt(t.x, t.y, t.z, B[b.base], 0); consumeHeld(1, hand); return true; }
  }
  if (x < 0 || z < 0 || y < 0 || x >= WX || z >= WZ || y >= WY) { UI.toast('That is the edge of the world'); return true; }
  const cur = world.get(x, y, z);
  if (cur && !IS_LIQUID[cur] && !(IS_CROSS[cur] && !IS_WATERLIKE[cur]) && cur !== B.fire) return false;
  // Plants need the right ground.
  const below = world.get(x, y - 1, z);
  if ((b.cross && !b.waterlogged) && !(IS_SOLID[below] || below === id)) return false;
  if (b.sapling && !(below === B.grass || below === B.dirt || below === B.podzol || below === B.coarse_dirt || below === B.rooted_dirt || below === B.moss_block || below === B.mud)) return false;
  if (b.key === 'sugar_cane' && below !== B.sugar_cane && !(below === B.sand || below === B.grass || below === B.dirt || below === B.red_sand)) return false;
  let meta = 0;
  const look = lookFacing();
  if (b.hasFront) meta = (look + 2) % 4;
  if (b.shape === 'stairs' || b.shape === 'anvil') meta = look | (b.shape === 'stairs' && (t.ny === -1 || (t.ny === 0 && t.hy > 0.5)) ? META_TOP : 0);
  if (b.shape === 'slab') meta = t.ny === -1 || (t.ny === 0 && t.hy > 0.5) ? META_TOP : 0;
  if (b.shape === 'trapdoor') meta = ((look + 2) % 4) | (t.ny === -1 || (t.ny === 0 && t.hy > 0.5) ? META_TOP : 0);
  if (b.shape === 'torch') {
    if (t.ny === 1) meta = 0;
    else if (t.ny === 0) meta = META_WALL | (t.nx === 1 ? 1 : t.nx === -1 ? 3 : t.nz === 1 ? 2 : 0);
    else return false;
  }
  if (b.shape === 'ladder') {
    if (t.ny !== 0) return false;
    meta = t.nx === 1 ? 1 : t.nx === -1 ? 3 : t.nz === 1 ? 2 : 0;
  }
  if (b.shape === 'door') {
    if (y + 1 >= WY || (world.get(x, y + 1, z) && !IS_CROSS[world.get(x, y + 1, z)]) || !IS_SOLID[below]) return false;
    meta = look;
  }
  if (IS_SOLID[id] && !b.nosolid) {
    if (p.gamemode !== 'spectator' && x + 1 > p.pos.x - PW && x < p.pos.x + PW && z + 1 > p.pos.z - PW && z < p.pos.z + PW && y + (b.shape === 'door' ? 2 : 1) > p.pos.y && y < p.pos.y + PH) return false;
    for (const m of GAME.mobs) {
      const bx = new THREE.Box3();
      m.box(bx);
      if (bx.max.x > x && bx.min.x < x + 1 && bx.max.y > y + 0.05 && bx.min.y < y + 1 && bx.max.z > z && bx.min.z < z + 1 && b.shape !== 'carpet') return false;
    }
  }
  GAME.placeAt(x, y, z, id, meta);
  if (b.shape === 'door') GAME.placeAt(x, y + 1, z, id, meta | META_TOP);
  consumeHeld(1, hand);
  p.placeCd = 0.2;
  GAME.swing();
  GAME.sound('place', id);
  return true;
}

function useBucket(hand, liquid) {
  const p = player, world = GAME.world;
  const hit = world.raycast(eyePos(), lookDirection(), 5, true);
  if (!liquid) {
    if (!hit || !IS_LIQUID[hit.id]) return false;
    world.set(hit.x, hit.y, hit.z, 0);
    GAME.markDirty(hit.x, hit.y, hit.z); GAME.flush();
    replaceHeld(hand, IS_WATER[hit.id] ? 'water_bucket' : 'lava_bucket');
    GAME.sound('bucket_fill');
    p.placeCd = 0.2;
    return true;
  }
  if (!hit) return false;
  let x = hit.x, y = hit.y, z = hit.z;
  const cur = hit.id;
  if (!(IS_CROSS[cur] && !IS_WATERLIKE[cur]) && !IS_LIQUID[cur] && cur !== B.fire) { x += hit.nx; y += hit.ny; z += hit.nz; }
  const there = world.get(x, y, z);
  if (there && !IS_LIQUID[there] && !IS_CROSS[there] && there !== B.fire) return false;
  GAME.placeAt(x, y, z, liquid, 0);
  if (p.gamemode !== 'creative') replaceHeld(hand, 'bucket');
  GAME.sound('bucket_empty');
  p.placeCd = 0.2;
  return true;
}

function useFlint(hand, t, charge) {
  const p = player, world = GAME.world;
  if (!t) return false;
  if (t.id === B.tnt) {
    GAME.setBlock(t.x, t.y, t.z, 0);
    GAME.spawnTnt(t.x, t.y, t.z);
  } else {
    const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    const cur = world.get(x, y, z);
    if (cur && !(IS_CROSS[cur] && !IS_WATERLIKE[cur])) return false;
    if (!IS_SOLID[world.get(x, y - 1, z)] && t.ny !== 0) return false;
    GAME.placeAt(x, y, z, B.fire, 0);
  }
  GAME.sound(charge ? 'blaze' : 'flint');
  if (charge) { p.placeCd = 0.25; UI.refresh(); return true; }
  const s = hand === 'off' ? p.inv.offhand : heldStack();
  if (damageStack(s, 1)) { if (hand === 'off') p.inv.offhand = null; else setHeld(null); }
  p.placeCd = 0.25;
  UI.refresh();
  return true;
}

// 67
function useBoneMeal(hand, t) {
  const b = BLOCKS[t.id], world = GAME.world;
  if (b.sapling) {
    if (Math.random() < 0.45 && GAME.growSapling(t.x, t.y, t.z)) GAME.particles('happy', t.x + 0.5, t.y + 0.5, t.z + 0.5, 12);
    else GAME.particles('happy', t.x + 0.5, t.y + 0.5, t.z + 0.5, 5);
    consumeHeld(1, hand);
    return true;
  }
  if (t.id === B.grass) {
    const flowers = [B.tall_grass, B.tall_grass, B.tall_grass, B.poppy, B.dandelion, B.cornflower, B.oxeye_daisy];
    for (let i = 0; i < 14; i++) {
      const x = t.x + Math.round((Math.random() - 0.5) * 6), z = t.z + Math.round((Math.random() - 0.5) * 6);
      if (world.get(x, t.y, z) === B.grass && !world.get(x, t.y + 1, z)) GAME.placeAt(x, t.y + 1, z, flowers[Math.random() * flowers.length | 0], 0);
    }
    GAME.particles('happy', t.x + 0.5, t.y + 1, t.z + 0.5, 12);
    consumeHeld(1, hand);
    return true;
  }
  return false;
}

// ---------- orbital shots ----------
// Pull the rod: the block you look at (up to 512 away) is marked, and the cannon fires half a second later.
function useOrbital(hand, s, it) {
  const p = player;
  const hit = GAME.world.raycast(eyePos(), lookDirection(), 512, false);
  GAME.sound('cast'); GAME.swing();
  if (!hit) { UI.toast('No block in sight to aim at'); return true; }
  GAME.startStrike(it.orbital, { x: hit.x, y: hit.y, z: hit.z }, p);
  setTimeout(function () { GAME.sound('reel'); }, 120);
  if (damageStack(s, 1)) { if (hand === 'off') p.inv.offhand = null; else setHeld(null); }
  p.placeCd = 0.5;
  UI.refresh();
  return true;
}

// ---------- fishing ----------
function useRod(hand) {
  const p = player;
  if (p.fishing && !p.fishing.bobber.remove) { reelIn(hand); return true; }
  const bobber = GAME.throwProjectile('bobber', 16);
  p.fishing = { bobber: bobber, hand: hand, wait: fishWait(), bite: 0 };
  GAME.sound('cast');
  return true;
}
function fishWait() {
  const rod = heldStack(), lure = enchLevel(rod, 'lure');
  return Math.max(2, 5 + Math.random() * 25 - lure * 5);
}
function fishingTick(dt) {
  const f = player.fishing;
  if (!f) return;
  const b = f.bobber;
  const rod = f.hand === 'off' ? player.inv.offhand : heldStack();
  if (b.remove || !rod || rod.id !== I.fishing_rod || b.pos.distanceTo(player.pos) > 32) { b.remove = true; player.fishing = null; return; }
  if (!b.inWater) return;
  if (f.bite > 0) {
    f.bite -= dt; b.bite = f.bite;
    if (f.bite <= 0) { f.wait = fishWait(); b.bite = 0; }
    return;
  }
  f.wait -= dt;
  if (f.wait <= 0) {
    f.bite = 1.1;
    GAME.particles('splash', b.pos.x, b.pos.y + 0.2, b.pos.z, 10);
    GAME.sound('splash');
  }
}
function reelIn(hand) {
  const p = player, f = p.fishing, rod = hand === 'off' ? p.inv.offhand : heldStack();
  if (!f) return;
  if (f.bite > 0) {
    const luck = enchLevel(rod, 'luck_of_the_sea');
    const r = Math.random();
    let s;
    if (r < 0.05 + luck * 0.021) {
      const keys = Object.keys(ENCHANTS), k = keys[Math.random() * keys.length | 0];
      s = [stack('enchanted_book', 1, { ench: { [k]: 1 + (Math.random() * ENCHANTS[k].max | 0) } }), stack('bow', 1), stack('fishing_rod', 1, { ench: { lure: 1 } })][Math.random() * 3 | 0];
    } else if (r < 0.15 - luck * 0.02) {
      s = stack(['bowl', 'leather', 'stick', 'string', 'bone', 'rotten_flesh', 'ink_sac'][Math.random() * 7 | 0], 1);
    } else {
      const q = Math.random();
      s = stack(q < 0.6 ? 'cod' : q < 0.85 ? 'salmon' : q < 0.87 ? 'tropical_fish' : 'pufferfish', 1);
    }
    const from = f.bobber.pos.clone();
    const vel = new THREE.Vector3().subVectors(p.pos, from).multiplyScalar(1.2);
    vel.y = Math.max(vel.y, 0) + 6;
    GAME.dropStack(s, from, vel);
    addXp(1 + (Math.random() * 6 | 0));
    if (damageStack(rod, 1)) { if (hand === 'off') p.inv.offhand = null; else setHeld(null); }
  } else if (f.bobber.stuck) {
    if (damageStack(rod, 2)) { if (hand === 'off') p.inv.offhand = null; else setHeld(null); }
  }
  f.bobber.remove = true;
  p.fishing = null;
  GAME.sound('reel');
  UI.refresh();
}

// ---------- holding right click ----------
function useHoldTick(dt) {
  const p = player, u = p.use;
  spearChargeTick(dt);
  if (!u) return;
  u.t += dt;
  if (u.type === 'crossbow' && u.t >= 1.25) {
    const s = u.hand === 'off' ? p.inv.offhand : heldStack();
    if (s && s.id === I.crossbow) { s.loaded = true; if (p.gamemode !== 'creative') removeItem(I.arrow, 1); GAME.sound('crossbow_loaded'); }
    p.use = null; UI.refresh();
    return;
  }
  if (u.type === 'eat') {
    const s = u.hand === 'off' ? p.inv.offhand : heldStack();
    if (!s || s.id !== u.id) { p.use = null; return; }
    if ((u.t * 5 | 0) !== ((u.t - dt) * 5 | 0)) { GAME.sound(u.milk ? 'drink' : 'eat'); GAME.particles('crumbs', p.pos.x - Math.sin(p.yaw) * 0.4, p.pos.y + 1.4, p.pos.z - Math.cos(p.yaw) * 0.4, 3, s.id); }
    if (u.t >= u.total) finishEating(s, u);
  }
}
function finishEating(s, u) {
  const p = player, it = ITEMS[s.id];
  if (u.milk) { clearEffects(); replaceHeld(u.hand, 'bucket'); p.use = null; return; }
  if (s.id === I.honey_bottle) { delete p.effects.poison; }
  if (s.id === I.chorus_fruit) {
    for (let i = 0; i < 16; i++) {
      const x = p.pos.x + (Math.random() - 0.5) * 16, z = p.pos.z + (Math.random() - 0.5) * 16, top = GAME.world.topSolid(x, z);
      if (top > 0 && Math.abs(top + 1 - p.pos.y) < 9 && x > 1 && z > 1 && x < WX - 1 && z < WZ - 1) { GAME.particles('portal', p.pos.x, p.pos.y + 1, p.pos.z, 12); p.pos.set(Math.floor(x) + 0.5, top + 1, Math.floor(z) + 0.5); p.fallDistance = 0; GAME.sound('vwoop'); break; }
    }
  }
  const food = it.food;
  p.food = Math.min(20, p.food + food.h);
  p.saturation = Math.min(p.food, p.saturation + food.s);
  if (food.fx) for (const fx of food.fx) if (fx[3] === undefined || Math.random() < fx[3]) applyEffect(fx[0], fx[1], fx[2]);
  if (food.returns) replaceHeld(u.hand, food.returns);
  else consumeHeld(1, u.hand);
  GAME.sound('burp');
  p.use = null;
  UI.refresh();
}
// Right click released: shoot the bow, lower the shield.
function useRelease() {
  const p = player, u = p.use;
  if (!u) return;
  if (u.type === 'trident' && u.t >= 0.5) {
    const s = u.hand === 'off' ? p.inv.offhand : heldStack();
    if (s) {
      const broke = damageStack(s, 1);
      GAME.throwProjectile('trident', 50, { stack: Object.assign({}, s) });
      if (p.gamemode !== 'creative' || broke) { if (u.hand === 'off') p.inv.offhand = null; else setHeld(null); }
      GAME.sound('trident');
      UI.refresh();
    }
  }
  if (u.type === 'bow') {
    const bow = u.hand === 'off' ? p.inv.offhand : heldStack();
    let f = u.t;
    f = (f * f + f * 2) / 3;
    if (f > 1) f = 1;
    if (f >= 0.1 && bow) {
      const infinity = enchLevel(bow, 'infinity') > 0, creative = p.gamemode === 'creative';
      const power = enchLevel(bow, 'power');
      GAME.throwProjectile('arrow', 60 * f, {
        crit: f >= 1, dmgMul: (2 + (power ? 0.5 * (power + 1) : 0)) / 2, punch: enchLevel(bow, 'punch'), flame: enchLevel(bow, 'flame') > 0,
        pickup: !infinity && !creative
      });
      if (!infinity && !creative) removeItem(I.arrow, 1);
      if (damageStack(bow, 1)) { if (u.hand === 'off') p.inv.offhand = null; else setHeld(null); }
      GAME.sound('bow');
      UI.refresh();
    }
  }
  p.use = null;
}

// Middle click: copy the targeted block into your hand.
function pickBlock(target) {
  if (!target || player.gamemode === 'spectator') return;
  let id = target.id;
  if (!ITEMS[id]) { id = IS_WATER[id] ? I.water_bucket : IS_LAVA[id] ? I.lava_bucket : 0; if (!id) return; }
  const m = player.inv.main;
  for (let i = 0; i < 9; i++) if (m[i] && m[i].id === id) { player.sel = i; UI.refresh(); return; }
  if (player.gamemode === 'creative') {
    let slot = player.sel;
    if (m[slot]) { const empty = m.slice(0, 9).indexOf(null); if (empty >= 0) slot = empty; }
    m[slot] = stack(id, maxStack(id)); player.sel = slot;
  } else {
    for (let i = 9; i < 36; i++) if (m[i] && m[i].id === id) { const t = m[player.sel]; m[player.sel] = m[i]; m[i] = t; break; }
  }
  UI.refresh();
}

function dropHeld(all) {
  const s = heldStack();
  if (!s || player.gamemode === 'spectator') return;
  const n = all ? s.n : 1;
  const out = Object.assign({}, s, { n: n });
  s.n -= n;
  if (s.n <= 0) setHeld(null);
  const d = lookDirection();
  GAME.dropStack(out, eyePos().addScaledVector(d, 0.4).setY(player.pos.y + 1.3), d.multiplyScalar(5).setY(d.y * 5 + 1.5), 1.5);
  UI.refresh();
}
function swapHands() {
  if (player.gamemode === 'spectator') return;
  const s = heldStack();
  setHeld(player.inv.offhand);
  player.inv.offhand = s;
  UI.refresh();
}

// 67