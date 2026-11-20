'use strict';
// Everything that moves: mobs, dropped items, projectiles, lit TNT, explosions and orbital strikes.
// This runs wherever the world is simulated: the browser in single player, or the dedicated server.

// 67
const TAU = Math.PI * 2;
const SIM_DIST = 96;       // mobs further than this from every player stand still, like unloaded chunks
function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function solidAt(world, x, y, z) { return IS_SOLID[world.get(Math.floor(x), Math.floor(y), Math.floor(z))]; }
function waterAt(world, x, y, z) { return IS_WATERLIKE[world.get(Math.floor(x), Math.floor(y), Math.floor(z))]; }
function lavaAt(world, x, y, z) { return IS_LAVA[world.get(Math.floor(x), Math.floor(y), Math.floor(z))]; }
function isNight() { return Math.sin(GAME.dayTime * TAU) < -0.05; }
function difficultyScale(dmg) {
  if (GAME.difficulty === 'peaceful') return 0;
  if (GAME.difficulty === 'easy') return Math.min(dmg / 2 + 1, dmg);
  if (GAME.difficulty === 'hard') return dmg * 1.5;
  return dmg;
}
function survivors() { return GAME.players().filter(function (p) { return p.gamemode === 'survival' && !p.dead; }); }
function nearestPlayer(pos, range, list) {
  let best = null, bd = range * range;
  for (const p of list || survivors()) { const d = p.pos.distanceToSquared(pos); if (d < bd) { bd = d; best = p; } }
  return best;
}
function isPlayer(o) { return !!o && !(o instanceof Mob); }
// True when nothing solid blocks the straight line between two points.
function lineOfSight(a, b) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  if (len < 0.01) return true;
  d.divideScalar(len);
  const hit = GAME.world.raycast(a, d, len, false);
  return !hit || !IS_OPAQUE[hit.id] || hit.t > len - 0.3;
}
function rollDrops(drops, looting, rnd) {
  const out = [];
  for (const d of drops || []) {
    if (rnd() > d.chance + looting * 0.01) continue;
    const n = d.lo + Math.floor(rnd() * (d.hi - d.lo + 1 + looting));
    if (n > 0 && I[d.key]) out.push(stack(d.key, n));
  }
  return out;
}
function centerOf(o) { return o instanceof Mob ? new THREE.Vector3(o.pos.x, o.centerY, o.pos.z) : new THREE.Vector3(o.pos.x, o.pos.y + 0.9, o.pos.z); }

class Mob {
  constructor(sp, x, y, z, rnd) {
    rnd = rnd || Math.random;
    this.id = GAME.nextId++;
    this.sp = sp;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = rnd() * TAU;
    this.targetYaw = this.yaw;
    this.timer = rnd() * 3;
    this.t = rnd() * 10;
    this.moving = false; this.flee = 0; this.onGround = false;
    this.kx = 0; this.kz = 0;
    this.hp = sp.hp; this.maxHp = sp.hp;
    this.invuln = 0; this.flashT = 0; this.fire = 0; this.fireTick = 0; this.lavaTick = 0;
    this.angry = 0; this.foe = null; this.attackCd = 0; this.fuse = 0; this.shootCd = 1 + rnd() * 2;
    this.dead = 0; this.remove = false; this.chasing = false; this.goal = null;
    this.effects = {}; this.owner = null; this.noFall = false; this.voice = 4 + rnd() * 12; this.swoopT = 3;
    this.model = GAME.scene ? buildModel(sp) : null;
    if (sp.move === 'fly') {
      this.radius = 4 + rnd() * 8;
      this.cx = this.ccx = x; this.cz = this.ccz = z;
      this.angle = rnd() * TAU;
      this.dir = rnd() < 0.5 ? 1 : -1;
      this.ground = SEA; this.groundTimer = 0;
    }
    if (sp.move === 'swim') this.target = this.pos.clone();
  }

  get centerY() { return this.sp.move === 'walk' || this.sp.move === 'hop' ? this.pos.y + this.sp.h / 2 : this.pos.y; }
  get headY() { return this.sp.move === 'walk' || this.sp.move === 'hop' ? this.pos.y + this.sp.h * 0.9 : this.pos.y; }
  effect(k) { return this.effects[k] ? this.effects[k].lvl : 0; }
  addEffect(k, lvl, secs) { this.effects[k] = { lvl: lvl, t: secs }; }

  startFlee(from, seconds) {
    this.flee = seconds;
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
    this.targetYaw = Math.atan2(dx, dz);
    if (this.sp.move === 'swim') {
      const len = Math.hypot(dx, dz) || 1;
      this.target.set(clamp(this.pos.x + dx / len * 8, 0.5, WX - 0.5), this.pos.y, clamp(this.pos.z + dz / len * 8, 0.5, WZ - 0.5));
      this.timer = 3;
    }
  }
  setFoe(o, seconds) {
    if (!o || o === this || (this.owner !== null && isPlayer(o) && o.id === this.owner)) return;
    if (o instanceof Mob && this.owner !== null && o.owner === this.owner) return;
    this.foe = o; this.angry = seconds || 30;
  }

  // Take damage. src: { type, from (Vector3), knock, fire, attacker (player or mob), looting, projectile }
  hurt(amount, src) {
    if (this.dead || amount <= 0) return false;
    if (this.invuln > 0 && !src.bypass) return false;
    if ((src.type === 'fire' || src.type === 'lava') && (this.effect('fire_resistance') || this.sp.fireproof)) return false;
    if (this.wolfArmor > 0 && ['kill', 'wither', 'magic', 'starve', 'drown', 'void'].indexOf(src.type) < 0) {
      this.wolfArmor -= Math.max(1, Math.ceil(amount));
      this.invuln = 0.5; this.flash();
      GAME.sound('hurt_mob', this.sp.key, this.pos);
      if (this.wolfArmor <= 0) { this.wolfArmor = 0; GAME.sound('item_break', null, this.pos); if (this.model) dressWolf(this.model, false); }
      if (src.attacker && src.attacker !== this) this.setFoe(src.attacker, 30);
      return true;
    }
    if (this.sp.teleports && (src.projectile || Math.random() < 0.3) && src.type !== 'kill' && src.type !== 'explosion') { if (this.teleport()) { if (src.attacker) this.setFoe(src.attacker, 30); return false; } }
    this.hp -= amount;
    this.invuln = 0.5;
    this.flash();
    GAME.sound('hurt_mob', this.sp.key, this.pos);
    if (src.fire) this.fire = Math.max(this.fire, src.fire);
    if (src.from && !this.sp.knockResist && !this.sp.boss) {
      const dx = this.pos.x - src.from.x, dz = this.pos.z - src.from.z, len = Math.hypot(dx, dz) || 1;
      const k = 5 * (src.knock || 1);
      if (this.sp.move === 'walk' || this.sp.move === 'hop') {
        this.vel.y = Math.max(this.vel.y, 5.5); this.onGround = false;
        this.kx = dx / len * k; this.kz = dz / len * k;
      } else if (this.sp.move === 'fly') { if (this.radius) this.radius = Math.min(this.radius + 4, 18); }
      else this.vel.set(dx / len * k, 1, dz / len * k);
    }
    if (src.attacker) {
      if (this.sp.hostile === 'neutral' || this.sp.hostile === 'stare' || this.sp.hostile === 'always' || this.owner !== null) {
        this.setFoe(src.attacker, 30);
        if (this.sp.group) for (const m of GAME.mobs) if (m !== this && m.sp === this.sp && m.owner === this.owner && m.pos.distanceToSquared(this.pos) < 256) m.setFoe(src.attacker, 30);
      } else if (!this.sp.hostile && src.from) this.startFlee(src.from, 4);
    }
    if (this.hp <= 0) this.die(src);
    return true;
  }

  die(src) {
    this.dead = 0.001;
    this.hp = 0;
    const byPlayer = isPlayer(src.attacker);
    if (byPlayer || src.type === 'fire' || src.type === 'explosion' || src.attacker) {
      for (const s of rollDrops(this.sp.drops, src.looting || 0, Math.random)) GAME.dropStack(s, new THREE.Vector3(this.pos.x, this.centerY, this.pos.z), null);
      if (byPlayer) GAME.addXpTo(src.attacker, this.sp.xp || 1);
    }
    if (this.sp.split) {
      const small = speciesByKey(this.sp.split), n = 2 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) spawnMob(small, this.pos.x + (Math.random() - 0.5), this.pos.y + 0.3, this.pos.z + (Math.random() - 0.5));
    }
    GAME.particles('poof', this.pos.x, this.centerY, this.pos.z, 10);
    GAME.sound('death_mob', this.sp.key, this.pos);
  }

  flash() {
    this.flashT = 0.3;
    if (!this.model) return;
    for (const m of this.model.rig.meshes) { if (!m.userData.orig) m.userData.orig = m.material; m.material = hurtMat(m.userData.orig); }
  }

// 67
  // Jump to a random safe spot nearby, like an enderman.
  teleport() {
    const w = GAME.world;
    for (let i = 0; i < 24; i++) {
      const x = Math.floor(this.pos.x + (Math.random() - 0.5) * 32), z = Math.floor(this.pos.z + (Math.random() - 0.5) * 32);
      if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) continue;
      for (let y = Math.floor(this.pos.y) + 8; y > Math.floor(this.pos.y) - 8; y--) {
        if (IS_SOLID[w.get(x, y - 1, z)] && !w.get(x, y, z) && !w.get(x, y + 1, z) && !w.get(x, y + 2, z)) {
          GAME.particles('portal', this.pos.x, this.centerY, this.pos.z, 14);
          this.pos.set(x + 0.5, y, z + 0.5); this.vel.set(0, 0, 0);
          GAME.particles('portal', this.pos.x, this.centerY, this.pos.z, 14);
          GAME.sound('vwoop', null, this.pos);
          return true;
        }
      }
    }
    return false;
  }

  update(dt, world) {
    const sp = this.sp;
    if (this.dead) {
      this.dead += dt;
      if (this.dead > 0.8) this.remove = true;
      this.place();
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.angry = Math.max(0, this.angry - dt);
    if (this.angry <= 0 && this.owner === null) this.foe = null;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0 && this.model) for (const m of this.model.rig.meshes) if (m.userData.orig) m.material = m.userData.orig;
    }
    this.tickEffects(dt);
    if (this.dead) return;
    const cy = this.centerY;
    const wet = waterAt(world, this.pos.x, cy, this.pos.z);
    if (wet) this.fire = 0;
    if (sp.teleports && (wet || (GAME.weather !== 'clear' && world.topSolid(this.pos.x, this.pos.z) < cy)) && Math.random() < dt) { this.hurt(1, { type: 'water', bypass: true }); this.teleport(); }
    if (lavaAt(world, this.pos.x, this.pos.y + 0.1, this.pos.z) && !this.effect('fire_resistance')) {
      this.fire = 8; this.lavaTick -= dt;
      if (this.lavaTick <= 0) { this.lavaTick = 0.5; this.hurt(4, { type: 'lava', bypass: true }); }
    }
    if (sp.burnsDay && !isNight() && GAME.weather === 'clear' && !wet && world.topSolid(this.pos.x, this.pos.z) < cy) this.fire = Math.max(this.fire, 2);
    if (this.fire > 0) {
      this.fire -= dt; this.fireTick -= dt;
      if (Math.random() < dt * 8) GAME.particles('flame', this.pos.x + (Math.random() - 0.5) * sp.r * 2, cy + (Math.random() - 0.3) * sp.h, this.pos.z + (Math.random() - 0.5) * sp.r * 2, 1);
      if (this.fireTick <= 0 && !this.effect('fire_resistance')) { this.fireTick = 1; this.hurt(1, { type: 'fire', bypass: true }); if (this.dead) return; }
    }
    this.voice -= dt;
    if (this.voice <= 0) { this.voice = 6 + Math.random() * 16; if (sp.sound) GAME.sound(sp.sound, null, this.pos); }
    this.think(dt, world);
    if (sp.move === 'fly') this.updateFlyer(dt, world);
    else if (sp.move === 'swim') this.updateSwimmer(dt, world);
    else this.updateWalker(dt, world);
    this.place();
  }

  place() {
    if (!this.model) return;
    const root = this.model.root;
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    root.rotation.z = this.dead ? Math.min(1, this.dead / 0.35) * Math.PI / 2 : 0;
    if (this.sp.explodes) {
      const s = (this.sp.scale || 1) * (1 + this.fuse * 0.18);
      this.model.body.scale.set(s / 16, (1 + this.fuse * 0.08) / 16, s / 16);
      if (this.fuse > 0 && Math.floor(this.fuse * 8) % 2 === 0) this.flash();
    }
  }

  tickEffects(dt) {
    for (const k in this.effects) {
      const e = this.effects[k];
      e.clock = (e.clock || 0) + dt;
      if (k === 'regeneration' && e.clock >= 2.5 / Math.pow(2, e.lvl - 1)) { e.clock = 0; this.hp = Math.min(this.maxHp, this.hp + 1); }
      if (k === 'poison' && e.clock >= 1.25 / Math.pow(2, e.lvl - 1)) { e.clock = 0; if (this.hp > 1) { this.invuln = 0; this.hurt(1, { type: 'poison', bypass: true }); } }
      if (k === 'wither' && e.clock >= 2 / Math.pow(2, e.lvl - 1)) { e.clock = 0; this.invuln = 0; this.hurt(1, { type: 'wither', bypass: true }); }
      e.t -= dt;
      if (e.t <= 0) delete this.effects[k];
    }
  }

  // Decide what to chase. Sets this.foe / this.goal / this.chasing for the movement code.
  think(dt, world) {
    const sp = this.sp;
    this.chasing = false; this.goal = null; this.standStill = false;
    const peaceful = GAME.difficulty === 'peaceful';
    const players = survivors();
    if (sp.shy && this.flee <= 0) {
      const near = nearestPlayer(this.pos, 5, GAME.players().filter(function (p) { return p.gamemode !== 'spectator' && !p.dead && !p.sneaking; }));
      if (near) this.startFlee(near.pos, 2.5);
    }
    // Forget foes that are gone.
    if (this.foe && (this.foe.dead || this.foe.remove || (isPlayer(this.foe) && (this.foe.gamemode !== 'survival' || players.indexOf(this.foe) < 0)) || this.foe.pos.distanceToSquared(this.pos) > 48 * 48)) { this.foe = null; this.angry = 0; }
    if (!this.foe && sp.guard) {
      // Iron and snow golems go after nearby monsters (but never creepers, like vanilla).
      let best = null, bd = 16 * 16;
      for (const m of GAME.mobs) {
        if (m.dead || !m.sp || !isHostileSpecies(m.sp) || m.sp.key === 'creeper' || m.sp.boss) continue;
        const d = m.pos.distanceToSquared(this.pos);
        if (d < bd) { bd = d; best = m; }
      }
      if (best) this.setFoe(best, 20);
    }
    if (sp.freezesWatched) {
      // The creaking only moves while nobody is looking at it.
      for (const p of players) {
        const cp = Math.cos(p.pitch || 0), look = new THREE.Vector3(-Math.sin(p.yaw || 0) * cp, Math.sin(p.pitch || 0), -Math.cos(p.yaw || 0) * cp);
        const to = new THREE.Vector3(this.pos.x - p.pos.x, this.centerY - p.pos.y - 1.6, this.pos.z - p.pos.z);
        if (to.length() < 48 && look.dot(to.normalize()) > 0.5) { this.standStill = true; this.chasing = false; this.goal = null; this.moving = false; return; }
      }
    }
    if (!this.foe && !peaceful) {
      if (sp.hostile === 'always') {
        const range = sp.swoops ? 64 : sp.range || 16;
        let p = nearestPlayer(this.pos, range, players);
        if (p && sp.key === 'spider' && !isNight()) p = null;
        if (p) this.foe = p;
      } else if (sp.hostile === 'stare') {
        for (const p of players) {
          const d = p.pos.distanceTo(this.pos);
          if (d > 48) continue;
          const cp = Math.cos(p.pitch || 0), look = new THREE.Vector3(-Math.sin(p.yaw || 0) * cp, Math.sin(p.pitch || 0), -Math.cos(p.yaw || 0) * cp);
          const eye = new THREE.Vector3(p.pos.x, p.pos.y + 1.62, p.pos.z), head = new THREE.Vector3(this.pos.x, this.headY, this.pos.z);
          const to = head.clone().sub(eye).normalize();
          if (look.dot(to) > 1 - 0.025 / Math.max(1, d) * 4 && lineOfSight(eye, head)) { this.setFoe(p, 30); GAME.sound('stare', null, this.pos); break; }
        }
      } else if (sp.hostile === 'touch') {
        for (const p of players) if (this.attackCd <= 0 && p.pos.distanceToSquared(new THREE.Vector3(this.pos.x, p.pos.y + 0.5, this.pos.z)) < 1.8) {
          this.attackCd = 1; GAME.hurtPlayer(p, difficultyScale(sp.attack), { type: 'mob', mob: this, from: this.pos }); GAME.applyEffectTo(p, 'poison', 1, 6);
        }
      }
    }
    // Tamed wolves follow their owner when they have nothing to fight.
    if (this.owner !== null && !this.foe) {
      const o = GAME.playerById(this.owner);
      if (o && !o.dead) {
        const d = o.pos.distanceTo(this.pos);
        if (d > 28) { this.pos.set(o.pos.x + (Math.random() - 0.5) * 3, o.pos.y + 0.5, o.pos.z + (Math.random() - 0.5) * 3); this.vel.set(0, 0, 0); }
        else if (d > 6) { this.goal = o.pos; this.chasing = true; this.stopDist = 3; }
      }
      this.fuse = 0;
      return;
    }
    if (!this.foe) { this.fuse = Math.max(0, this.fuse - dt); return; }
    const foe = this.foe, fc = centerOf(foe);
    const dx = fc.x - this.pos.x, dz = fc.z - this.pos.z, dy = (isPlayer(foe) ? foe.pos.y : foe.pos.y) - this.pos.y;
    const dist = Math.hypot(dx, dz);
    const eye = new THREE.Vector3(this.pos.x, this.headY, this.pos.z);
    this.chasing = true; this.flee = 0; this.goal = foe.pos; this.stopDist = this.sp.r + (foe.sp ? foe.sp.r : 0.3) + 0.25;
    this.targetYaw = Math.atan2(dx, dz);
    if (sp.move === 'swim') { this.target.set(fc.x, fc.y, fc.z); this.timer = 1; }
    if (sp.summons) {
      this.summonCd = (this.summonCd === undefined ? 4 : this.summonCd) - dt;
      if (this.summonCd <= 0 && dist < 16) {
        this.summonCd = 12;
        const kind = speciesByKey(sp.summons);
        let have = 0; for (const m of GAME.mobs) if (m.sp === kind && !m.dead && m.pos.distanceToSquared(this.pos) < 400) have++;
        for (let i = have; i < Math.min(have + 3, 8); i++) { const v = spawnMob(kind, this.pos.x + (Math.random() - 0.5) * 2, this.pos.y + 2, this.pos.z + (Math.random() - 0.5) * 2); v.setFoe(foe, 30); }
        GAME.particles('portal', this.pos.x, this.pos.y + 1, this.pos.z, 12);
        GAME.sound('illager', null, this.pos);
      }
    }
    if (sp.ranged) {
      const range = sp.range || 16;
      if (dist < 5 && sp.ranged !== 'sonic') { this.goal = null; this.targetYaw = Math.atan2(-dx, -dz); this.chasing = false; this.moving = true; }
      else if (dist <= range - 2 && sp.ranged !== 'sonic') this.standStill = true;
      this.shootCd -= dt;
      if (sp.ranged === 'sonic' && dist < 3) { /* close enough to punch instead */ }
      else if (this.shootCd <= 0 && dist < range && lineOfSight(eye, fc) && specialRanged(this, foe, eye, fc, dist)) return;
      else if (this.shootCd <= 0 && dist < 16 && lineOfSight(eye, fc) && (sp.ranged === 'bow' || sp.ranged === 'crossbow' || sp.ranged === 'potion')) {
        const dir = new THREE.Vector3().subVectors(fc, eye);
        if (sp.ranged === 'potion') {
          this.shootCd = 3;
          dir.y += dist * 0.5; dir.normalize();
          const fx = dist < 4 ? 'instant_damage' : ['poison', 'slowness', 'weakness'][Math.random() * 3 | 0];
          GAME.projectiles.push(new Projectile('potion', eye.clone().addScaledVector(dir, 0.6), dir.multiplyScalar(12), this, { effect: fx }));
          GAME.sound('throw', null, this.pos);
        } else {
          this.shootCd = sp.ranged === 'crossbow' ? 2.5 : 1.6 + Math.random() * 1.4;
          dir.y += dist * 0.07; dir.normalize();
          GAME.projectiles.push(new Projectile('arrow', eye.clone().addScaledVector(dir, 0.6), dir.multiplyScalar(sp.ranged === 'crossbow' ? 40 : 28), this,
            { dmg: Math.round(difficultyScale(sp.ranged === 'crossbow' ? 4 : 2 + Math.random() * 2)), effect: sp.strayArrow ? 'slowness' : sp.poisonArrow ? 'poison' : null }));
          GAME.sound(sp.ranged === 'crossbow' ? 'crossbow' : 'bow', null, this.pos);
        }
      }
      if (sp.ranged !== 'sonic') return;
    }
    if (sp.explodes) {
      if (dist < 3 && lineOfSight(eye, fc)) {
        if (this.fuse === 0) GAME.sound('hiss', null, this.pos);
        this.fuse += dt; this.standStill = true;
        if (this.fuse >= 1.5) { this.remove = true; this.dead = 1; explode(new THREE.Vector3(this.pos.x, this.pos.y + 0.8, this.pos.z), 3, this); }
      } else this.fuse = Math.max(0, this.fuse - dt * (dist > 7 ? 2 : 0.5));
      return;
    }
    if (sp.leaps && this.onGround && dist > 1.8 && dist < 4.5 && Math.random() < dt * 1.2) {
      this.vel.y = 6; this.kx = dx / dist * 6; this.kz = dz / dist * 6; this.onGround = false;
    }
    const reach = this.stopDist + 0.6;
    const close = sp.move === 'fly' || sp.move === 'swim' ? fc.distanceTo(new THREE.Vector3(this.pos.x, this.centerY, this.pos.z)) < reach + 0.3 : dist < reach && dy > -1.5 && dy < sp.h + 0.6;
    if (close && this.attackCd <= 0 && !sp.swoops) this.attack(foe);
  }

  attack(foe) {
    const sp = this.sp;
    this.attackCd = 1;
    const dmg = (sp.attack || 2) + 3 * this.effect('strength');
    if (isPlayer(foe)) {
      GAME.hurtPlayer(foe, difficultyScale(dmg), { type: 'mob', mob: this, from: this.pos });
      if (sp.poison) GAME.applyEffectTo(foe, 'poison', 1, GAME.difficulty === 'hard' ? 15 : 7);
      if (sp.hungerHit) GAME.applyEffectTo(foe, 'hunger', 1, 7);
      if (sp.witherHit) GAME.applyEffectTo(foe, 'wither', 1, 10);
      if (sp.flings || sp.key === 'iron_golem') GAME.pushPlayer(foe, new THREE.Vector3(0, 9, 0));
    } else {
      foe.hurt(dmg, { type: 'mob', from: this.pos, knock: 1, attacker: this });
      if ((sp.flings || sp.key === 'iron_golem') && foe.vel) foe.vel.y = 9;
    }
    if (this.model && this.model.rig.head) this.model.rig.head.rotation.x = 0.5;
    GAME.sound('bite', sp.key, this.pos);
  }

  turnAround() { this.targetYaw = this.yaw + Math.PI * (0.6 + Math.random() * 0.8); }

// 67
  updateWalker(dt, world) {
    const sp = this.sp, p = this.pos;
    this.timer -= dt;
    if (this.goal) {
      const gd = Math.hypot(this.goal.x - p.x, this.goal.z - p.z);
      this.moving = !this.standStill && gd > (this.stopDist || 1);
      this.targetYaw = Math.atan2(this.goal.x - p.x, this.goal.z - p.z);
    } else if (this.flee > 0) { this.flee -= dt; this.moving = true; }
    else if (!this.chasing && this.timer <= 0) {
      if (Math.random() < (sp.idle || 0.4)) { this.moving = false; this.timer = 1 + Math.random() * 3; }
      else { this.moving = true; this.targetYaw = Math.random() * TAU; this.timer = 1.5 + Math.random() * 4; }
    }
    if (this.standStill) this.moving = false;
    this.yaw += clamp(angleDiff(this.targetYaw, this.yaw), -5 * dt, 5 * dt);

    const inWater = waterAt(world, p.x, p.y + 0.3, p.z);
    const under = BLOCKS[world.get(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z))];
    const speed = sp.speed * (this.flee > 0 ? 2.2 : this.goal ? 1.3 : 1) * (inWater && !sp.sinks ? 0.6 : 1) * (under && under.slow ? 0.4 : 1) * (1 + 0.2 * this.effect('speed'));
    if (this.moving) {
      if (sp.move === 'hop' && this.onGround) { this.vel.y = sp.hostile ? 6 : 5.2; this.onGround = false; }
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const ax = p.x + fx * (sp.r + 0.15), az = p.z + fz * (sp.r + 0.15);
      const fy = Math.floor(p.y + 0.05);
      if (ax < 0.5 || az < 0.5 || ax > WX - 0.5 || az > WZ - 0.5) { if (!this.goal) this.turnAround(); }
      else if (solidAt(world, ax, fy, az)) {
        const canJump = (this.onGround || inWater) && !solidAt(world, ax, fy + 1, az) && !solidAt(world, p.x, fy + Math.ceil(sp.h) + 1, p.z);
        if (canJump) this.vel.y = inWater ? 5 : 7.2; else if (!this.goal) this.turnAround();
      } else if (!sp.amphibious && !inWater && !this.goal && (waterAt(world, ax, fy, az) || waterAt(world, ax, fy - 1, az) || lavaAt(world, ax, fy, az) || lavaAt(world, ax, fy - 1, az))) this.turnAround();
      else if (!inWater && !this.goal && !solidAt(world, ax, fy - 1, az) && !solidAt(world, ax, fy - 2, az) && !solidAt(world, ax, fy - 3, az)) this.turnAround();
      else if (BLOCKS[world.get(Math.floor(ax), fy, Math.floor(az))].hot && !this.effect('fire_resistance')) this.turnAround();
      else { p.x += fx * speed * dt; p.z += fz * speed * dt; }
    }
    if (this.kx || this.kz) {
      const nx = p.x + this.kx * dt, nz = p.z + this.kz * dt;
      if (!solidAt(world, nx, p.y + 0.1, nz) && nx > 0.3 && nz > 0.3 && nx < WX - 0.3 && nz < WZ - 0.3) { p.x = nx; p.z = nz; }
      const k = Math.exp(-5 * dt); this.kx *= k; this.kz *= k;
      if (Math.abs(this.kx) + Math.abs(this.kz) < 0.05) this.kx = this.kz = 0;
    }
    // Swim up toward a foe above you.
    if (inWater && this.goal && this.goal.y > p.y + 0.8) this.vel.y = Math.max(this.vel.y, 2.5);
    this.fall(dt, world, inWater);
    this.animate(dt, this.moving ? 1 : 0);
  }

  fall(dt, world, inWater) {
    const sp = this.sp, p = this.pos;
    const vy0 = this.vel.y;
    if (inWater && !sp.sinks) {
      const deep = waterAt(world, p.x, p.y + sp.h * 0.6, p.z);
      this.vel.y += ((deep ? 1.5 : 0) - this.vel.y) * Math.min(1, dt * 3);
    } else if (inWater) this.vel.y = Math.max(this.vel.y - 10 * dt, -2);
    else this.vel.y = Math.max(this.vel.y - 26 * dt, sp.slowFall ? -3 : -60);
    // Step in small pieces so fast falls from the sky don't pass through the ground.
    const steps = Math.max(1, Math.ceil(Math.abs(this.vel.y * dt) / 0.5));
    let landed = false;
    for (let i = 0; i < steps && !landed; i++) {
      p.y += this.vel.y * dt / steps;
      if (this.vel.y > 0 && solidAt(world, p.x, p.y + sp.h, p.z)) this.vel.y = 0;
      if (this.vel.y <= 0 && solidAt(world, p.x, p.y, p.z)) { p.y = Math.floor(p.y) + 1; landed = true; }
    }
    if (landed) {
      if (vy0 < -14 && !inWater && !this.noFall && !sp.slowFall) this.hurt(Math.floor((vy0 * vy0) / 52 - 3), { type: 'fall', bypass: true });
      this.vel.y = 0;
    }
    if (p.y < -20) this.remove = true;
    this.onGround = this.vel.y === 0 && solidAt(world, p.x, p.y - 0.05, p.z);
  }

  pickSwimTarget(world) {
    const sp = this.sp, p = this.pos;
    for (let i = 0; i < 10; i++) {
      const tx = clamp(p.x + (Math.random() * 2 - 1) * 8, 0.5, WX - 0.5);
      const tz = clamp(p.z + (Math.random() * 2 - 1) * 8, 0.5, WZ - 0.5);
      let ty = sp.surface ? SEA + 0.3 - Math.random() * 2.5 : p.y + (Math.random() * 2 - 1) * 2.5;
      ty = Math.min(ty, SEA + 0.4);
      if (waterAt(world, tx, ty, tz)) { this.target.set(tx, ty, tz); this.timer = 3 + Math.random() * 5; return; }
    }
    this.target.copy(p); this.timer = 1;
  }

  updateSwimmer(dt, world) {
    const sp = this.sp, p = this.pos, body = this.model && this.model.body;
    this.timer -= dt;
    if (this.flee > 0) this.flee -= dt;
    if (!waterAt(world, p.x, p.y, p.z)) {
      this.vel.x *= 0.9; this.vel.z *= 0.9;
      this.vel.y = Math.max(this.vel.y - 26 * dt, -30);
      p.y += this.vel.y * dt;
      if (this.vel.y <= 0 && solidAt(world, p.x, p.y - sp.h / 2, p.z)) { p.y = Math.floor(p.y - sp.h / 2) + 1 + sp.h / 2; this.vel.y = Math.random() < 0.02 ? 4 : 0; }
      p.x += this.vel.x * dt; p.z += this.vel.z * dt;
      if (body) body.rotation.z = Math.PI / 2;
      this.stranded = (this.stranded || 0) + dt;
      if (this.stranded > 20 && Math.random() < dt) this.hurt(1, { type: 'drown', bypass: true });
      this.animate(dt, 1.5);
      return;
    }
    this.stranded = 0;
    if (body) body.rotation.z = 0;
    if (!this.chasing && (this.timer <= 0 || p.distanceToSquared(this.target) < 1)) this.pickSwimTarget(world);
    const speed = sp.speed * (this.flee > 0 ? 2.5 : this.chasing ? 1.4 : 1);
    const dx = this.target.x - p.x, dy = this.target.y - p.y, dz = this.target.z - p.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const k = Math.min(1, dt * 1.5);
    this.vel.x += (dx / len * speed - this.vel.x) * k;
    this.vel.y += (dy / len * speed - this.vel.y) * k;
    this.vel.z += (dz / len * speed - this.vel.z) * k;
    const nx = p.x + this.vel.x * dt, ny = p.y + this.vel.y * dt, nz = p.z + this.vel.z * dt;
    const v = Math.hypot(this.vel.x, this.vel.y, this.vel.z) || 1;
    const lx = nx + this.vel.x / v * sp.r, ly = ny + this.vel.y / v * sp.r * 0.5, lz = nz + this.vel.z / v * sp.r;
    if (waterAt(world, nx, ny, nz) && waterAt(world, lx, ly, lz)) p.set(nx, ny, nz);
    else { this.pickSwimTarget(world); this.vel.multiplyScalar(-0.3); }
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (hv > 0.05) this.yaw = Math.atan2(this.vel.x, this.vel.z);
    if (body) body.rotation.x = -Math.atan2(this.vel.y, hv) * 0.7;
    this.animate(dt, Math.min(2, v / sp.speed));
  }

  updateFlyer(dt, world) {
    const sp = this.sp, p = this.pos;
    this.timer -= dt;
    if (this.flee > 0) this.flee -= dt;
    if (this.foe) {
      // Fly straight at the foe (bees), or circle above and swoop (phantoms).
      const fc = centerOf(this.foe);
      let tx = fc.x, ty = fc.y, tz = fc.z, speed = sp.speed * 1.3;
      if (sp.swoops) {
        this.swoopT -= dt;
        if (!this.swooping) {
          this.angle += dt * 0.6;
          tx = fc.x + Math.cos(this.angle) * 10; tz = fc.z + Math.sin(this.angle) * 10; ty = fc.y + 10;
          if (this.swoopT <= 0) { this.swooping = true; this.swoopT = 3; }
        } else {
          speed = 12;
          if (this.swoopT <= 0) { this.swooping = false; this.swoopT = 4 + Math.random() * 4; }
        }
      }
      const d = new THREE.Vector3(tx - p.x, ty - p.y, tz - p.z), len = d.length();
      if (len > 0.1) { d.divideScalar(len); p.addScaledVector(d, Math.min(len, speed * dt)); this.yaw = Math.atan2(d.x, d.z); }
      if (solidAt(world, p.x, p.y, p.z)) p.y += 4 * dt;
      if (fc.distanceTo(p) < this.sp.r + 1 && this.attackCd <= 0) { this.attack(this.foe); this.swooping = false; this.swoopT = 4 + Math.random() * 3; }
      this.cx = this.ccx = p.x; this.cz = this.ccz = p.z;
      this.animate(dt, 1.4);
      return;
    }
    if (this.timer <= 0) {
      this.timer = 6 + Math.random() * 10;
      this.radius = clamp(this.radius + (Math.random() * 2 - 1) * 3, 3, 16);
      this.cx = clamp(this.cx + (Math.random() * 2 - 1) * 10, this.radius + 1, WX - this.radius - 1);
      this.cz = clamp(this.cz + (Math.random() * 2 - 1) * 10, this.radius + 1, WZ - this.radius - 1);
    }
    this.ccx += (this.cx - this.ccx) * Math.min(1, dt * 0.2);
    this.ccz += (this.cz - this.ccz) * Math.min(1, dt * 0.2);
    this.angle += this.dir * sp.speed / this.radius * dt * (this.flee > 0 ? 1.8 : 1);
    const x = clamp(this.ccx + Math.cos(this.angle) * this.radius, 0.5, WX - 0.5);
    const z = clamp(this.ccz + Math.sin(this.angle) * this.radius, 0.5, WZ - 0.5);
    this.groundTimer -= dt;
    if (this.groundTimer <= 0) { this.ground = world.topSolid(x, z); this.groundTimer = 0.4; }
    const targetY = Math.max(this.ground, SEA) + sp.alt + Math.sin(this.t * 0.15) * 2 + (this.flee > 0 ? 6 : 0);
    p.y += (targetY - p.y) * Math.min(1, dt * 0.8);
    if (p.y < this.ground + 1.5) p.y = this.ground + 1.5;
    const dx = x - p.x, dz = z - p.z;
    if (dx || dz) this.yaw = Math.atan2(dx, dz);
    p.x = x; p.z = z;
    if (this.model) this.model.body.rotation.z = -this.dir * 0.3;
    this.animate(dt, 1);
  }

  animate(dt, speedFactor) {
    if (!this.model) return;
    animateRig(this.model, this.sp, this.t += dt * (2 + speedFactor * 8), speedFactor, this.moving, dt, this.onGround);
  }

  box(out) {
    const sp = this.sp, p = this.pos;
    const y0 = sp.move === 'walk' || sp.move === 'hop' ? p.y : p.y - sp.h / 2;
    out.min.set(p.x - sp.r, y0, p.z - sp.r);
    out.max.set(p.x + sp.r, y0 + sp.h, p.z + sp.r);
    return out;
  }

// 67
  // Compact state for the network: [id, key, x, y, z, yaw, flags, hp, fuse]
  snapshot() {
    const f = (this.moving ? 1 : 0) | (this.onGround ? 2 : 0) | (this.flashT > 0 ? 4 : 0) | (this.dead ? 8 : 0) | (this.foe ? 16 : 0) | (this.owner !== null ? 32 : 0) | (this.fire > 0 ? 64 : 0) | (this.wolfArmor > 0 ? 128 : 0);
    return [this.id, this.sp.key, +this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2), +this.yaw.toFixed(2), f, Math.ceil(this.hp), +this.fuse.toFixed(2)];
  }
}

// Shared limb animation, used by real mobs and by the copies a client draws for server mobs.
function animateRig(model, sp, t, speedFactor, moving, dt, onGround) {
  const rig = model.rig, sf = Math.min(1, speedFactor);
  for (const L of rig.legs) {
    if (L.j) { L.p.rotation.x = Math.sin(t * 0.35 + L.phase) * 0.35; L.p.rotation.z = Math.cos(t * 0.3 + L.phase) * 0.25; }
    else L.p.rotation.x = Math.sin(t + L.phase) * 0.7 * sf;
  }
  const flying = sp.move === 'fly', flapping = flying || sp.flapSwim || (sp.slowFall && !onGround);
  const glide = flying && !sp.swoops && sp.key !== 'bee' ? Math.max(0.2, Math.sin(t * 0.04)) : 1;
  for (const Wg of rig.wings) {
    if (sp.key === 'spider' || sp.key === 'cave_spider') Wg.p.rotation.z = Wg.s * (-0.35 + Math.sin(t + Wg.phase) * 0.25 * sf);
    else Wg.p.rotation.z = Wg.s * (flapping ? Math.sin(t * (sp.key === 'bee' ? 4 : flying ? 0.5 : 1.2)) * 0.6 * glide : 0);
  }
  for (const T of rig.tails) T.rotation.y = Math.sin(t * (sp.move === 'swim' ? 0.6 : 0.4)) * (sp.move === 'swim' ? 0.5 : 0.25);
  if (rig.head && sp.move !== 'swim') {
    const target = sp.grazes && !moving ? 0.55 : 0;
    rig.head.rotation.x += (target - rig.head.rotation.x) * Math.min(1, dt * 3);
  }
}

function spawnMob(sp, x, y, z, rnd) {
  const m = new Mob(sp, x, y, z, rnd || Math.random);
  if (m.model) GAME.add(m.model.root);
  GAME.mobs.push(m);
  return m;
}

// ---------- populating the world ----------
// Like Minecraft generating chunks: each 32x32 area gets its animals the first time a player comes near.
const REGION = 32;
function populateAround(pos) {
  const world = GAME.world;
  if (!world.populated) world.populated = new Set();
  const rx0 = Math.floor((pos.x - 96) / REGION), rx1 = Math.floor((pos.x + 96) / REGION);
  const rz0 = Math.floor((pos.z - 96) / REGION), rz1 = Math.floor((pos.z + 96) / REGION);
  for (let rz = rz0; rz <= rz1; rz++) for (let rx = rx0; rx <= rx1; rx++) {
    if (rx < 0 || rz < 0 || rx * REGION >= WX || rz * REGION >= WZ) continue;
    const key = rx + ',' + rz;
    if (world.populated.has(key)) continue;
    world.populated.add(key);
    populateRegion(world, rx, rz, mulberry32(world.seed ^ (rx * 73856093) ^ (rz * 19349663)));
  }
}
function populateRegion(world, rx, rz, rnd) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const x = rx * REGION + (rnd() * REGION | 0), z = rz * REGION + (rnd() * REGION | 0);
    if (x >= WX || z >= WZ) continue;
    const bio = world.biomes[x + z * WX];
    const pool = SPECIES.filter(function (s) { return s.biome === bio; });
    let total = 0;
    for (const s of pool) total += s.weight;
    let r = rnd() * total, sp = pool[0];
    for (const s of pool) { r -= s.weight; if (r <= 0) { sp = s; break; } }
    const n = sp.school ? 3 + (rnd() * 4 | 0) : sp.group ? 2 + (rnd() * 3 | 0) : sp.weight >= 6 ? 2 + (rnd() * 2 | 0) : 1;
    for (let i = 0; i < n; i++) {
      const s = spawnSpotNear(world, sp, x + (rnd() - 0.5) * 6, z + (rnd() - 0.5) * 6, rnd);
      if (s) spawnMob(sp, s[0], s[1], s[2], rnd);
    }
  }
  // Villagers, guardians, pillagers... that belong to structures in this area.
  for (const m of world.structureMobs || []) {
    if (Math.floor(m[1] / REGION) !== rx || Math.floor(m[3] / REGION) !== rz) continue;
    const sp = speciesByKey(m[0]);
    if (sp) { const e = spawnMob(sp, m[1], m[2], m[3], rnd); e.persistent = true; }
  }
}
// Monster spawners (dungeons) bring out their mob while a player is within 16 blocks, like vanilla.
let spawnerClock = 0;
function tickSpawners(dt, world) {
  spawnerClock -= dt;
  if (spawnerClock > 0 || !world.spawners || !world.spawners.size || GAME.difficulty === 'peaceful') return;
  spawnerClock = 2;
  world.spawners.forEach(function (key, idx) {
    if (world.data[idx] !== B.spawner) return;
    const x = idx % WX, y = Math.floor(idx / WXZ), z = Math.floor(idx / WX) % WZ;
    const near = GAME.players().some(function (p) { return !p.dead && p.gamemode !== 'spectator' && Math.abs(p.pos.x - x) < 16 && Math.abs(p.pos.y - y) < 16 && Math.abs(p.pos.z - z) < 16; });
    if (!near) return;
    GAME.particles('flame', x + 0.5, y + 0.5, z + 0.5, 3);
    if (Math.random() > 0.35) return;
    const sp = speciesByKey(key);
    let have = 0; for (const m of GAME.mobs) if (m.sp === sp && !m.dead && Math.abs(m.pos.x - x) < 9 && Math.abs(m.pos.z - z) < 9) have++;
    if (have >= 6) return;
    for (let i = 0; i < 2; i++) {
      const sx = x + (Math.random() * 7 | 0) - 3, sz = z + (Math.random() * 7 | 0) - 3;
      for (let sy = y - 1; sy <= y + 1; sy++) if (!world.get(sx, sy, sz) && !world.get(sx, sy + 1, sz) && IS_SOLID[world.get(sx, sy - 1, sz)]) { spawnMob(sp, sx + 0.5, sy, sz + 0.5); GAME.particles('poof', sx + 0.5, sy + 0.5, sz + 0.5, 6); break; }
    }
  });
}
// A place this species can stand (or swim, or fly) at a column, or null.
function spawnSpotNear(world, sp, fx, fz, rnd) {
  const x = Math.floor(fx), z = Math.floor(fz);
  if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) return null;
  const h = world.heights[x + z * WX];
  if (sp.move === 'swim') {
    const depth = SEA - h;
    if (depth < (sp.minDepth || 2) || (sp.maxDepth && depth > sp.maxDepth)) return null;
    const y = h + 1.5 + rnd() * (depth - 1.5);
    return waterAt(world, x + 0.5, y, z + 0.5) ? [x + 0.5, y, z + 0.5] : null;
  }
  if (sp.move === 'fly') return [x + 0.5, Math.max(h, SEA) + sp.alt, z + 0.5];
  const top = world.topSolid(x, z);
  if (top < SEA || IS_LIQUID[world.get(x, top + 1, z)] || /_leaves$/.test(BLOCKS[world.get(x, top, z)].key)) return null;
  if (IS_SOLID[world.get(x, top + 1, z)] || IS_SOLID[world.get(x, top + 2, z)]) return null;
  return [x + 0.5, top + 1, z + 0.5];
}

// Hostile mobs appear at night and underground near survival players, and despawn when far away.
let spawnClock = 0;
function updateSpawning(dt) {
  const world = GAME.world, players = GAME.players();
  for (const p of players) if (p.gamemode !== 'spectator') populateAround(p.pos);
  tickSpawners(dt, world);
  spawnClock -= dt;
  if (spawnClock > 0) return;
  spawnClock = 2;
  for (const m of GAME.mobs) {
    if (!isHostileSpecies(m.sp) || m.owner !== null || m.persistent || m.customName) continue;
    let near = false;
    for (const p of players) if (p.pos.distanceToSquared(m.pos) < 80 * 80) near = true;
    if (!near) m.remove = true;
  }
  if (GAME.difficulty === 'peaceful' || !GAME.rules.doMobSpawning) return;
  const cap = { easy: 6, normal: 10, hard: 14 }[GAME.difficulty];
  for (const p of survivors()) {
    let hostile = 0;
    for (const m of GAME.mobs) if (isHostileSpecies(m.sp) && m.pos.distanceToSquared(p.pos) < 64 * 64) hostile++;
    if (hostile >= cap) continue;
    const underground = world.topSolid(p.pos.x, p.pos.z) > p.pos.y + 4;
    if (!isNight() && !underground) continue;
    spawnHostileNear(world, p, underground);
  }
}
function pickHostile(where) {
  const pool = MOB_SPECIES.filter(function (s) {
    if (s.hidden) return false;
    if (where === 'cave') return s.where === 'land' || s.where === 'any' || s.where === 'cave';
    if (where === 'water') return s.where === 'water';
    if (where === 'desert') return s.where === 'desert' || s.where === 'any' || s.where === 'sky' || (s.where === 'land' && s.key !== 'zombie');
    return s.where === 'land' || s.where === 'any' || s.where === 'sky';
  });
  const w = function (s) { return s.weight || (where === 'cave' ? 12 : 0); };
  let total = 0;
  for (const s of pool) total += w(s);
  let r = Math.random() * total;
  for (const s of pool) { r -= w(s); if (r <= 0) return s; }
  return pool[0];
}
function spawnHostileNear(world, p, underground) {
  for (let tries = 0; tries < 30; tries++) {
    const a = Math.random() * TAU, d = underground ? 8 + Math.random() * 12 : 24 + Math.random() * 20;
    const x = Math.floor(p.pos.x + Math.cos(a) * d), z = Math.floor(p.pos.z + Math.sin(a) * d);
    if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) continue;
    const bio = world.biomes[x + z * WX];
    if (underground) {
      const y = Math.floor(p.pos.y) + (Math.random() * 9 | 0) - 4;
      if (world.get(x, y, z) || world.get(x, y + 1, z) || !IS_SOLID[world.get(x, y - 1, z)] || world.topSolid(x, z) <= y + 3) continue;
      let sp = pickHostile('cave');
      if (sp.deep && (y > 22 || Math.random() > 0.15)) sp = speciesByKey('zombie');
      if (Math.random() < 0.1) sp = speciesByKey('bat');
      if (sp.key === 'slime' && y > 40) sp = speciesByKey('zombie');
      if (sp.where === 'sky') continue;
      spawnMob(sp, x + 0.5, y, z + 0.5);
      return;
    }
    const top = world.topSolid(x, z);
    if (IS_WATER[world.get(x, top + 1, z)] && bio === OCEAN) {
      spawnMob(speciesByKey('drowned'), x + 0.5, top + 1, z + 0.5);
      return;
    }
    if (top < SEA || IS_LIQUID[world.get(x, top + 1, z)] || /_leaves$/.test(BLOCKS[world.get(x, top, z)].key)) continue;
    const sp = pickHostile(bio === DESERT ? 'desert' : 'land');
    if (sp.where === 'sky') { spawnMob(sp, x + 0.5, top + 20, z + 0.5); return; }
    if (IS_SOLID[world.get(x, top + 1, z)] || IS_SOLID[world.get(x, top + 2, z)] || (sp.h > 2 && IS_SOLID[world.get(x, top + 3, z)])) continue;
    spawnMob(sp, x + 0.5, top + 1, z + 0.5);
    return;
  }
}

// ---------- dropped items ----------
class ItemEntity {
  constructor(s, pos, vel) {
    this.id = GAME.nextId++;
    this.stack = s;
    this.pos = pos.clone();
    this.vel = vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3);
    this.age = 0; this.delay = 0.6; this.remove = false; this.spin = Math.random() * TAU;
    this.mesh = GAME.scene ? GAME.makeItemMesh(s) : null;
    GAME.add(this.mesh);
  }
  update(dt, world) {
    this.age += dt;
    if (this.age > 300) { this.remove = true; return; }
    const p = this.pos;
    const inWater = waterAt(world, p.x, p.y, p.z);
    this.vel.y = inWater ? Math.min(this.vel.y + 8 * dt, 1) : this.vel.y - 18 * dt;
    const nx = p.x + this.vel.x * dt, nz = p.z + this.vel.z * dt;
    if (!solidAt(world, nx, p.y + 0.05, p.z)) p.x = nx; else this.vel.x = 0;
    if (!solidAt(world, p.x, p.y + 0.05, nz)) p.z = nz; else this.vel.z = 0;
    const ny = p.y + this.vel.y * dt;
    if (this.vel.y < 0 && solidAt(world, p.x, ny - 0.1, p.z)) { p.y = Math.floor(ny - 0.1) + 1.1; this.vel.y = 0; this.vel.x *= 0.6; this.vel.z *= 0.6; }
    else p.y = ny;
    if (solidAt(world, p.x, p.y, p.z)) p.y += 4 * dt;
    p.x = clamp(p.x, 0.2, WX - 0.2); p.z = clamp(p.z, 0.2, WZ - 0.2);
    if (p.y < -20) this.remove = true;
    this.spin += dt * 1.6;
    if (this.mesh) { this.mesh.position.set(p.x, p.y + 0.12 + Math.sin(this.age * 2.5) * 0.05, p.z); this.mesh.rotation.y = this.spin; }
    if (this.age <= this.delay) return;
    for (const pl of GAME.players()) {
      if (pl.gamemode === 'spectator' || pl.dead) continue;
      const d2 = (pl.pos.x - p.x) ** 2 + (pl.pos.y + 0.8 - p.y) ** 2 + (pl.pos.z - p.z) ** 2;
      if (d2 < 2.4 && GAME.giveTo(pl, this.stack)) { this.remove = true; return; }
      if (d2 < 6) { p.x += (pl.pos.x - p.x) * dt * 4; p.z += (pl.pos.z - p.z) * dt * 4; }
    }
  }
  snapshot() { return [this.id, this.stack.id, this.stack.n, +this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2)]; }
}

let blastBudget = 40;

// Ranged attacks of the newer mobs. Returns true when it fired.
function specialRanged(mob, foe, eye, fc, dist) {
  const sp = mob.sp, kind = sp.ranged, dir = new THREE.Vector3().subVectors(fc, eye).normalize();
  const hit = function (dmg, src) { if (isPlayer(foe)) GAME.hurtPlayer(foe, difficultyScale(dmg), Object.assign({ type: 'mob', mob: mob, from: mob.pos }, src || {})); else foe.hurt(dmg, Object.assign({ type: 'mob', from: mob.pos, knock: 1, attacker: mob }, src || {})); };
  const shoot = function (type, speed, opts) { GAME.projectiles.push(new Projectile(type, eye.clone().addScaledVector(dir, sp.r + 0.6), dir.clone().multiplyScalar(speed), mob, opts || {})); };
  const line = function (type, n) { for (let i = 1; i <= n; i++) { const t = i / n; GAME.particles(type, eye.x + (fc.x - eye.x) * t, eye.y + (fc.y - eye.y) * t, eye.z + (fc.z - eye.z) * t, 1); } };
  switch (kind) {
    case 'snowball': mob.shootCd = 1; dir.y += dist * 0.04; dir.normalize(); shoot('snowball', 24, { knockMobs: true }); GAME.sound('throw', null, mob.pos); return true;
    case 'blaze': mob.shootCd = 3.5; for (let i = 0; i < 3; i++) setTimeout(function () { if (!mob.dead) shoot('small_fireball', 18); }, i * 300); GAME.sound('blaze', null, mob.pos); return true;
    case 'fireball': mob.shootCd = 3 + Math.random() * 2; shoot('fireball', 14); GAME.sound('ghast', null, mob.pos); return true;
    case 'wither': mob.shootCd = 1.2; shoot('skull', 16, { black: true }); GAME.sound('wither_shoot', null, mob.pos); return true;
    case 'bullet': mob.shootCd = 2 + Math.random() * 3; shoot('bullet', 6, { homing: foe }); GAME.sound('click', null, mob.pos); return true;
    case 'wind': mob.shootCd = 2.5; shoot('wind', 20); GAME.sound('throw', null, mob.pos); return true;
    case 'beam': {
      // Guardians lock on for 2 seconds, then the laser hits.
      mob.beam = (mob.beam || 0) + 0.25; mob.shootCd = 0.25; mob.standStill = true;
      line('crit', 6);
      if (mob.beam >= 2) { mob.beam = 0; mob.shootCd = 3; hit(sp.attack, { type: 'magic' }); GAME.sound('guardian', null, mob.pos); }
      return true;
    }
    case 'sonic': {
      if (dist > 15) return false;
      mob.shootCd = 5; line('sonic', 12); hit(10, { type: 'sonic', bypass: true });
      if (isPlayer(foe)) GAME.pushPlayer(foe, dir.clone().multiplyScalar(14).setY(4)); else if (foe.vel) foe.vel.addScaledVector(dir, 12);
      GAME.sound('sonic', null, mob.pos); return true;
    }
    case 'fangs': {
      mob.shootCd = 4;
      for (let i = 1; i <= 8; i++) { const t = i / 8; GAME.particles('fangs', mob.pos.x + (fc.x - mob.pos.x) * t, foe.pos.y + 0.2, mob.pos.z + (fc.z - mob.pos.z) * t, 2); }
      setTimeout(function () { if (!mob.dead && !foe.dead) hit(6, { type: 'magic' }); }, 400);
      GAME.sound('bite', null, mob.pos); return true;
    }
  }
  return false;
}

// ---------- projectiles ----------
const _ray = new THREE.Ray(), _box = new THREE.Box3(), _hit = new THREE.Vector3();
const GRAVITY = { arrow: 20, trident: 20, potion: 16, bobber: 12, pearl: 12, snowball: 12, skull: 0, fireball: 0, small_fireball: 0, wind: 0, bullet: 0, eye: 6, xp_bottle: 16 };
class Projectile {
  constructor(type, pos, vel, owner, opts) {
    this.id = GAME.nextId++;
    this.type = type; this.pos = pos.clone(); this.vel = vel.clone(); this.owner = owner; this.opts = opts || {};
    this.stuck = false; this.life = 0; this.remove = false;
    this.mesh = GAME.scene ? GAME.makeProjectileMesh(type, this.opts) : null;
    GAME.add(this.mesh);
    this.orient();
  }
  orient() {
    if (!this.mesh) return;
    if ((this.type === 'arrow' || this.type === 'trident' || this.type === 'skull') && this.vel.lengthSq() > 0.01) this.mesh.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
    this.mesh.position.copy(this.pos);
  }
  update(dt, world) {
    if (this.remove) return;
    this.life += dt;
    if (this.stuck) {
      if (this.life > 60) this.remove = true;
      if ((this.type === 'arrow' && this.opts.pickup) || this.type === 'trident') {
        const o = isPlayer(this.owner) ? this.owner : null;
        if (o && o.pos.distanceTo(this.pos) < 1.8 && GAME.giveTo(o, this.type === 'trident' ? (this.opts.stack || stack('trident', 1)) : stack('arrow', 1))) this.remove = true;
      }
      return;
    }
    if (this.life > (this.type === 'skull' ? 12 : 30)) { this.remove = true; return; }
    if (this.type === 'bobber' && waterAt(world, this.pos.x, this.pos.y - 0.05, this.pos.z)) {
      this.inWater = true;
      const surfaceTarget = Math.floor(this.pos.y) + 0.85 - (this.bite > 0 ? 0.35 : 0);
      this.vel.y += (surfaceTarget - this.pos.y) * 12 * dt - this.vel.y * 4 * dt;
      this.vel.x *= Math.exp(-3 * dt); this.vel.z *= Math.exp(-3 * dt);
      this.pos.addScaledVector(this.vel, dt);
      this.orient();
      return;
    }
    this.vel.y -= GRAVITY[this.type] * dt;
    if (GRAVITY[this.type] !== 0) this.vel.multiplyScalar(Math.exp(-0.2 * dt));
    if (this.type === 'bullet' && this.opts.homing && !this.opts.homing.dead) {
      const h = this.opts.homing, to = new THREE.Vector3(h.pos.x, (h.pos.y || 0) + 1, h.pos.z).sub(this.pos).normalize().multiplyScalar(6);
      this.vel.lerp(to, Math.min(1, dt * 2));
    }
    if ((this.type === 'fireball' || this.type === 'small_fireball') && Math.random() < 0.3) GAME.particles('flame', this.pos.x, this.pos.y, this.pos.z, 1);
    const speed = this.vel.length(), step = speed * dt;
    if (step <= 0) return;
    const dir = this.vel.clone().divideScalar(speed);
    _ray.set(this.pos, dir);
    let target = null, td = step;
    if (this.type !== 'bobber') {
      for (const m of GAME.mobs) {
        if (m === this.owner || m.dead) continue;
        if (_ray.intersectBox(m.box(_box), _hit)) { const d = _hit.distanceTo(this.pos); if (d <= td) { td = d; target = m; } }
      }
      for (const pl of GAME.players()) {
        if (pl === this.owner || pl.gamemode !== 'survival' || pl.dead) continue;
        _box.min.set(pl.pos.x - 0.3, pl.pos.y, pl.pos.z - 0.3); _box.max.set(pl.pos.x + 0.3, pl.pos.y + 1.8, pl.pos.z + 0.3);
        if (_ray.intersectBox(_box, _hit)) { const d = _hit.distanceTo(this.pos); if (d <= td) { td = d; target = pl; } }
      }
    }
    const blockHit = world.raycast(this.pos, dir, step, this.type === 'bobber' || this.type === 'potion');
    if (target && (!blockHit || blockHit.t > td)) { this.pos.addScaledVector(dir, td); this.hitEntity(target); return; }
    if (blockHit && (IS_SOLID[blockHit.id] || IS_LIQUID[blockHit.id])) {
      this.pos.addScaledVector(dir, Math.max(0, blockHit.t - 0.05));
      this.hitBlock(blockHit);
      this.orient();
      return;
    }
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < -10 || this.pos.y > WY + 60) this.remove = true;
    this.orient();
  }
  hurtTarget(target, dmg, src) {
    if (isPlayer(target)) GAME.hurtPlayer(target, dmg, src);
    else target.hurt(dmg, src);
  }
  hitEntity(target) {
    const speed = this.vel.length();
    const src = { type: 'arrow', from: this.pos.clone().sub(this.vel), knock: 0.6 + (this.opts.punch || 0), fire: this.opts.flame ? 5 : 0, attacker: this.owner, projectile: true, mob: this.owner instanceof Mob ? this.owner : null };
    if (this.type === 'arrow') {
      let dmg = this.opts.dmg !== undefined ? this.opts.dmg : Math.ceil(speed / 20 * 2 * (this.opts.dmgMul || 1));
      if (this.opts.effect && isPlayer(target)) GAME.applyEffectTo(target, this.opts.effect, 1, this.opts.effect === 'poison' ? 4 : 30);
      if (this.opts.crit) dmg += Math.floor(Math.random() * (dmg / 2 + 2));
      this.hurtTarget(target, dmg, src);
      if (this.opts.crit) GAME.particles('crit', this.pos.x, this.pos.y, this.pos.z, 6);
    } else if (this.type === 'trident') {
      this.hurtTarget(target, 8, Object.assign(src, { type: 'trident' }));
      this.vel.multiplyScalar(-0.1); this.vel.y = -2;
      return;
    } else if (this.type === 'snowball') {
      if (!isPlayer(target)) target.hurt(target.sp && target.sp.key === 'blaze' ? 3 : 0.01, { type: 'snowball', from: src.from, knock: this.opts.knockMobs ? 1 : 0.5, attacker: this.owner });
      GAME.particles('snow', this.pos.x, this.pos.y, this.pos.z, 8);
    } else if (this.type === 'pearl') { this.teleportOwner(); }
    else if (this.type === 'potion') { this.splash(); }
    else if (this.type === 'skull') { this.skullBlast(); }
    else if (this.type === 'fireball') { this.fireBlast(); }
    else if (this.type === 'small_fireball') { this.hurtTarget(target, 5, Object.assign(src, { type: 'fire', fire: 5 })); }
    else if (this.type === 'wind') { this.windBlast(); }
    else if (this.type === 'bullet') { this.hurtTarget(target, 4, src); if (isPlayer(target)) GAME.applyEffectTo(target, 'levitation', 1, 10); }
    else if (this.type === 'xp_bottle') { this.xpBurst(); }
    this.remove = true;
  }
  hitBlock(hit) {
    if (this.type === 'arrow' || this.type === 'trident') {
      if (IS_LIQUID[hit.id]) { this.vel.multiplyScalar(0.4); return; }
      this.stuck = true; this.life = 0; this.vel.set(0, 0, 0);
      GAME.sound('arrow_hit', null, this.pos);
    } else if (this.type === 'pearl') this.teleportOwner();
    else if (this.type === 'snowball') { GAME.particles('snow', this.pos.x, this.pos.y, this.pos.z, 8); this.remove = true; }
    else if (this.type === 'potion') this.splash();
    else if (this.type === 'skull') this.skullBlast();
    else if (this.type === 'fireball') this.fireBlast();
    else if (this.type === 'small_fireball') { if (!IS_LIQUID[hit.id]) { const fx = hit.x + hit.nx, fy = hit.y + hit.ny, fz = hit.z + hit.nz; if (!GAME.world.get(fx, fy, fz) && GAME.setFire) GAME.setFire(fx, fy, fz); } this.remove = true; }
    else if (this.type === 'wind') this.windBlast();
    else if (this.type === 'bullet') this.remove = true;
    else if (this.type === 'xp_bottle') this.xpBurst();
    else if (this.type === 'eye') { GAME.particles('portal', this.pos.x, this.pos.y, this.pos.z, 10); this.remove = true; }
    else if (this.type === 'bobber') { this.stuck = !IS_LIQUID[hit.id]; this.vel.set(0, 0, 0); }
  }
  splash() {
    const fx = this.opts.effect;
    GAME.particles('potion', this.pos.x, this.pos.y, this.pos.z, 24, fx);
    GAME.sound('glass', null, this.pos);
    for (const pl of GAME.players()) if (pl.gamemode === 'survival' && !pl.dead && pl.pos.distanceTo(this.pos) < 4) GAME.applyEffectTo(pl, fx, 1, fx === 'instant_damage' ? 0 : 20);
    for (const m of GAME.mobs) if (m !== this.owner && !m.dead && m.pos.distanceTo(this.pos) < 4) {
      if (fx === 'instant_damage') m.hurt(6, { type: 'magic', attacker: this.owner }); else m.addEffect(fx, 1, 20);
    }
    this.remove = true;
  }
  // A blue wither skull: a small blast that breaks anything but bedrock, plus Wither II.
  fireBlast() {
    explode(this.pos.clone(), 1, this, { quiet: false });
    GAME.particles('flame', this.pos.x, this.pos.y, this.pos.z, 12);
    this.remove = true;
  }
  windBlast() {
    GAME.particles('poof', this.pos.x, this.pos.y, this.pos.z, 10);
    for (const pl of GAME.players()) { const d = pl.pos.distanceTo(this.pos); if (d < 3 && !pl.dead && pl.gamemode !== 'spectator') GAME.pushPlayer(pl, new THREE.Vector3(pl.pos.x - this.pos.x, 2, pl.pos.z - this.pos.z).normalize().multiplyScalar(14)); }
    for (const m of GAME.mobs) if (m !== this.owner && !m.dead && m.pos.distanceTo(this.pos) < 3 && m.vel) m.vel.y = 8;
    GAME.sound('pop', null, this.pos);
    this.remove = true;
  }
  xpBurst() {
    GAME.particles('potion', this.pos.x, this.pos.y, this.pos.z, 16, 'luck');
    GAME.sound('glass', null, this.pos);
    if (isPlayer(this.owner)) GAME.addXpTo(this.owner, 3 + (Math.random() * 9 | 0));
    this.remove = true;
  }
  skullBlast() {
    if (this.opts.black) {
      // The Wither's black skulls: a normal small explosion plus Wither II.
      explode(this.pos.clone(), 1, this, { quiet: Math.random() > 0.5 });
      for (const pl of GAME.players()) if (pl.gamemode === 'survival' && !pl.dead && pl.pos.distanceTo(this.pos) < 3) GAME.applyEffectTo(pl, 'wither', 2, 10);
      this.remove = true; return;
    }
    explode(this.pos.clone(), 1, this, { breakAll: true, noDrops: true, quiet: Math.random() > 0.15 });
    GAME.particles('skull', this.pos.x, this.pos.y, this.pos.z, 3);
    for (const pl of GAME.players()) if (pl.gamemode === 'survival' && !pl.dead && pl.pos.distanceTo(this.pos) < 3) GAME.applyEffectTo(pl, 'wither', 2, 40);
    for (const m of GAME.mobs) if (!m.dead && m.pos.distanceTo(this.pos) < 3) m.addEffect('wither', 2, 40);
    this.remove = true;
  }
  teleportOwner() {
    const o = this.owner;
    if (isPlayer(o)) {
      GAME.particles('portal', o.pos.x, o.pos.y + 1, o.pos.z, 16);
      GAME.teleportPlayer(o, new THREE.Vector3(clamp(this.pos.x, 0.5, WX - 0.5), Math.max(1, this.pos.y), clamp(this.pos.z, 0.5, WZ - 0.5)));
      GAME.hurtPlayer(o, 5, { type: 'fall' });
      GAME.particles('portal', this.pos.x, this.pos.y + 1, this.pos.z, 16);
    }
    this.remove = true;
  }
  snapshot() { return [this.id, this.type, +this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2), +this.vel.x.toFixed(1), +this.vel.y.toFixed(1), +this.vel.z.toFixed(1), this.stuck ? 1 : 0]; }
}

// 67
// ---------- lit TNT ----------
// Moves like vanilla primed TNT: 20 ticks a second, gravity 0.04 blocks/tick, drag 0.98.
class PrimedTnt {
  constructor(x, y, z, fuse, opts) {
    this.id = GAME.nextId++;
    this.opts = opts || {};
    this.pos = this.opts.exact ? new THREE.Vector3(x, y, z) : new THREE.Vector3(x + 0.5, y, z + 0.5);
    this.vel = this.opts.still || this.opts.impact ? new THREE.Vector3() : new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.2, (Math.random() - 0.5) * 0.04); // blocks per tick
    this.hover = this.opts.hover || 0; // seconds it hangs in the air (no gravity), like the cannon's held payload
    this.fuse = fuse === undefined ? 4 : fuse; this.remove = false; this.acc = 0; this.onGround = false;
    this.blasts = this.opts.blasts || 1;
    this.mesh = GAME.scene ? GAME.makeBlockEntityMesh(B.tnt, this.opts) : null;
    GAME.add(this.mesh);
    if (!this.opts.quiet) GAME.sound('fuse', null, this.pos);
  }
  update(dt, world) {
    if (this.remove) return;
    this.fuse -= dt;
    if (this.hover > 0) {
      this.hover -= dt;
      if (this.hover <= 0 && this.opts.launch) this.vel.copy(this.opts.launch);
    } else if (!this.opts.still) {
      this.acc += dt;
      while (this.acc >= 0.05) {
        this.acc -= 0.05;
        this.vel.y -= 0.04;
        const p = this.pos;
        // Sub-steps so a fast fall can't skip through a thin floor.
        const n = Math.max(1, Math.ceil(Math.abs(this.vel.y) / 0.4));
        let landed = false;
        for (let i = 0; i < n && !landed; i++) {
          const ny = p.y + this.vel.y / n;
          if (this.vel.y < 0 && solidAt(world, p.x, ny, p.z)) { p.y = Math.floor(ny) + 1; landed = true; }
          else p.y = ny;
        }
        if (landed) { this.vel.y = 0; this.vel.x *= 0.7; this.vel.z *= 0.7; this.onGround = true; if (this.opts.impact) { this.fuse = 0; break; } }
        else this.onGround = false;
        if (!solidAt(world, p.x + this.vel.x, p.y + 0.1, p.z)) p.x += this.vel.x;
        if (!solidAt(world, p.x, p.y + 0.1, p.z + this.vel.z)) p.z += this.vel.z;
        this.vel.x *= 0.98; this.vel.y *= 0.98; this.vel.z *= 0.98;
        if (p.y < -20) { this.remove = true; return; }
      }
    }
    if (this.mesh) {
      this.mesh.position.set(this.pos.x, this.pos.y + 0.5, this.pos.z);
      const flash = !this.opts.impact && Math.floor(this.fuse * 5) % 2 === 0;
      this.mesh.scale.setScalar(this.fuse < 0.6 && !this.opts.impact ? 1 + (0.6 - this.fuse) * 0.4 : 1);
      if (GAME.flashMat && !this.opts.compressed) this.mesh.material = flash ? GAME.flashMat : GAME.blockEntityMat;
    }
    if (this.fuse > 0) return;
    // Big strikes detonate hundreds of TNT at once; a per-tick budget rolls them out over a few ticks instead of freezing the game.
    if (blastBudget <= 0) return;
    blastBudget--;
    const c = new THREE.Vector3(this.pos.x, this.pos.y + 0.5, this.pos.z);
    explode(c, this.opts.power || 4, this, { noDrops: this.opts.noDrops, quiet: this.opts.quiet && Math.random() > 0.25, breakAll: false });
    this.blasts--;
    if (this.blasts > 0) {
      this.fuse = this.opts.interval || 0.05;
      // The compressed block drops to the floor of the crater it just made, so the next blast keeps digging.
      if (this.opts.compressed) { let y = Math.floor(this.pos.y); while (y > 1 && !solidAt(world, this.pos.x, y - 0.5, this.pos.z)) y--; this.pos.y = y; }
      return;
    }
    this.remove = true;
  }
  snapshot() { return [this.id, +this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2), +this.fuse.toFixed(2), this.opts.compressed ? 1 : 0]; }
}

// ---------- explosions ----------
let lastBoom = 0;
function explode(center, power, source, opts) {
  opts = opts || {};
  const world = GAME.world;
  const R = power, cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
  const ir = Math.ceil(R);
  const dropChance = opts.noDrops || GAME.items.length > 300 ? 0 : 1 / power;
  let debris = 0;
  for (let dy = -ir; dy <= ir; dy++) for (let dz = -ir; dz <= ir; dz++) for (let dx = -ir; dx <= ir; dx++) {
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > R * (0.55 + Math.random() * 0.35) + (power <= 1 ? 0.6 : 0)) continue;
    const x = cx + dx, y = cy + dy, z = cz + dz;
    const id = world.get(x, y, z);
    if (!id || y <= 0) continue;
    const b = BLOCKS[id];
    if (b.unbreakable || (IS_LIQUID[id] && !opts.breakAll) || (b.blast && !opts.breakAll)) continue;
    if (id === B.tnt) { world.set(x, y, z, 0); world.setMeta(x, y, z, 0); GAME.markDirty(x, y, z); GAME.tnts.push(new PrimedTnt(x, y, z, 0.5 + Math.random())); continue; }
    if (dropChance && Math.random() < dropChance && GAME.rules.doTileDrops) for (const s of blockDrops(id, null, Math.random).items) GAME.dropStack(s, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), null);
    if (debris < 6 && Math.random() < 0.08) { debris++; GAME.particles('debris', x, y, z, 1, id); }
    GAME.removeBlockState(x, y, z, id);
    world.set(x, y, z, 0);
    world.setMeta(x, y, z, 0);
    GAME.markDirty(x, y, z);
  }
  GAME.particles('explosion', center.x, center.y, center.z, power <= 1 ? 4 : 18);
  const now = Date.now();
  if (!opts.quiet || now - lastBoom > 120) { lastBoom = now; GAME.sound(power <= 1 ? 'small_boom' : 'explode', null, center); }
  const reach = 2 * R;
  const hit = function (pos, apply) {
    const d = pos.distanceTo(center);
    if (d >= reach) return;
    const impact = 1 - d / reach;
    apply((impact * impact + impact) / 2 * 7 * reach + 1, impact, new THREE.Vector3().subVectors(pos, center).normalize());
  };
  for (const m of GAME.mobs) {
    if (m === source || m.dead) continue;
    hit(new THREE.Vector3(m.pos.x, m.centerY, m.pos.z), function (dmg, impact) {
      m.invuln = 0; m.hurt(dmg, { type: 'explosion', from: center, knock: impact * 3, bypass: true, attacker: source && source.owner && isPlayer(source.owner) ? null : null });
    });
  }
  // Explosions push other lit TNT, as in vanilla (that's how TNT cannons work). Orbital payloads keep their course.
  for (const t of GAME.tnts) {
    if (t === source || t.remove || t.opts.exact || t.opts.still) continue;
    const d = t.pos.distanceTo(center);
    if (d >= reach || d < 0.01) continue;
    const k = (1 - d / reach);
    t.vel.x += (t.pos.x - center.x) / d * k; t.vel.y += (t.pos.y + 0.5 - center.y) / d * k; t.vel.z += (t.pos.z - center.z) / d * k;
  }
  for (const p of GAME.players()) {
    if (p.gamemode === 'spectator' || p.dead) continue;
    hit(new THREE.Vector3(p.pos.x, p.pos.y + 0.9, p.pos.z), function (dmg, impact, dir) {
      if (p.gamemode === 'survival') GAME.hurtPlayer(p, difficultyScale(dmg), { type: 'explosion', from: center, mob: source instanceof Mob ? source : null });
      GAME.pushPlayer(p, dir.multiplyScalar(impact * (p.gamemode === 'survival' ? 14 : 10)));
      GAME.shake(p, impact);
    });
  }
}

// ---------- orbital strikes (Unstable SMP style cannon shots) ----------
// The shot is a fishing rod. Pulling it marks the block you look at; half a second later the payload arrives.
const CUBIC_HEIGHT = 40, CUBIC_HOLD = 0.6;
const ORBITAL_KINDS = ['nuke', 'stab', 'wither', 'wolf', 'compressed', 'cubic'];
class Strike {
  constructor(kind, target, owner) {
    this.id = GAME.nextId++;
    this.kind = kind; this.target = target; this.owner = owner; this.t = 0; this.fired = false; this.remove = false; this.skulls = 0;
  }
  update(dt, world) {
    this.t += dt;
    if (!this.fired && this.t >= 0.5) { this.fired = true; this.fire(world); }
    if (this.kind === 'wither' && this.fired && this.skulls < 750) {
      const n = Math.min(750 - this.skulls, Math.ceil(dt * 750));
      for (let i = 0; i < n; i++) this.launchSkull(world);
      this.skulls += n;
      if (this.skulls >= 750) this.remove = true;
    } else if (this.kind === 'cubic' && this.fired) {
      // The expansion charge goes off in the middle of the stack, and the "single" TNT bursts apart.
      if (!this.popped && this.t >= 0.5 + CUBIC_HOLD) {
        this.popped = true;
        const c = new THREE.Vector3(this.target.x + 0.5, this.target.y + CUBIC_HEIGHT + 0.5, this.target.z + 0.5);
        GAME.particles('explosion', c.x, c.y, c.z, 24);
        GAME.sound('explode', null, c);
        GAME.shockwave && GAME.shockwave(c.x, c.y, c.z);
      }
      if (this.popped) this.remove = true;
    } else if (this.fired && this.kind !== 'wither') this.remove = true;
  }
  fire(world) {
    const t = this.target, top = t.y + 72;
    GAME.sound('cannon', null, new THREE.Vector3(t.x, t.y, t.z));
    if (this.kind === 'nuke') {
      // As in the Unstable SMP cannon: the whole payload appears as one cluster high above the target,
      // hangs there for 1.5 s, then every TNT is pushed outward so they fan into 15 perfect circles
      // and land on rings 4 blocks apart (42 TNT on the inner ring, 2 more on each ring after it).
      const cx = t.x + 0.5, cz = t.z + 0.5, HOVER = 1.5;
      const ticks = fallTicks(top, t.y + 1);
      const reach = (1 - Math.pow(0.98, ticks)) / 0.02; // how far 1 block/tick of sideways speed carries a TNT with drag
      const opts = function (vx, vz) { return { impact: true, noDrops: true, quiet: true, exact: true, hover: HOVER, launch: new THREE.Vector3(vx, 0, vz) }; };
      GAME.tnts.push(new PrimedTnt(cx, top, cz, 60, opts(0, 0)));
      for (let ring = 1; ring <= 15; ring++) {
        const radius = ring * 4, count = 40 + ring * 2, start = ring * 10 * Math.PI / 180;
        for (let i = 0; i < count; i++) {
          const a = start + i / count * TAU, ex = cx + Math.cos(a) * radius, ez = cz + Math.sin(a) * radius;
          if (ex < 0 || ez < 0 || ex >= WX || ez >= WZ) continue;
          const v = radius / reach;
          GAME.tnts.push(new PrimedTnt(cx, top, cz, 60, opts(Math.cos(a) * v, Math.sin(a) * v)));
        }
      }
    } else if (this.kind === 'stab') {
      // No falling: the cannon fills the column you aimed at with TNT, two every 2 blocks from the
      // surface down to bedrock, all with no fuse, so it punches an instant shaft straight down.
      let y = t.y + 1;
      while (y < WY - 1 && solidAt(world, t.x + 0.5, y + 0.5, t.z + 0.5)) y++;
      for (; y >= 1; y -= 2) {
        for (const o of [0.3, -0.3]) {
          const px = t.x + 0.5 + o, pz = t.z + 0.5 + o;
          if (IS_LIQUID[world.get(Math.floor(px), y, Math.floor(pz))]) continue;
          GAME.tnts.push(new PrimedTnt(px, y, pz, 0, { still: true, exact: true, noDrops: true, quiet: true }));
        }
      }
      GAME.sound('explode', null, new THREE.Vector3(t.x, t.y, t.z));
    } else if (this.kind === 'wolf') {
      const owner = this.owner;
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * TAU, r = Math.random() * 3;
        const m = spawnMob(speciesByKey('wolf'), t.x + 0.5 + Math.cos(a) * r, top, t.z + 0.5 + Math.sin(a) * r);
        m.owner = owner ? owner.id : 0; m.noFall = true;
        // Like the plugin versions: red collar and wolf armour (absorbs damage until it breaks).
        m.wolfArmor = 64;
        if (m.model) dressWolf(m.model, true);
        m.addEffect('strength', 2, 180); m.addEffect('speed', 2, 180); m.addEffect('fire_resistance', 1, 180); m.addEffect('regeneration', 2, 180);
      }
    } else if (this.kind === 'compressed') {
      GAME.tnts.push(new PrimedTnt(t.x, t.y, t.z, 0, { still: true, compressed: true, blasts: 100, interval: 0.05, power: 4, noDrops: true, quiet: true }));
    } else if (this.kind === 'cubic') {
      // Cubicmetre's original design: the whole payload arrives stacked in ONE spot, so it looks like a
      // single TNT hanging over the target. An expansion charge in the middle blows the stack apart and the
      // TNT race outward into rings (more TNT on the bigger rings), then explode where they land.
      const cx = t.x + 0.5, cz = t.z + 0.5, y0 = t.y + CUBIC_HEIGHT;
      const reach = (1 - Math.pow(0.98, fallTicks(y0, t.y + 1, -0.05))) / 0.02;
      const opts = function (vx, vz) { return { impact: true, noDrops: true, quiet: true, exact: true, hover: CUBIC_HOLD, launch: new THREE.Vector3(vx, -0.05, vz) }; };
      GAME.tnts.push(new PrimedTnt(cx, y0, cz, 60, opts(0, 0)));
      for (let ring = 1; ring <= 12; ring++) {
        const radius = ring * 5, count = Math.round(TAU * radius / 3.5), start = Math.random() * TAU;
        for (let i = 0; i < count; i++) {
          const a = start + i / count * TAU, v = radius / reach * (0.99 + Math.random() * 0.02);
          if (cx + Math.cos(a) * radius < 0 || cz + Math.sin(a) * radius < 0 || cx + Math.cos(a) * radius >= WX || cz + Math.sin(a) * radius >= WZ) continue;
          GAME.tnts.push(new PrimedTnt(cx, y0, cz, 60, opts(Math.cos(a) * v, Math.sin(a) * v)));
        }
      }
    }
  }
  launchSkull(world) {
    const t = this.target;
    const a = Math.random() * TAU, el = (30 + Math.random() * 60) * Math.PI / 180, R = 30 + Math.random() * 10;
    const from = new THREE.Vector3(t.x + 0.5 + Math.cos(a) * Math.cos(el) * R, t.y + Math.sin(el) * R, t.z + 0.5 + Math.sin(a) * Math.cos(el) * R);
    const ra = Math.random() * TAU, rr = Math.sqrt(Math.random()) * 25;
    const gx = clamp(t.x + Math.cos(ra) * rr, 0, WX - 1), gz = clamp(t.z + Math.sin(ra) * rr, 0, WZ - 1);
    const to = new THREE.Vector3(gx, world.topSolid(gx, gz) + 0.5, gz);
    const vel = to.sub(from).normalize().multiplyScalar(28 + Math.random() * 10); // blue skulls fly fast
    GAME.projectiles.push(new Projectile('skull', from, vel, this.owner, {}));
    if (Math.random() < 0.02) GAME.sound('wither_shoot', null, from);
  }
}
// Ticks a TNT dropped from y0 takes to reach the ground at y1, using TNT's own gravity and drag.
function fallTicks(y0, y1, vy0) {
  let y = y0, vy = vy0 || 0, n = 0;
  while (y > y1 && n < 400) { vy -= 0.04; y += vy; vy *= 0.98; n++; }
  return n;
}
function startStrike(kind, target, owner) {
  // The target may come from the network: accept {x,y,z} or [x,y,z] and keep it inside the world.
  const t = Array.isArray(target) ? { x: target[0], y: target[1], z: target[2] } : (target || {});
  const x = Math.floor(+t.x), y = Math.floor(+t.y), z = Math.floor(+t.z);
  if (ORBITAL_KINDS.indexOf(kind) < 0 || !isFinite(x) || !isFinite(y) || !isFinite(z)) return;
  GAME.strikes.push(new Strike(kind, { x: clamp(x, 0, WX - 1), y: clamp(y, 1, WY - 1), z: clamp(z, 0, WZ - 1) }, owner));
}

// When a player attacks something or gets hurt, their tamed wolves join in, as in vanilla.
function ownerAttacked(p, victim) {
  if (!victim || (victim instanceof Mob && victim.owner === p.id)) return;
  for (const m of GAME.mobs) if (m.owner === p.id && !m.dead && m.pos.distanceToSquared(p.pos) < 48 * 48) m.setFoe(victim, 60);
}
function ownerHurtBy(p, attacker) {
  if (!attacker || attacker === p) return;
  for (const m of GAME.mobs) if (m.owner === p.id && !m.dead && m.pos.distanceToSquared(p.pos) < 48 * 48) m.setFoe(attacker, 60);
}

// One simulation step for everything that moves. Mobs far from every player wait, like unloaded chunks.
function updateEntities(dt, world) {
  const players = GAME.players();
  for (let i = GAME.mobs.length - 1; i >= 0; i--) {
    const m = GAME.mobs[i];
    let near = false;
    for (const p of players) if (Math.abs(p.pos.x - m.pos.x) < SIM_DIST && Math.abs(p.pos.z - m.pos.z) < SIM_DIST) { near = true; break; }
    if (near || m.owner !== null) m.update(dt, world);
    if (m.remove) { if (m.model) GAME.remove(m.model.root); GAME.mobs.splice(i, 1); }
  }
  blastBudget = 40;
  for (const list of [GAME.items, GAME.projectiles, GAME.tnts, GAME.strikes]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.update(dt, world);
      if (e.remove) { if (e.mesh) GAME.remove(e.mesh); list.splice(i, 1); }
    }
  }
}

// ---------- furnaces, saplings and fire (shared by the browser and the server) ----------
function furnaceAccepts(kind, id) {
  const r = smeltResult(id);
  if (!r) return false;
  if (kind === 'smoker') return r.kind === 'food';
  if (kind === 'blast_furnace') return r.kind === 'ore';
  return true;
}
// Runs 20 times a second for every furnace in the world, open or not.
function tickFurnaceStates(world) {
  world.furnaces.forEach(function (f, idx) {
    const id = world.data[idx];
    const kind = BLOCKS[id] && BLOCKS[id].key;
    if (!kind || BLOCKS[id].interact !== 'furnace') { world.furnaces.delete(idx); return; }
    const speed = kind === 'furnace' ? 1 : 2;
    if (f.burn > 0) f.burn--;
    const r = f.input && furnaceAccepts(kind, f.input.id) ? smeltResult(f.input.id) : null;
    const outId = r ? I[r.out] : 0;
    const fits = r && (!f.output || (f.output.id === outId && f.output.n < maxStack(outId)));
    if (fits && f.burn <= 0 && f.fuel && fuelTicks(f.fuel.id)) {
      f.burn = f.burnMax = Math.floor(fuelTicks(f.fuel.id) / speed);
      if (f.fuel.id === I.lava_bucket) f.fuel = stack('bucket', 1);
      else { f.fuel.n--; if (!f.fuel.n) f.fuel = null; }
    }
    if (fits && f.burn > 0) {
      f.cook += speed;
      if (f.cook >= 200) {
        f.cook = 0;
        if (f.output) f.output.n++; else f.output = stack(outId, 1);
        f.xp += r.xp;
        f.input.n--; if (!f.input.n) f.input = null;
        f.changed = true;
      }
    } else f.cook = Math.max(0, f.cook - 2);
  });
}

function growSapling(x, y, z) {
  const world = GAME.world, b = BLOCKS[world.get(x, y, z)];
  if (!b || !b.sapling) return false;
  world.set(x, y, z, 0);
  if (!world.growTree(b.sapling, x, y, z, Math.random, false)) { world.set(x, y, z, b.id); return false; }
  world.timers.delete(world.idx(x, y, z));
  for (let dy = 0; dy < 14; dy += 4) for (let dz = -4; dz <= 4; dz += 4) for (let dx = -4; dx <= 4; dx += 4) GAME.markDirty(x + dx, y + dy, z + dz);
  return true;
}
// Once a second: saplings grow, fire burns out.
function tickWorldTimers(world) {
  world.timers.forEach(function (t, idx) {
    t -= 1;
    if (t > 0) { world.timers.set(idx, t); return; }
    world.timers.delete(idx);
    const x = idx % WX, z = Math.floor(idx / WX) % WZ, y = Math.floor(idx / WXZ);
    const id = world.data[idx];
    if (BLOCKS[id] && BLOCKS[id].sapling) { if (!growSapling(x, y, z)) world.timers.set(idx, 30 + Math.random() * 60); }
    else if (id === B.fire) { world.set(x, y, z, 0); GAME.markDirty(x, y, z); }
  });
}

// 67