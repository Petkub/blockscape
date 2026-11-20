'use strict';
// Turns the block grid into triangles. The world is cut into 16x16x16 chunks; each chunk
// becomes up to four meshes: solid, water, translucent (stained glass, slime) and glowing.
// Only faces that touch air or see-through blocks are emitted, and each corner of a full
// cube is darkened by the blocks around it (ambient occlusion).

// 67
const CS = 16;
let CX = Math.ceil(WX / CS), CZ = Math.ceil(WZ / CS);
const CY = Math.ceil(WY / CS);

// Corners are listed counter-clockwise seen from outside: bottom-left, bottom-right, top-right, top-left.
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.74 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.74 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.52 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.87 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.87 }
];
const AO_CURVE = [0.45, 0.64, 0.82, 1.0];

// For every face corner: the three neighbour offsets (side, side, diagonal) that can shade it.
FACES.forEach(function (F) {
  const a = F.n[0] ? 0 : F.n[1] ? 1 : 2;
  const u = (a + 1) % 3, v = (a + 2) % 3;
  F.ao = F.c.map(function (c) {
    const su = c[u] ? 1 : -1, sv = c[v] ? 1 : -1;
    const s1 = F.n.slice(), s2 = F.n.slice(), cr = F.n.slice();
    s1[u] += su; s2[v] += sv; cr[u] += su; cr[v] += sv;
    return [s1, s2, cr];
  });
});

// 67
const CROSS_QUADS = [
  [[0.15, 0, 0.15], [0.85, 0, 0.85], [0.85, 1, 0.85], [0.15, 1, 0.15]],
  [[0.85, 0, 0.15], [0.15, 0, 0.85], [0.15, 1, 0.85], [0.85, 1, 0.15]]
];
const FIRE_QUADS = [
  [[0, 0, 0.1], [1, 0, 0.1], [1, 1.2, 0.1], [0, 1.2, 0.1]], [[0, 0, 0.9], [1, 0, 0.9], [1, 1.2, 0.9], [0, 1.2, 0.9]],
  [[0.1, 0, 0], [0.1, 0, 1], [0.1, 1.2, 1], [0.1, 1.2, 0]], [[0.9, 0, 0], [0.9, 0, 1], [0.9, 1.2, 1], [0.9, 1.2, 0]]
];

function newBuffer() { return { pos: [], uv: [], col: [], idx: [], n: 0 }; }

function pushQuad(buf, corners, x, y, z, uv, light, flip, doubleSided, lower) {
  const base = buf.n;
  const uvs = [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]];
  for (let k = 0; k < 4; k++) {
    const c = corners[k];
    buf.pos.push(x + c[0], y + c[1] - (lower && c[1] === 1 ? lower : 0), z + c[2]);
    buf.uv.push(uvs[k * 2], uvs[k * 2 + 1]);
    const l = light[k];
    buf.col.push(l, l, l);
  }
  if (flip) buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  if (doubleSided) buf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  buf.n += 4;
}

// 67
function finishBuffer(buf) {
  return {
    n: buf.n,
    pos: new Float32Array(buf.pos),
    uv: new Float32Array(buf.uv),
    col: new Float32Array(buf.col),
    idx: buf.n > 65535 ? new Uint32Array(buf.idx) : new Uint16Array(buf.idx)
  };
}

// Which part of the tile each face of a box shows, so a slab shows half a texture, not a squashed one.
function boxFaceUV(f, b) {
  switch (f) {
    case 0: return [1 - b[5], b[1], 1 - b[2], b[4]];
    case 1: return [b[2], b[1], b[5], b[4]];
    case 2: return [b[0], 1 - b[5], b[3], 1 - b[2]];
    case 3: return [b[0], b[2], b[3], b[5]];
    case 4: return [b[0], b[1], b[3], b[4]];
    default: return [1 - b[3], b[1], 1 - b[0], b[4]];
  }
}
function subUV(uv, r) {
  const du = uv[2] - uv[0], dv = uv[3] - uv[1];
  return [uv[0] + du * r[0], uv[1] + dv * clamp(r[1], 0, 1), uv[0] + du * r[2], uv[1] + dv * clamp(r[3], 0, 1)];
}

// 67
function blockTile(id, meta, f) {
  const b = BLOCKS[id];
  if (b.shape === 'door') return meta & META_TOP ? Atlas.upperTile[id] : Atlas.faceTile[id * 6];
  if (b.hasFront && f === FRONT_FACE[meta & 3]) return Atlas.frontTile[id];
  return Atlas.faceTile[id * 6 + f];
}

// Emit the boxes of a shaped block. Faces flush with the cell edge are hidden behind opaque neighbours.
function pushShaped(buf, world, x, y, z, id, meta, light0) {
  const boxes = shapeBoxes(id, meta, world, x, y, z, false);
  const light = [1, 1, 1, 1];
  for (const b of boxes) {
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const edge = f === 0 ? b[3] >= 1 : f === 1 ? b[0] <= 0 : f === 2 ? b[4] >= 1 : f === 3 ? b[1] <= 0 : f === 4 ? b[5] >= 1 : b[2] <= 0;
      if (edge && world && IS_OPAQUE[world.get(x + F.n[0], y + F.n[1], z + F.n[2])]) continue;
      const corners = F.c.map(function (c) { return [c[0] ? b[3] : b[0], c[1] ? b[4] : b[1], c[2] ? b[5] : b[2]]; });
      const uv = subUV(Atlas.uvs[blockTile(id, meta, f)], boxFaceUV(f, b));
      light[0] = light[1] = light[2] = light[3] = F.shade * light0;
      pushQuad(buf, corners, x, y, z, uv, light, false, false, 0);
    }
  }
}

function buildChunk(world, cx, cy, cz) {
  const solid = newBuffer(), water = newBuffer(), trans = newBuffer(), glow = newBuffer();
  const x0 = cx * CS, y0 = cy * CS, z0 = cz * CS;
  const x1 = Math.min(x0 + CS, WX), y1 = Math.min(y0 + CS, WY), z1 = Math.min(z0 + CS, WZ);
  const data = world.data;
  const light = [1, 1, 1, 1], ao = [3, 3, 3, 3];

// 67
  for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const index = x + z * WX + y * WXZ;
    const id = data[index];
    if (!id) continue;
    const b = BLOCKS[id];

    if (b.shape === 'fire') {
      const uv = Atlas.uvs[Atlas.faceTile[id * 6]];
      light[0] = light[1] = light[2] = light[3] = 1;
      for (const q of FIRE_QUADS) pushQuad(glow, q, x, y, z, uv, light, false, true, 0);
      continue;
    }
    if (IS_CROSS[id]) {
      const uv = Atlas.uvs[Atlas.faceTile[id * 6]];
      light[0] = light[1] = light[2] = light[3] = 0.95;
      for (const q of CROSS_QUADS) pushQuad(b.glow ? glow : solid, q, x, y, z, uv, light, false, true, 0);
      continue;
    }
    const meta = world.meta.size ? (world.meta.get(index) || 0) : 0;
    if (IS_SHAPED[id]) { pushShaped(b.glow ? glow : solid, world, x, y, z, id, meta, 1); continue; }

    const liquid = IS_LIQUID[id];
    const isWater = IS_WATER[id];
    const lower = liquid && (isWater ? !IS_WATERLIKE[world.get(x, y + 1, z)] : world.get(x, y + 1, z) !== id) ? 0.12 : 0;
    const out = isWater ? water : b.glow ? glow : b.translucent ? trans : solid;

// 67
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nb = world.get(x + F.n[0], y + F.n[1], z + F.n[2]);
      if (nb !== 0) {
        if (IS_OPAQUE[nb]) continue;
        if (nb === id) continue;
        if (isWater && IS_WATERLIKE[nb]) continue;
      }
      const uv = Atlas.uvs[blockTile(id, meta, f)];

      if (liquid || b.glow) {
        light[0] = light[1] = light[2] = light[3] = b.glow ? 1 : F.shade;
        pushQuad(out, F.c, x, y, z, uv, light, false, false, lower);
        continue;
      }
      for (let k = 0; k < 4; k++) {
        const o = F.ao[k];
        const s1 = IS_OPAQUE[world.get(x + o[0][0], y + o[0][1], z + o[0][2])];
        const s2 = IS_OPAQUE[world.get(x + o[1][0], y + o[1][1], z + o[1][2])];
        const cr = IS_OPAQUE[world.get(x + o[2][0], y + o[2][1], z + o[2][2])];
        ao[k] = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
        light[k] = F.shade * AO_CURVE[ao[k]];
      }
      pushQuad(out, F.c, x, y, z, uv, light, ao[0] + ao[2] > ao[1] + ao[3], false, 0);
    }
  }
  return { solid: finishBuffer(solid), water: finishBuffer(water), trans: finishBuffer(trans), glow: finishBuffer(glow) };
}

// One block centred on the origin, for the block in your hand, dropped items and lit TNT.
function buildBlockBuffer(id, meta) {
  const buf = newBuffer(), b = BLOCKS[id];
  if (b.cross || b.shape === 'fire' || b.shape === 'torch' || b.shape === 'ladder') {
    pushQuad(buf, [[0, 0, 0.5], [1, 0, 0.5], [1, 1, 0.5], [0, 1, 0.5]], -0.5, -0.5, -0.5, Atlas.uvs[Atlas.faceTile[id * 6]], [1, 1, 1, 1], false, true, 0);
  } else if (b.shape === 'door') {
    pushShaped(buf, null, -0.5, -0.5, -0.5, id, META_TOP, 1);
  } else if (IS_SHAPED[id]) {
    pushShaped(buf, null, -0.5, -0.5, -0.5, id, meta || 0, 1);
  } else {
    for (let f = 0; f < 6; f++) {
      const s = FACES[f].shade;
      pushQuad(buf, FACES[f].c, -0.5, -0.5, -0.5, Atlas.uvs[blockTile(id, meta || 0, f)], [s, s, s, s], false, false, 0);
    }
  }
  return finishBuffer(buf);
}

// 67