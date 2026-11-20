'use strict';
// Sound: everything is synthesised with the Web Audio API, so there are no sound files.
// Sounds with a position get quieter with distance and pan left/right like in game.

// 67
const AUDIO = {
  ctx: null, master: null, sfx: null, music: null, amb: null, reverb: null, noiseBuf: null,
  volume: 0.7, musicVolume: 0.5, listener: { x: 0, y: 0, z: 0, yaw: 0 },
  loops: {}, nextMusic: 40, musicPlaying: false, birdT: 3, cricketT: 2, dripT: 6, caveT: 30
};

AUDIO.init = function () {
  if (AUDIO.ctx) { if (AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume(); return AUDIO.ctx; }
  try { AUDIO.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  const a = AUDIO.ctx;
  const comp = a.createDynamicsCompressor();
  comp.connect(a.destination);
  AUDIO.master = a.createGain(); AUDIO.master.connect(comp);
  AUDIO.sfx = a.createGain(); AUDIO.sfx.connect(AUDIO.master);
  AUDIO.amb = a.createGain(); AUDIO.amb.connect(AUDIO.master);
  AUDIO.music = a.createGain(); AUDIO.music.connect(AUDIO.master);
  // A soft hall reverb made from decaying noise.
  AUDIO.reverb = a.createConvolver();
  const len = a.sampleRate * 2.6, ir = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  AUDIO.reverb.buffer = ir;
  const wet = a.createGain(); wet.gain.value = 0.35;
  AUDIO.reverb.connect(wet); wet.connect(AUDIO.master);
  AUDIO.noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
  const nd = AUDIO.noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  AUDIO.setVolumes(AUDIO.volume, AUDIO.musicVolume);
  return a;
};
AUDIO.setVolumes = function (sfx, music) {
  AUDIO.volume = sfx; AUDIO.musicVolume = music;
  if (!AUDIO.ctx) return;
  AUDIO.sfx.gain.value = sfx; AUDIO.amb.gain.value = sfx * 0.8; AUDIO.music.gain.value = music * 0.6;
};

// 67
// ---------- building blocks ----------
// A voice: where it plays (pan, volume) and which bus it goes to.
function voice(bus, vol, pan, reverbAmt) {
  const a = AUDIO.ctx, g = a.createGain(), p = a.createStereoPanner ? a.createStereoPanner() : null;
  g.gain.value = vol;
  if (p) { p.pan.value = clamp(pan || 0, -1, 1); g.connect(p); p.connect(bus); } else g.connect(bus);
  if (reverbAmt) { const r = a.createGain(); r.gain.value = reverbAmt; g.connect(r); r.connect(AUDIO.reverb); }
  return g;
}
function tone(out, f, dur, type, vol, f2, delay, attack) {
  const a = AUDIO.ctx, t = a.currentTime + (delay || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.2, t + (attack || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  return o;
}
function noise(out, dur, freq, vol, delay, q, type, freq2) {
  const a = AUDIO.ctx, t = a.currentTime + (delay || 0);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = AUDIO.noiseBuf; s.loop = true;
  f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
  if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
// A vowel-like animal call: a buzzy source through two formant filters, pitch gliding.
function call(out, f0, f1, dur, formants, vol, delay, vib) {
  const a = AUDIO.ctx, t = a.currentTime + (delay || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur);
  if (vib) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = vib; lg.gain.value = f0 * 0.06; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.3));
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  for (const fm of formants) { const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fm; f.Q.value = 6; g.connect(f); f.connect(out); }
  o.start(t); o.stop(t + dur + 0.05);
}

// 67
// ---------- block materials ----------
function blockMaterial(id) {
  const b = BLOCKS[id];
  if (!b || !id) return 'stone';
  const k = b.key;
  if (/glass|ice|beacon|pane/.test(k)) return 'glass';
  if (/^wool_|^carpet_|bed$/.test(k)) return 'cloth';
  if (/sand|gravel|powder|soul/.test(k)) return k.indexOf('gravel') >= 0 ? 'gravel' : 'sand';
  if (/snow/.test(k)) return 'snow';
  if (/(iron|gold|diamond|emerald|netherite|copper)_block|anvil|lantern|bars|iron_door|iron_trapdoor/.test(k)) return 'metal';
  if (b.tool === 'axe' || /planks|log|stem|wood|bookshelf|door|fence|chest|barrel/.test(k)) return 'wood';
  if (b.cross || /leaves|grass|moss|hay|slime|honey|mushroom_block|wart|sponge|kelp/.test(k)) return 'grass';
  if (b.tool === 'shovel' || /dirt|clay|mud|podzol|mycelium|farmland/.test(k)) return 'dirt';
  return 'stone';
}
const MATERIAL_SOUND = {
  stone: [1100, 1.4, 0.32], wood: [520, 2.2, 0.36], dirt: [420, 0.9, 0.34], grass: [1800, 0.7, 0.26], sand: [2600, 0.6, 0.24],
  gravel: [900, 0.8, 0.34], cloth: [700, 0.5, 0.2], glass: [3200, 3, 0.25], metal: [1500, 6, 0.3], snow: [3000, 0.5, 0.18]
};
function materialHit(out, mat, dur, vol) {
  const m = MATERIAL_SOUND[mat] || MATERIAL_SOUND.stone;
  noise(out, dur, m[0] * (0.85 + Math.random() * 0.3), m[2] * vol, 0, m[1]);
  if (mat === 'wood') tone(out, 180 + Math.random() * 40, dur * 0.8, 'triangle', 0.12 * vol);
  if (mat === 'metal') tone(out, 900 + Math.random() * 200, dur * 1.6, 'triangle', 0.06 * vol);
  if (mat === 'glass') tone(out, 2400 + Math.random() * 600, dur, 'sine', 0.05 * vol);
}

// ---------- the sound list ----------
const SFX = {
  step: function (o, id) { materialHit(o, blockMaterial(id), 0.07, 0.55); },
  dig: function (o, id) { materialHit(o, blockMaterial(id), 0.09, 0.7); },
  break: function (o, id) { materialHit(o, blockMaterial(id), 0.22, 1); materialHit(o, blockMaterial(id), 0.12, 0.6); },
  place: function (o, id) { materialHit(o, blockMaterial(id), 0.12, 0.9); },
  land: function (o, id) { materialHit(o, blockMaterial(id), 0.14, 1.1); },
  hit: function (o) { noise(o, 0.1, 380, 0.4); tone(o, 150, 0.08, 'square', 0.08); },
  crit: function (o) { noise(o, 0.14, 1800, 0.3); tone(o, 520, 0.1, 'triangle', 0.12); tone(o, 780, 0.1, 'triangle', 0.08, 0, 0.04); },
  smash: function (o) { tone(o, 70, 0.6, 'sine', 0.6, 28); noise(o, 0.6, 200, 0.6, 0, 0.7); noise(o, 0.3, 1400, 0.25, 0.05); },
  hurt: function (o) { tone(o, 230, 0.2, 'square', 0.16, 120); noise(o, 0.12, 600, 0.15); },
  hurt_mob: function (o, key) { const sp = speciesByKey(key), f = sp && sp.h < 1 ? 520 : sp && sp.h > 2 ? 160 : 300; call(o, f, f * 0.6, 0.18, [f * 2.2, f * 4], 0.18); },
  death_mob: function (o, key) { const sp = speciesByKey(key), f = sp && sp.h < 1 ? 440 : 220; call(o, f, f * 0.4, 0.45, [f * 2, f * 3.5], 0.18); noise(o, 0.3, 700, 0.12, 0.2); },
  bite: function (o) { noise(o, 0.08, 900, 0.35); tone(o, 120, 0.1, 'sawtooth', 0.1); },
  explode: function (o) { noise(o, 1.4, 140, 0.9, 0, 0.6, 'lowpass', 60); tone(o, 55, 1.0, 'sine', 0.6, 25); noise(o, 0.25, 2200, 0.35); },
  small_boom: function (o) { noise(o, 0.45, 300, 0.5, 0, 0.7, 'lowpass', 90); },
  cannon: function (o) { tone(o, 48, 1.2, 'sine', 0.7, 30); noise(o, 1.2, 400, 0.5, 0, 0.5, 'lowpass', 80); noise(o, 0.8, 3000, 0.25, 0.1, 0.5, 'bandpass', 300); },
  bell: function (o) { [880, 1318, 2217].forEach(function (f, i) { tone(o, f, 2.4 - i * 0.5, 'sine', 0.22 / (i + 1)); }); },
  villager: function (o) { call(o, 220, 180, 0.35, [600, 1100], 0.2, 0, 7); },
  golem: function (o) { noise(o, 0.3, 200, 0.4, 0, 0.8, 'lowpass', 120); tone(o, 70, 0.3, 'square', 0.12); },
  blaze: function (o) { noise(o, 0.6, 900, 0.25, 0, 0.8, 'bandpass', 400); tone(o, 120, 0.5, 'sawtooth', 0.08, 90); },
  ghast: function (o) { call(o, 700, 900, 0.8, [1400, 2600], 0.2, 0, 4); },
  guardian: function (o) { tone(o, 300, 0.6, 'sine', 0.14, 600); },
  warden: function (o) { tone(o, 50, 1.2, 'sawtooth', 0.3, 38); noise(o, 1.0, 120, 0.4, 0, 0.6, 'lowpass', 60); },
  sonic: function (o) { tone(o, 160, 0.9, 'sawtooth', 0.35, 40); noise(o, 0.9, 2400, 0.3, 0, 0.6, 'bandpass', 600); },
  illager: function (o) { call(o, 180, 140, 0.3, [500, 900], 0.18, 0, 6); },
  roar: function (o) { tone(o, 80, 0.9, 'sawtooth', 0.3, 50); noise(o, 0.9, 400, 0.35, 0, 0.7, 'lowpass', 150); },
  dragon: function (o) { tone(o, 60, 2, 'sawtooth', 0.3, 40); noise(o, 2, 300, 0.4, 0, 0.5, 'lowpass', 90); },
  hiss_small: function (o) { noise(o, 0.3, 5000, 0.12, 0, 1, 'highpass'); },
  wither_shoot: function (o) { noise(o, 0.5, 600, 0.35, 0, 0.8, 'bandpass', 250); tone(o, 90, 0.5, 'sawtooth', 0.18, 60); },
  fuse: function (o) { noise(o, 1.2, 4500, 0.16, 0, 0.7, 'highpass'); },
  hiss: function (o) { noise(o, 1.4, 4200, 0.25, 0, 0.6, 'highpass'); },
  bow: function (o) { tone(o, 380, 0.14, 'triangle', 0.24, 160); noise(o, 0.12, 2400, 0.12); },
  crossbow: function (o) { tone(o, 300, 0.12, 'square', 0.18, 120); noise(o, 0.1, 3000, 0.2); },
  crossbow_load: function (o) { noise(o, 0.3, 1800, 0.12, 0, 2); },
  crossbow_loaded: function (o) { tone(o, 700, 0.06, 'square', 0.1); tone(o, 900, 0.06, 'square', 0.1, 0, 0.06); },
  trident: function (o) { noise(o, 0.5, 900, 0.3, 0, 1, 'bandpass', 2600); },
  throw: function (o) { noise(o, 0.2, 1200, 0.2, 0, 1, 'bandpass', 400); },
  arrow_hit: function (o) { noise(o, 0.06, 1400, 0.25); tone(o, 200, 0.05, 'square', 0.06); },
  glass: function (o) { noise(o, 0.3, 4000, 0.3, 0, 3); for (let i = 0; i < 4; i++) tone(o, 2500 + Math.random() * 2500, 0.15, 'sine', 0.05, 0, i * 0.03); },
  shield: function (o) { noise(o, 0.12, 520, 0.4); tone(o, 240, 0.12, 'square', 0.1); },
  eat: function (o) { noise(o, 0.08, 1500 + Math.random() * 800, 0.25); },
  drink: function (o) { tone(o, 500, 0.1, 'sine', 0.12, 280); },
  burp: function (o) { call(o, 130, 90, 0.25, [400, 900], 0.15); },
  pop: function (o) { tone(o, 900 + Math.random() * 300, 0.07, 'sine', 0.18, 1600); },
  xp: function (o) { tone(o, 1300 + Math.random() * 700, 0.1, 'sine', 0.08); },
  levelup: function (o) { [523, 659, 784, 1046].forEach(function (f, i) { tone(o, f, 0.35, 'triangle', 0.12, 0, i * 0.09); }); },
  equip: function (o) { noise(o, 0.12, 1000, 0.2); tone(o, 320, 0.08, 'square', 0.05); },
  door_open: function (o) { noise(o, 0.16, 320, 0.4, 0, 1.5); tone(o, 140, 0.14, 'triangle', 0.1); },
  door_close: function (o) { noise(o, 0.12, 260, 0.45, 0, 1.5); tone(o, 110, 0.1, 'triangle', 0.12); },
  chest_open: function (o) { noise(o, 0.35, 300, 0.3, 0, 1, 'bandpass', 600); },
  anvil: function (o) { tone(o, 1200, 0.5, 'triangle', 0.25, 1180); tone(o, 1810, 0.35, 'sine', 0.12); },
  enchant: function (o) { [1200, 1500, 1800, 2400, 2000].forEach(function (f, i) { tone(o, f, 0.25, 'sine', 0.06, 0, i * 0.05); }); },
  item_break: function (o) { noise(o, 0.16, 2200, 0.3); tone(o, 620, 0.12, 'square', 0.1, 200); },
  totem: function (o) { [392, 494, 587, 784, 988].forEach(function (f, i) { tone(o, f, 0.8, 'triangle', 0.12, 0, i * 0.06); }); },
  splash: function (o) { noise(o, 0.45, 900, 0.4, 0, 0.6, 'lowpass', 300); noise(o, 0.2, 3000, 0.15); },
  swim: function (o) { noise(o, 0.25, 700, 0.15, 0, 0.8, 'lowpass', 300); },
  cast: function (o) { noise(o, 0.25, 2600, 0.18, 0, 1, 'bandpass', 900); },
  reel: function (o) { for (let i = 0; i < 5; i++) noise(o, 0.04, 2000, 0.15, i * 0.04, 4); },
  bucket_fill: function (o) { noise(o, 0.3, 700, 0.3, 0, 1, 'bandpass', 1400); },
  bucket_empty: function (o) { noise(o, 0.35, 900, 0.3, 0, 1, 'bandpass', 400); },
  flint: function (o) { noise(o, 0.12, 4500, 0.3, 0, 2); },
  rocket: function (o) { noise(o, 0.8, 1200, 0.3, 0, 0.8, 'bandpass', 3000); },
  elytra: function (o) { noise(o, 1.4, 500, 0.15, 0, 0.5); },
  fall: function (o) { noise(o, 0.16, 250, 0.45); },
  milk: function (o) { noise(o, 0.25, 900, 0.2); },
  thunder: function (o) { noise(o, 3.2, 90, 0.8, 0, 0.5, 'lowpass', 40); tone(o, 40, 2.4, 'sine', 0.4, 22); },
  horn: function (o) { call(o, 220, 210, 2.2, [700, 1400], 0.3, 0, 5); call(o, 330, 300, 1.8, [900], 0.12, 0.2, 4); },
  spyglass: function (o) { tone(o, 1200, 0.1, 'sine', 0.06, 1800); },
  ui_click: function (o) { tone(o, 1600, 0.03, 'square', 0.06); },
  note: function (o, p) { const f = 185 * Math.pow(2, (p || 0) / 12); tone(o, f, 0.7, 'triangle', 0.25); tone(o, f * 2, 0.4, 'sine', 0.06); },
  // mobs
  moo: function (o) { call(o, 120, 95, 1.1, [380, 800], 0.22, 0, 3); },
  oink: function (o) { call(o, 260, 200, 0.18, [700, 1300], 0.2); call(o, 240, 190, 0.16, [700, 1300], 0.18, 0.22); },
  baa: function (o) { call(o, 330, 300, 0.7, [800, 1600], 0.18, 0, 11); },
  cluck: function (o) { for (let i = 0; i < 3; i++) call(o, 700, 600, 0.06, [1500, 2600], 0.12, i * 0.12); },
  neigh: function (o) { call(o, 600, 300, 0.9, [1100, 2000], 0.16, 0, 14); },
  hee: function (o) { call(o, 500, 700, 0.35, [1200], 0.16); call(o, 300, 200, 0.5, [600], 0.16, 0.35); },
  llama: function (o) { call(o, 300, 260, 0.4, [700, 1500], 0.14, 0, 6); },
  sniff: function (o) { for (let i = 0; i < 3; i++) noise(o, 0.12, 1200, 0.15, i * 0.18, 2); },
  croak: function (o) { for (let i = 0; i < 2; i++) call(o, 90, 80, 0.15, [300, 600], 0.2, i * 0.2, 30); },
  buzz: function (o) { call(o, 210, 215, 1.2, [600, 1200], 0.06, 0, 25); },
  bark: function (o) { call(o, 400, 250, 0.12, [900, 1800], 0.2); call(o, 380, 240, 0.12, [900, 1800], 0.2, 0.2); },
  yip: function (o) { call(o, 900, 600, 0.12, [1800, 3000], 0.12); },
  bleat: function (o) { call(o, 400, 380, 0.6, [900, 1700], 0.16, 0, 12); },
  panda: function (o) { call(o, 160, 140, 0.4, [500, 900], 0.14); },
  chirp: function (o) { for (let i = 0; i < 4; i++) tone(o, 2400 + Math.random() * 1200, 0.07, 'sine', 0.08, 3600, i * 0.09); },
  meow: function (o) { call(o, 500, 700, 0.18, [1200, 2200], 0.14); call(o, 700, 420, 0.3, [1200, 2200], 0.14, 0.18); },
  camel: function (o) { call(o, 110, 90, 0.8, [300, 700], 0.18, 0, 4); },
  scuttle: function (o) { for (let i = 0; i < 6; i++) noise(o, 0.02, 3000, 0.1, i * 0.05, 4); },
  click_dolphin: function (o) { for (let i = 0; i < 8; i++) tone(o, 3200, 0.02, 'square', 0.05, 0, i * 0.04); },
  click: function (o) { for (let i = 0; i < 6; i++) tone(o, 3000, 0.02, 'square', 0.04, 0, i * 0.05); },
  groan: function (o) { call(o, 110, 80, 1.1, [400, 700], 0.22, 0, 4); },
  gurgle: function (o) { call(o, 120, 90, 0.9, [300, 600], 0.18, 0, 18); noise(o, 0.6, 500, 0.1, 0.1, 2); },
  rattle: function (o) { for (let i = 0; i < 7; i++) noise(o, 0.025, 2600, 0.18, i * 0.05, 3); },
  hiss_spider: function (o) { noise(o, 0.5, 3500, 0.15, 0, 1.5); call(o, 300, 250, 0.3, [900], 0.08); },
  vwoop: function (o) { tone(o, 300, 0.5, 'sawtooth', 0.12, 80); tone(o, 600, 0.5, 'sine', 0.08, 2400); },
  stare: function (o) { call(o, 600, 900, 1.2, [1500, 2600], 0.14, 0, 20); },
  witch: function (o) { for (let i = 0; i < 4; i++) call(o, 700 - i * 40, 600 - i * 40, 0.09, [1500, 2500], 0.12, i * 0.11); },
  squish: function (o) { noise(o, 0.2, 400, 0.3, 0, 1, 'lowpass', 150); tone(o, 120, 0.15, 'sine', 0.15, 60); },
  screech: function (o) { call(o, 1300, 900, 0.8, [2500, 3800], 0.12, 0, 9); },
  hmm: function (o) { call(o, 140, 130, 0.5, [500, 1000], 0.14); }
};

// 67
// Play a sound. pos (optional) makes it quieter with distance and pans it.
AUDIO.play = function (name, arg, pos) {
  const fn = SFX[name];
  if (!fn || !AUDIO.ctx || AUDIO.volume <= 0) return;
  let vol = 1, pan = 0;
  if (pos) {
    const L = AUDIO.listener, dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz), range = name === 'explode' || name === 'cannon' || name === 'thunder' ? 160 : name === 'horn' ? 200 : 32;
    if (d > range) return;
    vol = Math.pow(1 - d / range, 1.6);
    // right vector of the camera is (cos yaw, -sin yaw) in x/z
    pan = d > 0.5 ? (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / d * 0.85 : 0;
  }
  if (vol < 0.01) return;
  try { fn(voice(AUDIO.sfx, vol, pan, pos && name !== 'step' ? 0.15 : 0), arg); } catch (e) { /* audio busy */ }
};

// 67
// ---------- ambience ----------
function loopNoise(name, freq, q, type) {
  if (AUDIO.loops[name]) return AUDIO.loops[name];
  const a = AUDIO.ctx, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = AUDIO.noiseBuf; s.loop = true; f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q || 0.7;
  g.gain.value = 0; s.connect(f); f.connect(g); g.connect(AUDIO.amb); s.start();
  return (AUDIO.loops[name] = { gain: g, filter: f });
}
function fadeLoop(name, target, freq, q, type) {
  const L = loopNoise(name, freq, q, type);
  const now = AUDIO.ctx.currentTime;
  L.gain.gain.setTargetAtTime(target, now, 0.8);
}
// ctx: { biome, day (0..1), underground, nearWater, underwater, rain, altitude, inGame }
AUDIO.update = function (dt, ctx) {
  if (!AUDIO.ctx || AUDIO.ctx.state !== 'running') return;
  const out = function (v, pan) { return voice(AUDIO.amb, v, pan || (Math.random() - 0.5) * 1.6, 0.4); };
  if (!ctx.inGame) { for (const k in AUDIO.loops) fadeLoop(k, 0); return; }
  const t = AUDIO.ctx.currentTime;
  fadeLoop('rain', ctx.rain && !ctx.underground ? 0.22 : 0, 2600, 0.4, 'highpass');
  fadeLoop('wind', !ctx.underwater && (ctx.altitude > 100 || ctx.biome === DESERT) ? 0.12 + 0.05 * Math.sin(t * 0.3) : 0, 400, 0.4);
  fadeLoop('waves', ctx.nearWater && !ctx.underwater && !ctx.underground ? 0.1 + 0.08 * Math.sin(t * 0.45) : 0, 600, 0.5);
  fadeLoop('underwater', ctx.underwater ? 0.35 : 0, 180, 1);
  if (ctx.underwater || ctx.rain) return;
  if (!ctx.underground && ctx.day > 0.5 && ctx.biome !== OCEAN && ctx.biome !== DESERT) {
    AUDIO.birdT -= dt;
    if (AUDIO.birdT <= 0) { AUDIO.birdT = 2 + Math.random() * 7; const f = 2200 + Math.random() * 1800, n = 2 + (Math.random() * 4 | 0), o = out(0.35); for (let i = 0; i < n; i++) tone(o, f * (1 + (Math.random() - 0.5) * 0.3), 0.08, 'sine', 0.06, f * 1.4, i * 0.1); }
  }
  if (!ctx.underground && ctx.day < 0.3) {
    AUDIO.cricketT -= dt;
    if (AUDIO.cricketT <= 0) { AUDIO.cricketT = 0.6 + Math.random() * 1.6; const o = out(0.18), f = 4200 + Math.random() * 600; for (let i = 0; i < 3; i++) tone(o, f, 0.04, 'sine', 0.05, 0, i * 0.06); }
  }
  if (ctx.underground) {
    AUDIO.dripT -= dt;
    if (AUDIO.dripT <= 0) { AUDIO.dripT = 3 + Math.random() * 8; const o = out(0.4); tone(o, 1400 + Math.random() * 900, 0.12, 'sine', 0.08, 700); }
    AUDIO.caveT -= dt;
    if (AUDIO.caveT <= 0) { AUDIO.caveT = 60 + Math.random() * 120; const o = out(0.5); call(o, 70, 50, 3, [200, 400], 0.12, 0, 2); noise(o, 3, 300, 0.08, 0.5, 2, 'bandpass', 120); }
  }
};

// ---------- music ----------
// Calm generated piano pieces in a pentatonic scale, every few minutes, like the vanilla soundtrack.
const SCALES = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 5, 7, 9]];
function pianoNote(f, t, vol, len) {
  const a = AUDIO.ctx;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  g.connect(AUDIO.music);
  const r = a.createGain(); r.gain.value = 0.9; g.connect(r); r.connect(AUDIO.reverb);
  [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]].forEach(function (h) {
    const o = a.createOscillator(), og = a.createGain();
    o.type = h[1]; o.frequency.value = f * h[0]; og.gain.value = h[2];
    o.connect(og); og.connect(g); o.start(t); o.stop(t + len + 0.1);
  });
}
AUDIO.playPiece = function () {
  if (!AUDIO.ctx || AUDIO.musicVolume <= 0) return;
  const a = AUDIO.ctx, start = a.currentTime + 0.2;
  const scale = SCALES[Math.random() * SCALES.length | 0], root = 196 * Math.pow(2, (Math.random() * 7 | 0) / 12);
  const beat = 0.55 + Math.random() * 0.25, bars = 16 + (Math.random() * 8 | 0);
  const deg = function (d) { const o = Math.floor(d / 5); return root * Math.pow(2, o + scale[((d % 5) + 5) % 5] / 12); };
  let melody = 5 + (Math.random() * 3 | 0);
  for (let bar = 0; bar < bars; bar++) {
    const t0 = start + bar * beat * 4;
    const chord = [0, 3, 2, 4][bar % 4];
    pianoNote(deg(chord - 5), t0, 0.09, beat * 4.5);
    pianoNote(deg(chord - 3), t0 + beat * 0.5, 0.05, beat * 3.5);
    for (let s = 0; s < 4; s++) {
      if (Math.random() < 0.35) continue;
      melody = clamp(melody + (Math.random() * 5 | 0) - 2, 3, 11);
      pianoNote(deg(melody), t0 + s * beat + (Math.random() < 0.2 ? beat / 2 : 0), 0.06 + Math.random() * 0.03, beat * 2.5);
    }
  }
  AUDIO.musicPlaying = true;
  setTimeout(function () { AUDIO.musicPlaying = false; }, (bars * beat * 4 + 3) * 1000);
};
AUDIO.musicTick = function (dt, inGame) {
  if (!AUDIO.ctx || AUDIO.musicPlaying) return;
  AUDIO.nextMusic -= dt;
  if (AUDIO.nextMusic <= 0) { AUDIO.nextMusic = (inGame ? 240 : 90) + Math.random() * 240; AUDIO.playPiece(); }
};

// 67