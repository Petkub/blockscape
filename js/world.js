'use strict';
// The world: a 100 x 100 x 200 grid of block IDs, plus the generator that fills it from a seed.

// 67
let WX = 512, WZ = 512;               // width (x) and depth (z)
const WY = 200;                        // height (y)
let WXZ = WX * WZ;
// Every module reads WX/WZ live, so resizing is just updating these before generating.
function setWorldSize(n) {
  WX = WZ = n; WXZ = n * n;
  CX = Math.ceil(WX / CS); CZ = Math.ceil(WZ / CS);
}
function areaScale() { return WXZ / 10000; }
const SEA = 56;                        // water fills every empty cell up to this height

const OCEAN = 0, PLAINS = 1, FOREST = 2, DESERT = 3;
const BIOME_INFO = [
  { key: 'ocean', name: 'Ocean', color: '#2f6fd0' },
  { key: 'plains', name: 'Plains', color: '#93c95e' },
  { key: 'forest', name: 'Forest', color: '#2f7a3c' },
  { key: 'desert', name: 'Desert', color: '#e3cf8d' }
];

function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// Step 1 + 2 of generation: decide each column's biome and surface height.
// Cheap enough to run on every keystroke for the title-screen map preview.
function computeColumns(seedText) {
  const seed = hashString(seedText);
  const rnd = mulberry32(seed);
  const nH = new Perlin(mulberry32(seed ^ 0x51ed27));
  const nW = new Perlin(mulberry32(seed ^ 0x2c1b3c6d));
  const nD = new Perlin(mulberry32(seed ^ 0x6a09e667));

// 67
  // Biome centres on a jittered grid (3x3 for small worlds, 6x6 for large). Every biome gets at least two.
  const N = Math.max(3, Math.round(WX / 42));
  const kinds = [];
  for (let i = 0; i < N * N; i++) kinds.push(i < 8 ? [OCEAN, PLAINS, FOREST, DESERT][i % 4] : rnd() * 4 | 0);
  shuffle(kinds, rnd);
  const sites = [];
  for (let gz = 0; gz < N; gz++) for (let gx = 0; gx < N; gx++)
    sites.push({ x: (gx + 0.2 + rnd() * 0.6) * WX / N, z: (gz + 0.2 + rnd() * 0.6) * WZ / N, b: kinds[gz * N + gx] });

  function biomeHeight(b, x, z) {
    switch (b) {
      case OCEAN: return SEA - 10 + nH.fbm(x * 0.05, z * 0.05, 3) * 6;
      case PLAINS: return SEA + 3 + nH.fbm(x * 0.02, z * 0.02, 3) * 5;
      case FOREST: return SEA + 6 + nH.fbm(x * 0.03 + 100, z * 0.03 + 100, 4) * 13;
      default: return SEA + 4 + nD.fbm(x * 0.04, z * 0.04, 3) * 6 + Math.abs(nD.noise2(x * 0.09, z * 0.05)) * 4;
    }
  }

  const heights = new Int16Array(WXZ), biomes = new Uint8Array(WXZ);
  const d2 = new Float64Array(25), near = new Int32Array(25), wb = new Float64Array(4);
  for (let z = 0; z < WZ; z++) for (let x = 0; x < WX; x++) {
    // Warp the lookup point so borders wiggle instead of being straight lines.
    const wx = x + nW.fbm(x * 0.035, z * 0.035, 3) * 14;
    const wz = z + nW.fbm(x * 0.035 + 40, z * 0.035 + 40, 3) * 14;
    // Only the sites in nearby grid cells can matter, which keeps big worlds fast.
    const cgx = Math.floor(wx / WX * N), cgz = Math.floor(wz / WZ * N);
    let dmin = 1e9, best = 0, cnt = 0;
    for (let gz = cgz - 2; gz <= cgz + 2; gz++) for (let gx = cgx - 2; gx <= cgx + 2; gx++) {
      if (gx < 0 || gz < 0 || gx >= N || gz >= N) continue;
      const i = gz * N + gx, dx = wx - sites[i].x, dz = wz - sites[i].z;
      near[cnt] = i; d2[cnt] = dx * dx + dz * dz;
      if (d2[cnt] < dmin) { dmin = d2[cnt]; best = i; }
      cnt++;
    }
    // Blend neighbouring biome heights near borders so there are no cliffs.
    wb[0] = wb[1] = wb[2] = wb[3] = 0;
    let sum = 0, h = 0;
    for (let k = 0; k < cnt; k++) {
      const dd = d2[k] - dmin;
      if (dd > 1400) continue;
      const w = Math.exp(-dd / 150);
      wb[sites[near[k]].b] += w; sum += w;
    }
    for (let bi = 0; bi < 4; bi++) if (wb[bi] > 1e-4 * sum) h += wb[bi] * biomeHeight(bi, x, z);
    heights[x + z * WX] = clamp(Math.round(h / sum), 6, WY - 30);
    biomes[x + z * WX] = sites[best].b;
  }
  return { seed: seed, heights: heights, biomes: biomes, sites: sites };
}

// Pick a dry grassy column near the middle of the map for the player.
function findSpawnColumn(cols) {
  const cx = WX >> 1, cz = WZ >> 1;
  for (let r = 0; r < WX; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = cx + dx, z = cz + dz;
      if (x < 2 || z < 2 || x >= WX - 2 || z >= WZ - 2) continue;
      const i = x + z * WX, b = cols.biomes[i];
      if ((b === PLAINS || b === FOREST) && cols.heights[i] >= SEA + 2) return { x: x, z: z };
    }
  }
  return { x: cx, z: cz };
}

// Nearest column of a biome, for /locate.
function locateBiome(world, biome, fx, fz) {
  let best = null, bd = 1e9;
  for (let z = 0; z < WZ; z++) for (let x = 0; x < WX; x++) {
    if (world.biomes[x + z * WX] !== biome) continue;
    const d = (x - fx) * (x - fx) + (z - fz) * (z - fz);
    if (d < bd) { bd = d; best = { x: x, z: z, d: Math.sqrt(d) }; }
  }
  return best;
}

// 67
class World {
  constructor() {
    this.data = new Uint16Array(WX * WY * WZ);
    this.meta = new Map();     // block index -> state bits (facing, open, top half...)
    this.chests = new Map();   // block index -> 27 slots
    this.furnaces = new Map(); // block index -> furnace state
    this.timers = new Map();   // block index -> seconds left (saplings grow, fire burns out)
    this.jukeboxes = new Map(); // block index -> music disc item id
    this.edits = new Map();    // block index -> [id, meta] for every change since generation (what gets saved)
    this.changes = [];         // changes not yet sent to other players
    this.tracking = false;
  }
  track(i) {
    if (!this.tracking) return;
    const e = [this.data[i], this.meta.get(i) || 0];
    this.edits.set(i, e);
    this.changes.push(i);
  }
  // Apply saved or received changes on top of the generated world.
  applyEdits(list) {
    const was = this.tracking;
    this.tracking = false;
    for (const e of list) { this.data[e[0]] = e[1]; if (e[2]) this.meta.set(e[0], e[2]); else this.meta.delete(e[0]); this.edits.set(e[0], [e[1], e[2] || 0]); }
    this.tracking = was;
  }
  exportEdits() { const out = []; this.edits.forEach(function (v, i) { out.push([i, v[0], v[1]]); }); return out; }

  idx(x, y, z) { return x + z * WX + y * WXZ; }

  get(x, y, z) {
    if (x < 0 || z < 0 || x >= WX || z >= WZ || y >= WY) return 0;
    if (y < 0) return B.bedrock;
    return this.data[x + z * WX + y * WXZ];
  }

  set(x, y, z, id) {
    if (x < 0 || z < 0 || y < 0 || x >= WX || z >= WZ || y >= WY) return;
    const i = x + z * WX + y * WXZ;
    if (this.data[i] === id) return;
    this.data[i] = id;
    this.track(i);
  }

// 67
  getMeta(x, y, z) { return this.meta.get(x + z * WX + y * WXZ) || 0; }
  setMeta(x, y, z, m) {
    const i = x + z * WX + y * WXZ;
    if ((this.meta.get(i) || 0) === (m || 0)) return;
    if (m) this.meta.set(i, m); else this.meta.delete(i);
    this.track(i);
  }

  setIfFree(x, y, z, id) {
    const cur = this.get(x, y, z);
    if (y >= 0 && y < WY && x >= 0 && z >= 0 && x < WX && z < WZ && (cur === 0 || IS_CROSS[cur])) this.set(x, y, z, id);
  }

  // Highest solid block in a column (or -1).
  topSolid(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    for (let y = WY - 1; y >= 0; y--) if (IS_SOLID[this.get(x, y, z)]) return y;
    return -1;
  }

  // Step through the grid along a ray. Shaped blocks (slabs, doors...) are tested box by box.
  raycast(o, d, maxDist, liquids) {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const tdx = d.x !== 0 ? Math.abs(1 / d.x) : Infinity;
    const tdy = d.y !== 0 ? Math.abs(1 / d.y) : Infinity;
    const tdz = d.z !== 0 ? Math.abs(1 / d.z) : Infinity;
    let tmx = d.x !== 0 ? (d.x > 0 ? x + 1 - o.x : o.x - x) * tdx : Infinity;
    let tmy = d.y !== 0 ? (d.y > 0 ? y + 1 - o.y : o.y - y) * tdy : Infinity;
    let tmz = d.z !== 0 ? (d.z > 0 ? z + 1 - o.z : o.z - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 1200; i++) {
      const id = this.get(x, y, z);
      if (id && (!IS_LIQUID[id] || liquids)) {
        if (IS_SHAPED[id]) {
          const h = rayBoxes(o, d, shapeBoxes(id, this.getMeta(x, y, z), this, x, y, z, false), x, y, z, maxDist);
          if (h) return { x: x, y: y, z: z, id: id, nx: h.nx, ny: h.ny, nz: h.nz, t: h.t, hy: o.y + d.y * h.t - y };
        } else return { x: x, y: y, z: z, id: id, nx: nx, ny: ny, nz: nz, t: t, hy: o.y + d.y * t - y };
      }
      if (tmx < tmy && tmx < tmz) { if (tmx > maxDist) break; x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { if (tmy > maxDist) break; y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { if (tmz > maxDist) break; z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

// 67
  generate(seedText) {
    const cols = computeColumns(seedText);
    this.seedText = seedText;
    this.seed = cols.seed;
    this.heights = cols.heights;
    this.biomes = cols.biomes;
    const rnd = mulberry32(cols.seed ^ 0x9e3779b9);
    const nS = new Perlin(mulberry32(cols.seed ^ 0x1234567));

    // Step 3: layers. Bedrock, deepslate, stone, then a biome-specific skin.
    for (let z = 0; z < WZ; z++) for (let x = 0; x < WX; x++) {
      const i = x + z * WX, h = this.heights[i], bio = this.biomes[i];
      this.set(x, 0, z, B.bedrock);
      const deep = 8 + (rnd() * 3 | 0);
      for (let y = 1; y <= h; y++) this.set(x, y, z, y <= deep ? B.deepslate : B.stone);
      if (rnd() < 0.5) this.set(x, 1, z, B.bedrock);
      if (rnd() < 0.2) this.set(x, 2, z, B.bedrock);

      if (h < SEA) {
        const n = nS.noise2(x * 0.12, z * 0.12);
        const floor = n > 0.35 ? B.gravel : B.sand;
        for (let y = h - 2; y <= h; y++) this.set(x, y, z, floor);
        if (n < -0.4) this.set(x, h, z, B.clay);
        for (let y = h + 1; y <= SEA; y++) this.set(x, y, z, B.water);
      } else if (bio === DESERT) {
        for (let y = h - 6; y <= h - 4; y++) this.set(x, y, z, B.sandstone);
        for (let y = h - 3; y <= h; y++) this.set(x, y, z, B.sand);
      } else if (h <= SEA + 1) {
        for (let y = h - 2; y <= h; y++) this.set(x, y, z, B.sand); // beach
      } else {
        for (let y = h - 3; y < h; y++) this.set(x, y, z, B.dirt);
        this.set(x, h, z, bio === FOREST && nS.noise2(x * 0.08 + 50, z * 0.08) > 0.45 ? B.podzol : B.grass);
      }
    }

    // Step 4: ore veins and stone pockets (random walks through stone).
    const DEEP_ORE = {};
    ['coal', 'iron', 'copper', 'gold', 'redstone', 'lapis', 'diamond', 'emerald'].forEach(function (k) { DEEP_ORE[B[k + '_ore']] = B['deepslate_' + k + '_ore']; });
    const veins = [
      [B.coal_ore, 90, 6, SEA], [B.iron_ore, 60, 5, 48], [B.copper_ore, 34, 6, 50], [B.gold_ore, 20, 4, 30], [B.redstone_ore, 20, 5, 22],
      [B.lapis_ore, 14, 4, 30], [B.diamond_ore, 12, 3, 16], [B.emerald_ore, 8, 1, 44],
      [B.granite, 16, 26, SEA], [B.diorite, 16, 26, SEA], [B.andesite, 16, 26, SEA], [B.tuff, 10, 20, 14]
    ];
    for (const v of veins) {
      for (let c = 0; c < v[1] * areaScale(); c++) {
        let x = rnd() * WX | 0, y = 3 + (rnd() * (v[3] - 3) | 0), z = rnd() * WZ | 0;
        for (let k = 0; k < v[2]; k++) {
          const cur = this.get(x, y, z);
          if (cur === B.stone) this.set(x, y, z, v[0]);
          else if (cur === B.deepslate) this.set(x, y, z, DEEP_ORE[v[0]] || v[0]); // ores in the deep layer are deepslate ores
          const a = rnd() * 6 | 0;
          if (a === 0) x++; else if (a === 1) x--; else if (a === 2) y++; else if (a === 3) y--; else if (a === 4) z++; else z--;
        }
      }
    }

    // Step 5: a few winding caves that stay safely under the surface.
    for (let c = 0; c < 9 * areaScale(); c++) {
      let x = rnd() * WX, y = 12 + rnd() * 25, z = rnd() * WZ;
      let yaw = rnd() * Math.PI * 2, pitch = 0;
      const len = 50 + rnd() * 60;
      for (let s = 0; s < len; s++) {
        const rad = 1.3 + Math.sin(s * 0.2) * 0.6 + rnd() * 0.4;
        for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dy * dy + dz * dz > rad * rad) continue;
          const bx = Math.floor(x + dx), by = Math.floor(y + dy), bz = Math.floor(z + dz);
          if (bx < 0 || bz < 0 || bx >= WX || bz >= WZ || by < 4) continue;
          if (by > this.heights[bx + bz * WX] - 5) continue;
          const cur = this.get(bx, by, bz);
          if (cur && cur !== B.bedrock && !IS_WATER[cur]) this.set(bx, by, bz, 0);
        }
        yaw += (rnd() - 0.5) * 0.6; pitch = clamp(pitch + (rnd() - 0.5) * 0.3, -0.4, 0.4);
        x += Math.cos(yaw); z += Math.sin(yaw); y += Math.sin(pitch);
      }
    }

// 67
    // Step 6: trees and plants.
    const nC = new Perlin(mulberry32(cols.seed ^ 0x7f4a7c15));
    const PLAINS_FLOWERS = [B.poppy, B.dandelion, B.cornflower, B.allium, B.azure_bluet, B.red_tulip, B.orange_tulip, B.white_tulip, B.pink_tulip, B.oxeye_daisy];
    for (let z = 0; z < WZ; z++) for (let x = 0; x < WX; x++) {
      const i = x + z * WX, h = this.heights[i], bio = this.biomes[i];
      const top = this.get(x, h, z), r = rnd();
      const inner = x > 2 && z > 2 && x < WX - 3 && z < WZ - 3;
      const shore = h >= SEA && h <= SEA + 1 && (IS_WATER[this.get(x + 1, h, z)] || IS_WATER[this.get(x - 1, h, z)] || IS_WATER[this.get(x, h, z + 1)] || IS_WATER[this.get(x, h, z - 1)]);
      if (shore && (top === B.sand || top === B.grass) && r < 0.12) {
        const ch = 1 + (rnd() * 3 | 0);
        for (let k = 1; k <= ch; k++) this.setIfFree(x, h + k, z, B.sugar_cane);
        continue;
      }
      if (top === B.grass || top === B.podzol) {
        if (bio === FOREST) {
          if (r < 0.055 && inner && this.roomForTree(x, h, z)) {
            const t = rnd();
            this.growTree(t < 0.45 ? 'oak' : t < 0.7 ? 'birch' : t < 0.85 ? 'spruce' : 'dark_oak', x, h + 1, z, rnd, true);
          } else if (r < 0.2) this.setIfFree(x, h + 1, z, rnd() < 0.7 ? B.tall_grass : B.fern);
          else if (r < 0.215) this.setIfFree(x, h + 1, z, rnd() < 0.5 ? B.red_mushroom : B.brown_mushroom);
          else if (r < 0.235) this.setIfFree(x, h + 1, z, rnd() < 0.5 ? B.cornflower : B.lily_of_the_valley);
          else if (r < 0.245) this.setIfFree(x, h + 1, z, rnd() < 0.6 ? B.sweet_berry_bush : B.azalea);
        } else {
          if (r < 0.006 && inner && this.roomForTree(x, h, z)) this.growTree(rnd() < 0.3 ? 'cherry' : 'oak', x, h + 1, z, rnd, true);
          else if (r < 0.23) this.setIfFree(x, h + 1, z, B.tall_grass);
          else if (r < 0.27) this.setIfFree(x, h + 1, z, PLAINS_FLOWERS[rnd() * PLAINS_FLOWERS.length | 0]);
          else if (r < 0.273) this.setIfFree(x, h + 1, z, rnd() < 0.7 ? B.pumpkin : B.melon);
          else if (r < 0.279) this.setIfFree(x, h + 1, z, [B.sunflower, B.lilac, B.rose_bush, B.peony, B.torchflower][rnd() * 5 | 0]);
        }
      } else if (top === B.sand && bio === DESERT && h > SEA) {
        if (r < 0.012 && inner && this.get(x + 1, h + 1, z) === 0 && this.get(x - 1, h + 1, z) === 0 &&
            this.get(x, h + 1, z + 1) === 0 && this.get(x, h + 1, z - 1) === 0) {
          const ch = 1 + (rnd() * 3 | 0);
          for (let k = 1; k <= ch; k++) this.set(x, h + k, z, B.cactus);
        } else if (r < 0.026) this.setIfFree(x, h + 1, z, B.dead_bush);
      } else if (h < SEA) {
        const depth = SEA - h;
        const reef = bio === OCEAN && depth >= 3 && depth <= 10 && nC.noise2(x * 0.15, z * 0.15) > 0.28;
        if (reef && r < 0.4) {
          const coral = [B.coral_red, B.coral_blue, B.coral_yellow][rnd() * 3 | 0];
          this.set(x, h + 1, z, coral);
          if (rnd() < 0.35) this.set(x, h + 2, z, coral);
        } else if (depth >= 4 && r < 0.07) {
          const len = 1 + (rnd() * (depth - 2) | 0);
          for (let k = 1; k <= len; k++) this.set(x, h + k, z, B.kelp);
        } else if (depth >= 2 && r < 0.2) this.set(x, h + 1, z, B.seagrass);
      }
    }
    // Step 7: villages, temples, wrecks, dungeons and the rest (js/structures.js).
    if (this.genStructures) this.genStructures(mulberry32(cols.seed ^ 0x51ab1e));
  }

  roomForTree(x, h, z) {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const id = this.get(x + dx, h + 2, z + dz);
      if (id && /_log$/.test(BLOCKS[id].key)) return false;
    }
    return true;
  }

  // Grow a tree of one wood type with its trunk base at (x, y, z). Returns false if there's no room.
  growTree(kind, x, y, z, rnd, force) {
    const log = B[kind + '_log'], leaf = B[kind + '_leaves'];
    const tall = { oak: [4, 6], birch: [5, 7], spruce: [6, 9], jungle: [8, 11], acacia: [5, 6], dark_oak: [5, 7], cherry: [4, 6], mangrove: [5, 7] }[kind];
    const th = tall[0] + (rnd() * (tall[1] - tall[0] + 1) | 0), top = y + th;
    if (top + 2 >= WY) return false;
    if (!force) for (let k = 0; k < th; k++) { const c = this.get(x, y + k, z); if (c && !IS_CROSS[c] && k > 0) return false; }
    const ball = function (w, cx, cy, cz, rad, chance) {
      for (let dy = -1; dy <= 1; dy++) for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > rad + (dy === 0 ? 1 : 0)) continue;
        if (rnd() < (chance || 1)) w.setIfFree(cx + dx, cy + dy, cz + dz, leaf);
      }
    };
    if (kind === 'spruce') {
      for (let i = 0; i <= th - 2; i++) {
        const ly = top - i, rad = i === 0 ? 0 : i % 2 === 1 ? 1 : 2;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (rad === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          this.setIfFree(x + dx, ly, z + dz, leaf);
        }
      }
      this.setIfFree(x, top + 1, z, leaf);
    } else if (kind === 'acacia') {
      const dx = rnd() < 0.5 ? 1 : -1, dz = rnd() < 0.5 ? 1 : -1;
      let cx = x, cz = z;
      for (let k = 0; k < th; k++) {
        if (k >= th - 3) { cx += dx; cz += dz; }
        this.set(cx, y + k, cz, log);
      }
      for (let ddz = -3; ddz <= 3; ddz++) for (let ddx = -3; ddx <= 3; ddx++) if (Math.abs(ddx) + Math.abs(ddz) <= 4) this.setIfFree(cx + ddx, y + th, cz + ddz, leaf);
      for (let ddz = -1; ddz <= 1; ddz++) for (let ddx = -1; ddx <= 1; ddx++) this.setIfFree(cx + ddx, y + th + 1, cz + ddz, leaf);
      this.set(x, y - 1, z, B.dirt);
      return true;
    } else if (kind === 'jungle' || kind === 'dark_oak' || kind === 'cherry') {
      const rad = kind === 'jungle' ? 3 : 3;
      ball(this, x, top - 1, z, rad, 0.92);
      ball(this, x, top + 1, z, rad - 1, 0.95);
      if (kind === 'jungle') ball(this, x, top - 4, z, 2, 0.7);
    } else {
      for (let ly = top - 3; ly <= top; ly++) {
        const rad = ly >= top - 1 ? 1 : 2;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (ly === top || rnd() < 0.5)) continue;
          this.setIfFree(x + dx, ly, z + dz, leaf);
        }
      }
    }
    for (let k = 0; k < th; k++) this.set(x, y + k, z, log);
    this.set(x, y - 1, z, B.dirt);
    return true;
  }
}

// Ray against a list of block-local boxes. Returns the nearest hit with its face normal.
function rayBoxes(o, d, boxes, bx, by, bz, maxDist) {
  let best = null;
  for (const b of boxes) {
    let tmin = -Infinity, tmax = Infinity, n = null;
    const lo = [bx + b[0], by + b[1], bz + b[2]], hi = [bx + b[3], by + b[4], bz + b[5]];
    const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    let ok = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(dd[a]) < 1e-9) { if (oo[a] < lo[a] || oo[a] > hi[a]) { ok = false; break; } continue; }
      let t1 = (lo[a] - oo[a]) / dd[a], t2 = (hi[a] - oo[a]) / dd[a], s = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
      if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[a] = dd[a] > 0 ? -1 : 1; }
      tmax = Math.min(tmax, t2);
    }
    if (!ok || tmax < Math.max(0, tmin) || tmin > maxDist || !n) continue;
    if (!best || tmin < best.t) best = { t: Math.max(0, tmin), nx: n[0], ny: n[1], nz: n[2] };
  }
  return best;
}

// 67