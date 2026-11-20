#!/usr/bin/env node
'use strict';
// Blockscape dedicated server. Run:  node server.js   (or double-click "Start Server.command")
// Friends on the same Wi-Fi open  http://<this computer's address>:<port>  and join.
// The server runs the world at 20 ticks a second, like a Minecraft server: mobs, items,
// explosions, furnaces and time all live here. Settings are in server.properties.

// 67
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto'), os = require('os'), vm = require('vm');
const HERE = __dirname;

// ---------- settings ----------
const PROPS_FILE = path.join(HERE, 'server.properties');
const DEFAULTS = {
  'server-port': '25565', 'level-name': 'world', 'level-seed': '', 'gamemode': 'survival', 'difficulty': 'normal',
  'max-players': '8', 'motd': 'A Blockscape server', 'pvp': 'true', 'spawn-protection': '0', 'autosave-seconds': '60'
};
function loadProps() {
  if (!fs.existsSync(PROPS_FILE)) {
    fs.writeFileSync(PROPS_FILE, '# Blockscape server settings. Restart the server after editing.\n' +
      '# level-seed: leave empty for a random 16-character seed. max-players: how many people can join.\n' +
      Object.keys(DEFAULTS).map(function (k) { return k + '=' + DEFAULTS[k]; }).join('\n') + '\n');
  }
  const props = Object.assign({}, DEFAULTS);
  for (const line of fs.readFileSync(PROPS_FILE, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([\w-]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && line.trim()[0] !== '#') props[m[1]] = m[2];
  }
  // Command line: node server.js --seed Abc123 --port 25570
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, ''), v = argv[i + 1];
    if (k === 'seed') props['level-seed'] = v; else if (k === 'port') props['server-port'] = v; else if (k === 'world') props['level-name'] = v; else if (k === 'max-players') props['max-players'] = v;
  }
  return props;
}
const PROPS = loadProps();
const PORT = parseInt(PROPS['server-port'], 10) || 25565;
const MAX_PLAYERS = Math.max(1, parseInt(PROPS['max-players'], 10) || 8);
const SAVE_DIR = path.join(HERE, 'worlds', PROPS['level-name'].replace(/[^\w-]/g, '_'));
const SAVE_FILE = path.join(SAVE_DIR, 'level.json');

// 67
// ---------- load the game code (same files the browser uses) ----------
global.window = global;
global.performance = global.performance || { now: function () { return Date.now(); } };
const SOURCES = ['vendor/three.min.js', 'js/noise.js', 'js/core.js', 'js/blocks.js', 'js/items.js', 'js/world.js', 'js/structures.js', 'js/mesher.js', 'js/mobs.js', 'js/entities.js'];
for (const f of SOURCES) vm.runInThisContext(fs.readFileSync(path.join(HERE, f), 'utf8'), { filename: f });
// commands.js needs a couple of browser helpers; the server only runs its world commands.
global.$ui = function () { return null; };
global.esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
global.player = null;
vm.runInThisContext(fs.readFileSync(path.join(HERE, 'js/commands.js'), 'utf8'), { filename: 'js/commands.js' });

const G = vm.runInThisContext('GAME');
G.server = true;
G.scene = null;

// ---------- the world ----------
function randomSeed() { const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (let i = 0; i < 16; i++) s += C[crypto.randomInt(C.length)]; return s; }
let saved = null;
if (fs.existsSync(SAVE_FILE)) { try { saved = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch (e) { console.error('Could not read the save file, starting fresh:', e.message); } }
const seed = saved ? saved.seed : (PROPS['level-seed'] || randomSeed()).replace(/[^A-Za-z0-9]/g, '').slice(0, 32) || randomSeed();
console.log('Generating world "' + PROPS['level-name'] + '" from seed ' + seed + ' ...');
const world = new World();
world.generate(seed);
world.tracking = true;
G.world = world;
G.difficulty = (saved && saved.difficulty) || PROPS.difficulty;
if (saved) {
  world.applyEdits(saved.edits || []);
  (saved.chests || []).forEach(function (c) { world.chests.set(c[0], c[1]); });
  (saved.furnaces || []).forEach(function (f) { world.furnaces.set(f[0], f[1]); });
  (saved.jukeboxes || []).forEach(function (j) { world.jukeboxes.set(j[0], j[1]); });
  (saved.timers || []).forEach(function (t) { world.timers.set(t[0], t[1]); });
  G.dayTime = saved.dayTime || 0.08; G.weather = saved.weather || 'clear';
  Object.assign(G.rules, saved.rules || {});
  console.log('Loaded ' + (saved.edits || []).length + ' changed blocks and ' + Object.keys(saved.players || {}).length + ' players.');
}
const playerSaves = (saved && saved.players) || {};
const spawnCol = findSpawnColumn(world);
const worldSpawn = [spawnCol.x + 0.5, world.topSolid(spawnCol.x, spawnCol.z) + 1, spawnCol.z + 0.5];

// 67
function save() {
  const out = {
    seed: seed, size: WX, dayTime: G.dayTime, weather: G.weather, rules: G.rules, difficulty: G.difficulty,
    edits: world.exportEdits(),
    chests: Array.from(world.chests.entries()), furnaces: Array.from(world.furnaces.entries()), jukeboxes: Array.from(world.jukeboxes.entries()), timers: Array.from(world.timers.entries()),
    players: playerSaves
  };
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  fs.writeFileSync(SAVE_FILE + '.tmp', JSON.stringify(out));
  fs.renameSync(SAVE_FILE + '.tmp', SAVE_FILE);
}

// ---------- players ----------
const clients = new Map(); // id -> client
let nextPlayerId = 1;
class Client {
  constructor(sock) {
    this.sock = sock; this.id = 0; this.name = ''; this.joined = false;
    this.pos = new THREE.Vector3(worldSpawn[0], worldSpawn[1], worldSpawn[2]);
    this.yaw = 0; this.pitch = 0; this.gamemode = PROPS.gamemode; this.dead = false; this.sneaking = false; this.state = null;
  }
  send(obj) { wsSend(this.sock, JSON.stringify(obj)); }
}
G.players = function () { const out = []; clients.forEach(function (c) { if (c.joined) out.push(c); }); return out; };
function broadcast(obj, except) { const msg = JSON.stringify(obj); clients.forEach(function (c) { if (c.joined && c !== except) wsSend(c.sock, msg); }); }
function chatAll(text, cls) { broadcast({ t: 'chat', text: text, cls: cls }); console.log('[chat] ' + text); }

// 67
// Simulation hooks: the shared code calls these; the server turns them into messages.
const fxQueue = [], sndQueue = [];
G.particles = function (type, x, y, z, n, arg) { if (fxQueue.length < 400) fxQueue.push([type, +x.toFixed(2), +y.toFixed(2), +z.toFixed(2), n, arg === undefined ? null : arg]); };
G.sound = function (name, arg, pos) { if (sndQueue.length < 60) sndQueue.push(pos ? [name, arg === undefined ? null : arg, +pos.x.toFixed(1), +pos.y.toFixed(1), +pos.z.toFixed(1)] : [name, arg === undefined ? null : arg, null, null, null]); };
G.chat = function (text, cls) { chatAll(text, cls); };
G.hurtPlayer = function (p, dmg, src) {
  if (!p || !p.send) return false;
  if (src.mob && src.mob instanceof Mob) ownerHurtBy(p, src.mob);
  p.send({ t: 'hurt', dmg: dmg, src: { type: src.type, from: src.from ? [src.from.x, src.from.y, src.from.z] : null, projectile: !!src.projectile, mobName: src.mob && src.mob.sp ? src.mob.sp.name : null } });
  return true;
};
G.applyEffectTo = function (p, k, lvl, secs) { if (p && p.send) p.send({ t: 'eff', k: k, lvl: lvl, secs: secs }); };
G.addXpTo = function (p, n) { if (p && p.send) p.send({ t: 'xp', n: n }); };
G.giveTo = function (p, s) { if (!p || !p.send) return false; p.send({ t: 'give', s: s }); return true; };
G.teleportPlayer = function (p, pos) { if (p && p.send) { p.pos.copy(pos); p.send({ t: 'tp', pos: [pos.x, pos.y, pos.z] }); } };
G.pushPlayer = function (p, v) { if (p && p.send) p.send({ t: 'push', v: [v.x, v.y, v.z] }); };
G.shake = function (p, a) { if (p && p.send) p.send({ t: 'shake', a: a }); };
G.dropStack = function (s, pos, vel, delay) { if (!s || !s.n) return; const e = new ItemEntity(Object.assign({}, s), pos, vel); if (delay) e.delay = delay; G.items.push(e); };
G.removeBlockState = function (x, y, z) {
  const idx = world.idx(x, y, z), c = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
  if (world.chests.has(idx)) { for (const s of world.chests.get(idx)) if (s) G.dropStack(s, c, null); world.chests.delete(idx); broadcast({ t: 'chest', idx: idx, slots: new Array(27).fill(null) }); }
  if (world.furnaces.has(idx)) { const f = world.furnaces.get(idx); for (const s of [f.input, f.fuel, f.output]) if (s) G.dropStack(s, c, null); world.furnaces.delete(idx); }
  if (world.jukeboxes.has(idx)) { G.dropStack(stack(world.jukeboxes.get(idx), 1), c, null); world.jukeboxes.delete(idx); broadcast({ t: 'juke', idx: idx, disc: 0 }); }
  world.timers.delete(idx);
};

// ---------- messages from players ----------
function handle(c, m) {
  if (!c.joined && m.t !== 'hello') return;
  switch (m.t) {
    case 'hello': {
      if (G.players().length >= MAX_PLAYERS) { c.send({ t: 'deny', reason: 'The server is full (' + MAX_PLAYERS + ' players).' }); c.sock.end(); return; }
      let name = String(m.name || 'Player').replace(/[^\w ]/g, '').slice(0, 16).trim() || 'Player';
      const taken = function (n) { return G.players().some(function (p) { return p.name === n; }); };
      if (taken(name)) { let i = 2; while (taken(name + i)) i++; name += i; }
      c.id = nextPlayerId++; c.name = name; c.joined = true;
      const data = playerSaves[name] || null;
      if (data && data.pos) c.pos.set(data.pos[0], data.pos[1], data.pos[2]);
      if (data && data.gamemode) c.gamemode = data.gamemode;
      c.send({
        t: 'welcome', id: c.id, name: name, seed: seed, size: WX, motd: PROPS.motd, edits: world.exportEdits(),
        chests: Array.from(world.chests.entries()), furnaces: Array.from(world.furnaces.entries()), jukeboxes: Array.from(world.jukeboxes.entries()),
        dayTime: G.dayTime, weather: G.weather, rules: G.rules, difficulty: G.difficulty, gamemode: c.gamemode, spawn: worldSpawn, data: data, pvp: PROPS.pvp !== 'false',
        players: G.players().filter(function (p) { return p !== c; }).map(function (p) { return { id: p.id, name: p.name, p: [p.pos.x, p.pos.y, p.pos.z] }; })
      });
      broadcast({ t: 'join', id: c.id, name: name, p: [c.pos.x, c.pos.y, c.pos.z] }, c);
      chatAll(name + ' joined the game', 'cmd');
      break;
    }
    case 's':
      c.pos.set(m.p[0], m.p[1], m.p[2]); c.yaw = m.yaw; c.pitch = m.pitch; c.gamemode = m.gm; c.dead = m.dead; c.sneaking = m.sn;
      c.state = { id: c.id, p: m.p, yaw: m.yaw, pitch: m.pitch, gm: m.gm, dead: m.dead, sn: m.sn, gl: m.gl, held: m.held, armor: m.armor, sw: m.sw, mv: m.mv, name: c.name };
      break;
    case 'pdata': playerSaves[c.name] = m.data; break;
    case 'e': {
      const list = [];
      for (const e of m.c) {
        const i = e[0];
        if (i < 0 || i >= world.data.length) continue;
        world.tracking = false; world.data[i] = e[1]; if (e[2]) world.meta.set(i, e[2]); else world.meta.delete(i); world.tracking = true;
        world.edits.set(i, [e[1], e[2] || 0]);
        const b = BLOCKS[e[1]];
        if (b && b.sapling) world.timers.set(i, 40 + Math.random() * 80);
        if (e[1] === B.fire) world.timers.set(i, 4 + Math.random() * 6);
        if (!e[1]) { if (world.chests.has(i) || world.furnaces.has(i) || world.jukeboxes.has(i)) G.removeBlockState(i % WX, Math.floor(i / WXZ), Math.floor(i / WX) % WZ); }
        list.push(e);
      }
      broadcast({ t: 'e', c: list }, c);
      break;
    }
    case 'chest': world.chests.set(m.idx, m.slots); broadcast({ t: 'chest', idx: m.idx, slots: m.slots }, c); break;
    case 'furn': {
      const f = world.furnaces.get(m.idx) || { burn: 0, burnMax: 0, cook: 0, xp: 0 };
      f.input = m.f.input; f.fuel = m.f.fuel; f.output = m.f.output; if (m.f.xpTaken) f.xp = 0;
      world.furnaces.set(m.idx, f);
      broadcast({ t: 'furn', l: [[m.idx, f]] }, c);
      break;
    }
    case 'juke': {
      if (m.disc) world.jukeboxes.set(m.idx, m.disc);
      else { const d = world.jukeboxes.get(m.idx); if (d) { G.dropStack(stack(d, 1), new THREE.Vector3(m.idx % WX + 0.5, Math.floor(m.idx / WXZ) + 1.2, Math.floor(m.idx / WX) % WZ + 0.5), null); world.jukeboxes.delete(m.idx); } }
      broadcast({ t: 'juke', idx: m.idx, disc: m.disc || 0 });
      break;
    }
    case 'drop': G.dropStack(m.s, new THREE.Vector3(m.pos[0], m.pos[1], m.pos[2]), m.vel ? new THREE.Vector3(m.vel[0], m.vel[1], m.vel[2]) : null, m.delay); break;
    case 'proj': G.projectiles.push(new Projectile(m.type, new THREE.Vector3(m.pos[0], m.pos[1], m.pos[2]), new THREE.Vector3(m.vel[0], m.vel[1], m.vel[2]), c, m.opts || {})); break;
    case 'tnt': G.tnts.push(new PrimedTnt(m.x, m.y, m.z, 4)); break;
    case 'strike': if (ORBITAL_KINDS.indexOf(m.kind) >= 0) { startStrike(m.kind, m.target, c); chatAll(c.name + ' fired a ' + m.kind + ' shot', 'cmd'); } break;
    case 'hit': {
      if (m.pid !== undefined) {
        const t = G.playerById(m.pid);
        if (!t || PROPS.pvp === 'false') break;
        t.send({ t: 'hurt', dmg: m.dmg, src: { type: 'mob', from: [c.pos.x, c.pos.y, c.pos.z], attackerName: c.name, fire: m.fire } });
        ownerAttacked(c, t); ownerHurtBy(t, c);
        break;
      }
      const mob = G.mobs.find(function (x) { return x.id === m.id; });
      if (mob) { mob.hurt(m.dmg, { type: 'player', from: c.pos.clone(), knock: m.knock, fire: m.fire, attacker: c, looting: m.looting }); ownerAttacked(c, mob); }
      break;
    }
    case 'name': { const mob = G.mobs.find(function (x) { return x.id === m.id; }); if (mob) mob.customName = String(m.name).slice(0, 40); break; }
    case 'chat': chatAll('<' + c.name + '> ' + String(m.text).slice(0, 256)); break;
    case 'sys': chatAll(String(m.text).replace(/^Player\b/, c.name).slice(0, 256)); break;
    case 'snd': G.sound(m.name, m.arg, m.pos ? new THREE.Vector3(m.pos[0], m.pos[1], m.pos[2]) : null); break;
    case 'cmd': {
      global.player = c;
      const before = G.chat;
      G.chat = function (text, cls) { c.send({ t: 'chat', text: text, cls: cls }); };
      global.killPlayer = function () { c.send({ t: 'kill' }); };
      try { runCommand(m.text); } finally { G.chat = before; }
      if (/^\/?(time|weather|difficulty|gamerule)/.test(m.text)) sendTime();
      break;
    }
  }
}
function leave(c) {
  if (!c.joined) return;
  c.joined = false;
  clients.delete(c.id);
  broadcast({ t: 'leave', id: c.id });
  chatAll(c.name + ' left the game', 'cmd');
}

// ---------- the game loop: 20 ticks a second ----------
let tickCount = 0, secAcc = 0;
function sendTime() { broadcast({ t: 'time', dayTime: G.dayTime, weather: G.weather, difficulty: G.difficulty, rules: G.rules }); }
function tick() {
  const dt = 0.05;
  tickCount++;
  if (G.players().length) {
    if (G.rules.doDaylightCycle) G.dayTime = (G.dayTime + dt / 1200) % 1;
    if (G.rules.doWeatherCycle) {
      G.weatherTimer -= dt;
      if (G.weatherTimer <= 0) {
        G.weather = G.weather === 'clear' ? (Math.random() < 0.15 ? 'thunder' : 'rain') : 'clear';
        G.weatherTimer = G.weather === 'clear' ? 600 + Math.random() * 900 : 180 + Math.random() * 240;
        sendTime();
      }
    }
    updateEntities(dt, world);
    updateSpawning(dt);
    tickFurnaceStates(world);
    secAcc += dt;
    if (secAcc >= 1) { secAcc -= 1; tickWorldTimers(world); }
  }
  // Blocks the server itself changed (explosions, saplings, fire).
  if (world.changes.length) {
    const c = [];
    for (const i of world.changes) { const e = world.edits.get(i); if (e) c.push([i, e[0], e[1]]); }
    world.changes.length = 0;
    if (c.length) broadcast({ t: 'e', c: c });
  }
  if (fxQueue.length) { broadcast({ t: 'fx', l: fxQueue.splice(0) }); }
  if (sndQueue.length) { broadcast({ t: 'snd', l: sndQueue.splice(0) }); }
  if (tickCount % 2 === 0) {
    const states = [];
    G.players().forEach(function (p) { if (p.state) states.push(p.state); });
    if (states.length) G.players().forEach(function (p) { p.send({ t: 'ps', l: states.filter(function (s) { return s.id !== p.id; }) }); });
    // Each player gets the entities near them.
    G.players().forEach(function (p) {
      const near = function (e) { return Math.abs(e.pos.x - p.pos.x) < 112 && Math.abs(e.pos.z - p.pos.z) < 112; };
      p.send({
        t: 'ent', mobs: G.mobs.filter(near).map(function (m) { return m.snapshot(); }), items: G.items.filter(near).map(function (e) { return e.snapshot(); }),
        projs: G.projectiles.filter(near).map(function (e) { return e.snapshot(); }), tnts: G.tnts.filter(near).map(function (e) { return e.snapshot(); })
      });
    });
  }
  if (tickCount % 10 === 0) {
    const changed = [];
    world.furnaces.forEach(function (f, idx) { if (f.burn > 0 || f.cook > 0 || f.changed) { changed.push([idx, f]); f.changed = false; } });
    if (changed.length) broadcast({ t: 'furn', l: changed });
  }
  if (tickCount % 100 === 0) sendTime();
}

// 67
// ---------- a tiny WebSocket implementation (no packages needed) ----------
function wsSend(sock, text) {
  if (sock.destroyed) return;
  const data = Buffer.from(text, 'utf8'), len = data.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = 0x81;
  sock.write(Buffer.concat([head, data]));
}
function wsAccept(req, sock) {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const c = new Client(sock);
  let buf = Buffer.alloc(0), parts = [];
  clients.set('pending' + Math.random(), c);
  const cleanup = function () { clients.forEach(function (v, k) { if (v === c) clients.delete(k); }); leave(c); };
  sock.on('data', function (chunk) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const total = off + (masked ? 4 : 0) + len;
      if (buf.length < total) return;
      let payload = buf.slice(off + (masked ? 4 : 0), total);
      if (masked) { const mask = buf.slice(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]; }
      buf = buf.slice(total);
      if (op === 8) { sock.end(); return; }
      if (op === 9) { const pong = Buffer.concat([Buffer.from([0x8a, payload.length]), payload]); sock.write(pong); continue; }
      if (op === 1 || op === 0) {
        parts.push(payload);
        if (!fin) continue;
        const text = Buffer.concat(parts).toString('utf8'); parts = [];
        let m; try { m = JSON.parse(text); } catch (e) { continue; }
        try {
          handle(c, m);
          if (m.t === 'hello' && c.joined) { clients.forEach(function (v, k) { if (v === c) clients.delete(k); }); clients.set(c.id, c); }
        } catch (e) { console.error('Error handling', m.t, e); }
      }
    }
  });
  sock.on('close', cleanup);
  sock.on('error', cleanup);
}

// ---------- the web page ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(function (req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = fs.existsSync(path.join(HERE, 'Blockscape.html')) ? '/Blockscape.html' : '/index.html';
  const file = path.normalize(path.join(HERE, p));
  if (!file.startsWith(HERE) || /server|worlds|\.properties/.test(path.relative(HERE, file)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});
server.on('upgrade', function (req, sock) {
  if (req.url.split('?')[0] !== '/ws' || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { sock.destroy(); return; }
  wsAccept(req, sock);
});
server.listen(PORT, '0.0.0.0', function () {
  const addrs = [];
  const ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(function (n) { for (const a of ifs[n]) if (a.family === 'IPv4' && !a.internal) addrs.push(a.address); });
  console.log('\nBlockscape server running. Seed: ' + seed + '  Max players: ' + MAX_PLAYERS);
  console.log('Play on this computer:   http://localhost:' + PORT);
  addrs.forEach(function (a) { console.log('Friends on your Wi-Fi:   http://' + a + ':' + PORT); });
  console.log('Stop the server with Ctrl+C (the world is saved).\n');
});
setInterval(tick, 50);
setInterval(function () { try { save(); } catch (e) { console.error('Save failed:', e.message); } }, (parseInt(PROPS['autosave-seconds'], 10) || 60) * 1000);
function shutdown() {
  console.log('\nSaving world ...');
  try { save(); console.log('Saved to ' + SAVE_FILE); } catch (e) { console.error('Save failed:', e.message); }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 67