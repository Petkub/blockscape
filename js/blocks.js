'use strict';
// Block catalogue + procedural 16x16 pixel textures + block shapes.
// Every block is a number (its ID) stored in the world grid. ID 0 is air.

// 67
const TILE = 16;
const BLOCK_CATEGORIES = ['Natural', 'Wood', 'Stone', 'Ores & Minerals', 'Building', 'Colored', 'Functional', 'Plants'];

// ---------- painting helpers ----------
function rgba(c, f, a) {
  f = f === undefined ? 1 : f;
  a = a === undefined ? 1 : a;
  return 'rgba(' + clamp(c[0] * f | 0, 0, 255) + ',' + clamp(c[1] * f | 0, 0, 255) + ',' + clamp(c[2] * f | 0, 0, 255) + ',' + a + ')';
}
// Shades snap to steps, so each texture uses a small palette like Minecraft's instead of smooth noise.
function px(ctx, x, y, c, f, a) { ctx.fillStyle = rgba(c, f === undefined ? 1 : Math.round(f * 16) / 16, a); ctx.fillRect(((x % TILE) + TILE) % TILE, ((y % TILE) + TILE) % TILE, 1, 1); }
// Tileable blotchy noise (0..1): the 2-3 pixel clusters vanilla textures are built from.
function clusterNoise(r, cell) {
  cell = cell || 2;
  const n = TILE / cell, g = [];
  for (let i = 0; i < n * n; i++) g.push(r());
  const v = function (a, b) { return g[((a % n) + n) % n + (((b % n) + n) % n) * n]; };
  return function (x, y) {
    const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    return lerp(lerp(v(x0, y0), v(x0 + 1, y0), tx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), tx), ty);
  };
}
// Paint from a palette (darkest first) chosen by blotchy noise.
function paletteFill(ctx, r, pal, cell, grain) {
  const cn = clusterNoise(r, cell || 2);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const t = clamp(cn(x, y) * (1 - (grain || 0.35)) + r() * (grain || 0.35), 0, 0.999);
    px(ctx, x, y, pal[Math.floor(t * pal.length)]);
  }
}
function rect(ctx, x0, y0, x1, y1, c, f, a) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(ctx, x, y, c, f, a); }
function noiseFill(ctx, r, c, v, a) {
  const cn = clusterNoise(r, 2);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, c, 1 + (cn(x, y) * 0.6 + r() * 0.4 - 0.5) * v * 1.3, a);
}
function specks(ctx, r, c, n, v) {
  for (let i = 0; i < n; i++) px(ctx, r() * TILE | 0, r() * TILE | 0, c, 1 + (r() - 0.5) * (v || 0.1));
}
function mul(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }
// Irregular stones separated by mortar (tiles seamlessly).
function voronoi(ctx, r, n, colorFn, mortar, edge) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([r() * TILE, r() * TILE, colorFn(i, r)]);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let i = 0; i < n; i++) {
      let dx = Math.abs(x + 0.5 - pts[i][0]), dy = Math.abs(y + 0.5 - pts[i][1]);
      dx = Math.min(dx, TILE - dx); dy = Math.min(dy, TILE - dy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
    }
    if (mortar && d2 - d1 < edge) px(ctx, x, y, mortar, 1 + (r() - 0.5) * 0.15);
    else px(ctx, x, y, pts[best][2], 1.08 - d1 / 14 + (r() - 0.5) * 0.1);
  }
}
function rings(ctx, r, wood, barkC) {
  // Log end: a bark rim, then rounded growth rings around a darker heart.
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const ax = Math.abs(x - 7.5), ay = Math.abs(y - 7.5), d = Math.max(ax, ay);
    if (d >= 7) { px(ctx, x, y, barkC, (r() < 0.3 ? 0.8 : 1) * (1 + (r() - 0.5) * 0.1)); continue; }
    const ring = Math.floor(Math.max(ax, ay) * 0.55 + Math.min(ax, ay) * 0.45 + (r() < 0.12 ? 1 : 0));
    let f = ring % 2 ? 0.84 : 1;
    if (d < 1.5) f = 0.78;
    if (d >= 6 && d < 7) f = 0.9;
    px(ctx, x, y, wood, f * (1 + (r() - 0.5) * 0.05));
  }
}
function bark(ctx, r, c) {
  // Vertical bark plates split by dark wandering cracks.
  const cn = clusterNoise(r, 4);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const plate = 0.88 + cn(x * 3, y) * 0.24;
    px(ctx, x, y, c, plate * (1 + (r() - 0.5) * 0.1));
  }
  for (let k = 0; k < 5; k++) {
    let x = (k * 3 + (r() * 2 | 0)) % TILE;
    const y0 = r() * 16 | 0, len = 5 + (r() * 9 | 0);
    for (let i = 0; i < len; i++) {
      px(ctx, x, y0 + i, c, 0.62);
      if (r() < 0.35) px(ctx, x + 1, y0 + i, c, 1.12);
      if (r() < 0.15) x += r() < 0.5 ? 1 : -1;
    }
  }
}
function planks(ctx, r, c) {
  // Four boards, a dark gap under each, a butt joint per board, and dashed grain lines.
  for (let board = 0; board < 4; board++) {
    const joint = (board * 7 + 2 + (r() * 3 | 0)) % TILE, tone = 0.94 + r() * 0.1;
    for (let yy = 0; yy < 4; yy++) {
      const y = board * 4 + yy;
      for (let x = 0; x < TILE; x++) {
        let f = tone * (1 + (r() - 0.5) * 0.06);
        if (yy === 3) f = 0.68;
        else if (yy === 0) f *= 1.06;
        else if (r() < 0.22) f *= 0.88;
        if (x === joint && yy < 3) f = 0.72;
        else if (x === (joint + 1) % TILE && yy < 3) f *= 1.08;
        px(ctx, x, y, c, f);
      }
    }
  }
}
function leaves(ctx, r, c) {
  // Dense leaf clumps with dark gaps and a few see-through holes (fancy leaves).
  const cn = clusterNoise(r, 2);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const t = cn(x, y);
    if (t < 0.2 && r() < 0.7) continue;
    px(ctx, x, y, c, t < 0.35 ? 0.62 : t < 0.55 ? 0.82 : t < 0.78 ? 1 : 1.18);
    if (r() < 0.06) px(ctx, x, y, c, 1.3);
  }
}
function stonePaint(ctx, r) {
  // Vanilla stone: mid grey with darker smeared blotches and pale flecks.
  paletteFill(ctx, r, [[104, 104, 104], [116, 116, 116], [126, 126, 126], [126, 126, 126], [134, 134, 134], [143, 143, 143]], 2, 0.3);
  for (let i = 0; i < 7; i++) {
    const x0 = r() * 16 | 0, y0 = r() * 16 | 0, len = 2 + (r() * 4 | 0);
    for (let k = 0; k < len; k++) px(ctx, x0 + k, y0 + (k > 2 && r() < 0.4 ? 1 : 0), [96, 96, 96]);
  }
}
function oreOn(basePaint, c) {
  // Ore lumps: a dark rim below/right, the ore colour, and a bright glint top-left.
  const SHAPES = [[[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]]];
  return function (ctx, r) {
    basePaint(ctx, r);
    const spots = [[2, 2], [9, 1], [5, 7], [12, 8], [2, 11], [9, 12]];
    for (const sp of spots) {
      if (r() < 0.2) continue;
      const cx = sp[0] + (r() * 2 | 0), cy = sp[1] + (r() * 2 | 0), shape = SHAPES[r() * SHAPES.length | 0];
      for (const s of shape) { px(ctx, cx + s[0] + 1, cy + s[1] + 1, mul(c, 0.55)); }
      for (const s of shape) px(ctx, cx + s[0], cy + s[1], c, 0.85 + r() * 0.25);
      px(ctx, cx + shape[0][0], cy + shape[0][1], c, 1.4);
    }
  };
}
function ore(c) { return oreOn(stonePaint, c); }
function wool(c) {
  return function (ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const f = 1 + ((x + y) & 1 ? -0.05 : 0.04) + ((x * 3 + y) % 5 === 0 ? -0.06 : 0) + (r() - 0.5) * 0.07;
      px(ctx, x, y, c, f);
    }
  };
}
function metal(c) {
  return function (ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      let f = 1 + (r() - 0.5) * 0.05;
      if (x === 0 || y === 0) f = 1.18;
      else if (x === 15 || y === 15) f = 0.75;
      else if (x === 1 || y === 1 || x === 14 || y === 14) f = 0.92;
      else if ((x + y) % 7 === 0 && x > 2 && x < 13) f = 1.1;
      px(ctx, x, y, c, f);
    }
  };
}
function polished(c) {
  return function (ctx, r) {
    noiseFill(ctx, r, c, 0.06);
    for (let i = 0; i < TILE; i++) { px(ctx, i, 0, c, 1.15); px(ctx, 0, i, c, 1.15); px(ctx, i, 15, c, 0.75); px(ctx, 15, i, c, 0.75); }
  };
}
function brickPattern(brick, mortar, h, w) {
  return function (ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const row = Math.floor(y / h), off = (row % 2) * (w / 2);
      if (y % h === h - 1 || (x + off) % w === w - 1) px(ctx, x, y, mortar, 1 + (r() - 0.5) * 0.1);
      else px(ctx, x, y, brick, (y % h === 0 ? 1.1 : 1) * (1 + (r() - 0.5) * 0.12));
    }
  };
}
function tiles(c, n) {
  return function (ctx, r) {
    noiseFill(ctx, r, c, 0.1);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (x % n === n - 1 || y % n === n - 1) px(ctx, x, y, c, 0.7);
      else if (x % n === 0 || y % n === 0) px(ctx, x, y, c, 1.12);
    }
  };
}
function pillar(c) {
  return function (ctx, r) {
    noiseFill(ctx, r, c, 0.05);
    for (let y = 0; y < TILE; y++) for (const x of [0, 3, 12, 15]) px(ctx, x, y, c, x === 0 || x === 12 ? 1.08 : 0.82);
  };
}
function chiseled(c) {
  return function (ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      px(ctx, x, y, c, (d > 6.5 ? 0.8 : d > 5.5 ? 1.1 : d < 2 ? 0.85 : d < 3 ? 1.12 : 1) * (1 + (r() - 0.5) * 0.06));
    }
  };
}
function coral(c) {
  return function (ctx, r) {
    noiseFill(ctx, r, c, 0.12);
    for (let y = 1; y < TILE; y += 4) for (let x = 1 + ((y >> 2) & 1) * 2; x < TILE; x += 4) {
      const jx = x + (r() * 2 | 0), jy = y + (r() * 2 | 0);
      px(ctx, jx % 16, jy % 16, c, 0.55);
      px(ctx, (jx + 1) % 16, jy % 16, c, 1.25);
    }
  };
}
function blades(ctx, r, c, n) {
  for (let k = 0; k < n; k++) {
    const x = 1 + r() * 14 | 0, h = 6 + r() * 9 | 0, lean = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < h; i++) px(ctx, clamp(x + (i > h * 0.6 ? lean : 0), 0, 15), 15 - i, c, 0.75 + i / h * 0.45);
  }
}
function flower(petal, center) {
  return function (ctx, r) {
    const stem = [70, 140, 45];
    for (let y = 8; y < 16; y++) px(ctx, 7, y, stem);
    px(ctx, 6, 12, stem, 1.1); px(ctx, 5, 11, stem, 1.1); px(ctx, 8, 10, stem, 1.1); px(ctx, 9, 9, stem, 1.1);
    for (let y = 4; y < 8; y++) for (let x = 5; x < 10; x++) {
      if ((x === 5 || x === 9) && (y === 4 || y === 7)) continue;
      px(ctx, x, y, petal, 0.85 + r() * 0.3);
    }
    px(ctx, 7, 3, petal); px(ctx, 7, 5, center); px(ctx, 7, 6, center, 0.9);
  };
}
function tulip(petal) {
  return function (ctx, r) {
    const stem = [70, 140, 45];
    for (let y = 7; y < 16; y++) px(ctx, 7, y, stem);
    px(ctx, 6, 12, stem, 1.1); px(ctx, 5, 11, stem, 1.1); px(ctx, 8, 13, stem, 1.1); px(ctx, 9, 12, stem, 1.1);
    rect(ctx, 6, 3, 8, 6, petal);
    px(ctx, 5, 2, petal); px(ctx, 7, 2, petal, 1.1); px(ctx, 9, 2, petal); px(ctx, 7, 4, petal, 0.8);
  };
}
function sapling(leafC, trunkC) {
  return function (ctx, r) {
    for (let y = 9; y < 16; y++) px(ctx, 7, y, trunkC);
    px(ctx, 8, 12, trunkC); px(ctx, 6, 11, trunkC);
    for (let y = 1; y < 11; y++) for (let x = 2; x < 14; x++) {
      if (Math.hypot(x - 7.5, y - 5.5) < 4.8 && r() < 0.82) px(ctx, x, y, leafC, 0.7 + r() * 0.55);
    }
  };
}
function doorPainter(c, upper, windows) {
  return function (ctx, r) {
    for (let x = 0; x < TILE; x++) {
      const f = 0.9 + r() * 0.2;
      for (let y = 0; y < TILE; y++) {
        let g = f * (1 + (r() - 0.5) * 0.08);
        if (x === 0 || x === 15) g = 0.68;
        else if (x === 1 || x === 14) g = 0.85;
        if ((upper && y === 0) || (!upper && y === 15)) g = 0.68;
        if (!upper && (y === 6 || y === 7)) g = 0.8;
        px(ctx, x, y, c, g);
      }
    }
    if (upper && windows) { for (const wx of [3, 9]) ctx.clearRect(wx, 3, 4, 5); }
    if (!upper) { px(ctx, 12, 1, [70, 70, 70]); px(ctx, 12, 2, [70, 70, 70]); }
  };
}
function trapdoorPainter(c, holes) {
  return function (ctx, r) {
    planks(ctx, r, c);
    for (let i = 0; i < TILE; i++) { px(ctx, i, 0, c, 0.65); px(ctx, i, 15, c, 0.65); px(ctx, 0, i, c, 0.65); px(ctx, 15, i, c, 0.65); }
    if (holes) for (const hx of [3, 9]) for (const hy of [3, 9]) ctx.clearRect(hx, hy, 4, 4);
  };
}
function strippedSide(c) {
  return function (ctx, r) {
    for (let x = 0; x < TILE; x++) {
      const f = 0.9 + r() * 0.18;
      for (let y = 0; y < TILE; y++) px(ctx, x, y, c, f * (x % 5 === 2 ? 0.9 : 1) * (1 + (r() - 0.5) * 0.06));
    }
  };
}
// Tiny 4-row pixel font for the TNT label.
const GLYPHS = { T: ['111', '010', '010', '010'], N: ['1001', '1101', '1011', '1001'] };
function glyph(ctx, ch, x0, y0, c) {
  GLYPHS[ch].forEach(function (row, y) {
    for (let x = 0; x < row.length; x++) if (row[x] === '1') px(ctx, x0 + x, y0 + y, c);
  });
}

// ---------- texture painters, keyed by tile name ----------
const DIRT = [134, 96, 67], GRASS = [96, 160, 56];
const PAINTERS = {
  grass_top(ctx, r) { noiseFill(ctx, r, GRASS, 0.3); specks(ctx, r, [72, 128, 42], 30); specks(ctx, r, [120, 186, 70], 10); },
  grass_side(ctx, r) {
    PAINTERS.dirt(ctx, r);
    for (let x = 0; x < TILE; x++) {
      const h = 2 + (r() * 3 | 0);
      for (let y = 0; y < h; y++) px(ctx, x, y, GRASS, 0.85 + r() * 0.3);
      if (r() < 0.3) px(ctx, x, h, GRASS, 0.75);
    }
  },
  dirt(ctx, r) { noiseFill(ctx, r, DIRT, 0.3); specks(ctx, r, [96, 68, 46], 20); specks(ctx, r, [168, 128, 92], 12); },
  stone: stonePaint,
  cobblestone(ctx, r) { voronoi(ctx, r, 9, function (i, r) { const g = 115 + r() * 40; return [g, g, g + 2]; }, [68, 68, 70], 1.1); },
  mossy_cobblestone(ctx, r) {
    PAINTERS.cobblestone(ctx, r);
    for (let b = 0; b < 5; b++) {
      const cx = r() * 16, cy = r() * 16, rad = 2 + r() * 2;
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++)
        if (Math.hypot(x - cx, y - cy) < rad && r() < 0.75) px(ctx, x, y, [78, 122, 48], 0.8 + r() * 0.4);
    }
  },
  stone_bricks(ctx, r) {
    noiseFill(ctx, r, [124, 124, 124], 0.12);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const row = y >> 3;
      if (y % 8 === 7 || (x + row * 8) % 16 === 15) px(ctx, x, y, [84, 84, 84]);
      else if (y % 8 === 0) px(ctx, x, y, [146, 146, 146]);
    }
  },
  bricks(ctx, r) {
    const shades = [];
    for (let i = 0; i < 16; i++) shades.push(0.85 + r() * 0.3);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const row = y >> 2, off = (row % 2) * 4;
      if (y % 4 === 3 || (x + off) % 8 === 7) px(ctx, x, y, [182, 170, 158], 1 + (r() - 0.5) * 0.1);
      else px(ctx, x, y, [150, 70, 54], shades[row * 2 + ((x + off) >> 3) % 2] * (1 + (r() - 0.5) * 0.1));
    }
  },
  sand(ctx, r) { noiseFill(ctx, r, [220, 208, 160], 0.1); specks(ctx, r, [190, 174, 126], 25); specks(ctx, r, [238, 228, 192], 10); },
  red_sand(ctx, r) { noiseFill(ctx, r, [190, 104, 40], 0.12); specks(ctx, r, [160, 84, 30], 25); specks(ctx, r, [214, 130, 60], 10); },
  sandstone_side(ctx, r) {
    noiseFill(ctx, r, [216, 202, 152], 0.08);
    for (let x = 0; x < TILE; x++) {
      px(ctx, x, 3, [180, 164, 118]); px(ctx, x, 12, [180, 164, 118]);
      for (let y = 0; y < 3; y++) px(ctx, x, y, [228, 216, 170], 1 + (r() - 0.5) * 0.05);
    }
  },
  sandstone_top(ctx, r) { noiseFill(ctx, r, [222, 208, 160], 0.06); },
  gravel(ctx, r) {
    const cols = [[132, 126, 122], [104, 98, 96], [152, 142, 132], [116, 102, 92]];
    voronoi(ctx, r, 18, function (i, r) { return cols[r() * 4 | 0]; }, [86, 80, 78], 0.7);
  },
  clay(ctx, r) { noiseFill(ctx, r, [160, 166, 180], 0.07); specks(ctx, r, [138, 144, 158], 12); },
  terracotta(ctx, r) { noiseFill(ctx, r, [152, 94, 68], 0.07); },
  snow(ctx, r) { noiseFill(ctx, r, [242, 246, 252], 0.05); },
  ice(ctx, r) {
    noiseFill(ctx, r, [146, 186, 240], 0.08);
    for (let k = 0; k < 3; k++) {
      let x = r() * 16 | 0, y = r() * 16 | 0;
      for (let i = 0; i < 6; i++) { px(ctx, x & 15, y & 15, [220, 236, 255]); x += r() < 0.5 ? 1 : 0; y += 1; }
    }
  },
  cactus_side(ctx, r) {
    noiseFill(ctx, r, [86, 140, 44], 0.1);
    for (let y = 0; y < TILE; y++) {
      px(ctx, 0, y, [60, 104, 30]); px(ctx, 15, y, [60, 104, 30]);
      for (const x of [3, 7, 11]) px(ctx, x, y, [110, 170, 60]);
    }
    for (let i = 0; i < 12; i++) px(ctx, [2, 6, 10, 13][r() * 4 | 0], r() * 16 | 0, [232, 230, 190]);
  },
  cactus_top(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      px(ctx, x, y, [96, 150, 50], (d >= 7 ? 0.7 : d < 2 ? 1.2 : 1) * (1 + (r() - 0.5) * 0.08));
    }
  },
  water(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++)
      px(ctx, x, y, [48, 98, 212], 1 + Math.sin((x + y * 2) * 0.8) * 0.08 + (r() - 0.5) * 0.06, 0.78);
    for (let k = 0; k < 5; k++) {
      const x = r() * 13 | 0, y = r() * 16 | 0;
      for (let i = 0; i < 3; i++) px(ctx, x + i, y, [130, 180, 245], 1, 0.82);
    }
  },
  lava(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++)
      px(ctx, x, y, [226, 92, 18], 1 + Math.sin((x * 2 + y) * 0.7) * 0.12 + (r() - 0.5) * 0.15);
    for (let k = 0; k < 7; k++) { const x = r() * 14 | 0, y = r() * 16 | 0; px(ctx, x, y, [255, 210, 70]); px(ctx, x + 1, y, [255, 180, 50]); }
  },
  fire(ctx, r) {
    for (let x = 0; x < TILE; x++) {
      const h = 6 + r() * 9 | 0;
      for (let i = 0; i < h; i++) {
        const t = i / h;
        px(ctx, x, 15 - i, t < 0.35 ? [255, 236, 120] : t < 0.7 ? [250, 160, 40] : [210, 70, 20], 0.9 + r() * 0.2);
      }
    }
  },
  glass(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++)
      if (x === 0 || y === 0 || x === 15 || y === 15) px(ctx, x, y, [206, 234, 244]);
    for (const p of [[3, 5], [4, 4], [5, 3], [3, 7], [4, 6], [5, 5], [6, 4], [7, 3], [10, 12], [11, 11], [12, 10]]) px(ctx, p[0], p[1], [250, 255, 255]);
  },
  coal_ore: ore([38, 38, 38]),
  iron_ore: ore([216, 176, 146]),
  gold_ore: ore([250, 218, 60]),
  diamond_ore: ore([92, 230, 222]),
  emerald_ore: ore([40, 204, 96]),
  redstone_ore: ore([222, 24, 20]),
  lapis_ore: ore([34, 66, 184]),
  copper_ore: ore([212, 120, 76]),
  bedrock(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const g = 50 + r() * 100; px(ctx, x, y, [g, g, g]); }
  },
  obsidian(ctx, r) { noiseFill(ctx, r, [28, 20, 42], 0.5); specks(ctx, r, [76, 50, 116], 14, 0.3); },
  crying_obsidian(ctx, r) {
    PAINTERS.obsidian(ctx, r);
    for (let k = 0; k < 6; k++) { const x = r() * 15 | 0, y = r() * 13 | 0; px(ctx, x, y, [150, 60, 230]); px(ctx, x, y + 1, [120, 40, 210]); px(ctx, x, y + 2, [90, 30, 170]); }
  },
  granite(ctx, r) { noiseFill(ctx, r, [154, 108, 90], 0.15); specks(ctx, r, [192, 142, 122], 20); specks(ctx, r, [110, 70, 60], 15); },
  diorite(ctx, r) { noiseFill(ctx, r, [196, 196, 196], 0.08); specks(ctx, r, [118, 118, 122], 26); specks(ctx, r, [238, 238, 238], 10); },
  andesite(ctx, r) { noiseFill(ctx, r, [136, 136, 138], 0.12); specks(ctx, r, [108, 108, 110], 25); specks(ctx, r, [162, 162, 164], 15); },
  bookshelf(ctx, r) {
    planks(ctx, r, [164, 132, 80]);
    const bookCols = [[150, 40, 36], [40, 70, 140], [60, 120, 50], [180, 150, 60], [110, 50, 120], [200, 200, 190], [90, 60, 40]];
    for (const bottom of [6, 14]) {
      for (let y = bottom - 5; y <= bottom; y++) for (let x = 1; x < 15; x++) px(ctx, x, y, [60, 40, 22]);
      let x = 1;
      while (x < 15) {
        const w = r() < 0.6 ? 1 : 2, h = 4 + (r() * 2 | 0), c = bookCols[r() * bookCols.length | 0];
        for (let i = 0; i < w && x + i < 15; i++) for (let y = bottom - h + 1; y <= bottom; y++) px(ctx, x + i, y, c, y === bottom - h + 1 ? 1.25 : 1);
        x += w;
      }
    }
  },
  crafting_top(ctx, r) {
    planks(ctx, r, [172, 136, 86]);
    for (let i = 0; i < TILE; i++) {
      px(ctx, i, 0, [100, 72, 40]); px(ctx, i, 15, [100, 72, 40]); px(ctx, 0, i, [100, 72, 40]); px(ctx, 15, i, [100, 72, 40]);
      px(ctx, 5, i, [120, 88, 50]); px(ctx, 10, i, [120, 88, 50]); px(ctx, i, 5, [120, 88, 50]); px(ctx, i, 10, [120, 88, 50]);
    }
  },
  crafting_side(ctx, r) {
    planks(ctx, r, [150, 116, 70]);
    for (let x = 0; x < TILE; x++) { px(ctx, x, 0, [100, 72, 40]); px(ctx, x, 1, [172, 136, 86]); }
    for (let x = 2; x < 8; x++) { px(ctx, x, 4, [190, 190, 196]); px(ctx, x, 5, [150, 150, 156]); if (x % 2) px(ctx, x, 6, [120, 120, 126]); }
    px(ctx, 1, 4, [110, 70, 40]); px(ctx, 1, 5, [110, 70, 40]);
    for (let y = 5; y < 14; y++) px(ctx, 11, y, [110, 70, 40]);
    for (let x = 9; x < 14; x++) { px(ctx, x, 3, [170, 170, 176]); px(ctx, x, 4, [130, 130, 136]); }
  },
  furnace_side(ctx, r) {
    noiseFill(ctx, r, [118, 118, 118], 0.12);
    for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [90, 90, 90]); px(ctx, i, 15, [90, 90, 90]); }
  },
  furnace_top(ctx, r) { noiseFill(ctx, r, [130, 130, 130], 0.08); },
  furnace_front(ctx, r) {
    PAINTERS.furnace_side(ctx, r);
    for (let x = 3; x < 13; x++) { px(ctx, x, 3, [70, 70, 70]); px(ctx, x, 5, [70, 70, 70]); }
    for (let y = 8; y < 14; y++) for (let x = 3; x < 13; x++) px(ctx, x, y, [28, 26, 26]);
    for (let x = 4; x < 12; x++) { px(ctx, x, 12, r() < 0.5 ? [246, 150, 40] : [252, 210, 70]); if (r() < 0.5) px(ctx, x, 11, [230, 100, 30]); }
  },
  smoker_front(ctx, r) {
    PAINTERS.furnace_front(ctx, r);
    for (let x = 0; x < TILE; x++) for (const y of [0, 1, 15]) px(ctx, x, y, [88, 62, 36]);
  },
  smoker_side(ctx, r) {
    noiseFill(ctx, r, [110, 106, 100], 0.1);
    for (let x = 0; x < TILE; x++) for (const y of [0, 1, 2, 13, 14, 15]) px(ctx, x, y, [96, 70, 40], 1 + (r() - 0.5) * 0.15);
  },
  blast_front(ctx, r) {
    noiseFill(ctx, r, [92, 92, 96], 0.1);
    for (let y = 7; y < 14; y++) for (let x = 3; x < 13; x++) px(ctx, x, y, x % 2 ? [40, 40, 44] : [150, 150, 156]);
    for (let x = 0; x < TILE; x++) { px(ctx, x, 0, [170, 170, 176]); px(ctx, x, 15, [60, 60, 64]); }
  },
  blast_side(ctx, r) { tiles([110, 110, 116], 8)(ctx, r); },
  pumpkin_side(ctx, r) {
    noiseFill(ctx, r, [216, 128, 30], 0.08);
    for (let y = 0; y < TILE; y++) for (const x of [0, 4, 8, 12]) { px(ctx, x, y, [170, 96, 20]); px(ctx, x + 1, y, [232, 150, 50]); }
  },
  pumpkin_top(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      px(ctx, x, y, [204, 120, 28], (d % 3 < 1 ? 0.85 : 1) * (1 + (r() - 0.5) * 0.08));
    }
    for (const p of [[7, 7], [8, 7], [7, 8], [8, 8], [9, 6]]) px(ctx, p[0], p[1], [92, 72, 32]);
  },
  jack_front(ctx, r) {
    PAINTERS.pumpkin_side(ctx, r);
    const glow = [255, 214, 80];
    const face = [
      [3, 4], [4, 4], [5, 4], [3, 5], [4, 5], [4, 6],
      [10, 4], [11, 4], [12, 4], [11, 5], [12, 5], [11, 6],
      [3, 9], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10], [12, 9],
      [5, 11], [6, 11], [8, 11], [9, 11], [10, 11], [6, 9], [9, 9]
    ];
    for (const p of face) px(ctx, p[0], p[1], glow, 0.9 + r() * 0.2);
  },
  melon_side(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++)
      px(ctx, x, y, x % 4 < 2 ? [74, 122, 30] : [118, 166, 44], 1 + (r() - 0.5) * 0.12);
  },
  melon_top(ctx, r) {
    noiseFill(ctx, r, [120, 166, 46], 0.1);
    for (let i = 0; i < 8; i++) { px(ctx, 7, i * 2, [80, 126, 32]); px(ctx, i * 2, 7, [80, 126, 32]); }
    px(ctx, 7, 7, [90, 70, 32]);
  },
  hay_side(ctx, r) {
    for (let x = 0; x < TILE; x++) {
      const f = 0.85 + r() * 0.3;
      for (let y = 0; y < TILE; y++) px(ctx, x, y, [198, 166, 44], f * (1 + (r() - 0.5) * 0.1));
    }
    for (let x = 0; x < TILE; x++) for (const y of [3, 4, 11, 12]) px(ctx, x, y, [146, 42, 30], 1 + (r() - 0.5) * 0.1);
  },
  hay_top(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      px(ctx, x, y, [204, 172, 52], (Math.floor(d) % 2 ? 0.86 : 1) * (1 + (r() - 0.5) * 0.12));
    }
  },
  tnt_side(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (y >= 5 && y <= 10) px(ctx, x, y, [236, 236, 230]);
      else px(ctx, x, y, [204, 44, 32], x % 4 === 3 ? 0.75 : 1 + (r() - 0.5) * 0.1);
    }
    glyph(ctx, 'T', 1, 6, [30, 30, 30]); glyph(ctx, 'N', 5, 6, [30, 30, 30]); glyph(ctx, 'T', 11, 6, [30, 30, 30]);
  },
  tnt_top(ctx, r) {
    noiseFill(ctx, r, [204, 52, 40], 0.1);
    for (const p of [[7, 7], [8, 7], [7, 8], [8, 8]]) px(ctx, p[0], p[1], [60, 60, 60]);
    px(ctx, 8, 6, [90, 90, 90]);
  },
  iron_block: metal([222, 222, 222]),
  gold_block: metal([250, 212, 64]),
  diamond_block: metal([104, 228, 222]),
  emerald_block: metal([62, 204, 104]),
  copper_block: metal([196, 110, 80]),
  netherite_block: metal([70, 64, 66]),
  coal_block(ctx, r) { noiseFill(ctx, r, [36, 36, 38], 0.3); },
  lapis_block(ctx, r) { noiseFill(ctx, r, [38, 66, 172], 0.15); specks(ctx, r, [80, 120, 220], 18); },
  redstone_block(ctx, r) {
    noiseFill(ctx, r, [176, 26, 18], 0.15);
    for (let i = 0; i < TILE; i++) { px(ctx, i, 7, [120, 14, 10]); px(ctx, 7, i, [120, 14, 10]); }
  },
  glowstone(ctx, r) {
    const cols = [[232, 190, 92], [252, 222, 132], [204, 152, 72], [255, 236, 170]];
    voronoi(ctx, r, 10, function (i, r) { return cols[r() * 4 | 0]; }, [142, 100, 52], 0.9);
  },
  sea_lantern(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const light = d < 2 || (d > 4 && d < 6);
      px(ctx, x, y, light ? [226, 244, 236] : [168, 200, 192], 1 + (r() - 0.5) * 0.06);
    }
  },
  prismarine(ctx, r) { noiseFill(ctx, r, [96, 158, 150], 0.15); specks(ctx, r, [70, 120, 120], 18); specks(ctx, r, [132, 192, 182], 14); },
  sponge(ctx, r) {
    noiseFill(ctx, r, [202, 192, 72], 0.1);
    for (let i = 0; i < 16; i++) { const x = r() * 15 | 0, y = r() * 15 | 0; px(ctx, x, y, [126, 116, 32]); px(ctx, x + 1, y, [160, 150, 46]); }
  },
  coral_red: coral([206, 60, 70]),
  coral_blue: coral([52, 92, 214]),
  coral_yellow: coral([226, 200, 60]),
  quartz(ctx, r) { noiseFill(ctx, r, [236, 230, 222], 0.035); },
  moss_block(ctx, r) { noiseFill(ctx, r, [90, 122, 46], 0.25); specks(ctx, r, [112, 146, 60], 16); },
  tall_grass(ctx, r) { blades(ctx, r, [80, 150, 50], 10); },
  fern(ctx, r) {
    for (const s of [-1, 1]) for (let i = 0; i < 12; i++) {
      const x = 7 + s * Math.round(i * 0.4), y = 15 - i;
      px(ctx, x, y, [70, 130, 50], 0.8 + i * 0.03);
      if (i % 2 === 0) { px(ctx, x + s, y, [80, 146, 56]); px(ctx, x + 2 * s, y - 1, [90, 160, 60]); }
    }
  },
  poppy: flower([214, 30, 30], [50, 20, 20]),
  dandelion: flower([250, 220, 40], [240, 170, 20]),
  cornflower: flower([72, 110, 232], [40, 60, 160]),
  allium: flower([186, 110, 230], [150, 70, 200]),
  azure_bluet: flower([226, 230, 240], [240, 210, 80]),
  oxeye_daisy: flower([244, 244, 240], [236, 196, 40]),
  lily_of_the_valley: flower([248, 248, 248], [220, 230, 220]),
  blue_orchid: flower([60, 170, 230], [30, 120, 200]),
  red_tulip: tulip([220, 40, 36]),
  orange_tulip: tulip([240, 130, 30]),
  white_tulip: tulip([240, 240, 236]),
  pink_tulip: tulip([240, 160, 200]),
  dead_bush(ctx, r) {
    const c = [122, 88, 42];
    const pts = [[7, 15], [7, 14], [7, 13], [6, 12], [5, 11], [4, 10], [3, 9], [8, 12], [9, 11], [10, 10], [11, 9], [12, 8], [7, 12], [7, 11], [7, 10], [7, 9], [6, 8], [8, 8], [5, 7], [9, 7], [3, 8], [12, 7], [10, 9], [4, 11]];
    for (const p of pts) px(ctx, p[0], p[1], c, 0.85 + r() * 0.3);
  },
  seagrass(ctx, r) { blades(ctx, r, [52, 140, 76], 8); },
  kelp(ctx, r) {
    for (let y = 0; y < TILE; y++) {
      const x = 7 + Math.round(Math.sin(y * 0.7) * 1.5);
      px(ctx, x, y, [64, 112, 40]); px(ctx, x + 1, y, [84, 140, 52]);
      if (y % 4 === 1) { px(ctx, x - 1, y, [96, 150, 60]); px(ctx, x - 2, y + 1, [96, 150, 60]); }
      if (y % 4 === 3) { px(ctx, x + 2, y, [96, 150, 60]); px(ctx, x + 3, y + 1, [96, 150, 60]); }
    }
  },
  sugar_cane(ctx, r) {
    for (const x0 of [3, 8, 12]) for (let y = 0; y < TILE; y++) {
      const joint = (y + x0) % 5 === 0;
      px(ctx, x0, y, [130, 190, 90], joint ? 0.7 : 1); px(ctx, x0 + 1, y, [110, 170, 74], joint ? 0.7 : 1);
      if (joint && y > 1) px(ctx, x0 + 2, y - 1, [120, 180, 70]);
    }
  },
  cobweb(ctx, r) {
    const c = [236, 236, 236];
    for (let i = 0; i < TILE; i++) { px(ctx, i, i, c); px(ctx, 15 - i, i, c); px(ctx, 7, i, c); px(ctx, i, 7, c); }
    for (const rad of [3, 6]) for (let a = 0; a < 32; a++) {
      const t = a / 32 * Math.PI * 2;
      px(ctx, Math.round(7.5 + Math.cos(t) * rad), Math.round(7.5 + Math.sin(t) * rad), c, 0.9);
    }
  },
  red_mushroom(ctx, r) {
    for (let y = 10; y < 16; y++) { px(ctx, 7, y, [224, 218, 202]); px(ctx, 8, y, [200, 194, 178]); }
    for (let x = 4; x < 12; x++) for (let y = 7; y < 10; y++) px(ctx, x, y, [204, 32, 30]);
    for (let x = 5; x < 11; x++) px(ctx, x, 6, [214, 40, 36]);
    for (const p of [[5, 8], [8, 7], [10, 8], [7, 6]]) px(ctx, p[0], p[1], [250, 250, 250]);
  },
  brown_mushroom(ctx, r) {
    for (let y = 10; y < 16; y++) { px(ctx, 7, y, [224, 218, 202]); px(ctx, 8, y, [200, 194, 178]); }
    for (let x = 3; x < 13; x++) for (let y = 8; y < 10; y++) px(ctx, x, y, [150, 110, 80], 1 + (r() - 0.5) * 0.15);
    for (let x = 5; x < 11; x++) px(ctx, x, 7, [164, 124, 92]);
  },

  // --- soils ---
  podzol_top(ctx, r) { noiseFill(ctx, r, [106, 72, 36], 0.3); specks(ctx, r, [150, 104, 50], 30); },
  podzol_side(ctx, r) { PAINTERS.dirt(ctx, r); for (let x = 0; x < TILE; x++) { const h = 2 + (r() * 2 | 0); for (let y = 0; y < h; y++) px(ctx, x, y, [106, 72, 36], 0.9 + r() * 0.2); } },
  mycelium_top(ctx, r) { noiseFill(ctx, r, [112, 98, 110], 0.25); specks(ctx, r, [150, 136, 150], 20); },
  mycelium_side(ctx, r) { PAINTERS.dirt(ctx, r); for (let x = 0; x < TILE; x++) { const h = 2 + (r() * 2 | 0); for (let y = 0; y < h; y++) px(ctx, x, y, [112, 98, 110], 0.9 + r() * 0.2); } },
  coarse_dirt(ctx, r) { PAINTERS.dirt(ctx, r); specks(ctx, r, [110, 104, 100], 26); specks(ctx, r, [80, 60, 44], 20); },
  rooted_dirt(ctx, r) {
    PAINTERS.dirt(ctx, r);
    for (let k = 0; k < 4; k++) { let x = r() * 16 | 0; for (let y = 0; y < 16; y++) { if (r() < 0.6) px(ctx, x & 15, y, [176, 140, 100]); if (r() < 0.2) x += r() < 0.5 ? 1 : -1; } }
  },
  path_top(ctx, r) { noiseFill(ctx, r, [148, 122, 66], 0.14); specks(ctx, r, [120, 98, 52], 20); },
  path_side(ctx, r) { PAINTERS.dirt(ctx, r); for (let x = 0; x < TILE; x++) { px(ctx, x, 1, [148, 122, 66]); px(ctx, x, 2, [148, 122, 66], 0.9); } },
  mud(ctx, r) { noiseFill(ctx, r, [60, 56, 62], 0.15); specks(ctx, r, [80, 74, 82], 18); },
  packed_mud(ctx, r) { noiseFill(ctx, r, [142, 106, 80], 0.12); specks(ctx, r, [120, 90, 66], 22); },
  mud_bricks: brickPattern([138, 104, 78], [100, 76, 58], 4, 8),
  packed_ice(ctx, r) { noiseFill(ctx, r, [140, 180, 236], 0.06); },
  blue_ice(ctx, r) { noiseFill(ctx, r, [116, 168, 252], 0.08); specks(ctx, r, [180, 210, 255], 14); },
  slime(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15, inner = x > 3 && x < 12 && y > 3 && y < 12;
      px(ctx, x, y, [120, 200, 96], edge ? 0.85 : inner ? 0.95 : 1.1, edge ? 0.95 : inner ? 0.85 : 0.6);
    }
  },
  honey(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      px(ctx, x, y, [236, 160, 40], edge ? 0.85 : 1 + (r() - 0.5) * 0.1, edge ? 0.95 : 0.7);
    }
  },
  magma(ctx, r) {
    noiseFill(ctx, r, [120, 36, 16], 0.2);
    for (let k = 0; k < 4; k++) { let x = r() * 16 | 0, y = r() * 16 | 0; for (let i = 0; i < 7; i++) { px(ctx, x & 15, y & 15, [252, 150, 40]); x += r() < 0.5 ? 1 : 0; y += r() < 0.5 ? 1 : -1; } }
  },
  netherrack(ctx, r) { noiseFill(ctx, r, [112, 52, 52], 0.3); specks(ctx, r, [140, 70, 66], 20); specks(ctx, r, [80, 30, 32], 20); },
  nether_bricks: brickPattern([62, 30, 36], [28, 14, 18], 4, 8),
  red_nether_bricks: brickPattern([110, 20, 22], [60, 8, 10], 4, 8),
  soul_sand(ctx, r) {
    noiseFill(ctx, r, [82, 62, 48], 0.25);
    for (let k = 0; k < 3; k++) { const x = 2 + r() * 10 | 0, y = 2 + r() * 10 | 0; px(ctx, x, y, [40, 28, 22]); px(ctx, x + 2, y, [40, 28, 22]); px(ctx, x + 1, y + 2, [40, 28, 22]); }
  },
  end_stone(ctx, r) { noiseFill(ctx, r, [220, 222, 160], 0.1); specks(ctx, r, [196, 198, 136], 22); },
  end_stone_bricks: brickPattern([226, 228, 170], [190, 192, 130], 8, 16),
  purpur: tiles([168, 124, 168], 8),
  purpur_pillar: pillar([170, 126, 170]),
  quartz_pillar: pillar([236, 230, 222]),
  quartz_bricks: brickPattern([238, 232, 224], [206, 200, 190], 8, 16),
  chiseled_quartz: chiseled([234, 228, 220]),
  prismarine_bricks: brickPattern([100, 170, 150], [70, 120, 110], 8, 16),
  dark_prismarine: tiles([52, 92, 76], 8),
  amethyst(ctx, r) {
    noiseFill(ctx, r, [140, 96, 200], 0.18);
    for (let k = 0; k < 6; k++) { const x = r() * 14 | 0, y = r() * 14 | 0; px(ctx, x, y, [210, 170, 250]); px(ctx, x + 1, y + 1, [180, 130, 230]); }
  },
  smooth_stone(ctx, r) {
    noiseFill(ctx, r, [160, 160, 160], 0.05);
    for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [120, 120, 120]); px(ctx, i, 15, [120, 120, 120]); px(ctx, 0, i, [130, 130, 130]); px(ctx, 15, i, [130, 130, 130]); }
  },
  cracked_stone_bricks(ctx, r) {
    PAINTERS.stone_bricks(ctx, r);
    for (let k = 0; k < 3; k++) { let x = r() * 16 | 0, y = r() * 16 | 0; for (let i = 0; i < 6; i++) { px(ctx, x & 15, y & 15, [70, 70, 70]); x += r() < 0.5 ? 1 : 0; y += 1; } }
  },
  mossy_stone_bricks(ctx, r) {
    PAINTERS.stone_bricks(ctx, r);
    for (let b = 0; b < 4; b++) {
      const cx = r() * 16, cy = r() * 16, rad = 2 + r() * 2;
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (Math.hypot(x - cx, y - cy) < rad && r() < 0.7) px(ctx, x, y, [80, 120, 50], 0.8 + r() * 0.4);
    }
  },
  chiseled_stone_bricks: chiseled([128, 128, 128]),
  cut_sandstone(ctx, r) {
    noiseFill(ctx, r, [218, 204, 154], 0.06);
    for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [184, 168, 120]); px(ctx, i, 7, [184, 168, 120]); px(ctx, i, 8, [230, 218, 172]); px(ctx, i, 15, [184, 168, 120]); }
  },
  chiseled_sandstone(ctx, r) {
    PAINTERS.cut_sandstone(ctx, r);
    for (const p of [[4, 3], [5, 3], [10, 3], [11, 3], [7, 5], [8, 5], [5, 11], [6, 12], [7, 12], [8, 12], [9, 12], [10, 11]]) px(ctx, p[0], p[1], [170, 150, 104]);
  },
  red_sandstone_side(ctx, r) {
    noiseFill(ctx, r, [186, 100, 38], 0.08);
    for (let x = 0; x < TILE; x++) { px(ctx, x, 3, [150, 76, 26]); px(ctx, x, 12, [150, 76, 26]); for (let y = 0; y < 3; y++) px(ctx, x, y, [200, 116, 50]); }
  },
  red_sandstone_top(ctx, r) { noiseFill(ctx, r, [190, 104, 40], 0.06); },
  polished_granite: polished([164, 112, 92]),
  polished_diorite: polished([200, 200, 202]),
  polished_andesite: polished([134, 138, 138]),
  deepslate(ctx, r) {
    noiseFill(ctx, r, [82, 82, 88], 0.16);
    for (let k = 0; k < 8; k++) { const x0 = r() * 12 | 0, y = r() * 16 | 0; for (let i = 0; i < 4; i++) px(ctx, x0 + i, y, [62, 62, 68]); }
  },
  deepslate_top(ctx, r) { rings(ctx, r, [90, 90, 96], [70, 70, 76]); },
  cobbled_deepslate(ctx, r) { voronoi(ctx, r, 10, function (i, r) { const g = 70 + r() * 25; return [g, g, g + 5]; }, [40, 40, 44], 1.0); },
  deepslate_bricks: brickPattern([86, 86, 92], [46, 46, 50], 4, 8),
  deepslate_tiles: tiles([66, 66, 72], 4),
  polished_deepslate: polished([84, 84, 90]),
  tuff(ctx, r) { noiseFill(ctx, r, [108, 110, 102], 0.14); specks(ctx, r, [88, 90, 84], 24); specks(ctx, r, [130, 132, 122], 14); },
  calcite(ctx, r) { noiseFill(ctx, r, [224, 226, 222], 0.05); specks(ctx, r, [200, 202, 200], 16); },
  blackstone(ctx, r) { noiseFill(ctx, r, [44, 38, 44], 0.25); specks(ctx, r, [66, 58, 66], 20); },
  blackstone_bricks: brickPattern([50, 44, 52], [26, 22, 28], 8, 16),
  basalt_side(ctx, r) { for (let x = 0; x < TILE; x++) { const f = 0.8 + r() * 0.4; for (let y = 0; y < TILE; y++) px(ctx, x, y, [80, 80, 86], f * (1 + (r() - 0.5) * 0.1)); } },
  basalt_top(ctx, r) { rings(ctx, r, [92, 92, 98], [70, 70, 76]); },
  nether_quartz_ore: oreOn(function (ctx, r) { PAINTERS.netherrack(ctx, r); }, [236, 230, 220]),
  nether_gold_ore: oreOn(function (ctx, r) { PAINTERS.netherrack(ctx, r); }, [250, 210, 60]),
  raw_iron_block(ctx, r) { noiseFill(ctx, r, [166, 136, 108], 0.2); specks(ctx, r, [216, 190, 160], 20); },
  raw_gold_block(ctx, r) { noiseFill(ctx, r, [222, 168, 44], 0.2); specks(ctx, r, [252, 222, 100], 20); },
  raw_copper_block(ctx, r) { noiseFill(ctx, r, [156, 90, 64], 0.2); specks(ctx, r, [80, 160, 130], 14); },
  ancient_debris_side(ctx, r) { for (let x = 0; x < TILE; x++) for (let y = 0; y < TILE; y++) px(ctx, x, y, [96, 66, 58], (Math.floor((x + y * 0.4) / 2) % 2 ? 0.8 : 1) * (1 + (r() - 0.5) * 0.1)); },
  ancient_debris_top(ctx, r) { rings(ctx, r, [100, 72, 62], [70, 50, 44]); },

  // --- utilities ---
  chest_front(ctx, r) {
    planks(ctx, r, [160, 112, 46]);
    for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [70, 44, 20]); px(ctx, i, 15, [70, 44, 20]); px(ctx, 0, i, [70, 44, 20]); px(ctx, 15, i, [70, 44, 20]); px(ctx, i, 5, [70, 44, 20]); }
    rect(ctx, 7, 3, 8, 7, [200, 200, 200]); px(ctx, 7, 7, [90, 90, 90]); px(ctx, 8, 7, [90, 90, 90]);
  },
  chest_side(ctx, r) {
    planks(ctx, r, [160, 112, 46]);
    for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [70, 44, 20]); px(ctx, i, 15, [70, 44, 20]); px(ctx, 0, i, [70, 44, 20]); px(ctx, 15, i, [70, 44, 20]); px(ctx, i, 5, [70, 44, 20]); }
  },
  chest_top(ctx, r) {
    planks(ctx, r, [166, 118, 50]);
    for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [70, 44, 20]); px(ctx, i, 15, [70, 44, 20]); px(ctx, 0, i, [70, 44, 20]); px(ctx, 15, i, [70, 44, 20]); }
  },
  barrel_side(ctx, r) {
    for (let x = 0; x < TILE; x++) { const f = x % 4 === 3 ? 0.7 : 0.9 + r() * 0.2; for (let y = 0; y < TILE; y++) px(ctx, x, y, [132, 94, 52], f * (1 + (r() - 0.5) * 0.06)); }
    for (let x = 0; x < TILE; x++) for (const y of [2, 13]) px(ctx, x, y, [80, 80, 84]);
  },
  barrel_top(ctx, r) {
    rings(ctx, r, [150, 108, 60], [90, 64, 34]);
    rect(ctx, 6, 6, 9, 9, [50, 34, 18]);
  },
  anvil_top(ctx, r) { noiseFill(ctx, r, [70, 70, 72], 0.12); for (let i = 2; i < 14; i++) { px(ctx, i, 2, [96, 96, 98]); px(ctx, i, 13, [50, 50, 52]); } },
  anvil_side(ctx, r) { noiseFill(ctx, r, [64, 64, 66], 0.1); for (let i = 0; i < TILE; i++) px(ctx, i, 0, [96, 96, 98]); },
  enchanting_top(ctx, r) {
    noiseFill(ctx, r, [150, 30, 36], 0.12);
    for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [40, 30, 60]); px(ctx, i, 15, [40, 30, 60]); px(ctx, 0, i, [40, 30, 60]); px(ctx, 15, i, [40, 30, 60]); }
    for (let i = 0; i < 6; i++) { px(ctx, 7 - i, 2 + i, [60, 220, 200]); px(ctx, 8 + i, 2 + i, [60, 220, 200]); px(ctx, 7 - i, 13 - i, [60, 220, 200]); px(ctx, 8 + i, 13 - i, [60, 220, 200]); }
  },
  enchanting_side(ctx, r) {
    noiseFill(ctx, r, [28, 20, 42], 0.4);
    for (let x = 0; x < TILE; x++) { for (let y = 4; y < 7; y++) px(ctx, x, y, [150, 30, 36], 1 + (r() - 0.5) * 0.15); px(ctx, x, 7, [200, 170, 60]); }
  },
  ladder(ctx, r) {
    const c = [150, 112, 64];
    for (let y = 0; y < TILE; y++) { px(ctx, 2, y, c, 0.85); px(ctx, 3, y, c); px(ctx, 12, y, c, 0.85); px(ctx, 13, y, c); }
    for (const y of [1, 5, 9, 13]) for (let x = 4; x < 12; x++) { px(ctx, x, y, c, 1.05); px(ctx, x, y + 1, c, 0.8); }
  },
  torch(ctx, r) {
    for (let y = 8; y < 16; y++) { px(ctx, 7, y, [120, 86, 44]); px(ctx, 8, y, [100, 72, 36]); }
    px(ctx, 7, 6, [255, 240, 140]); px(ctx, 8, 6, [255, 210, 80]); px(ctx, 7, 7, [250, 170, 40]); px(ctx, 8, 7, [240, 140, 30]);
  },
  torch_top(ctx, r) { px(ctx, 7, 7, [255, 236, 130]); px(ctx, 8, 7, [255, 210, 80]); px(ctx, 7, 8, [255, 210, 80]); px(ctx, 8, 8, [250, 180, 50]); },
  lantern(ctx, r) {
    rect(ctx, 5, 9, 10, 15, [48, 50, 60]);
    rect(ctx, 6, 10, 9, 14, [255, 204, 96]);
    rect(ctx, 6, 7, 9, 8, [40, 42, 50]);
    px(ctx, 7, 12, [255, 240, 170]); px(ctx, 8, 11, [255, 240, 170]);
  },
  lantern_top(ctx, r) { rect(ctx, 5, 5, 10, 10, [48, 50, 60]); rect(ctx, 6, 6, 9, 9, [70, 72, 82]); },
  iron_door_top(ctx, r) {
    noiseFill(ctx, r, [196, 196, 200], 0.06);
    for (let i = 0; i < TILE; i++) { px(ctx, 0, i, [130, 130, 136]); px(ctx, 15, i, [130, 130, 136]); px(ctx, i, 0, [130, 130, 136]); }
    ctx.clearRect(3, 3, 4, 5); ctx.clearRect(9, 3, 4, 5);
  },
  iron_door_bottom(ctx, r) {
    noiseFill(ctx, r, [196, 196, 200], 0.06);
    for (let i = 0; i < TILE; i++) { px(ctx, 0, i, [130, 130, 136]); px(ctx, 15, i, [130, 130, 136]); px(ctx, i, 15, [130, 130, 136]); px(ctx, i, 7, [150, 150, 156]); }
    px(ctx, 12, 2, [90, 90, 96]);
  },
  iron_trapdoor(ctx, r) {
    noiseFill(ctx, r, [196, 196, 200], 0.06);
    for (const hx of [3, 9]) for (const hy of [3, 9]) ctx.clearRect(hx, hy, 4, 4);
  },
  iron_bars(ctx, r) {
    for (const x of [1, 5, 10, 14]) for (let y = 0; y < TILE; y++) { px(ctx, x, y, [120, 120, 124]); px(ctx, x + 1, y, [80, 80, 84]); }
    for (let x = 0; x < TILE; x++) { px(ctx, x, 0, [110, 110, 114]); px(ctx, x, 15, [80, 80, 84]); }
  },
  jukebox_side(ctx, r) { planks(ctx, r, [120, 80, 56]); for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [70, 46, 30]); px(ctx, i, 15, [70, 46, 30]); px(ctx, 0, i, [70, 46, 30]); px(ctx, 15, i, [70, 46, 30]); } },
  jukebox_top(ctx, r) { PAINTERS.jukebox_side(ctx, r); rect(ctx, 3, 6, 12, 9, [30, 22, 18]); rect(ctx, 4, 7, 11, 8, [12, 10, 10]); },
  note_block(ctx, r) {
    PAINTERS.jukebox_side(ctx, r);
    for (let y = 3; y < 13; y += 2) for (let x = 3; x < 13; x += 2) px(ctx, x, y, [50, 34, 22]);
  },
  smithing_top(ctx, r) { noiseFill(ctx, r, [56, 58, 66], 0.12); for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [96, 98, 108]); px(ctx, i, 15, [30, 32, 38]); } },
  smithing_side(ctx, r) {
    planks(ctx, r, [70, 46, 30]);
    for (let x = 0; x < TILE; x++) for (const y of [0, 1, 2]) px(ctx, x, y, [56, 58, 66]);
    rect(ctx, 4, 6, 11, 8, [180, 180, 186]);
  },
  cartography_top(ctx, r) {
    noiseFill(ctx, r, [214, 196, 150], 0.06);
    for (let k = 0; k < 4; k++) rect(ctx, 2 + k * 3, 3 + (k % 2) * 4, 3 + k * 3, 6 + (k % 2) * 4, [90, 140, 200]);
    for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [110, 76, 46]); px(ctx, i, 15, [110, 76, 46]); px(ctx, 0, i, [110, 76, 46]); px(ctx, 15, i, [110, 76, 46]); }
  },
  cartography_side(ctx, r) { planks(ctx, r, [92, 64, 40]); rect(ctx, 3, 4, 12, 9, [214, 196, 150]); },
  fletching_top(ctx, r) { planks(ctx, r, [200, 182, 128]); rect(ctx, 6, 2, 9, 13, [232, 232, 232]); },
  fletching_side(ctx, r) { planks(ctx, r, [200, 182, 128]); for (let i = 3; i < 13; i++) px(ctx, i, i, [120, 86, 44]); px(ctx, 12, 3, [240, 240, 240]); px(ctx, 13, 2, [240, 240, 240]); },
  loom_top(ctx, r) { planks(ctx, r, [172, 140, 96]); for (let x = 2; x < 14; x++) px(ctx, x, 7, [220, 220, 220]); },
  loom_side(ctx, r) { planks(ctx, r, [172, 140, 96]); for (let y = 3; y < 13; y++) for (const x of [4, 7, 10]) px(ctx, x, y, [236, 236, 236]); },
  composter_side(ctx, r) { planks(ctx, r, [136, 96, 52]); for (let i = 0; i < TILE; i++) { px(ctx, 0, i, [90, 60, 30]); px(ctx, 15, i, [90, 60, 30]); px(ctx, i, 0, [90, 60, 30]); } },
  composter_top(ctx, r) { noiseFill(ctx, r, [80, 110, 40], 0.3); for (let i = 0; i < TILE; i++) { px(ctx, 0, i, [136, 96, 52]); px(ctx, 15, i, [136, 96, 52]); px(ctx, i, 0, [136, 96, 52]); px(ctx, i, 15, [136, 96, 52]); } },
  bed_top(ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (y < 5) px(ctx, x, y, [236, 236, 236], 1 + (r() - 0.5) * 0.05);
      else px(ctx, x, y, [176, 34, 34], (x === 0 || x === 15 ? 0.8 : 1) * (1 + (r() - 0.5) * 0.08));
    }
  },
  bed_side(ctx, r) {
    for (let y = 7; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (y < 11) px(ctx, x, y, [176, 34, 34], 1 + (r() - 0.5) * 0.08);
      else if (y < 13) px(ctx, x, y, [150, 112, 64]);
      else if (x < 3 || x > 12) px(ctx, x, y, [120, 88, 50]);
    }
  },
  bed_bottom(ctx, r) { planks(ctx, r, [150, 112, 64]); }
};

// 67
// ---------- colour and wood families ----------
const WOOL_COLORS = [
  ['white', 'White', [234, 236, 236]], ['light_gray', 'Light Gray', [142, 142, 134]], ['gray', 'Gray', [62, 68, 72]],
  ['black', 'Black', [22, 22, 26]], ['brown', 'Brown', [114, 72, 40]], ['red', 'Red', [160, 38, 34]],
  ['orange', 'Orange', [240, 118, 20]], ['yellow', 'Yellow', [248, 198, 40]], ['lime', 'Lime', [112, 186, 26]],
  ['green', 'Green', [84, 110, 28]], ['cyan', 'Cyan', [22, 138, 146]], ['light_blue', 'Light Blue', [58, 176, 218]],
  ['blue', 'Blue', [52, 56, 158]], ['purple', 'Purple', [122, 42, 172]], ['magenta', 'Magenta', [190, 70, 180]],
  ['pink', 'Pink', [238, 142, 172]]
];
WOOL_COLORS.forEach(function (w) {
  const c = w[2];
  PAINTERS['wool_' + w[0]] = wool(c);
  PAINTERS['concrete_' + w[0]] = function (ctx, r) { noiseFill(ctx, r, mul(c, 0.92), 0.035); };
  PAINTERS['powder_' + w[0]] = function (ctx, r) { noiseFill(ctx, r, mul(c, 1.05), 0.2); specks(ctx, r, mul(c, 1.25), 18); };
  PAINTERS['stained_' + w[0]] = function (ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      px(ctx, x, y, c, edge ? 0.85 : 1.08, edge ? 0.95 : 0.45);
    }
    for (const p of [[3, 5], [4, 4], [5, 3], [10, 12], [11, 11]]) px(ctx, p[0], p[1], mul(c, 1.5), 1, 0.7);
  };
  PAINTERS['terracotta_' + w[0]] = function (ctx, r) { noiseFill(ctx, r, [c[0] * 0.62 + 50, c[1] * 0.58 + 34, c[2] * 0.55 + 28], 0.07); };
});

// [key, name, bark, log-top wood, planks, leaves]
const WOODS = [
  ['oak', 'Oak', [104, 82, 50], [182, 148, 94], [164, 132, 80], [62, 136, 42]],
  ['birch', 'Birch', [222, 220, 212], [212, 194, 144], [198, 180, 124], [112, 164, 70]],
  ['spruce', 'Spruce', [62, 42, 24], [122, 92, 56], [116, 86, 50], [44, 92, 54]],
  ['jungle', 'Jungle', [88, 70, 34], [172, 124, 82], [162, 116, 78], [50, 152, 30]],
  ['acacia', 'Acacia', [106, 100, 90], [178, 94, 54], [172, 92, 52], [112, 142, 42]],
  ['dark_oak', 'Dark Oak', [62, 46, 28], [92, 66, 38], [70, 46, 24], [42, 92, 28]],
  ['cherry', 'Cherry', [58, 32, 42], [226, 178, 170], [226, 180, 172], [236, 168, 200]],
  ['mangrove', 'Mangrove', [84, 52, 40], [118, 54, 48], [118, 52, 44], [70, 130, 40]]
];
WOODS.forEach(function (w) {
  const k = w[0];
  if (!PAINTERS['log_' + k]) {
    PAINTERS['log_' + k] = function (ctx, r) { bark(ctx, r, w[2]); };
    PAINTERS['log_' + k + '_top'] = function (ctx, r) { rings(ctx, r, w[3], w[2]); };
    PAINTERS['planks_' + k] = function (ctx, r) { planks(ctx, r, w[4]); };
    PAINTERS['leaves_' + k] = function (ctx, r) { leaves(ctx, r, w[5]); };
  }
  PAINTERS['stripped_' + k] = strippedSide(w[3]);
  PAINTERS['stripped_' + k + '_top'] = function (ctx, r) { rings(ctx, r, w[3], mul(w[3], 0.85)); };
  PAINTERS['door_' + k + '_top'] = doorPainter(w[4], true, k !== 'birch' && k !== 'cherry');
  PAINTERS['door_' + k + '_bottom'] = doorPainter(w[4], false, false);
  PAINTERS['trapdoor_' + k] = trapdoorPainter(w[4], k !== 'dark_oak');
  PAINTERS['sapling_' + k] = sapling(w[5], w[2]);
});
PAINTERS.log_birch = function (ctx, r) {
  noiseFill(ctx, r, [222, 220, 212], 0.06);
  for (let k = 0; k < 9; k++) {
    const x = r() * 14 | 0, y = r() * 16 | 0, l = 2 + (r() * 3 | 0);
    for (let i = 0; i < l; i++) px(ctx, (x + i) & 15, y, [44, 44, 40]);
  }
};

// ---------- hand-tuned versions of the blocks you see most (closer to vanilla) ----------
const GRASS_PAL = [[70, 118, 40], [82, 136, 46], [94, 152, 54], [104, 164, 60], [118, 178, 70]];
const DIRT_PAL = [[94, 66, 44], [114, 80, 54], [134, 96, 67], [134, 96, 67], [150, 110, 78]];
PAINTERS.grass_top = function (ctx, r) { paletteFill(ctx, r, GRASS_PAL, 2, 0.45); };
PAINTERS.dirt = function (ctx, r) {
  paletteFill(ctx, r, DIRT_PAL, 2, 0.4);
  for (let i = 0; i < 6; i++) px(ctx, r() * 16 | 0, r() * 16 | 0, [120, 116, 110]); // little stones
};
PAINTERS.grass_side = function (ctx, r) {
  PAINTERS.dirt(ctx, r);
  // Grass hangs over the dirt in a ragged fringe, 2 to 5 pixels deep.
  let h = 3;
  for (let x = 0; x < TILE; x++) {
    h = clamp(h + (r() < 0.5 ? -1 : 1) * (r() < 0.6 ? 1 : 0), 2, 5);
    const hh = h + (r() < 0.2 ? 1 : 0);
    for (let y = 0; y < hh; y++) px(ctx, x, y, GRASS_PAL[1 + (r() * 4 | 0)]);
    px(ctx, x, hh - 1, GRASS_PAL[0]);
  }
};
PAINTERS.cobblestone = function (ctx, r) {
  voronoi(ctx, r, 7, function (i, r) { const g = 118 + (r() * 4 | 0) * 11; return [g, g, g]; }, [76, 76, 76], 0.8);
  // Highlight the upper-left edge of each stone so they read as rounded lumps.
  const d = ctx.getImageData(0, 0, TILE, TILE).data;
  const lum = function (x, y) { x = (x + TILE) % TILE; y = (y + TILE) % TILE; return d[(y * TILE + x) * 4]; };
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const v = lum(x, y);
    if (v > 90 && lum(x - 1, y - 1) < 90) px(ctx, x, y, [v, v, v], 1.18);
    else if (v > 90 && lum(x + 1, y + 1) < 90) px(ctx, x, y, [v, v, v], 0.82);
  }
};
PAINTERS.sand = function (ctx, r) {
  paletteFill(ctx, r, [[208, 194, 146], [218, 206, 158], [224, 212, 166], [224, 212, 166], [232, 222, 180]], 2, 0.6);
  for (let i = 0; i < 10; i++) px(ctx, r() * 16 | 0, r() * 16 | 0, [196, 180, 132]);
};
PAINTERS.gravel = function (ctx, r) {
  const cols = [[96, 90, 88], [126, 120, 116], [144, 136, 130], [112, 100, 94], [158, 152, 146]];
  voronoi(ctx, r, 22, function (i, r) { return cols[r() * cols.length | 0]; }, [80, 74, 72], 0.55);
};
PAINTERS.bedrock = function (ctx, r) {
  paletteFill(ctx, r, [[34, 34, 34], [58, 58, 58], [86, 86, 86], [112, 112, 112], [140, 140, 140]], 2, 0.5);
};
PAINTERS.glass = function (ctx, r) {
  // Clear pane with a pale frame and a couple of diagonal glints, like vanilla glass.
  for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [218, 238, 246]); px(ctx, 0, i, [218, 238, 246]); px(ctx, i, 15, [176, 206, 218]); px(ctx, 15, i, [176, 206, 218]); }
  for (const p of [[2, 4], [3, 3], [4, 2], [2, 6], [3, 5], [4, 4], [5, 3], [6, 2], [11, 13], [12, 12], [13, 11]]) px(ctx, p[0], p[1], [244, 252, 255]);
};
PAINTERS.tnt_side = function (ctx, r) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (y >= 4 && y <= 11) px(ctx, x, y, [232, 232, 226], y === 4 || y === 11 ? 0.82 : 1);
    else px(ctx, x, y, [196, 42, 30], x % 4 === 3 ? 0.72 : x % 4 === 0 ? 1.12 : 1);
  }
  glyph(ctx, 'T', 1, 6, [24, 24, 24]); glyph(ctx, 'N', 6, 6, [24, 24, 24]); glyph(ctx, 'T', 12, 6, [24, 24, 24]);
};
PAINTERS.tnt_top = function (ctx, r) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, [196, 42, 30], (x % 4 === 3 || y % 4 === 3) ? 0.74 : 1 + (r() - 0.5) * 0.08);
  for (let x = 5; x < 11; x++) for (let y = 5; y < 11; y++) px(ctx, x, y, [200, 196, 186], Math.hypot(x - 7.5, y - 7.5) < 2 ? 0.45 : 1);
};
PAINTERS.log_birch = function (ctx, r) {
  paletteFill(ctx, r, [[206, 204, 196], [220, 218, 210], [232, 230, 224]], 2, 0.4);
  for (let k = 0; k < 10; k++) {
    const x = r() * 16 | 0, y = r() * 16 | 0, l = 2 + (r() * 4 | 0);
    for (let i = 0; i < l; i++) { px(ctx, x + i, y, [40, 40, 36]); if (r() < 0.4) px(ctx, x + i, y + 1, [70, 70, 62]); }
  }
};

// ---------- block table ----------
// [key, display name, category, texture (one name or {top, side, bottom, front, upper}), flags, props]
const LOG = function (k) { return { top: 'log_' + k + '_top', side: 'log_' + k, bottom: 'log_' + k + '_top' }; };
const BLOCK_TABLE = [
  ['grass', 'Grass Block', 'Natural', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, '', { drop: 'dirt' }],
  ['dirt', 'Dirt', 'Natural', 'dirt'],
  ['sand', 'Sand', 'Natural', 'sand', 'gravity'],
  ['red_sand', 'Red Sand', 'Natural', 'red_sand', 'gravity'],
  ['gravel', 'Gravel', 'Natural', 'gravel', 'gravity'],
  ['clay', 'Clay', 'Natural', 'clay', '', { drop: 'clay_ball*4' }],
  ['snow', 'Snow Block', 'Natural', 'snow', '', { hardness: 0.2, drop: 'snowball*4' }],
  ['ice', 'Ice', 'Natural', 'ice', '', { hardness: 0.5, tool: 'pickaxe', drop: 'none', slip: true }],
  ['water', 'Water', 'Natural', 'water', 'water hidden'],
  ['moss_block', 'Moss Block', 'Natural', 'moss_block', '', { hardness: 0.1, tool: 'hoe' }],
  ['cactus', 'Cactus', 'Plants', { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' }, '', { hardness: 0.4 }],
  ['pumpkin', 'Pumpkin', 'Plants', { top: 'pumpkin_top', side: 'pumpkin_side', bottom: 'pumpkin_top' }, '', { hardness: 1, tool: 'axe' }],
  ['jack_o_lantern', "Jack o'Lantern", 'Plants', { top: 'pumpkin_top', side: 'pumpkin_side', bottom: 'pumpkin_top', front: 'jack_front' }, 'front glow', { hardness: 1, tool: 'axe' }],
  ['melon', 'Melon', 'Plants', { top: 'melon_top', side: 'melon_side', bottom: 'melon_top' }, '', { hardness: 1, tool: 'axe', drop: 'melon_slice*3-7' }],
  ['hay_bale', 'Hay Bale', 'Plants', { top: 'hay_top', side: 'hay_side', bottom: 'hay_top' }, '', { hardness: 0.5, tool: 'hoe' }],
  ['tall_grass', 'Tall Grass', 'Plants', 'tall_grass', 'cross', { drop: 'none' }],
  ['poppy', 'Poppy', 'Plants', 'poppy', 'cross'],
  ['dandelion', 'Dandelion', 'Plants', 'dandelion', 'cross'],
  ['cornflower', 'Cornflower', 'Plants', 'cornflower', 'cross'],
  ['red_mushroom', 'Red Mushroom', 'Plants', 'red_mushroom', 'cross'],
  ['brown_mushroom', 'Brown Mushroom', 'Plants', 'brown_mushroom', 'cross'],
  ['dead_bush', 'Dead Bush', 'Plants', 'dead_bush', 'cross', { drop: 'stick*0-2' }],
  ['seagrass', 'Seagrass', 'Plants', 'seagrass', 'cross waterlogged', { drop: 'none' }],
  ['kelp', 'Kelp', 'Plants', 'kelp', 'cross waterlogged'],
  ['oak_log', 'Oak Log', 'Wood', LOG('oak')],
  ['oak_planks', 'Oak Planks', 'Wood', 'planks_oak'],
  ['oak_leaves', 'Oak Leaves', 'Wood', 'leaves_oak', 'transparent'],
  ['birch_log', 'Birch Log', 'Wood', LOG('birch')],
  ['birch_planks', 'Birch Planks', 'Wood', 'planks_birch'],
  ['birch_leaves', 'Birch Leaves', 'Wood', 'leaves_birch', 'transparent'],
  ['spruce_log', 'Spruce Log', 'Wood', LOG('spruce')],
  ['spruce_planks', 'Spruce Planks', 'Wood', 'planks_spruce'],
  ['spruce_leaves', 'Spruce Leaves', 'Wood', 'leaves_spruce', 'transparent'],
  ['bookshelf', 'Bookshelf', 'Wood', { top: 'planks_oak', side: 'bookshelf', bottom: 'planks_oak' }, '', { hardness: 1.5, drop: 'book*3' }],
  ['crafting_table', 'Crafting Table', 'Functional', { top: 'crafting_top', side: 'crafting_side', bottom: 'planks_oak' }, '', { hardness: 2.5, interact: 'craft' }],
  ['stone', 'Stone', 'Stone', 'stone', '', { drop: 'cobblestone' }],
  ['cobblestone', 'Cobblestone', 'Stone', 'cobblestone', '', { hardness: 2 }],
  ['mossy_cobblestone', 'Mossy Cobblestone', 'Stone', 'mossy_cobblestone', '', { hardness: 2 }],
  ['granite', 'Granite', 'Stone', 'granite'],
  ['diorite', 'Diorite', 'Stone', 'diorite'],
  ['andesite', 'Andesite', 'Stone', 'andesite'],
  ['sandstone', 'Sandstone', 'Stone', { top: 'sandstone_top', side: 'sandstone_side', bottom: 'sandstone_top' }, '', { hardness: 0.8 }],
  ['obsidian', 'Obsidian', 'Stone', 'obsidian', '', { hardness: 50, tier: 3, blast: true }],
  ['bedrock', 'Bedrock', 'Stone', 'bedrock', 'unbreakable', { blast: true }],
  ['furnace', 'Furnace', 'Functional', { top: 'furnace_top', side: 'furnace_side', bottom: 'furnace_top', front: 'furnace_front' }, 'front', { hardness: 3.5, tool: 'pickaxe', needsTool: true, interact: 'furnace' }],
  ['coal_ore', 'Coal Ore', 'Ores & Minerals', 'coal_ore', '', { drop: 'coal', xp: [0, 2] }],
  ['iron_ore', 'Iron Ore', 'Ores & Minerals', 'iron_ore', '', { tier: 1, drop: 'raw_iron' }],
  ['gold_ore', 'Gold Ore', 'Ores & Minerals', 'gold_ore', '', { tier: 2, drop: 'raw_gold' }],
  ['redstone_ore', 'Redstone Ore', 'Ores & Minerals', 'redstone_ore', '', { tier: 2, drop: 'redstone*4-5', xp: [1, 5] }],
  ['lapis_ore', 'Lapis Ore', 'Ores & Minerals', 'lapis_ore', '', { tier: 1, drop: 'lapis_lazuli*4-9', xp: [2, 5] }],
  ['diamond_ore', 'Diamond Ore', 'Ores & Minerals', 'diamond_ore', '', { tier: 2, drop: 'diamond', xp: [3, 7] }],
  ['emerald_ore', 'Emerald Ore', 'Ores & Minerals', 'emerald_ore', '', { tier: 2, drop: 'emerald', xp: [3, 7] }],
  ['coal_block', 'Block of Coal', 'Ores & Minerals', 'coal_block'],
  ['iron_block', 'Block of Iron', 'Ores & Minerals', 'iron_block', '', { tier: 1 }],
  ['gold_block', 'Block of Gold', 'Ores & Minerals', 'gold_block', '', { tier: 2 }],
  ['redstone_block', 'Block of Redstone', 'Ores & Minerals', 'redstone_block'],
  ['lapis_block', 'Block of Lapis', 'Ores & Minerals', 'lapis_block', '', { tier: 1 }],
  ['diamond_block', 'Block of Diamond', 'Ores & Minerals', 'diamond_block', '', { tier: 2 }],
  ['emerald_block', 'Block of Emerald', 'Ores & Minerals', 'emerald_block', '', { tier: 2 }],
  ['bricks', 'Bricks', 'Building', 'bricks', '', { hardness: 2 }],
  ['stone_bricks', 'Stone Bricks', 'Building', 'stone_bricks'],
  ['glass', 'Glass', 'Building', 'glass', 'transparent', { hardness: 0.3, drop: 'none' }],
  ['quartz', 'Quartz Block', 'Building', 'quartz', '', { hardness: 0.8 }],
  ['terracotta', 'Terracotta', 'Building', 'terracotta', '', { hardness: 1.25 }],
  ['glowstone', 'Glowstone', 'Building', 'glowstone', 'glow', { hardness: 0.3, tool: null, needsTool: false, drop: 'glowstone_dust*2-4' }],
  ['sea_lantern', 'Sea Lantern', 'Building', 'sea_lantern', 'glow', { hardness: 0.3, tool: null, needsTool: false }],
  ['prismarine', 'Prismarine', 'Building', 'prismarine'],
  ['sponge', 'Sponge', 'Building', 'sponge', '', { hardness: 0.6, tool: 'hoe', needsTool: false }],
  ['tnt', 'TNT', 'Functional', { top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_top' }, '', { hardness: 0, tool: null, needsTool: false }],
  ['coral_red', 'Fire Coral Block', 'Natural', 'coral_red', '', { tool: 'pickaxe', needsTool: true, hardness: 1.5 }],
  ['coral_blue', 'Tube Coral Block', 'Natural', 'coral_blue', '', { tool: 'pickaxe', needsTool: true, hardness: 1.5 }],
  ['coral_yellow', 'Horn Coral Block', 'Natural', 'coral_yellow', '', { tool: 'pickaxe', needsTool: true, hardness: 1.5 }]
];
// The original 16 wool colours keep their IDs straight after the first 72 blocks.
WOOL_COLORS.forEach(function (w) { BLOCK_TABLE.push(['wool_' + w[0], w[1] + ' Wool', 'Colored', 'wool_' + w[0]]); });

// ----- new in this version -----
WOODS.forEach(function (w) {
  const k = w[0], N = w[1], planksKey = k + '_planks';
  if (['oak', 'birch', 'spruce'].indexOf(k) < 0) {
    BLOCK_TABLE.push([k + '_log', N + ' Log', 'Wood', LOG(k)]);
    BLOCK_TABLE.push([planksKey, N + ' Planks', 'Wood', 'planks_' + k]);
    BLOCK_TABLE.push([k + '_leaves', N + ' Leaves', 'Wood', 'leaves_' + k, 'transparent']);
  }
  BLOCK_TABLE.push(['stripped_' + k + '_log', 'Stripped ' + N + ' Log', 'Wood', { top: 'stripped_' + k + '_top', side: 'stripped_' + k, bottom: 'stripped_' + k + '_top' }]);
  BLOCK_TABLE.push([k + '_slab', N + ' Slab', 'Wood', 'planks_' + k, '', { shape: 'slab', base: planksKey }]);
  BLOCK_TABLE.push([k + '_stairs', N + ' Stairs', 'Wood', 'planks_' + k, '', { shape: 'stairs' }]);
  BLOCK_TABLE.push([k + '_fence', N + ' Fence', 'Wood', 'planks_' + k, '', { shape: 'fence' }]);
  BLOCK_TABLE.push([k + '_door', N + ' Door', 'Functional', { side: 'door_' + k + '_bottom', upper: 'door_' + k + '_top' }, 'transparent', { shape: 'door', interact: 'toggle', hardness: 3 }]);
  BLOCK_TABLE.push([k + '_trapdoor', N + ' Trapdoor', 'Functional', 'trapdoor_' + k, 'transparent', { shape: 'trapdoor', interact: 'toggle', hardness: 3 }]);
});
WOODS.forEach(function (w) { BLOCK_TABLE.push([w[0] + '_sapling', w[1] + ' Sapling', 'Plants', 'sapling_' + w[0], 'cross', { sapling: w[0] }]); });

[
  ['smooth_stone', 'Smooth Stone', 'smooth_stone', { hardness: 2 }],
  ['stone_slab', 'Stone Slab', 'stone', { shape: 'slab', base: 'stone' }],
  ['smooth_stone_slab', 'Smooth Stone Slab', 'smooth_stone', { shape: 'slab', base: 'smooth_stone' }],
  ['cobblestone_slab', 'Cobblestone Slab', 'cobblestone', { shape: 'slab', base: 'cobblestone', hardness: 2 }],
  ['cobblestone_stairs', 'Cobblestone Stairs', 'cobblestone', { shape: 'stairs', hardness: 2 }],
  ['stone_brick_slab', 'Stone Brick Slab', 'stone_bricks', { shape: 'slab', base: 'stone_bricks' }],
  ['stone_brick_stairs', 'Stone Brick Stairs', 'stone_bricks', { shape: 'stairs' }],
  ['brick_slab', 'Brick Slab', 'bricks', { shape: 'slab', base: 'bricks', hardness: 2 }],
  ['brick_stairs', 'Brick Stairs', 'bricks', { shape: 'stairs', hardness: 2 }],
  ['sandstone_slab', 'Sandstone Slab', { top: 'sandstone_top', side: 'sandstone_side', bottom: 'sandstone_top' }, { shape: 'slab', base: 'sandstone', hardness: 0.8 }],
  ['sandstone_stairs', 'Sandstone Stairs', { top: 'sandstone_top', side: 'sandstone_side', bottom: 'sandstone_top' }, { shape: 'stairs', hardness: 0.8 }],
  ['cut_sandstone', 'Cut Sandstone', { top: 'sandstone_top', side: 'cut_sandstone', bottom: 'sandstone_top' }, { hardness: 0.8 }],
  ['chiseled_sandstone', 'Chiseled Sandstone', { top: 'sandstone_top', side: 'chiseled_sandstone', bottom: 'sandstone_top' }, { hardness: 0.8 }],
  ['smooth_sandstone', 'Smooth Sandstone', 'sandstone_top', { hardness: 2 }],
  ['red_sandstone', 'Red Sandstone', { top: 'red_sandstone_top', side: 'red_sandstone_side', bottom: 'red_sandstone_top' }, { hardness: 0.8 }],
  ['polished_granite', 'Polished Granite', 'polished_granite'],
  ['polished_diorite', 'Polished Diorite', 'polished_diorite'],
  ['polished_andesite', 'Polished Andesite', 'polished_andesite'],
  ['cracked_stone_bricks', 'Cracked Stone Bricks', 'cracked_stone_bricks'],
  ['mossy_stone_bricks', 'Mossy Stone Bricks', 'mossy_stone_bricks'],
  ['chiseled_stone_bricks', 'Chiseled Stone Bricks', 'chiseled_stone_bricks'],
  ['deepslate', 'Deepslate', { top: 'deepslate_top', side: 'deepslate', bottom: 'deepslate_top' }, { hardness: 3, drop: 'cobbled_deepslate' }],
  ['cobbled_deepslate', 'Cobbled Deepslate', 'cobbled_deepslate', { hardness: 3.5 }],
  ['deepslate_bricks', 'Deepslate Bricks', 'deepslate_bricks', { hardness: 3.5 }],
  ['deepslate_tiles', 'Deepslate Tiles', 'deepslate_tiles', { hardness: 3.5 }],
  ['polished_deepslate', 'Polished Deepslate', 'polished_deepslate', { hardness: 3.5 }],
  ['tuff', 'Tuff', 'tuff'],
  ['calcite', 'Calcite', 'calcite', { hardness: 0.75 }],
  ['blackstone', 'Blackstone', 'blackstone'],
  ['blackstone_bricks', 'Polished Blackstone Bricks', 'blackstone_bricks'],
  ['basalt', 'Basalt', { top: 'basalt_top', side: 'basalt_side', bottom: 'basalt_top' }, { hardness: 1.25 }],
  ['netherrack', 'Netherrack', 'netherrack', { hardness: 0.4 }],
  ['nether_bricks', 'Nether Bricks', 'nether_bricks', { hardness: 2 }],
  ['red_nether_bricks', 'Red Nether Bricks', 'red_nether_bricks', { hardness: 2 }],
  ['end_stone', 'End Stone', 'end_stone', { hardness: 3 }],
  ['end_stone_bricks', 'End Stone Bricks', 'end_stone_bricks', { hardness: 3 }],
  ['purpur_block', 'Purpur Block', 'purpur'],
  ['purpur_pillar', 'Purpur Pillar', { top: 'purpur', side: 'purpur_pillar', bottom: 'purpur' }],
  ['quartz_pillar', 'Quartz Pillar', { top: 'quartz', side: 'quartz_pillar', bottom: 'quartz' }, { hardness: 0.8 }],
  ['quartz_bricks', 'Quartz Bricks', 'quartz_bricks', { hardness: 0.8 }],
  ['chiseled_quartz', 'Chiseled Quartz Block', 'chiseled_quartz', { hardness: 0.8 }],
  ['prismarine_bricks', 'Prismarine Bricks', 'prismarine_bricks'],
  ['dark_prismarine', 'Dark Prismarine', 'dark_prismarine'],
  ['mud_bricks', 'Mud Bricks', 'mud_bricks'],
  ['crying_obsidian', 'Crying Obsidian', 'crying_obsidian', { hardness: 50, tier: 3, blast: true }],
  ['magma_block', 'Magma Block', 'magma', { hardness: 0.5, hot: true }],
  ['amethyst_block', 'Block of Amethyst', 'amethyst'],
  ['packed_ice', 'Packed Ice', 'packed_ice', { hardness: 0.5, tool: 'pickaxe', needsTool: false, slip: true }],
  ['blue_ice', 'Blue Ice', 'blue_ice', { hardness: 2.8, tool: 'pickaxe', needsTool: false, slip: true }]
].forEach(function (s) { BLOCK_TABLE.push([s[0], s[1], 'Stone', s[2], '', s[3]]); });

// 67
[
  ['copper_ore', 'Copper Ore', 'copper_ore', { tier: 1, drop: 'raw_copper*2-5' }],
  ['nether_quartz_ore', 'Nether Quartz Ore', 'nether_quartz_ore', { drop: 'quartz_crystal', xp: [2, 5] }],
  ['nether_gold_ore', 'Nether Gold Ore', 'nether_gold_ore', { drop: 'gold_nugget*2-6', xp: [0, 1] }],
  ['copper_block', 'Block of Copper', 'copper_block', { tier: 1 }],
  ['raw_iron_block', 'Block of Raw Iron', 'raw_iron_block', { tier: 1 }],
  ['raw_gold_block', 'Block of Raw Gold', 'raw_gold_block', { tier: 2 }],
  ['raw_copper_block', 'Block of Raw Copper', 'raw_copper_block', { tier: 1 }],
  ['netherite_block', 'Block of Netherite', 'netherite_block', { tier: 3, hardness: 50, blast: true }],
  ['ancient_debris', 'Ancient Debris', { top: 'ancient_debris_top', side: 'ancient_debris_side', bottom: 'ancient_debris_top' }, { tier: 3, hardness: 30, blast: true }]
].forEach(function (s) { BLOCK_TABLE.push([s[0], s[1], 'Ores & Minerals', s[2], '', s[3]]); });

WOOL_COLORS.forEach(function (w) {
  BLOCK_TABLE.push(['concrete_' + w[0], w[1] + ' Concrete', 'Colored', 'concrete_' + w[0], '', { hardness: 1.8 }]);
  BLOCK_TABLE.push(['concrete_powder_' + w[0], w[1] + ' Concrete Powder', 'Colored', 'powder_' + w[0], 'gravity', { hardness: 0.5, tool: 'shovel', needsTool: false }]);
  BLOCK_TABLE.push(['stained_glass_' + w[0], w[1] + ' Stained Glass', 'Colored', 'stained_' + w[0], 'translucent', { hardness: 0.3, drop: 'none', tool: null, needsTool: false }]);
  BLOCK_TABLE.push(['terracotta_' + w[0], w[1] + ' Terracotta', 'Colored', 'terracotta_' + w[0], '', { hardness: 1.25, tool: 'pickaxe', needsTool: true }]);
  BLOCK_TABLE.push(['carpet_' + w[0], w[1] + ' Carpet', 'Colored', 'wool_' + w[0], '', { shape: 'carpet', hardness: 0.1 }]);
});

[
  ['chest', 'Chest', { top: 'chest_top', side: 'chest_side', bottom: 'chest_top', front: 'chest_front' }, 'front', { shape: 'chest', hardness: 2.5, tool: 'axe', interact: 'chest' }],
  ['barrel', 'Barrel', { top: 'barrel_top', side: 'barrel_side', bottom: 'barrel_top' }, '', { hardness: 2.5, tool: 'axe', interact: 'chest' }],
  ['anvil', 'Anvil', { top: 'anvil_top', side: 'anvil_side', bottom: 'anvil_side' }, '', { shape: 'anvil', hardness: 5, tool: 'pickaxe', needsTool: true, interact: 'anvil', blast: true }],
  ['enchanting_table', 'Enchanting Table', { top: 'enchanting_top', side: 'enchanting_side', bottom: 'obsidian' }, '', { shape: 'enchanting', hardness: 5, tool: 'pickaxe', needsTool: true, interact: 'enchant', blast: true }],
  ['smoker', 'Smoker', { top: 'furnace_top', side: 'smoker_side', bottom: 'furnace_top', front: 'smoker_front' }, 'front', { hardness: 3.5, tool: 'pickaxe', needsTool: true, interact: 'furnace' }],
  ['blast_furnace', 'Blast Furnace', { top: 'smooth_stone', side: 'blast_side', bottom: 'smooth_stone', front: 'blast_front' }, 'front', { hardness: 3.5, tool: 'pickaxe', needsTool: true, interact: 'furnace' }],
  ['red_bed', 'Red Bed', { top: 'bed_top', side: 'bed_side', bottom: 'bed_bottom' }, '', { shape: 'bed', hardness: 0.2, interact: 'bed' }],
  ['ladder', 'Ladder', 'ladder', 'transparent climb nosolid', { shape: 'ladder', hardness: 0.4, tool: 'axe' }],
  ['torch', 'Torch', { top: 'torch_top', side: 'torch', bottom: 'torch' }, 'transparent nosolid glow', { shape: 'torch', hardness: 0 }],
  ['lantern', 'Lantern', { top: 'lantern_top', side: 'lantern', bottom: 'lantern_top' }, 'transparent glow', { shape: 'lantern', hardness: 3.5, tool: 'pickaxe', needsTool: true }],
  ['iron_door', 'Iron Door', { side: 'iron_door_bottom', upper: 'iron_door_top' }, 'transparent', { shape: 'door', interact: 'toggle', hardness: 5, tool: 'pickaxe', needsTool: true }],
  ['iron_trapdoor', 'Iron Trapdoor', 'iron_trapdoor', 'transparent', { shape: 'trapdoor', interact: 'toggle', hardness: 5, tool: 'pickaxe', needsTool: true }],
  ['iron_bars', 'Iron Bars', 'iron_bars', 'transparent', { shape: 'pane', hardness: 5, tool: 'pickaxe', needsTool: true }],
  ['glass_pane', 'Glass Pane', 'glass', 'transparent', { shape: 'pane', hardness: 0.3, drop: 'none' }],
  ['jukebox', 'Jukebox', { top: 'jukebox_top', side: 'jukebox_side', bottom: 'jukebox_side' }, '', { hardness: 2, tool: 'axe', interact: 'jukebox' }],
  ['note_block', 'Note Block', 'note_block', '', { hardness: 0.8, tool: 'axe', interact: 'note' }],
  ['smithing_table', 'Smithing Table', { top: 'smithing_top', side: 'smithing_side', bottom: 'planks_dark_oak' }, '', { hardness: 2.5, tool: 'axe' }],
  ['cartography_table', 'Cartography Table', { top: 'cartography_top', side: 'cartography_side', bottom: 'planks_dark_oak' }, '', { hardness: 2.5, tool: 'axe' }],
  ['fletching_table', 'Fletching Table', { top: 'fletching_top', side: 'fletching_side', bottom: 'planks_birch' }, '', { hardness: 2.5, tool: 'axe' }],
  ['loom', 'Loom', { top: 'loom_top', side: 'loom_side', bottom: 'planks_oak' }, '', { hardness: 2.5, tool: 'axe' }],
  ['composter', 'Composter', { top: 'composter_top', side: 'composter_side', bottom: 'planks_oak' }, '', { hardness: 0.6, tool: 'axe' }]
].forEach(function (s) { BLOCK_TABLE.push([s[0], s[1], 'Functional', s[2], s[3], s[4]]); });

[
  ['lava', 'Lava', 'Natural', 'lava', 'lava hidden glow', { hot: true }],
  ['fire', 'Fire', 'Natural', 'fire', 'cross hidden glow nosolid', { shape: 'fire', hot: true, drop: 'none', hardness: 0 }],
  ['cobweb', 'Cobweb', 'Natural', 'cobweb', 'cross', { hardness: 4, tool: 'sword', drop: 'string', web: true }],
  ['slime_block', 'Slime Block', 'Natural', 'slime', 'translucent', { hardness: 0, bouncy: true }],
  ['honey_block', 'Honey Block', 'Natural', 'honey', 'translucent', { hardness: 0, sticky: true }],
  ['podzol', 'Podzol', 'Natural', { top: 'podzol_top', side: 'podzol_side', bottom: 'dirt' }],
  ['mycelium', 'Mycelium', 'Natural', { top: 'mycelium_top', side: 'mycelium_side', bottom: 'dirt' }, '', { drop: 'dirt' }],
  ['coarse_dirt', 'Coarse Dirt', 'Natural', 'coarse_dirt'],
  ['rooted_dirt', 'Rooted Dirt', 'Natural', 'rooted_dirt'],
  ['dirt_path', 'Dirt Path', 'Natural', { top: 'path_top', side: 'path_side', bottom: 'dirt' }, '', { shape: 'path', drop: 'dirt', hardness: 0.65 }],
  ['mud', 'Mud', 'Natural', 'mud'],
  ['packed_mud', 'Packed Mud', 'Natural', 'packed_mud', '', { hardness: 1, tool: 'pickaxe', needsTool: false }],
  ['soul_sand', 'Soul Sand', 'Natural', 'soul_sand', '', { slow: true }],
  ['sugar_cane', 'Sugar Cane', 'Plants', 'sugar_cane', 'cross'],
  ['fern', 'Fern', 'Plants', 'fern', 'cross', { drop: 'none' }],
  ['allium', 'Allium', 'Plants', 'allium', 'cross'],
  ['azure_bluet', 'Azure Bluet', 'Plants', 'azure_bluet', 'cross'],
  ['red_tulip', 'Red Tulip', 'Plants', 'red_tulip', 'cross'],
  ['orange_tulip', 'Orange Tulip', 'Plants', 'orange_tulip', 'cross'],
  ['white_tulip', 'White Tulip', 'Plants', 'white_tulip', 'cross'],
  ['pink_tulip', 'Pink Tulip', 'Plants', 'pink_tulip', 'cross'],
  ['oxeye_daisy', 'Oxeye Daisy', 'Plants', 'oxeye_daisy', 'cross'],
  ['lily_of_the_valley', 'Lily of the Valley', 'Plants', 'lily_of_the_valley', 'cross'],
  ['blue_orchid', 'Blue Orchid', 'Plants', 'blue_orchid', 'cross']
].forEach(function (s) { BLOCK_TABLE.push(s); });

// ----- version 3: more vanilla blocks -----
(function () {
  // Nether woods: crimson and warped stems, nylium, wart and fungus.
  const NETHER = [
    ['crimson', 'Crimson', [92, 26, 40], [126, 56, 82], [118, 14, 14], [130, 30, 30]],
    ['warped', 'Warped', [40, 70, 74], [44, 104, 98], [22, 118, 120], [36, 122, 110]]
  ];
  NETHER.forEach(function (w) {
    const k = w[0], N = w[1];
    PAINTERS['stem_' + k] = function (ctx, r) { bark(ctx, r, w[2]); for (let i = 0; i < 6; i++) px(ctx, r() * 16 | 0, r() * 16 | 0, mul(w[4], 1.6)); };
    PAINTERS['stem_' + k + '_top'] = function (ctx, r) { rings(ctx, r, w[3], w[2]); };
    PAINTERS['stripped_stem_' + k] = strippedSide(w[3]);
    PAINTERS['planks_' + k] = function (ctx, r) { planks(ctx, r, w[3]); };
    PAINTERS['door_' + k + '_top'] = doorPainter(w[3], true, true);
    PAINTERS['door_' + k + '_bottom'] = doorPainter(w[3], false, false);
    PAINTERS['trapdoor_' + k] = trapdoorPainter(w[3], true);
    PAINTERS['nylium_' + k] = function (ctx, r) { noiseFill(ctx, r, w[5], 0.3); specks(ctx, r, mul(w[5], 1.4), 14); };
    PAINTERS['nylium_' + k + '_side'] = function (ctx, r) { PAINTERS.netherrack(ctx, r); for (let x = 0; x < TILE; x++) { const h = 2 + (r() * 3 | 0); for (let y = 0; y < h; y++) px(ctx, x, y, w[5], 0.85 + r() * 0.3); } };
    PAINTERS['wart_' + k] = function (ctx, r) { noiseFill(ctx, r, w[4], 0.35); specks(ctx, r, mul(w[4], 0.6), 20); };
    PAINTERS['fungus_' + k] = function (ctx, r) {
      for (let y = 9; y < 16; y++) px(ctx, 7, y, [200, 160, 120]);
      for (let x = 3; x < 13; x++) for (let y = 4; y < 9; y++) if (Math.hypot(x - 7.5, (y - 8) * 1.4) < 5) px(ctx, x, y, w[5], 0.8 + r() * 0.5);
      px(ctx, 5, 6, [255, 200, 120]); px(ctx, 10, 5, [255, 200, 120]);
    };
    const planksKey = k + '_planks';
    BLOCK_TABLE.push([k + '_stem', N + ' Stem', 'Wood', { top: 'stem_' + k + '_top', side: 'stem_' + k, bottom: 'stem_' + k + '_top' }]);
    BLOCK_TABLE.push(['stripped_' + k + '_stem', 'Stripped ' + N + ' Stem', 'Wood', { top: 'stem_' + k + '_top', side: 'stripped_stem_' + k, bottom: 'stem_' + k + '_top' }]);
    BLOCK_TABLE.push([planksKey, N + ' Planks', 'Wood', 'planks_' + k]);
    BLOCK_TABLE.push([k + '_slab', N + ' Slab', 'Wood', 'planks_' + k, '', { shape: 'slab', base: planksKey }]);
    BLOCK_TABLE.push([k + '_stairs', N + ' Stairs', 'Wood', 'planks_' + k, '', { shape: 'stairs' }]);
    BLOCK_TABLE.push([k + '_fence', N + ' Fence', 'Wood', 'planks_' + k, '', { shape: 'fence' }]);
    BLOCK_TABLE.push([k + '_door', N + ' Door', 'Functional', { side: 'door_' + k + '_bottom', upper: 'door_' + k + '_top' }, 'transparent', { shape: 'door', interact: 'toggle', hardness: 3 }]);
    BLOCK_TABLE.push([k + '_trapdoor', N + ' Trapdoor', 'Functional', 'trapdoor_' + k, 'transparent', { shape: 'trapdoor', interact: 'toggle', hardness: 3 }]);
    BLOCK_TABLE.push([k + '_nylium', N + ' Nylium', 'Natural', { top: 'nylium_' + k, side: 'nylium_' + k + '_side', bottom: 'netherrack' }, '', { hardness: 0.4, tool: 'pickaxe', needsTool: true, drop: 'netherrack' }]);
    BLOCK_TABLE.push([k === 'crimson' ? 'nether_wart_block' : 'warped_wart_block', k === 'crimson' ? 'Nether Wart Block' : 'Warped Wart Block', 'Natural', 'wart_' + k, '', { hardness: 1, tool: 'hoe', needsTool: false }]);
    BLOCK_TABLE.push([k + '_fungus', N + ' Fungus', 'Plants', 'fungus_' + k, 'cross']);
  });

  const add = function (key, name, cat, tex, flags, props, painter) {
    if (painter) PAINTERS[typeof tex === 'string' ? tex : tex.side] = painter;
    BLOCK_TABLE.push([key, name, cat, tex, flags || '', props || {}]);
  };
  const spots = function (base, spot) {
    return function (ctx, r) {
      noiseFill(ctx, r, base, 0.12);
      for (let i = 0; i < 5; i++) { const x = r() * 13 | 0, y = r() * 13 | 0; rect(ctx, x, y, x + 2, y + 2, spot, 1 + (r() - 0.5) * 0.1); }
    };
  };
  add('red_mushroom_block', 'Red Mushroom Block', 'Natural', 'mushroom_red', '', { hardness: 0.2, tool: 'axe', needsTool: false }, spots([196, 36, 34], [236, 230, 220]));
  add('brown_mushroom_block', 'Brown Mushroom Block', 'Natural', 'mushroom_brown', '', { hardness: 0.2, tool: 'axe', needsTool: false }, function (ctx, r) { noiseFill(ctx, r, [150, 110, 78], 0.15); });
  add('mushroom_stem', 'Mushroom Stem', 'Natural', 'mushroom_stem', '', { hardness: 0.2, tool: 'axe', needsTool: false }, function (ctx, r) { strippedSide([206, 198, 182])(ctx, r); });
  add('shroomlight', 'Shroomlight', 'Natural', 'shroomlight', 'glow', { hardness: 1, tool: 'hoe', needsTool: false }, function (ctx, r) {
    voronoi(ctx, r, 9, function (i, r) { return [[250, 160, 70], [255, 196, 110], [230, 120, 50]][r() * 3 | 0]; }, [180, 80, 30], 0.8);
  });
  add('sculk', 'Sculk', 'Natural', 'sculk', '', { hardness: 0.2, tool: 'hoe', needsTool: false }, function (ctx, r) {
    noiseFill(ctx, r, [14, 36, 48], 0.4);
    for (let i = 0; i < 9; i++) px(ctx, r() * 16 | 0, r() * 16 | 0, [40, 220, 230]);
  });
  add('sculk_catalyst', 'Sculk Catalyst', 'Natural', { top: 'sculk', side: 'sculk_catalyst', bottom: 'calcite' }, 'glow', { hardness: 3, tool: 'hoe', needsTool: false }, function (ctx, r) {
    noiseFill(ctx, r, [222, 224, 214], 0.08);
    rect(ctx, 0, 0, 15, 4, [14, 36, 48]); for (const x of [3, 8, 12]) px(ctx, x, 2, [60, 230, 240]);
  });
  [['exposed', 'Exposed', [168, 128, 96], [96, 160, 126]], ['weathered', 'Weathered', [110, 150, 110], [80, 160, 130]], ['oxidized', 'Oxidized', [84, 162, 132], [70, 180, 150]]].forEach(function (c) {
    add(c[0] + '_copper', c[1] + ' Copper', 'Ores & Minerals', 'copper_' + c[0], '', { tier: 1 }, function (ctx, r) { metal(c[2])(ctx, r); specks(ctx, r, c[3], 26, 0.2); });
  });
  add('cut_copper', 'Cut Copper', 'Ores & Minerals', 'cut_copper', '', { tier: 1 }, tiles([196, 110, 80], 8));
  add('tinted_glass', 'Tinted Glass', 'Building', 'tinted_glass', 'translucent', { hardness: 0.3, tool: null, needsTool: false }, function (ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const e = x === 0 || y === 0 || x === 15 || y === 15; px(ctx, x, y, [46, 36, 54], e ? 1.4 : 1, e ? 0.95 : 0.78); }
  });
  add('dried_kelp_block', 'Dried Kelp Block', 'Plants', { top: 'kelp_block_top', side: 'kelp_block', bottom: 'kelp_block_top' }, '', { hardness: 0.5, tool: 'hoe', needsTool: false }, function (ctx, r) {
    for (let x = 0; x < TILE; x++) { const f = x % 3 === 0 ? 0.7 : 1; for (let y = 0; y < TILE; y++) px(ctx, x, y, [50, 62, 34], f * (1 + (r() - 0.5) * 0.15)); }
  });
  PAINTERS.kelp_block_top = function (ctx, r) { rings(ctx, r, [62, 76, 40], [40, 50, 26]); };
  PAINTERS.honeycomb = function (ctx, r) {
    noiseFill(ctx, r, [232, 160, 36], 0.08);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if ((y % 4 === 0 && (x + (y % 8 ? 2 : 0)) % 4 !== 1) || ((x + (y >> 2) * 2) % 4 === 0 && y % 4)) px(ctx, x, y, [170, 100, 20]);
  };
  add('honeycomb_block', 'Honeycomb Block', 'Building', 'honeycomb', '', { hardness: 0.6, tool: null, needsTool: false });
  add('bee_nest', 'Bee Nest', 'Functional', { top: 'nest_top', side: 'nest_side', bottom: 'nest_top', front: 'nest_front' }, 'front', { hardness: 0.3, tool: 'axe' }, function (ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, [206, 166, 80], (y % 4 === 0 ? 0.8 : 1) * (1 + (r() - 0.5) * 0.12));
  });
  PAINTERS.nest_top = function (ctx, r) { rings(ctx, r, [214, 176, 92], [170, 130, 60]); };
  PAINTERS.nest_front = function (ctx, r) { PAINTERS.nest_side(ctx, r); rect(ctx, 5, 9, 10, 11, [60, 40, 20]); px(ctx, 4, 4, [60, 40, 20]); px(ctx, 11, 5, [60, 40, 20]); };
  add('beehive', 'Beehive', 'Functional', { top: 'hive_top', side: 'hive_side', bottom: 'hive_top', front: 'hive_front' }, 'front', { hardness: 0.6, tool: 'axe' }, function (ctx, r) { planks(ctx, r, [180, 140, 82]); });
  PAINTERS.hive_top = function (ctx, r) { planks(ctx, r, [196, 156, 92]); for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [120, 90, 50]); px(ctx, i, 15, [120, 90, 50]); } };
  PAINTERS.hive_front = function (ctx, r) { PAINTERS.hive_side(ctx, r); rect(ctx, 3, 6, 12, 8, [70, 46, 22]); rect(ctx, 6, 10, 9, 11, [70, 46, 22]); };
  add('target', 'Target', 'Functional', { top: 'target_top', side: 'target', bottom: 'target_top' }, '', { hardness: 0.5, tool: 'hoe', needsTool: false }, function (ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const d = Math.hypot(x - 7.5, y - 7.5); px(ctx, x, y, Math.floor(d / 2) % 2 ? [236, 226, 210] : [200, 40, 40]); }
  });
  PAINTERS.target_top = function (ctx, r) { noiseFill(ctx, r, [214, 196, 170], 0.08); };
  add('lodestone', 'Lodestone', 'Functional', { top: 'lodestone_top', side: 'lodestone', bottom: 'lodestone_top' }, '', { hardness: 3.5, tool: 'pickaxe', needsTool: true }, chiseled([150, 150, 156]));
  PAINTERS.lodestone_top = function (ctx, r) { chiseled([130, 130, 136])(ctx, r); rect(ctx, 6, 6, 9, 9, [70, 70, 76]); };
  add('beacon', 'Beacon', 'Functional', 'beacon', 'glow', { hardness: 3, tool: null, needsTool: false }, function (ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const e = x === 0 || y === 0 || x === 15 || y === 15, c = x > 4 && x < 11 && y > 4 && y < 11;
      px(ctx, x, y, c ? [200, 255, 250] : e ? [180, 230, 240] : [40, 30, 50], c ? 1 + (r() - 0.5) * 0.1 : 1);
    }
  });
  add('end_rod', 'End Rod', 'Functional', 'end_rod', 'transparent nosolid glow', { shape: 'rod', hardness: 0 }, function (ctx, r) {
    for (let y = 0; y < TILE; y++) { px(ctx, 7, y, [250, 246, 240]); px(ctx, 8, y, [220, 210, 220]); }
    rect(ctx, 6, 14, 9, 15, [190, 170, 200]);
  });
  add('sea_pickle', 'Sea Pickle', 'Plants', 'sea_pickle', 'cross glow', {}, function (ctx, r) {
    for (const x0 of [4, 9]) { rect(ctx, x0, 9, x0 + 2, 15, [110, 140, 50]); rect(ctx, x0, 7, x0 + 2, 8, [200, 255, 160]); }
  });
  [['white', [236, 236, 230], [80, 160, 200]], ['light_blue', [90, 170, 220], [236, 236, 230]], ['yellow', [244, 200, 60], [236, 236, 230]], ['magenta', [200, 80, 190], [240, 180, 230]]].forEach(function (g) {
    add('glazed_terracotta_' + g[0], WOOL_COLORS.find(function (w) { return w[0] === g[0]; })[1] + ' Glazed Terracotta', 'Colored', 'glazed_' + g[0], '', { hardness: 1.4 }, function (ctx, r) {
      noiseFill(ctx, r, g[1], 0.05);
      for (let i = 0; i < 16; i++) { px(ctx, i, i, g[2]); px(ctx, 15 - i, i, g[2], 0.8); px(ctx, i, 0, g[2], 0.7); px(ctx, 0, i, g[2], 0.7); }
      rect(ctx, 6, 6, 9, 9, g[2]);
    });
  });
  add('bamboo_block', 'Block of Bamboo', 'Wood', { top: 'bamboo_top', side: 'bamboo_side', bottom: 'bamboo_top' }, '', {}, function (ctx, r) {
    for (let x = 0; x < TILE; x++) for (let y = 0; y < TILE; y++) px(ctx, x, y, [120, 160, 40], (x % 4 === 3 ? 0.7 : 1) * ((y + (x >> 2) * 5) % 8 === 0 ? 0.75 : 1));
  });
  PAINTERS.bamboo_top = function (ctx, r) { rings(ctx, r, [190, 180, 90], [110, 150, 40]); };
  add('bamboo_planks', 'Bamboo Planks', 'Wood', 'planks_bamboo', '', {}, function (ctx, r) { planks(ctx, r, [216, 196, 92]); });
  add('bamboo_mosaic', 'Bamboo Mosaic', 'Wood', 'bamboo_mosaic', '', {}, tiles([212, 190, 86], 4));
  add('cake', 'Cake', 'Functional', { top: 'cake_top', side: 'cake_side', bottom: 'cake_bottom' }, '', { shape: 'cake', hardness: 0.5, tool: null, needsTool: false, interact: 'cake', drop: 'none' }, function (ctx, r) {
    for (let y = 8; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, y < 10 ? [244, 244, 240] : y === 12 ? [220, 60, 60] : [196, 132, 76], 1 + (r() - 0.5) * 0.06);
  });
  PAINTERS.cake_top = function (ctx, r) { noiseFill(ctx, r, [246, 246, 242], 0.04); for (const p of [[4, 4], [11, 5], [7, 9], [3, 12], [12, 12]]) px(ctx, p[0], p[1], [220, 40, 40]); };
  PAINTERS.cake_bottom = function (ctx, r) { noiseFill(ctx, r, [180, 120, 66], 0.08); };
  add('moss_carpet', 'Moss Carpet', 'Natural', 'moss_block', '', { shape: 'carpet', hardness: 0.1, tool: 'hoe', needsTool: false });
  add('flowering_azalea_leaves', 'Flowering Azalea Leaves', 'Wood', 'azalea_leaves', 'transparent', { hardness: 0.2, tool: 'hoe', needsTool: false, drop: 'none' }, function (ctx, r) {
    leaves(ctx, r, [90, 130, 50]);
    for (let i = 0; i < 6; i++) { const x = r() * 14 | 0, y = r() * 14 | 0; px(ctx, x, y, [230, 120, 200]); px(ctx, x + 1, y, [250, 160, 220]); }
  });
  add('dripstone_block', 'Dripstone Block', 'Stone', 'dripstone', '', { hardness: 1.5 }, function (ctx, r) {
    for (let x = 0; x < TILE; x++) for (let y = 0; y < TILE; y++) px(ctx, x, y, [134, 108, 92], (x % 3 === 0 ? 0.82 : 1) * (1 + (r() - 0.5) * 0.14));
  });
  add('respawn_anchor', 'Respawn Anchor', 'Functional', { top: 'anchor_top', side: 'crying_obsidian', bottom: 'obsidian' }, 'glow', { hardness: 50, tier: 3, blast: true });
  PAINTERS.anchor_top = function (ctx, r) { PAINTERS.obsidian(ctx, r); rect(ctx, 4, 4, 11, 11, [250, 180, 60]); rect(ctx, 6, 6, 9, 9, [255, 230, 140]); };
  add('spawner', 'Monster Spawner', 'Functional', 'spawner', 'transparent', { hardness: 5, tool: 'pickaxe', needsTool: true, drop: 'none' }, function (ctx, r) {
    for (let i = 0; i < TILE; i++) for (const k of [0, 5, 10, 15]) { px(ctx, k, i, [40, 46, 60]); px(ctx, i, k, [30, 36, 50]); }
    rect(ctx, 6, 6, 9, 9, [200, 60, 60]);
  });
})();

// ---------- version 4: about 100 more vanilla blocks ----------
(function () {
  const add = function (key, name, cat, tex, flags, props, painter) {
    if (painter) PAINTERS[typeof tex === 'string' ? tex : tex.side] = painter;
    BLOCK_TABLE.push([key, name, cat, tex, flags || '', props || {}]);
  };
  const row = function (key) { return BLOCK_TABLE.find(function (r) { return r[0] === key; }); };
  // Rows are [key, name, category, texture, flags, props]; a few older ones skip the category.
  const texAt = function (r) { return BLOCK_CATEGORIES.indexOf(r[2]) >= 0 ? 3 : 2; };
  const texOf = function (key) { const r = row(key); return r[texAt(r)]; };
  const propsOf = function (key) { const r = row(key), p = r.slice(texAt(r) + 1).find(function (x) { return x && typeof x === 'object'; }); return Object.assign({}, p || {}); };

  // The 12 glazed terracottas that were missing (each with its own swirl pattern).
  WOOL_COLORS.forEach(function (w, k) {
    if (row('glazed_terracotta_' + w[0])) return;
    const c = w[2], dark = mul(c, 0.55), light = [Math.min(255, c[0] * 0.5 + 128), Math.min(255, c[1] * 0.5 + 128), Math.min(255, c[2] * 0.5 + 128)];
    add('glazed_terracotta_' + w[0], w[1] + ' Glazed Terracotta', 'Colored', 'glazed_' + w[0], '', { hardness: 1.4 }, function (ctx, r) {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const a = Math.atan2(y - 7.5, x - 7.5), d = Math.hypot(x - 7.5, y - 7.5);
        const band = Math.floor(d / 2.2 + a * (k % 2 ? 1 : -1) * 0.8 + 10) % 3;
        px(ctx, x, y, band === 0 ? dark : band === 1 ? c : light);
      }
      for (let i = 0; i < TILE; i++) { px(ctx, i, 0, dark); px(ctx, 0, i, dark); }
    });
  });
  // Stained glass panes.
  WOOL_COLORS.forEach(function (w) {
    add(w[0] + '_stained_glass_pane', w[1] + ' Stained Glass Pane', 'Colored', 'stained_' + w[0], 'translucent', { shape: 'pane', hardness: 0.3, tool: null, needsTool: false, drop: 'none' });
  });
  // Beds in every colour.
  WOOL_COLORS.forEach(function (w) {
    if (w[0] === 'red') return;
    const c = w[2];
    PAINTERS['bed_top_' + w[0]] = function (ctx, r) {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        if (y < 5) px(ctx, x, y, [236, 236, 236], 1 + (r() - 0.5) * 0.05);
        else px(ctx, x, y, c, (x === 0 || x === 15 ? 0.8 : 1) * (1 + (r() - 0.5) * 0.08));
      }
    };
    PAINTERS['bed_side_' + w[0]] = function (ctx, r) {
      for (let y = 7; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        if (y < 11) px(ctx, x, y, c, 1 + (r() - 0.5) * 0.08);
        else if (y < 13) px(ctx, x, y, [150, 112, 64]);
        else if (x < 3 || x > 12) px(ctx, x, y, [120, 88, 50]);
      }
    };
    add(w[0] + '_bed', w[1] + ' Bed', 'Functional', { top: 'bed_top_' + w[0], side: 'bed_side_' + w[0], bottom: 'bed_bottom' }, '', { shape: 'bed', hardness: 0.2, interact: 'bed' });
  });
  // Deepslate ores: the same ores in the deep layer, a little harder to mine.
  const deepPaint = function (ctx, r) { paletteFill(ctx, r, [[54, 54, 60], [66, 66, 72], [78, 78, 84], [90, 90, 96]], 2, 0.4); };
  [['coal', [30, 30, 30]], ['iron', [216, 176, 146]], ['copper', [224, 128, 90]], ['gold', [250, 214, 60]], ['redstone', [230, 20, 20]], ['lapis', [40, 80, 200]], ['diamond', [110, 236, 226]], ['emerald', [40, 210, 100]]].forEach(function (o) {
    const p = propsOf(o[0] + '_ore');
    p.hardness = 4.5; p.tool = 'pickaxe'; p.needsTool = true;
    add('deepslate_' + o[0] + '_ore', 'Deepslate ' + o[0][0].toUpperCase() + o[0].slice(1) + ' Ore', 'Ores & Minerals', 'deepslate_' + o[0] + '_ore', '', p, oreOn(deepPaint, o[1]));
  });
  // Stairs and slabs for stones that only had full blocks.
  [['granite', 'Granite'], ['diorite', 'Diorite'], ['andesite', 'Andesite'], ['polished_granite', 'Polished Granite'], ['polished_diorite', 'Polished Diorite'],
    ['polished_andesite', 'Polished Andesite'], ['mossy_cobblestone', 'Mossy Cobblestone'], ['mossy_stone_bricks', 'Mossy Stone Brick'], ['quartz_block', 'Quartz', 'quartz'],
    ['prismarine', 'Prismarine'], ['deepslate_bricks', 'Deepslate Brick'], ['blackstone', 'Blackstone']
  ].forEach(function (m) {
    const base = m[2] || m[0], tex = texOf(base), hard = propsOf(base).hardness || 1.5;
    const k = m[0].replace(/_bricks$/, '_brick').replace(/_block$/, '');
    add(k + '_stairs', m[1] + ' Stairs', 'Stone', tex, '', { shape: 'stairs', hardness: hard });
    add(k + '_slab', m[1] + ' Slab', 'Stone', tex, '', { shape: 'slab', base: base, hardness: hard });
  });
  // Walls.
  [['cobblestone', 'Cobblestone'], ['mossy_cobblestone', 'Mossy Cobblestone'], ['stone_bricks', 'Stone Brick'], ['bricks', 'Brick'], ['sandstone', 'Sandstone'],
    ['deepslate_bricks', 'Deepslate Brick'], ['blackstone', 'Blackstone'], ['granite', 'Granite'], ['andesite', 'Andesite'], ['diorite', 'Diorite'],
    ['end_stone_bricks', 'End Stone Brick'], ['mud_bricks', 'Mud Brick']
  ].forEach(function (m) {
    const k = m[0].replace(/_bricks$/, '_brick').replace(/s$/, '');
    add((m[0] === 'bricks' ? 'brick' : k) + '_wall', m[1] + ' Wall', 'Stone', texOf(m[0]), '', { shape: 'wall', hardness: propsOf(m[0]).hardness || 2 });
  });
  // Plants.
  const tallFlower = function (stem, petal, center) {
    return function (ctx, r) {
      for (let y = 4; y < 16; y++) px(ctx, 7, y, stem);
      for (const l of [[5, 11], [9, 9], [4, 13], [10, 12]]) { px(ctx, l[0], l[1], stem, 1.1); px(ctx, l[0] + (l[0] < 7 ? 1 : -1), l[1], stem); }
      for (let y = 0; y < 7; y++) for (let x = 3; x < 12; x++) if (Math.hypot(x - 7, y - 3) < 3.6 && r() < 0.85) px(ctx, x, y, petal, 0.8 + r() * 0.35);
      if (center) { px(ctx, 7, 3, center); px(ctx, 6, 3, center, 0.9); px(ctx, 7, 2, center, 1.1); }
    };
  };
  add('sunflower', 'Sunflower', 'Plants', 'sunflower', 'cross', { hardness: 0 }, tallFlower([70, 140, 45], [250, 210, 40], [110, 70, 30]));
  add('lilac', 'Lilac', 'Plants', 'lilac', 'cross', { hardness: 0 }, tallFlower([70, 140, 45], [200, 150, 210]));
  add('rose_bush', 'Rose Bush', 'Plants', 'rose_bush', 'cross', { hardness: 0 }, tallFlower([50, 110, 40], [200, 30, 40]));
  add('peony', 'Peony', 'Plants', 'peony', 'cross', { hardness: 0 }, tallFlower([70, 140, 45], [240, 180, 220], [220, 130, 190]));
  add('wither_rose', 'Wither Rose', 'Plants', 'wither_rose', 'cross', { hardness: 0 }, flower([30, 30, 26], [60, 60, 50]));
  add('torchflower', 'Torchflower', 'Plants', 'torchflower', 'cross', { hardness: 0 }, flower([240, 120, 40], [250, 220, 90]));
  add('sweet_berry_bush', 'Sweet Berry Bush', 'Plants', 'sweet_berry_bush', 'cross', { hardness: 0, drop: 'sweet_berries*2-3' }, function (ctx, r) {
    leaves(ctx, r, [40, 100, 50]);
    for (let i = 0; i < 6; i++) { const x = 1 + r() * 13 | 0, y = 1 + r() * 13 | 0; rect(ctx, x, y, x + 1, y + 1, [200, 30, 40]); }
  });
  add('azalea', 'Azalea', 'Plants', 'azalea', 'cross', { hardness: 0 }, function (ctx, r) {
    for (let y = 2; y < 12; y++) for (let x = 1; x < 15; x++) if (Math.hypot(x - 7.5, y - 6.5) < 6 && r() < 0.85) px(ctx, x, y, [100, 140, 50], 0.75 + r() * 0.5);
    for (let y = 11; y < 16; y++) px(ctx, 7, y, [100, 80, 50]);
  });
  // Utility and decoration.
  const stoneTop = function (c) { return function (ctx, r) { noiseFill(ctx, r, c, 0.1); for (let i = 0; i < TILE; i++) { px(ctx, i, 0, c, 0.7); px(ctx, i, 15, c, 0.7); px(ctx, 0, i, c, 0.7); px(ctx, 15, i, c, 0.7); } }; };
  add('bell', 'Bell', 'Functional', 'bell', 'transparent', { shape: 'lantern', hardness: 5, tool: 'pickaxe', needsTool: false, interact: 'bell' }, function (ctx, r) {
    for (let y = 2; y < 14; y++) for (let x = 3; x < 13; x++) if (Math.abs(x - 7.5) < 2.5 + (y - 2) * 0.25) px(ctx, x, y, [244, 200, 60], 0.85 + (x < 8 ? 0.25 : 0) + (r() - 0.5) * 0.08);
    rect(ctx, 3, 13, 12, 14, [220, 170, 40]);
  });
  add('lectern', 'Lectern', 'Functional', { top: 'lectern_top', side: 'lectern_side', bottom: 'planks_oak', front: 'lectern_front' }, 'front', { hardness: 2.5, tool: 'axe' }, function (ctx, r) { planks(ctx, r, [176, 140, 86]); rect(ctx, 5, 0, 10, 15, [130, 96, 54]); });
  PAINTERS.lectern_top = function (ctx, r) { planks(ctx, r, [176, 140, 86]); rect(ctx, 2, 3, 13, 12, [236, 226, 196]); for (let y = 4; y < 12; y += 2) rect(ctx, 3, y, 6, y, [120, 110, 100]); rect(ctx, 7, 3, 8, 12, [150, 110, 70]); };
  PAINTERS.lectern_front = function (ctx, r) { PAINTERS.lectern_side(ctx, r); rect(ctx, 4, 4, 11, 11, [110, 80, 46]); };
  add('grindstone', 'Grindstone', 'Functional', { top: 'grindstone_top', side: 'grindstone', bottom: 'planks_dark_oak' }, '', { hardness: 2 }, function (ctx, r) {
    planks(ctx, r, [92, 66, 38]);
    for (let y = 1; y < 14; y++) for (let x = 2; x < 14; x++) if (Math.hypot(x - 7.5, y - 7) < 6) px(ctx, x, y, [150, 150, 150], Math.hypot(x - 7.5, y - 7) < 2 ? 0.7 : 1 + (r() - 0.5) * 0.12);
  });
  PAINTERS.grindstone_top = stoneTop([150, 150, 150]);
  add('stonecutter', 'Stonecutter', 'Functional', { top: 'stonecutter_top', side: 'stonecutter', bottom: 'smooth_stone' }, '', { shape: 'slab', hardness: 3.5 }, function (ctx, r) {
    noiseFill(ctx, r, [120, 120, 120], 0.1); rect(ctx, 0, 0, 15, 2, [90, 70, 50]);
  });
  PAINTERS.stonecutter_top = function (ctx, r) { stoneTop([130, 130, 130])(ctx, r); rect(ctx, 1, 7, 14, 8, [200, 200, 210]); };
  add('cauldron', 'Cauldron', 'Functional', { top: 'cauldron_top', side: 'cauldron', bottom: 'cauldron' }, '', { hardness: 2, tier: 0 }, function (ctx, r) {
    noiseFill(ctx, r, [64, 64, 68], 0.12); rect(ctx, 0, 0, 15, 1, [90, 90, 94]); rect(ctx, 4, 13, 11, 15, [40, 40, 44]);
  });
  PAINTERS.cauldron_top = function (ctx, r) { noiseFill(ctx, r, [64, 64, 68], 0.12); rect(ctx, 2, 2, 13, 13, [30, 30, 34]); };
  add('campfire', 'Campfire', 'Functional', { top: 'campfire_top', side: 'campfire', bottom: 'log_oak_top' }, 'glow transparent', { shape: 'slab', hardness: 2, tool: 'axe', needsTool: false, drop: 'charcoal*2' }, function (ctx, r) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (y > 9) px(ctx, x, y, [96, 74, 44], y % 3 === 0 ? 0.7 : 1);
      else if (Math.abs(x - 7.5) < (y + 1) * 0.6 && r() < 0.9) px(ctx, x, y, y < 4 ? [255, 230, 120] : [250, 140, 30], 0.9 + r() * 0.2);
    }
  });
  PAINTERS.campfire_top = function (ctx, r) { rings(ctx, r, [140, 110, 70], [96, 74, 44]); rect(ctx, 5, 5, 10, 10, [250, 160, 40]); };
  add('soul_lantern', 'Soul Lantern', 'Functional', { top: 'lantern_top', side: 'soul_lantern', bottom: 'lantern_top' }, 'transparent glow', { shape: 'lantern', hardness: 3.5, tool: 'pickaxe', needsTool: true }, function (ctx, r) {
    rect(ctx, 5, 9, 10, 15, [60, 70, 80]); rect(ctx, 6, 10, 9, 14, [110, 230, 240]); rect(ctx, 6, 7, 9, 8, [60, 70, 80]);
  });
  add('soul_torch', 'Soul Torch', 'Functional', { top: 'soul_torch_top', side: 'soul_torch', bottom: 'soul_torch' }, 'transparent nosolid glow', { shape: 'torch', hardness: 0 }, function (ctx, r) {
    for (let y = 6; y < 16; y++) { px(ctx, 7, y, [120, 90, 50]); px(ctx, 8, y, [100, 74, 40]); }
    rect(ctx, 7, 4, 8, 5, [110, 230, 240]); px(ctx, 7, 3, [200, 255, 255]);
  });
  PAINTERS.soul_torch_top = function (ctx, r) { rect(ctx, 7, 7, 8, 8, [110, 230, 240]); };
  add('chain', 'Chain', 'Functional', 'chain', 'transparent', { shape: 'rod', hardness: 5, tool: 'pickaxe', needsTool: true }, function (ctx, r) {
    for (let y = 0; y < TILE; y++) { const odd = (y >> 2) & 1; px(ctx, odd ? 6 : 7, y, [70, 76, 90]); px(ctx, odd ? 9 : 8, y, [50, 56, 70]); if (y % 4 === 0) rect(ctx, 6, y, 9, y, [90, 96, 110]); }
  });
  add('lightning_rod', 'Lightning Rod', 'Functional', 'lightning_rod', 'transparent', { shape: 'rod', hardness: 3, tool: 'pickaxe', needsTool: true }, function (ctx, r) {
    for (let y = 3; y < TILE; y++) { px(ctx, 7, y, [220, 130, 90]); px(ctx, 8, y, [180, 100, 70]); }
    rect(ctx, 6, 0, 9, 3, [236, 150, 110]);
  });
  add('bone_block', 'Bone Block', 'Natural', { top: 'bone_block_top', side: 'bone_block', bottom: 'bone_block_top' }, '', { hardness: 2 }, function (ctx, r) {
    noiseFill(ctx, r, [226, 222, 200], 0.05); for (let y = 0; y < TILE; y++) { px(ctx, 3, y, [200, 196, 176]); px(ctx, 12, y, [200, 196, 176]); }
  });
  PAINTERS.bone_block_top = function (ctx, r) { noiseFill(ctx, r, [226, 222, 200], 0.05); rect(ctx, 4, 4, 11, 11, [206, 200, 180]); rect(ctx, 6, 6, 9, 9, [226, 222, 200]); };
  add('redstone_lamp', 'Redstone Lamp', 'Functional', 'redstone_lamp', 'glow', { hardness: 0.3, tool: null, needsTool: false }, function (ctx, r) {
    noiseFill(ctx, r, [230, 170, 90], 0.1); for (let i = 0; i < TILE; i++) { px(ctx, i, 0, [110, 60, 30]); px(ctx, 0, i, [110, 60, 30]); px(ctx, i, 15, [110, 60, 30]); px(ctx, 15, i, [110, 60, 30]); px(ctx, i, 7, [150, 90, 40]); px(ctx, 7, i, [150, 90, 40]); }
  });
  add('chiseled_bookshelf', 'Chiseled Bookshelf', 'Functional', { top: 'chiseled_bookshelf_top', side: 'planks_oak', bottom: 'chiseled_bookshelf_top', front: 'chiseled_bookshelf' }, 'front', { hardness: 1.5, tool: 'axe' });
  PAINTERS.chiseled_bookshelf = (function (ctx, r) {
    planks(ctx, r, [164, 132, 80]); rect(ctx, 1, 1, 14, 6, [60, 40, 22]); rect(ctx, 1, 9, 14, 14, [60, 40, 22]);
    for (let x = 1; x < 15; x += 2) { if (r() < 0.6) rect(ctx, x, 2, x, 6, [[150, 40, 36], [40, 70, 140], [60, 120, 50]][r() * 3 | 0]); if (r() < 0.6) rect(ctx, x, 10, x, 14, [[180, 150, 60], [110, 50, 120], [200, 200, 190]][r() * 3 | 0]); }
  });
  PAINTERS.chiseled_bookshelf_top = function (ctx, r) { rings(ctx, r, [164, 132, 80], [120, 90, 50]); };
  add('decorated_pot', 'Decorated Pot', 'Functional', { top: 'pot_top', side: 'decorated_pot', bottom: 'pot_top' }, '', { hardness: 0, tool: null, needsTool: false, drop: 'brick*4' }, function (ctx, r) {
    noiseFill(ctx, r, [150, 80, 54], 0.08); rect(ctx, 0, 0, 15, 1, [110, 56, 38]); rect(ctx, 3, 5, 12, 10, [110, 56, 38]); rect(ctx, 5, 6, 10, 9, [196, 140, 100]);
  });
  PAINTERS.pot_top = function (ctx, r) { noiseFill(ctx, r, [150, 80, 54], 0.08); rect(ctx, 5, 5, 10, 10, [60, 30, 20]); };
  add('amethyst_cluster', 'Amethyst Cluster', 'Plants', 'amethyst_cluster', 'cross glow', { hardness: 1.5, tool: 'pickaxe', needsTool: false, drop: 'amethyst_shard*2-4' }, function (ctx, r) {
    for (const c of [[4, 9], [8, 3], [11, 8]]) for (let y = c[1]; y < 16; y++) { px(ctx, c[0], y, [200, 150, 240]); px(ctx, c[0] + 1, y, [160, 100, 210]); }
  });
  add('budding_amethyst', 'Budding Amethyst', 'Natural', 'budding_amethyst', '', { hardness: 1.5, drop: 'none' }, function (ctx, r) {
    PAINTERS.amethyst(ctx, r); for (let i = 0; i < 5; i++) { const x = r() * 13 | 0, y = r() * 13 | 0; rect(ctx, x, y, x + 2, y + 2, [60, 30, 90]); px(ctx, x + 1, y + 1, [230, 190, 255]); }
  });
  add('pointed_dripstone', 'Pointed Dripstone', 'Natural', 'pointed_dripstone', 'cross', { hardness: 1.5 }, function (ctx, r) {
    for (let y = 0; y < TILE; y++) { const w = Math.max(0, 3 - y / 5) | 0; rect(ctx, 7 - w, y, 8 + w, y, [134, 108, 92], 0.85 + r() * 0.3); }
  });
  add('suspicious_sand', 'Suspicious Sand', 'Natural', 'suspicious_sand', '', { hardness: 0.25, tool: 'shovel', needsTool: false, gravity: true }, function (ctx, r) {
    PAINTERS.sand(ctx, r); for (let i = 0; i < 6; i++) px(ctx, r() * 16 | 0, r() * 16 | 0, [170, 140, 90]); rect(ctx, 6, 7, 8, 8, [140, 110, 70]);
  });
  add('sculk_sensor', 'Sculk Sensor', 'Natural', { top: 'sculk_sensor_top', side: 'sculk_sensor', bottom: 'sculk' }, 'glow', { shape: 'slab', hardness: 1.5, tool: 'hoe', needsTool: false }, function (ctx, r) {
    noiseFill(ctx, r, [16, 40, 52], 0.2); rect(ctx, 0, 0, 15, 2, [30, 140, 150]);
  });
  PAINTERS.sculk_sensor_top = function (ctx, r) { noiseFill(ctx, r, [16, 40, 52], 0.2); for (const c of [[3, 3], [11, 4], [4, 11], [11, 11]]) rect(ctx, c[0], c[1], c[0] + 1, c[1] + 1, [60, 230, 230]); };
  add('sculk_shrieker', 'Sculk Shrieker', 'Natural', { top: 'shrieker_top', side: 'sculk_shrieker', bottom: 'sculk' }, '', { shape: 'slab', hardness: 3, tool: 'hoe', needsTool: false }, function (ctx, r) {
    noiseFill(ctx, r, [16, 40, 52], 0.2); rect(ctx, 0, 0, 15, 3, [226, 220, 196]);
  });
  PAINTERS.shrieker_top = function (ctx, r) { noiseFill(ctx, r, [226, 220, 196], 0.08); rect(ctx, 4, 4, 11, 11, [20, 60, 70]); rect(ctx, 6, 6, 9, 9, [80, 220, 230]); };
  add('mangrove_roots', 'Mangrove Roots', 'Wood', 'mangrove_roots', 'transparent', { hardness: 0.7, tool: 'axe', needsTool: false }, function (ctx, r) {
    for (let k = 0; k < 6; k++) { let x = r() * 16 | 0; for (let y = 0; y < TILE; y++) { px(ctx, x, y, [84, 64, 46], 0.8 + r() * 0.3); if (r() < 0.3) x += r() < 0.5 ? 1 : -1; } }
  });
  add('muddy_mangrove_roots', 'Muddy Mangrove Roots', 'Wood', 'muddy_mangrove_roots', '', { hardness: 0.7, tool: 'shovel', needsTool: false }, function (ctx, r) {
    noiseFill(ctx, r, [60, 56, 60], 0.15); for (let k = 0; k < 5; k++) { let x = r() * 16 | 0; for (let y = 0; y < TILE; y++) { px(ctx, x, y, [96, 74, 50]); if (r() < 0.3) x += 1; } }
  });
  add('crafter', 'Crafter', 'Functional', { top: 'crafter_top', side: 'crafter', bottom: 'furnace_top' }, '', { hardness: 1.5 }, function (ctx, r) {
    noiseFill(ctx, r, [110, 110, 114], 0.1); rect(ctx, 3, 3, 12, 12, [70, 50, 40]); rect(ctx, 5, 5, 10, 10, [200, 60, 50]);
  });
  PAINTERS.crafter_top = function (ctx, r) { PAINTERS.crafting_top(ctx, r); rect(ctx, 6, 6, 9, 9, [90, 90, 94]); };
})();

// 67
const BLOCKS = [{ id: 0, key: 'air', name: 'Air', cat: null, shape: 'air', hardness: 0 }];
const B = { air: 0 }; // key -> id

// Mining rules filled in from the category when a row doesn't say otherwise.
function blockDefaults(b, p) {
  const k = b.key;
  let hardness = 1.5, tool = 'pickaxe', needsTool = true;
  if (b.cat === 'Natural') { hardness = 0.5; tool = 'shovel'; needsTool = false; if (k === 'grass' || k === 'clay' || k === 'mycelium' || k === 'podzol') hardness = 0.6; }
  else if (b.cat === 'Wood') { hardness = 2; tool = 'axe'; needsTool = false; }
  else if (b.cat === 'Plants') { hardness = 0; tool = null; needsTool = false; }
  else if (b.cat === 'Functional') { hardness = 2.5; tool = 'axe'; needsTool = false; }
  else if (b.cat === 'Ores & Minerals') { hardness = /_ore$/.test(k) ? 3 : 5; }
  if (/_leaves$/.test(k)) { hardness = 0.2; tool = 'hoe'; needsTool = false; }
  if (/^wool_/.test(k)) { hardness = 0.8; tool = null; needsTool = false; }
  if (/^carpet_/.test(k)) { tool = null; needsTool = false; }
  if (k === 'snow') { tool = 'shovel'; needsTool = true; }
  b.hardness = p.hardness !== undefined ? p.hardness : hardness;
  b.tool = p.tool !== undefined ? p.tool : tool;
  b.needsTool = p.needsTool !== undefined ? p.needsTool : needsTool;
  b.tier = p.tier || 0;
}

BLOCK_TABLE.forEach(function (row, i) {
  const id = i + 1, flags = ' ' + (row[4] || '') + ' ', p = row[5] || {};
  const has = function (f) { return flags.indexOf(' ' + f + ' ') >= 0; };
  const t = typeof row[3] === 'string' ? { top: row[3], side: row[3], bottom: row[3] } : Object.assign({}, row[3]);
  if (!t.top) t.top = t.side;
  if (!t.bottom) t.bottom = t.side;
  const b = {
    id: id, key: row[0], name: row[1], cat: row[2], tex: t,
    cross: has('cross'), water: has('water'), lava: has('lava'), waterlogged: has('waterlogged'),
    translucent: has('translucent'), hidden: has('hidden'), gravity: has('gravity'), climb: has('climb'),
    glow: has('glow'), unbreakable: has('unbreakable'), hasFront: has('front'), nosolid: has('nosolid')
  };
  b.transparent = has('transparent') || b.water || b.lava || b.translucent;
  b.shape = p.shape || (b.cross ? 'cross' : b.water || b.lava ? 'liquid' : 'cube');
  ['drop', 'base', 'interact', 'xp', 'blast', 'hot', 'slip', 'slow', 'bouncy', 'sticky', 'web', 'sapling'].forEach(function (f) { if (p[f] !== undefined) b[f] = p[f]; });
  blockDefaults(b, p);
  if (b.unbreakable) b.hardness = -1;
  BLOCKS.push(b);
  B[row[0]] = id;
});
const BLOCK_COUNT = BLOCKS.length;

// Fast lookup tables used by the mesher and physics (indexed by block ID).
const MAX_ID = 1024;
const IS_OPAQUE = new Uint8Array(MAX_ID);    // full cube that hides neighbours and casts shade
const IS_CROSS = new Uint8Array(MAX_ID);     // X-shaped plant sprite
const IS_WATER = new Uint8Array(MAX_ID);
const IS_LAVA = new Uint8Array(MAX_ID);
const IS_LIQUID = new Uint8Array(MAX_ID);
const IS_WATERLIKE = new Uint8Array(MAX_ID); // water, or a plant that lives inside water
const IS_SOLID = new Uint8Array(MAX_ID);     // you collide with it
const IS_SHAPED = new Uint8Array(MAX_ID);    // collides with a set of smaller boxes
BLOCKS.forEach(function (b) {
  if (b.id === 0) return;
  const shaped = ['cube', 'cross', 'liquid', 'fire'].indexOf(b.shape) < 0;
  IS_CROSS[b.id] = b.cross ? 1 : 0;
  IS_WATER[b.id] = b.water ? 1 : 0;
  IS_LAVA[b.id] = b.lava ? 1 : 0;
  IS_LIQUID[b.id] = b.water || b.lava ? 1 : 0;
  IS_WATERLIKE[b.id] = b.water || b.waterlogged ? 1 : 0;
  IS_SHAPED[b.id] = shaped ? 1 : 0;
  IS_OPAQUE[b.id] = b.shape === 'cube' && !b.transparent ? 1 : 0;
  IS_SOLID[b.id] = !b.cross && !b.water && !b.lava && !b.nosolid ? 1 : 0;
});

// ---------- shapes ----------
// Block state ("meta") bits: 0-1 facing (0 south +Z, 1 west -X, 2 north -Z, 3 east +X),
// 2 open, 3 upper half / top half, 4 mounted on a wall.
const META_OPEN = 4, META_TOP = 8, META_WALL = 16;
const FRONT_FACE = [4, 1, 5, 0]; // facing -> mesher face index
const S16 = function (a) { return a.map(function (v) { return v / 16; }); };

// 67
function rotBox(b, f) {
  if (!f) return b;
  const pts = [[b[0], b[2]], [b[3], b[5]]].map(function (p) {
    const x = p[0], z = p[1];
    return f === 1 ? [1 - z, x] : f === 2 ? [1 - x, 1 - z] : [z, 1 - x];
  });
  return [Math.min(pts[0][0], pts[1][0]), b[1], Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), b[4], Math.max(pts[0][1], pts[1][1])];
}
const DIRS4 = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // facing -> (dx, dz)

function connects(world, x, z, y, id) {
  const n = world.get(x, y, z);
  if (!n) return false;
  const s = BLOCKS[n].shape;
  if (s === 'fence' && BLOCKS[id].shape === 'fence') return true;
  if (s === 'pane' && BLOCKS[id].shape === 'pane') return true;
  if ((s === 'wall' || s === 'fence') && BLOCKS[id].shape === 'wall') return true;
  return IS_OPAQUE[n] === 1;
}

// Boxes in block-local units (0..1). `collide` asks for the collision version.
function shapeBoxes(id, meta, world, x, y, z, collide) {
  const b = BLOCKS[id], f = meta & 3;
  switch (b.shape) {
    case 'slab': return [meta & META_TOP ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]];
    case 'carpet': return [[0, 0, 0, 1, 1 / 16, 1]];
    case 'path': return [[0, 0, 0, 1, 15 / 16, 1]];
    case 'bed': return [[0, 0, 0, 1, 9 / 16, 1]];
    case 'enchanting': return [[0, 0, 0, 1, 0.75, 1]];
    case 'chest': return [S16([1, 0, 1, 15, 14, 15])];
    case 'door': return [rotBox(meta & META_OPEN ? [0, 0, 0, 3 / 16, 1, 1] : [0, 0, 0, 1, 1, 3 / 16], f)];
    case 'trapdoor':
      if (meta & META_OPEN) return [rotBox([0, 0, 13 / 16, 1, 1, 1], f)];
      return [meta & META_TOP ? [0, 13 / 16, 0, 1, 1, 1] : [0, 0, 0, 1, 3 / 16, 1]];
    case 'stairs':
      if (meta & META_TOP) return [[0, 0.5, 0, 1, 1, 1], rotBox([0, 0, 0.5, 1, 0.5, 1], f)];
      return [[0, 0, 0, 1, 0.5, 1], rotBox([0, 0.5, 0.5, 1, 1, 1], f)];
    case 'torch': return [meta & META_WALL ? rotBox(S16([7, 3, 14, 9, 13, 16]), f) : S16([7, 0, 7, 9, 10, 9])];
    case 'ladder': return [rotBox([0, 0, 15 / 16, 1, 1, 1], f)];
    case 'lantern': return [S16([5, 0, 5, 11, 7, 11]), S16([6, 7, 6, 10, 9, 10])];
    case 'anvil': return [S16([2, 0, 2, 14, 4, 14]), rotBox(S16([4, 4, 5, 12, 10, 11]), f), rotBox(S16([0, 10, 3, 16, 16, 13]), f)];
    case 'fence': {
      const out = [collide ? [6 / 16, 0, 6 / 16, 10 / 16, 1.5, 10 / 16] : S16([6, 0, 6, 10, 16, 10])];
      for (let d = 0; d < 4; d++) {
        if (!(world ? connects(world, x + DIRS4[d][0], z + DIRS4[d][1], y, id) : d % 2 === 1)) continue;
        if (collide) out.push(rotBox([6 / 16, 0, 10 / 16, 10 / 16, 1.5, 1], d));
        else { out.push(rotBox(S16([7, 6, 10, 9, 9, 16]), d)); out.push(rotBox(S16([7, 12, 10, 9, 15, 16]), d)); }
      }
      return out;
    }
    case 'wall': {
      const out = [collide ? [4 / 16, 0, 4 / 16, 12 / 16, 1.5, 12 / 16] : S16([4, 0, 4, 12, 16, 12])];
      for (let d = 0; d < 4; d++) {
        if (!(world ? connects(world, x + DIRS4[d][0], z + DIRS4[d][1], y, id) : d % 2 === 1)) continue;
        out.push(collide ? rotBox([5 / 16, 0, 12 / 16, 11 / 16, 1.5, 1], d) : rotBox(S16([5, 0, 12, 11, 14, 16]), d));
      }
      return out;
    }
    case 'cake': return [[1 / 16 + (meta & 7) / 8, 0, 1 / 16, 15 / 16, 0.5, 15 / 16]];
    case 'rod': return [S16([6, 0, 6, 10, 16, 10])];
    case 'pane': {
      const out = [S16([7, 0, 7, 9, 16, 9])];
      let any = false;
      for (let d = 0; d < 4; d++) {
        if (!(world ? connects(world, x + DIRS4[d][0], z + DIRS4[d][1], y, id) : d % 2 === 1)) continue;
        out.push(rotBox(S16([7, 0, 9, 9, 16, 16]), d)); any = true;
      }
      if (!any) for (let d = 0; d < 4; d++) out.push(rotBox(S16([7, 0, 9, 9, 16, 16]), d));
      return out;
    }
    default: return [[0, 0, 0, 1, 1, 1]];
  }
}

// ---------- atlas ----------
// Faces: 0 +X(east), 1 -X(west), 2 +Y(top), 3 -Y(bottom), 4 +Z(south), 5 -Z(north)
const Atlas = {
  canvas: null, uvs: null, tileIndex: {}, tileCanvas: {}, faceTile: new Int16Array(MAX_ID * 6), frontTile: new Int16Array(MAX_ID),
  upperTile: new Int16Array(MAX_ID), avgColor: [], cols: 16, rows: 16,

  build: function () {
    const names = [];
    BLOCKS.forEach(function (b) {
      if (!b.tex) return;
      ['top', 'side', 'bottom', 'front', 'upper'].forEach(function (k) { if (b.tex[k] && names.indexOf(b.tex[k]) < 0) names.push(b.tex[k]); });
    });
    this.rows = Math.ceil(names.length / this.cols);
    const canvas = document.createElement('canvas');
    canvas.width = this.cols * TILE; canvas.height = this.rows * TILE;
    const actx = canvas.getContext('2d');
    names.forEach(function (name, i) {
      const c = document.createElement('canvas'); c.width = c.height = TILE;
      const ctx = c.getContext('2d');
      if (!PAINTERS[name]) throw new Error('No texture painter for ' + name);
      PAINTERS[name](ctx, mulberry32(hashString(name)));
      Atlas.tileCanvas[name] = c;
      Atlas.tileIndex[name] = i;
      actx.drawImage(c, (i % Atlas.cols) * TILE, Math.floor(i / Atlas.cols) * TILE);
    });
    this.canvas = canvas;
    this.uvs = [];
    for (let i = 0; i < this.cols * this.rows; i++) this.uvs.push(this.uv(i));

// 67
    BLOCKS.forEach(function (b) {
      if (!b.tex) return;
      const ti = Atlas.tileIndex;
      const side = ti[b.tex.side];
      const f = [side, side, ti[b.tex.top], ti[b.tex.bottom], side, side];
      for (let k = 0; k < 6; k++) Atlas.faceTile[b.id * 6 + k] = f[k];
      Atlas.frontTile[b.id] = b.tex.front ? ti[b.tex.front] : side;
      Atlas.upperTile[b.id] = b.tex.upper ? ti[b.tex.upper] : side;
      Atlas.avgColor[b.id] = averageColor(Atlas.tileCanvas[b.tex.side]);
    });
  },

  // [u0, v0, u1, v1] for a tile, slightly inset to avoid bleeding.
  uv: function (i) {
    const e = 0.02;
    const tx = i % this.cols, ty = Math.floor(i / this.cols);
    const W = this.cols * TILE, H = this.rows * TILE;
    return [(tx * TILE + e) / W, 1 - ((ty + 1) * TILE - e) / H, ((tx + 1) * TILE - e) / W, 1 - (ty * TILE + e) / H];
  }
};

function averageColor(c) {
  const d = c.getContext('2d').getImageData(0, 0, TILE, TILE).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  n = n || 1;
  return [r / n | 0, g / n | 0, b / n | 0];
}

const shadeCache = {};
function shadedTile(name, f) {
  const key = name + '|' + f;
  if (shadeCache[key]) return shadeCache[key];
  const src = Atlas.tileCanvas[name];
  const c = document.createElement('canvas'); c.width = c.height = TILE;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, TILE, TILE);
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] *= f; img.data[i + 1] *= f; img.data[i + 2] *= f; }
  ctx.putImageData(img, 0, 0);
  return (shadeCache[key] = c);
}

// Isometric icon of a block (any shape), for the hotbar, inventories and manual.
const iconCache = {};
function blockIconCanvas(id) {
  const b = BLOCKS[id], size = 64;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const flat = b.cross || b.shape === 'torch' || b.shape === 'ladder' || b.shape === 'fire' || b.shape === 'rod';
  if (flat) {
    ctx.drawImage(Atlas.tileCanvas[b.tex.side], 8, 8, 48, 48);
  } else if (b.shape === 'door') {
    ctx.drawImage(Atlas.tileCanvas[b.tex.upper], 0, 0, 16, 16, 18, 2, 28, 30);
    ctx.drawImage(Atlas.tileCanvas[b.tex.side], 0, 0, 16, 16, 18, 32, 28, 30);
  } else {
    // Screen projection: +X goes right-down, +Z goes left-down, +Y goes up.
    const P = function (x, y, z) { return [32 + 28 * x - 28 * z, 4 + 14 * x + 14 * z + 28 * (1 - y)]; };
    const boxes = shapeBoxes(id, 0, null, 0, 0, 0, false).slice().sort(function (a, b2) { return (a[0] + a[1] + a[2]) - (b2[0] + b2[1] + b2[2]); });
    const face = function (tile, sx, sy, sw, sh, o, u, v) {
      if (sw <= 0 || sh <= 0) return;
      ctx.setTransform((u[0] - o[0]) / sw, (u[1] - o[1]) / sw, (v[0] - o[0]) / sh, (v[1] - o[1]) / sh, o[0], o[1]);
      ctx.drawImage(tile, sx, sy, sw, sh, 0, 0, sw, sh);
    };
    const front = b.tex.front || b.tex.side;
    boxes.forEach(function (bx) {
      const x0 = bx[0], y0 = bx[1], z0 = bx[2], x1 = bx[3], y1 = Math.min(1, bx[4]), z1 = bx[5];
      face(Atlas.tileCanvas[b.tex.top], x0 * 16, z0 * 16, (x1 - x0) * 16, (z1 - z0) * 16, P(x0, y1, z0), P(x1, y1, z0), P(x0, y1, z1));
      face(shadedTile(front, 0.78), x0 * 16, (1 - y1) * 16, (x1 - x0) * 16, (y1 - y0) * 16, P(x0, y1, z1), P(x1, y1, z1), P(x0, y0, z1));
      face(shadedTile(b.tex.side, 0.6), (1 - z1) * 16, (1 - y1) * 16, (z1 - z0) * 16, (y1 - y0) * 16, P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z1));
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return c;
}
function blockIcon(id) {
  if (!iconCache[id]) iconCache[id] = blockIconCanvas(id).toDataURL();
  return iconCache[id];
}

// 67