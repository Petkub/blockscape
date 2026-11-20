'use strict';
// Generated structures, placed after terrain and trees. Everything comes from the seed, so the same
// seed always gives the same villages, temples and wrecks (saved edits are applied on top).
// Facing in meta: 0 south (+Z), 1 west (-X), 2 north (-Z), 3 east (+X).

// 67
const LOOT = {
  village: [['bread', 1, 4, 0.8], ['apple', 1, 3, 0.5], ['wheat', 2, 7, 0.5], ['emerald', 1, 3, 0.3], ['iron_ingot', 1, 3, 0.3], ['oak_sapling', 1, 3, 0.4], ['potato', 1, 5, 0.4], ['carrot', 1, 5, 0.4]],
  desert_village: [['bread', 1, 4, 0.7], ['dead_bush', 1, 2, 0.4], ['emerald', 1, 3, 0.4], ['cactus', 1, 4, 0.5], ['clay_ball', 1, 6, 0.4], ['gold_nugget', 1, 5, 0.3]],
  pyramid: [['bone', 4, 6, 0.7], ['rotten_flesh', 3, 7, 0.6], ['gold_ingot', 2, 7, 0.5], ['iron_ingot', 1, 5, 0.5], ['emerald', 1, 3, 0.4], ['diamond', 1, 3, 0.15], ['saddle', 1, 1, 0.2],
    ['golden_apple', 1, 1, 0.2], ['enchanted_golden_apple', 1, 1, 0.03], ['iron_horse_armor', 1, 1, 0.15], ['golden_horse_armor', 1, 1, 0.1], ['diamond_horse_armor', 1, 1, 0.05], ['@book', 1, 1, 0.2]],
  shipwreck: [['emerald', 1, 5, 0.5], ['iron_ingot', 1, 5, 0.6], ['gold_ingot', 1, 5, 0.4], ['diamond', 1, 1, 0.15], ['iron_nugget', 1, 10, 0.5], ['gold_nugget', 1, 10, 0.5], ['experience_bottle', 1, 3, 0.4],
    ['paper', 1, 8, 0.5], ['compass', 1, 1, 0.3], ['heart_of_the_sea', 1, 1, 0.5], ['@book', 1, 1, 0.15]],
  ruins: [['coal', 1, 4, 0.6], ['wheat', 2, 3, 0.5], ['emerald', 1, 1, 0.3], ['gold_nugget', 1, 3, 0.4], ['fishing_rod', 1, 1, 0.2], ['@book', 1, 1, 0.1], ['golden_apple', 1, 1, 0.05]],
  dungeon: [['saddle', 1, 1, 0.3], ['bread', 1, 3, 0.6], ['wheat', 1, 4, 0.5], ['gunpowder', 1, 8, 0.5], ['string', 1, 8, 0.5], ['bucket', 1, 1, 0.3], ['golden_apple', 1, 1, 0.15],
    ['iron_ingot', 1, 4, 0.4], ['gold_ingot', 1, 4, 0.2], ['redstone', 1, 4, 0.3], ['name_tag', 1, 1, 0.2], ['music_disc_13', 1, 1, 0.1], ['music_disc_cat', 1, 1, 0.1],
    ['iron_horse_armor', 1, 1, 0.1], ['enchanted_golden_apple', 1, 1, 0.02], ['@book', 1, 1, 0.2], ['echo_shard', 1, 1, 0.05]],
  portal: [['obsidian', 1, 2, 0.6], ['flint', 1, 4, 0.5], ['iron_nugget', 9, 18, 0.4], ['flint_and_steel', 1, 1, 0.4], ['fire_charge', 1, 1, 0.4], ['golden_apple', 1, 1, 0.2], ['gold_nugget', 4, 24, 0.6],
    ['golden_sword', 1, 1, 0.2], ['golden_pickaxe', 1, 1, 0.2], ['golden_carrot', 4, 12, 0.3], ['gold_block', 1, 2, 0.05], ['enchanted_golden_apple', 1, 1, 0.02]],
  outpost: [['crossbow', 1, 1, 0.5], ['wheat', 3, 5, 0.6], ['potato', 2, 5, 0.5], ['carrot', 3, 5, 0.5], ['dark_oak_log', 2, 3, 0.5], ['experience_bottle', 1, 1, 0.3], ['string', 1, 6, 0.4],
    ['arrow', 2, 7, 0.5], ['iron_ingot', 1, 3, 0.3], ['@book', 1, 1, 0.2], ['goat_horn', 1, 1, 0.5]],
  witch: [['spider_eye', 1, 3, 0.5], ['glowstone_dust', 1, 4, 0.5], ['redstone', 1, 4, 0.5], ['sugar', 1, 4, 0.5], ['glass_bottle', 1, 3, 0.5]]
};
function rollLoot(table, rnd) {
  const slots = new Array(27).fill(null), out = [];
  for (const e of LOOT[table]) {
    if (rnd() > e[3]) continue;
    const n = e[1] + (rnd() * (e[2] - e[1] + 1) | 0);
    if (e[0] === '@book') {
      const keys = Object.keys(ENCHANTS), k = keys[rnd() * keys.length | 0];
      out.push(stack('enchanted_book', 1, { ench: { [k]: 1 + (rnd() * ENCHANTS[k].max | 0) } }));
    } else if (I[e[0]] !== undefined) out.push(stack(e[0], Math.min(n, maxStack(I[e[0]]))));
  }
  if (!out.length) out.push(stack('bread', 2));
  for (const s of out) { let i = rnd() * 27 | 0; while (slots[i]) i = (i + 1) % 27; slots[i] = s; }
  return slots;
}

World.prototype.genStructures = function (rnd) {
  const w = this, OB = B;
  w.structures = [];
  w.spawners = new Map();
  w.structureMobs = [];
  const used = []; // footprints, so structures don't overlap each other
  const put = function (x, y, z, id, meta) { if (x < 0 || z < 0 || x >= WX || z >= WZ || y < 1 || y >= WY) return; w.set(x, y, z, id); w.setMeta(x, y, z, meta || 0); };
  const air = function (x, y, z) { put(x, y, z, 0, 0); };
  const free = function (x, z, r) { return !used.some(function (u) { return Math.abs(u[0] - x) < u[2] + r && Math.abs(u[1] - z) < u[2] + r; }); };
  const claim = function (x, z, r) { used.push([x, z, r]); };
  const chest = function (x, y, z, facing, table) { put(x, y, z, OB.chest, facing); w.chests.set(w.idx(x, y, z), rollLoot(table, rnd)); };
  const mob = function (key, x, y, z) { w.structureMobs.push([key, x + 0.5, y, z + 0.5]); };
  const record = function (type, x, y, z) { w.structures.push({ type: type, x: x, y: y, z: z }); };
  const H = function (x, z) { return w.heights[x + z * WX]; };
  // A flat-enough patch of one biome above the sea.
  const site = function (biome, r, maxSlope, land) {
    for (let t = 0; t < 400; t++) {
      const x = r + 4 + (rnd() * (WX - 2 * r - 8) | 0), z = r + 4 + (rnd() * (WZ - 2 * r - 8) | 0);
      if (w.biomes[x + z * WX] !== biome || !free(x, z, r)) continue;
      const h = H(x, z);
      if (land !== false && h <= SEA) continue;
      let ok = true;
      for (let k = 0; k < 12 && ok; k++) {
        const sx = x + ((rnd() - 0.5) * 2 * r | 0), sz = z + ((rnd() - 0.5) * 2 * r | 0);
        if (Math.abs(H(sx, sz) - h) > maxSlope || (land !== false && H(sx, sz) <= SEA) || w.biomes[sx + sz * WX] !== biome) ok = false;
      }
      if (ok) return [x, h, z];
    }
    return null;
  };
  // Level a rectangle: solid up to y, air for 14 blocks above.
  const level = function (x0, z0, x1, z1, y, top, fill) {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      for (let k = y - 4; k < y; k++) if (!w.get(x, k, z) || IS_LIQUID[w.get(x, k, z)]) put(x, k, z, fill);
      put(x, y, z, top);
      for (let k = y + 1; k <= y + 14; k++) air(x, k, z);
    }
  };
  const box = function (x0, y0, z0, x1, y1, z1, id) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, id); };
  const door = function (x, y, z, id, facing) { put(x, y, z, id, facing); put(x, y + 1, z, id, facing | META_TOP); };

  // ---------- villages ----------
  const village = function (desert) {
    const s = site(desert ? DESERT : PLAINS, 22, 4);
    if (!s) return;
    const cx = s[0], cz = s[2], y = s[1];
    claim(cx, cz, 24); record(desert ? 'desert_village' : 'village', cx, y, cz);
    const wall = desert ? OB.sandstone : OB.oak_planks, corner = desert ? OB.cut_sandstone : OB.oak_log, base = desert ? OB.smooth_sandstone : OB.cobblestone;
    const roof = desert ? OB.smooth_sandstone : OB.oak_planks, stairs = desert ? OB.sandstone_stairs : OB.oak_stairs, pathB = desert ? OB.smooth_sandstone : OB.dirt_path;
    const yAt = function (x, z) { return H(x, z); };
    // Well in the middle, the bell beside it.
    level(cx - 3, cz - 3, cx + 3, cz + 3, y, pathB, desert ? OB.sandstone : OB.dirt);
    box(cx - 2, y + 1, cz - 2, cx + 1, y + 1, cz + 1, base);
    box(cx - 1, y - 2, cz - 1, cx, y + 1, cz, OB.water);
    for (const c of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) { put(cx + c[0], y + 2, cz + c[1], desert ? OB.sandstone_wall : OB.oak_fence); put(cx + c[0], y + 3, cz + c[1], desert ? OB.sandstone_wall : OB.oak_fence); }
    box(cx - 2, y + 4, cz - 2, cx + 1, y + 4, cz + 1, desert ? OB.sandstone_slab : OB.cobblestone_slab);
    put(cx + 3, y + 1, cz + 3, OB.bell);
    // Four streets out from the well, with houses along them.
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let houses = 0;
    for (const d of dirs) {
      const len = 12 + (rnd() * 8 | 0);
      for (let i = 3; i <= len; i++) for (let k = -1; k <= 1; k++) {
        const x = cx + d[0] * i + (d[1] ? k : 0), z = cz + d[1] * i + (d[0] ? k : 0);
        const h = yAt(x, z);
        if (h > SEA && Math.abs(h - y) < 6) { put(x, h, z, pathB); for (let a = 1; a < 3; a++) if (!IS_SOLID[w.get(x, h + a, z)] || IS_CROSS[w.get(x, h + a, z)]) air(x, h + a, z); }
      }
      // Lamp post halfway down the street.
      const lx = cx + d[0] * 8 + d[1] * 2, lz = cz + d[1] * 8 + d[0] * 2, lh = yAt(lx, lz);
      if (lh > SEA) { put(lx, lh + 1, lz, desert ? OB.sandstone_wall : OB.oak_fence); put(lx, lh + 2, lz, desert ? OB.sandstone_wall : OB.oak_fence); put(lx, lh + 3, lz, OB.lantern); }
      // Houses on both sides of the street.
      for (const side of [-1, 1]) for (let along = 6; along + 4 <= len + 2; along += 10) {
        const hx = cx + d[0] * along + d[1] * side * 6, hz = cz + d[1] * along + d[0] * side * 6;
        const hh = yAt(hx, hz);
        if (hh <= SEA || Math.abs(hh - y) > 5 || hx < 6 || hz < 6 || hx >= WX - 6 || hz >= WZ - 6) continue;
        // The door faces the street.
        const facing = d[0] ? (side > 0 ? 2 : 0) : (side > 0 ? 1 : 3);
        if (rnd() < 0.22 && !desert) farm(hx, hh, hz);
        else { house(hx, hh, hz, facing, wall, corner, base, roof, stairs, desert); houses++; }
      }
    }
    // Villagers, an iron golem and a cat.
    for (let i = 0; i < 3 + houses; i++) mob('villager', cx + (rnd() - 0.5) * 16 | 0, y + 1, cz + (rnd() - 0.5) * 16 | 0);
    mob('iron_golem', cx + 4, y + 1, cz - 4);
    if (!desert) mob('cat', cx - 4, y + 1, cz + 4);
  };
  const house = function (x, y, z, facing, wall, corner, base, roof, stairs, desert) {
    const r = 2, top = y + 4;
    level(x - r - 1, z - r - 1, x + r + 1, z + r + 1, y, base, base);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const edge = Math.abs(dx) === r || Math.abs(dz) === r, cor = Math.abs(dx) === r && Math.abs(dz) === r;
      for (let k = y + 1; k < top; k++) {
        if (!edge) { air(x + dx, k, z + dz); continue; }
        const win = !cor && k === y + 2 && (dx === 0 || dz === 0);
        put(x + dx, k, z + dz, cor ? corner : win ? (desert ? 0 : OB.glass_pane) : wall);
      }
    }
    // Pitched roof: stairs stepping up from both long sides.
    for (let s = 0; s <= r + 1; s++) for (let a = -r - 1; a <= r + 1; a++) {
      if (desert) { if (s === 0) put(x + a, top, z - r - 1 + 0, roof); continue; }
      const along = facing === 0 || facing === 2;
      const px1 = along ? x + a : x - r - 1 + s, pz1 = along ? z - r - 1 + s : z + a;
      const px2 = along ? x + a : x + r + 1 - s, pz2 = along ? z + r + 1 - s : z + a;
      if (s === r + 1) { put(px1, top + s, pz1, roof); continue; }
      put(px1, top + s, pz1, stairs, along ? 0 : 3); put(px2, top + s, pz2, stairs, along ? 2 : 1);
    }
    if (desert) for (let dx = -r - 1; dx <= r + 1; dx++) for (let dz = -r - 1; dz <= r + 1; dz++) put(x + dx, top, z + dz, roof);
    // Door toward the street.
    const fdx = facing === 3 ? r : facing === 1 ? -r : 0, fdz = facing === 0 ? r : facing === 2 ? -r : 0;
    door(x + fdx, y + 1, z + fdz, desert ? OB.acacia_door : OB.oak_door, facing);
    put(x + fdx * 1.5 | 0, y, z + fdz * 1.5 | 0, desert ? OB.smooth_sandstone : OB.cobblestone);
    // Furniture.
    const bed = desert ? OB.yellow_bed : [OB.red_bed, OB.white_bed, OB.light_blue_bed, OB.green_bed][rnd() * 4 | 0];
    put(x - fdx / r, y + 1, z - fdz / r, bed, facing);
    const job = [OB.crafting_table, OB.composter, OB.furnace, OB.lectern, OB.cartography_table, OB.fletching_table, OB.smoker, OB.stonecutter, OB.grindstone, OB.loom, OB.barrel][rnd() * 11 | 0];
    put(x + (fdz ? 1 : 0) + (fdx ? -0 : 0), y + 1, z - (fdx ? 1 : 0), job, facing);
    if (rnd() < 0.6) chest(x - (fdz ? 1 : 0), y + 1, z + (fdx ? 1 : 0), facing, desert ? 'desert_village' : 'village');
    put(x, top - 1, z, OB.lantern);
  };
  const farm = function (x, y, z) {
    level(x - 4, z - 3, x + 4, z + 3, y, OB.dirt, OB.dirt);
    for (let dx = -4; dx <= 4; dx++) for (let dz = -3; dz <= 3; dz++) {
      const edge = Math.abs(dx) === 4 || Math.abs(dz) === 3;
      if (edge) { put(x + dx, y, z + dz, OB.oak_log); continue; }
      if (dx === 0) { put(x + dx, y, z + dz, OB.water); continue; }
      if (rnd() < 0.55) put(x + dx, y + 1, z + dz, [OB.pumpkin, OB.melon, OB.hay_bale, OB.sweet_berry_bush][rnd() * 4 | 0]);
    }
    put(x + 4, y + 1, z + 3, OB.composter);
  };

  // ---------- desert pyramid ----------
  const pyramid = function () {
    const s = site(DESERT, 12, 3);
    if (!s) return;
    const cx = s[0], cz = s[2], y = s[1];
    claim(cx, cz, 13); record('desert_pyramid', cx, y, cz);
    level(cx - 10, cz - 10, cx + 10, cz + 10, y, OB.sandstone, OB.sandstone);
    for (let k = 0; k <= 10; k++) {
      const r = 10 - k;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const edge = Math.abs(dx) === r || Math.abs(dz) === r;
        if (edge || k === 0) put(cx + dx, y + 1 + k, cz + dz, k % 3 === 1 && edge ? OB.cut_sandstone : OB.sandstone);
        else if (k < 6) air(cx + dx, y + 1 + k, cz + dz);
      }
    }
    // Orange terracotta stripes on the outside and a blue terracotta star on the floor.
    for (let dx = -9; dx <= 9; dx += 3) { put(cx + dx, y + 2, cz - 10, OB.terracotta_orange); put(cx + dx, y + 2, cz + 10, OB.terracotta_orange); }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) put(cx + dx, y + 1, cz + dz, Math.abs(dx) + Math.abs(dz) <= 1 ? OB.terracotta_blue : OB.terracotta_orange);
    // Entrance on the north side.
    for (let k = 2; k <= 4; k++) for (let dz = -10; dz <= -8; dz++) { air(cx, y + k, cz + dz); air(cx + 1, y + k, cz + dz); }
    // The hidden room: a shaft under the star, four chests, and a TNT trap.
    for (let k = y; k > y - 12; k--) air(cx, k, cz);
    const ry = y - 12;
    box(cx - 3, ry - 1, cz - 3, cx + 3, ry + 3, cz + 3, OB.sandstone);
    box(cx - 2, ry, cz - 2, cx + 2, ry + 2, cz + 2, 0);
    for (let k = ry; k <= y; k++) air(cx, k, cz);
    box(cx - 1, ry - 1, cz - 1, cx + 1, ry - 1, cz + 1, OB.tnt);
    chest(cx, ry, cz - 2, 0, 'pyramid'); chest(cx, ry, cz + 2, 2, 'pyramid'); chest(cx - 2, ry, cz, 3, 'pyramid'); chest(cx + 2, ry, cz, 1, 'pyramid');
    mob('husk', cx + 3, y + 1, cz + 3);
  };
  const desertWell = function () {
    const s = site(DESERT, 4, 1);
    if (!s) return;
    const x = s[0], z = s[2], y = s[1];
    claim(x, z, 4); record('desert_well', x, y, z);
    level(x - 2, z - 2, x + 2, z + 2, y, OB.sandstone, OB.sandstone);
    put(x, y, z, OB.water); put(x, y - 1, z, OB.water);
    for (const c of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(x + c[0], y + 1, z + c[1], OB.sandstone_slab);
    for (const c of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { put(x + c[0], y + 1, z + c[1], OB.sandstone); put(x + c[0], y + 2, z + c[1], OB.sandstone); }
    box(x - 1, y + 3, z - 1, x + 1, y + 3, z + 1, OB.sandstone_slab);
    put(x + 2, y - 1, z, OB.suspicious_sand); put(x - 2, y - 1, z + 1, OB.suspicious_sand);
  };

  // ---------- ocean ----------
  const oceanSite = function (r, minDepth) {
    for (let t = 0; t < 300; t++) {
      const x = r + 4 + (rnd() * (WX - 2 * r - 8) | 0), z = r + 4 + (rnd() * (WZ - 2 * r - 8) | 0);
      if (!free(x, z, r) || SEA - H(x, z) < minDepth) continue;
      let ok = true;
      for (let k = 0; k < 8 && ok; k++) if (SEA - H(x + ((rnd() - 0.5) * 2 * r | 0), z + ((rnd() - 0.5) * 2 * r | 0)) < minDepth - 2) ok = false;
      if (ok) return [x, H(x, z), z];
    }
    return null;
  };
  const shipwreck = function () {
    const s = oceanSite(8, 5);
    if (!s) return;
    const x = s[0], z = s[2], y = s[1] + 1;
    claim(x, z, 9); record('shipwreck', x, y, z);
    const along = rnd() < 0.5, plank = [OB.oak_planks, OB.spruce_planks, OB.dark_oak_planks][rnd() * 3 | 0];
    const P = function (a, k, b, id, m) { put(along ? x + a : x + b, y + k, along ? z + b : z + a, id, m); };
    for (let a = -7; a <= 7; a++) {
      const half = a > 5 || a < -6 ? 1 : 2;
      for (let b = -half; b <= half; b++) P(a, 0, b, plank);
      for (let k = 1; k <= 2; k++) { if (rnd() < 0.85) P(a, k, -half - 1, plank); if (rnd() < 0.85) P(a, k, half + 1, plank); }
    }
    for (let k = 1; k <= 7; k++) if (k < 5 || rnd() < 0.5) P(1, k, 0, along ? OB.spruce_log : OB.spruce_log);
    for (let b = -2; b <= 2; b++) P(-6, 3, b, plank);
    chest(along ? x - 5 : x, y + 1, along ? z : z - 5, 0, 'shipwreck');
    chest(along ? x + 5 : x, y + 1, along ? z + 1 : z + 5, 2, 'shipwreck');
    mob('drowned', x, y + 1, z);
  };
  const ruins = function () {
    const s = oceanSite(5, 4);
    if (!s) return;
    const x = s[0], z = s[2], y = s[1] + 1;
    claim(x, z, 6); record('ocean_ruins', x, y, z);
    const mats = [OB.stone_bricks, OB.mossy_stone_bricks, OB.cracked_stone_bricks, OB.cobblestone, OB.mossy_cobblestone];
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      put(x + dx, y - 1, z + dz, mats[rnd() * mats.length | 0]);
      if (Math.abs(dx) === 3 || Math.abs(dz) === 3) { const hgt = rnd() * 4 | 0; for (let k = 0; k < hgt; k++) put(x + dx, y + k, z + dz, mats[rnd() * mats.length | 0]); }
    }
    chest(x, y, z, 0, 'ruins');
    mob('drowned', x + 1, y, z + 1); mob('drowned', x - 1, y, z - 1);
  };
  const monument = function () {
    const s = oceanSite(13, 11);
    if (!s) return;
    const x = s[0], z = s[2], y = s[1] + 1;
    claim(x, z, 14); record('ocean_monument', x, y, z);
    for (let k = 0; k <= 8; k++) {
      const r = 11 - Math.max(0, k - 3);
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const edge = Math.abs(dx) === r || Math.abs(dz) === r;
        if (k === 0) put(x + dx, y, z + dz, OB.prismarine_bricks);
        else if (edge) put(x + dx, y + k, z + dz, (dx + dz + k) % 7 === 0 ? OB.sea_lantern : k % 4 === 0 ? OB.dark_prismarine : OB.prismarine_bricks);
        else if (k === 8) put(x + dx, y + k, z + dz, OB.prismarine);
        else put(x + dx, y + k, z + dz, OB.water);
      }
    }
    // Doorways on every side, pillars, and the gold core.
    for (const d of [[11, 0], [-11, 0], [0, 11], [0, -11]]) for (let k = 1; k <= 3; k++) for (let o = -1; o <= 1; o++) put(x + d[0] + (d[1] ? o : 0), y + k, z + d[1] + (d[0] ? o : 0), OB.water);
    for (const c of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) for (let k = 1; k < 8; k++) put(x + c[0], y + k, z + c[1], k % 3 ? OB.prismarine_bricks : OB.sea_lantern);
    box(x - 1, y + 1, z - 1, x + 1, y + 2, z, OB.gold_block); put(x, y + 3, z, OB.sponge);
    for (let i = 0; i < 6; i++) mob('guardian', x + (rnd() - 0.5) * 18 | 0, y + 3, z + (rnd() - 0.5) * 18 | 0);
    mob('elder_guardian', x, y + 5, z + 3);
  };

  // ---------- underground dungeons ----------
  const dungeon = function () {
    for (let t = 0; t < 60; t++) {
      const x = 8 + (rnd() * (WX - 16) | 0), z = 8 + (rnd() * (WZ - 16) | 0), y = 8 + (rnd() * 30 | 0);
      if (y > H(x, z) - 8) continue;
      // Needs to touch a cave so you can find it.
      let open = 0;
      for (let dx = -4; dx <= 4; dx += 2) for (let dz = -4; dz <= 4; dz += 2) if (!w.get(x + dx, y + 1, z + dz)) open++;
      if (open < 2 || open > 14) continue;
      record('dungeon', x, y, z);
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let k = -1; k <= 4; k++) {
        const edge = Math.abs(dx) === 4 || Math.abs(dz) === 4 || k === -1 || k === 4;
        if (edge) { if (w.get(x + dx, y + k, z + dz)) put(x + dx, y + k, z + dz, k === -1 && rnd() < 0.6 ? OB.mossy_cobblestone : OB.cobblestone); }
        else air(x + dx, y + k, z + dz);
      }
      put(x, y, z, OB.spawner);
      w.spawners.set(w.idx(x, y, z), ['zombie', 'skeleton', 'spider', 'zombie'][rnd() * 4 | 0]);
      chest(x - 3, y, z, 3, 'dungeon');
      if (rnd() < 0.6) chest(x + 3, y, z + 2, 1, 'dungeon');
      return;
    }
  };

  // ---------- ruined portal, pillager outpost, witch hut ----------
  const ruinedPortal = function () {
    const biome = [PLAINS, FOREST, DESERT][rnd() * 3 | 0], s = site(biome, 5, 3);
    if (!s) return;
    const x = s[0], z = s[2], y = s[1];
    claim(x, z, 6); record('ruined_portal', x, y, z);
    for (let dx = -4; dx <= 4; dx++) for (let dz = -3; dz <= 3; dz++) if (rnd() < 0.7 - Math.hypot(dx, dz) * 0.06) put(x + dx, H(x + dx, z + dz), z + dz, rnd() < 0.15 ? OB.magma_block : OB.netherrack);
    for (let a = -1; a <= 2; a++) for (let k = 0; k <= 4; k++) {
      const frame = a === -1 || a === 2 || k === 0 || k === 4;
      if (!frame) { air(x + a, y + 1 + k, z); continue; }
      if (rnd() < 0.78) put(x + a, y + 1 + k, z, rnd() < 0.2 ? OB.crying_obsidian : OB.obsidian);
    }
    put(x + 3, y + 1, z + 1, OB.gold_block);
    chest(x - 3, y + 1, z + 1, 0, 'portal');
  };
  const outpost = function () {
    const s = site(rnd() < 0.7 ? PLAINS : DESERT, 6, 3);
    if (!s) return;
    const x = s[0], z = s[2], y = s[1];
    claim(x, z, 8); record('pillager_outpost', x, y, z);
    level(x - 4, z - 4, x + 4, z + 4, y, OB.cobblestone, OB.cobblestone);
    for (let k = 1; k <= 16; k++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3, cor = Math.abs(dx) === 3 && Math.abs(dz) === 3;
      if (cor) put(x + dx, y + k, z + dz, OB.dark_oak_log);
      else if (k % 6 === 0) put(x + dx, y + k, z + dz, OB.dark_oak_planks);
      else if (edge && k <= 12) put(x + dx, y + k, z + dz, (k === 3 || k === 9) && (dx === 0 || dz === 0) ? 0 : OB.birch_planks);
      else air(x + dx, y + k, z + dz);
    }
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.abs(dx) === 3 || Math.abs(dz) === 3) put(x + dx, y + 13, z + dz, OB.dark_oak_fence);
    for (let k = 1; k <= 12; k++) put(x + 2, y + k, z + 2, OB.ladder, 2);
    for (const k of [6, 12]) air(x + 2, y + k, z + 2);
    door(x, y + 1, z - 3, OB.dark_oak_door, 2);
    chest(x - 2, y + 13, z - 2, 0, 'outpost');
    for (let i = 0; i < 4; i++) mob('pillager', x + (rnd() - 0.5) * 10 | 0, y + 1, z + (rnd() - 0.5) * 10 | 0);
    mob('pillager', x, y + 13, z);
    // A cage with an allay inside.
    const gx = x + 7, gz = z, gy = H(gx, gz);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let k = 1; k <= 3; k++) put(gx + dx, gy + k, gz + dz, k === 3 ? OB.dark_oak_planks : (dx || dz) ? OB.dark_oak_fence : 0);
    mob('allay', gx, gy + 1, gz);
  };
  const witchHut = function () {
    const s = site(FOREST, 4, 3);
    if (!s) return;
    const x = s[0], z = s[2], y = s[1] + 3;
    claim(x, z, 5); record('witch_hut', x, y, z);
    for (const c of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let k = H(x + c[0], z + c[1]) + 1; k < y; k++) put(x + c[0], k, z + c[1], OB.spruce_log);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -3; dz <= 2; dz++) {
      put(x + dx, y, z + dz, OB.spruce_planks);
      for (let k = 1; k <= 3; k++) { const edge = Math.abs(dx) === 2 || dz === 2 || dz === -2; put(x + dx, y + k, z + dz, edge && dz >= -2 ? (k === 2 && dx === 0 ? 0 : OB.spruce_planks) : 0); }
      put(x + dx, y + 4, z + dz, OB.spruce_slab);
    }
    air(x, y + 1, z - 2); air(x, y + 2, z - 2);
    put(x - 1, y + 1, z + 1, OB.cauldron); put(x + 1, y + 1, z + 1, OB.crafting_table); put(x, y + 3, z, OB.lantern);
    chest(x + 1, y + 1, z - 1, 1, 'witch');
    mob('witch', x, y + 1, z);
  };

  // How many of each, scaled to the world's size (a 512 x 512 world gets the full set).
  const n = function (k) { return Math.max(1, Math.round(k * areaScale() / 26.2144)); };
  for (let i = 0; i < n(3); i++) village(false);
  for (let i = 0; i < n(2); i++) village(true);
  for (let i = 0; i < n(2); i++) pyramid();
  for (let i = 0; i < n(3); i++) desertWell();
  for (let i = 0; i < n(4); i++) shipwreck();
  for (let i = 0; i < n(5); i++) ruins();
  monument();
  for (let i = 0; i < n(14); i++) dungeon();
  for (let i = 0; i < n(4); i++) ruinedPortal();
  for (let i = 0; i < n(2); i++) outpost();
  for (let i = 0; i < n(2); i++) witchHut();
  // Keep the column heights right where structures changed the ground.
  for (const st of w.structures) for (let dx = -14; dx <= 14; dx++) for (let dz = -14; dz <= 14; dz++) {
    const x = st.x + dx, z = st.z + dz;
    if (x < 0 || z < 0 || x >= WX || z >= WZ) continue;
    let h = WY - 1; while (h > 0 && (!w.get(x, h, z) || IS_LIQUID[w.get(x, h, z)])) h--;
    if (h > w.heights[x + z * WX] || st.type === 'desert_pyramid' || st.type.indexOf('village') >= 0) w.heights[x + z * WX] = h;
  }
};

// The structure nearest to a point, for /locate.
function nearestStructure(world, type, x, z) {
  let best = null, bd = Infinity;
  for (const s of world.structures || []) {
    if (type && s.type !== type && !(type === 'village' && s.type.indexOf('village') >= 0)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  return best ? { s: best, d: bd } : null;
}

// 67
// 67
// 67
// 67
// 67
// 67
// 67
