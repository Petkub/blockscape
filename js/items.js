'use strict';
// Items: everything you can hold. Blocks are items with the same ID as their block;
// other items (tools, food, materials) start at ITEM_BASE.
// A held thing is a "stack": { id, n, dmg, ench, name }.

// 67
const ITEM_BASE = 1000;
const ITEMS = [];
const I = {}; // key -> id (blocks included)
const ITEM_CATEGORIES = ['Tools', 'Combat', 'Food', 'Ingredients'];

// ---------- 16x16 icon painter ----------
function Pix() { this.p = new Array(256).fill(null); }
Pix.prototype.px = function (x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < 16 && y < 16 && c) this.p[y * 16 + x] = c; };
Pix.prototype.line = function (x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let i = 0; i <= n; i++) this.px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, typeof c === 'function' ? c(i / n) : c);
};
Pix.prototype.rect = function (x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.px(x, y, typeof c === 'function' ? c(x, y) : c); };
Pix.prototype.poly = function (pts, c) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let inside = false;
    const X = x + 0.5, Y = y + 0.5;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > Y) !== (yj > Y) && X < (xj - xi) * (Y - yi) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) this.px(x, y, typeof c === 'function' ? c(x, y) : c);
  }
};
Pix.prototype.disc = function (cx, cy, r, c, ry) {
  ry = ry || r;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) this.px(x, y, typeof c === 'function' ? c(x, y) : c);
  }
};
// Dark outline around everything drawn, like vanilla item sprites.
Pix.prototype.outline = function () {
  const o = this.p.slice();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (this.p[y * 16 + x]) continue;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(function (d) { const X = x + d[0], Y = y + d[1]; return X >= 0 && Y >= 0 && X < 16 && Y < 16 ? this.p[Y * 16 + X] : null; }, this).filter(Boolean)[0];
    if (nb) o[y * 16 + x] = mul(nb, 0.32);
  }
  this.p = o;
};
Pix.prototype.canvas = function () {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 256; i++) if (this.p[i]) { ctx.fillStyle = rgba(this.p[i]); ctx.fillRect(i % 16, i / 16 | 0, 1, 1); }
  return c;
};
function lit(c) { return function (x, y) { return mul(c, 1.22 - (x + y) / 32 * 0.5); }; }

const WOOD_H = [150, 112, 54], WOOD_D = [96, 70, 32];
function handle(P, x0, y0, x1, y1) { P.line(x0, y0, x1, y1, WOOD_H); P.line(x0 + 1, y0, x1, y1 + 1, WOOD_D); }
const ICONS = {
  sword(P, m) { P.line(4, 10, 12, 2, mul(m, 1.25)); P.line(5, 10, 13, 2, m); P.line(5, 11, 13, 3, mul(m, 0.78)); P.px(13, 1, mul(m, 1.3)); P.line(2, 9, 6, 13, [70, 52, 30]); P.line(1, 14, 4, 11, WOOD_H); },
  pickaxe(P, m) { handle(P, 2, 13, 10, 5); P.rect(4, 1, 11, 2, function (x, y) { return mul(m, y === 1 ? 1.2 : 0.95); }); P.rect(13, 4, 14, 11, function (x) { return mul(m, x === 14 ? 0.8 : 1); }); P.px(12, 2, m); P.px(12, 3, m); P.px(13, 3, m); },
  axe(P, m) { handle(P, 3, 13, 11, 5); P.poly([[6.5, 2.5], [10, 0.5], [14.5, 4.5], [12.5, 7.5], [9, 6]], lit(m)); },
  shovel(P, m) { handle(P, 2, 13, 9, 6); P.poly([[8.5, 5.5], [11, 1.5], [14.8, 0.8], [14.2, 4.8], [10.5, 7.5]], lit(m)); },
  hoe(P, m) { handle(P, 3, 13, 11, 5); P.rect(6, 2, 12, 3, lit(m)); P.px(12, 4, m); },
  spear(P, m) { P.line(1, 14, 10, 5, WOOD_H); P.line(2, 14, 10, 6, WOOD_D); P.poly([[9.5, 6.5], [11, 2.5], [15, 1], [13.5, 5]], lit(m)); },
  mace(P) { P.line(2, 13, 8, 7, [86, 86, 92]); P.line(3, 13, 8, 8, [56, 56, 60]); P.disc(10.5, 5.5, 3.8, lit([176, 176, 184])); for (const s of [[10, 1], [15, 5], [6, 4], [13, 9]]) P.px(s[0], s[1], [210, 210, 218]); P.px(9, 4, [240, 240, 248]); },
  bow(P) {
    for (let a = -84; a <= -6; a += 2) { const t = a * Math.PI / 180; P.px(1 + 12 * Math.cos(t), 14 + 12 * Math.sin(t), WOOD_H); P.px(1 + 11 * Math.cos(t), 14 + 11 * Math.sin(t), WOOD_D); }
    P.line(3, 3, 12, 12, [230, 230, 230]);
  },
  arrow(P) { P.line(3, 12, 11, 4, [190, 150, 90]); P.poly([[10, 3], [14.5, 1], [13, 5.5]], [200, 200, 206]); P.line(1, 12, 3, 14, [240, 240, 240]); P.line(2, 11, 4, 13, [220, 220, 220]); },
  shield(P) {
    P.rect(3, 1, 12, 10, lit([150, 110, 60])); P.poly([[3, 10.5], [12.9, 10.5], [8, 15.5]], [140, 100, 54]);
    P.line(3, 1, 12, 1, [170, 170, 176]); P.line(3, 1, 3, 10, [170, 170, 176]); P.line(12, 1, 12, 10, [150, 150, 156]); P.rect(7, 5, 8, 7, [190, 190, 196]);
  },
  fishing_rod(P) { P.line(2, 14, 13, 3, WOOD_H); P.line(3, 14, 13, 4, WOOD_D); P.line(14, 3, 14, 12, [225, 225, 225]); P.px(13, 13, [150, 150, 156]); P.px(13, 12, [150, 150, 156]); },
  flint_and_steel(P) { P.rect(9, 7, 14, 8, [180, 180, 186]); P.rect(13, 7, 14, 13, [160, 160, 166]); P.rect(9, 12, 14, 13, [140, 140, 146]); P.poly([[2, 3], [7, 1.5], [8.5, 6], [3.5, 7.5]], lit([70, 70, 76])); },
  bucket(P, m) {
    P.poly([[2.5, 5], [13.5, 5], [12, 14.5], [4, 14.5]], lit([196, 196, 204]));
    P.rect(4, 5, 12, 6, m || [70, 70, 78]);
    P.line(3, 4, 5, 1, [150, 150, 156]); P.line(5, 1, 11, 1, [150, 150, 156]); P.line(11, 1, 13, 4, [150, 150, 156]);
  },
  helmet(P, m) { P.rect(3, 3, 12, 7, lit(m)); P.rect(2, 6, 4, 11, lit(m)); P.rect(11, 6, 13, 11, lit(m)); P.line(3, 3, 12, 3, mul(m, 1.3)); },
  chestplate(P, m) { P.rect(1, 2, 5, 7, lit(m)); P.rect(10, 2, 14, 7, lit(m)); P.rect(4, 4, 11, 14, lit(m)); P.rect(6, 2, 9, 3, null); P.line(7, 6, 7, 13, mul(m, 0.8)); },
  leggings(P, m) { P.rect(3, 2, 12, 5, lit(m)); P.rect(3, 6, 6, 14, lit(m)); P.rect(9, 6, 12, 14, lit(m)); },
  boots(P, m) { P.rect(2, 7, 5, 13, lit(m)); P.rect(2, 12, 7, 14, lit(m)); P.rect(9, 7, 12, 13, lit(m)); P.rect(9, 12, 14, 14, lit(m)); },
  elytra(P) { const c = [146, 140, 176]; P.poly([[7, 1.5], [2, 3.5], [0.8, 12.5], [4, 15], [7, 9]], lit(c)); P.poly([[9, 1.5], [14, 3.5], [15.2, 12.5], [12, 15], [9, 9]], lit(c)); P.line(2, 4, 6, 3, [190, 186, 214]); P.line(14, 4, 10, 3, [190, 186, 214]); },
  firework(P) { P.line(1, 14, 4, 11, WOOD_H); for (let i = 0; i < 3; i++) P.line(4 + i, 11, 10, 5 - i + 1, [200, 40, 40]); P.line(4, 12, 10, 6, [160, 30, 30]); P.poly([[9.5, 3.5], [13, 2.5], [11.5, 6.5]], [240, 240, 236]); },
  pearl(P) { P.disc(7.5, 7.5, 4.8, lit([24, 104, 92])); P.disc(7.5, 7.5, 2, [60, 170, 150]); P.px(6, 6, [150, 240, 220]); },
  ball(P, m) { P.disc(7.5, 8, 5, lit(m)); P.px(5, 5, mul(m, 1.4)); },
  totem(P) { const g = [240, 200, 60]; P.rect(5, 5, 10, 13, lit(g)); P.rect(6, 1, 9, 4, lit(g)); P.rect(2, 6, 13, 7, g); P.px(6, 2, [40, 160, 80]); P.px(9, 2, [40, 160, 80]); P.rect(7, 9, 8, 13, [200, 150, 40]); },
  clock(P) { P.disc(7.5, 7.5, 6.2, lit([230, 190, 60])); P.disc(7.5, 7.5, 4.6, function (x, y) { return y < 8 ? [80, 150, 230] : [30, 30, 80]; }); P.line(7, 7, 7, 4, [240, 240, 240]); },
  compass(P) { P.disc(7.5, 7.5, 6.2, lit([150, 150, 156])); P.disc(7.5, 7.5, 4.6, [230, 230, 220]); P.line(7, 4, 7, 7, [220, 40, 40]); P.line(8, 8, 8, 11, [70, 70, 76]); },
  apple(P, m) { P.disc(7.5, 9, 5.5, lit(m || [214, 36, 40])); P.line(8, 3, 8, 5, [100, 70, 30]); P.px(9, 3, [80, 160, 50]); P.px(10, 2, [80, 160, 50]); P.px(5, 6, [255, 255, 255]); },
  bread(P) { P.poly([[1.5, 10], [8.5, 3], [14, 5], [7, 13]], lit([200, 140, 64])); for (const s of [[5, 8], [7, 6], [9, 7]]) P.px(s[0], s[1], [150, 96, 40]); },
  meat(P, m) { P.poly([[3, 7], [7, 3], [12, 4], [13.5, 9], [9, 13.5], [3.5, 12]], lit(m)); P.line(5, 6, 10, 11, [240, 220, 210]); },
  drumstick(P, m) { P.disc(9.5, 6, 4.3, lit(m)); P.line(6, 9, 2, 13, [236, 230, 210]); P.px(1, 13, [236, 230, 210]); P.px(2, 14, [236, 230, 210]); },
  fish(P, m, m2) { P.disc(7, 8, 5.2, lit(m), 3.2); P.poly([[11, 8], [15.5, 4.5], [15.5, 11.5]], m2 || mul(m, 0.8)); P.px(4, 7, [20, 20, 20]); },
  puffer(P) { P.disc(7.5, 8, 5, lit([230, 200, 60])); for (const s of [[7, 1], [2, 8], [13, 8], [7, 14], [3, 4], [12, 4]]) P.px(s[0], s[1], [240, 236, 200]); P.px(5, 7, [20, 20, 20]); },
  carrot(P, m) { P.poly([[2.5, 13.5], [10.5, 4.5], [13, 7]], lit(m || [240, 130, 30])); P.line(11, 4, 14, 1, [80, 170, 60]); P.line(12, 5, 15, 3, [70, 150, 50]); },
  potato(P, m) { P.disc(7.5, 8, 5.5, lit(m), 4.2); P.px(6, 6, mul(m, 0.7)); P.px(9, 9, mul(m, 0.7)); },
  melon_slice(P) { P.poly([[1.5, 5], [14.5, 5], [8, 13.5]], lit([224, 60, 50])); P.line(1, 5, 14, 5, [90, 160, 50]); P.line(2, 6, 13, 6, [180, 220, 120]); for (const s of [[5, 8], [8, 9], [11, 8]]) P.px(s[0], s[1], [30, 20, 20]); },
  cookie(P) { P.disc(7.5, 8, 5.5, lit([196, 124, 60])); for (const s of [[5, 6], [9, 7], [7, 10], [10, 10]]) P.px(s[0], s[1], [70, 40, 20]); },
  pie(P) { P.poly([[1.5, 9], [14.5, 9], [12, 14], [4, 14]], lit([200, 130, 60])); P.rect(2, 7, 13, 9, [236, 140, 40]); },
  bowl(P, m) { P.poly([[1.5, 7.5], [14.5, 7.5], [11.5, 13.5], [4.5, 13.5]], lit([140, 96, 50])); P.rect(2, 7, 13, 8, m || [70, 46, 22]); },
  strip(P, m) { P.line(3, 12, 12, 3, m); P.line(4, 12, 12, 4, mul(m, 0.75)); P.line(3, 11, 11, 3, mul(m, 1.2)); },
  stick(P) { P.line(3, 12, 12, 3, WOOD_H); P.line(4, 12, 12, 4, WOOD_D); },
  lump(P, m) { P.poly([[3.5, 5], [9, 2.5], [13.5, 6.5], [11, 13], [4, 11.5]], lit(m)); P.px(7, 6, mul(m, 1.5)); P.px(10, 9, mul(m, 1.4)); },
  ingot(P, m) { P.poly([[1.5, 9.5], [8.5, 5], [14.5, 7.5], [7.5, 12.5]], lit(m)); P.line(3, 9, 8, 6, mul(m, 1.35)); },
  nugget(P, m) { P.poly([[5, 8], [8, 5.5], [11, 7.5], [8.5, 11]], lit(m)); },
  gem(P, m) { P.poly([[7.5, 1.5], [13.5, 7], [7.5, 14.5], [1.5, 7]], lit(m)); P.line(5, 6, 7, 4, mul(m, 1.4)); },
  hexgem(P, m) { P.poly([[7.5, 1], [12.5, 4], [12.5, 11], [7.5, 15], [2.5, 11], [2.5, 4]], lit(m)); P.line(5, 4, 5, 10, mul(m, 1.35)); },
  shard(P, m) { P.poly([[9, 1], [12, 6], [8, 15], [4, 9]], lit(m)); P.line(8, 4, 6, 9, mul(m, 1.3)); },
  dust(P, m) { for (const s of [[5, 9, 2.4], [9, 8, 2.8], [7, 11.5, 2.4], [10.5, 11, 2]]) P.disc(s[0], s[1], s[2], lit(m)); },
  flint(P) { P.poly([[4, 3], [11, 2.5], [13, 8], [8, 14], [3, 9]], lit([70, 70, 74])); P.px(8, 5, [130, 130, 136]); },
  string(P) { for (let x = 1; x < 15; x++) P.px(x, 8 + Math.round(Math.sin(x * 0.8) * 2.5), [236, 236, 236]); },
  feather(P) { P.line(2, 14, 12, 4, [200, 200, 196]); P.poly([[4, 10], [10, 2], [14, 2.5], [13, 6], [6, 12.5]], lit([246, 246, 244])); },
  hide(P, m) { P.poly([[3, 3], [13, 2.5], [12, 7], [14, 13], [7, 13.5], [2, 12], [4, 7]], lit(m)); },
  bone(P) { P.line(4, 11, 11, 4, [238, 234, 220]); P.line(5, 11, 11, 5, [206, 202, 188]); for (const s of [[3, 11], [4, 13], [11, 3], [13, 4]]) P.disc(s[0] + 0.5, s[1] + 0.5, 1.4, [238, 234, 220]); },
  paper(P) { P.poly([[2, 4], [11, 1.5], [14, 11], [5, 14]], lit([240, 240, 232])); P.line(5, 6, 10, 4, [200, 200, 190]); P.line(6, 9, 11, 7, [200, 200, 190]); },
  book(P, m) { P.rect(3, 2, 13, 14, lit(m || [120, 64, 34])); P.rect(4, 13, 13, 14, [236, 232, 220]); P.line(3, 2, 3, 14, mul(m || [120, 64, 34], 0.6)); },
  sac(P, m) { P.disc(7.5, 9, 5, lit(m), 4.5); P.rect(7, 2, 8, 5, m); },
  wheat(P) { for (const s of [[7, 2], [4, 3], [11, 3], [2, 6], [13, 6]]) P.line(7.5, 14, s[0], s[1], function (t) { return t > 0.6 ? [230, 196, 70] : [200, 160, 50]; }); },
  egg(P) { P.disc(7.5, 8.5, 4.5, lit([236, 220, 180]), 5.8); },
  scroll(P, m) { P.rect(3, 3, 12, 12, lit(m)); },
  trident(P) { P.line(1, 14, 10, 5, [70, 140, 130]); P.line(2, 14, 10, 6, [40, 100, 96]); P.line(10, 5, 14, 1, [90, 200, 180]); P.line(9, 2, 12, 2, [90, 200, 180]); P.line(9, 2, 9, 5, [90, 200, 180]); P.line(13, 5, 13, 8, [90, 200, 180]); P.line(10, 8, 13, 8, [90, 200, 180]); },
  crossbow(P) { P.line(2, 13, 12, 3, WOOD_H); P.line(3, 13, 12, 4, WOOD_D); P.line(5, 3, 13, 11, [130, 130, 136]); P.line(5, 3, 2, 6, [220, 220, 220]); P.line(13, 11, 10, 14, [220, 220, 220]); P.rect(7, 7, 8, 8, [170, 170, 176]); },
  spyglass(P) { P.line(3, 12, 11, 4, [200, 120, 70]); P.line(4, 12, 12, 4, [160, 90, 50]); P.line(4, 13, 12, 5, [130, 70, 40]); P.rect(11, 2, 13, 4, [170, 120, 230]); },
  bottle(P, m) { P.rect(6, 1, 9, 3, [200, 220, 230]); P.poly([[3.5, 5], [12.5, 5], [13, 14.5], [3, 14.5]], m ? lit(m) : [210, 230, 240]); P.rect(4, 4, 11, 5, [230, 240, 248]); },
  berries(P, m) { P.line(8, 1, 8, 6, [70, 120, 40]); for (const s of [[5, 9], [10, 8], [7, 12], [11, 12]]) P.disc(s[0] + 0.5, s[1] + 0.5, 2.3, lit(m)); },
  beetroot(P) { P.poly([[5, 6], [11, 6], [10, 12], [8, 15], [6, 12]], lit([170, 30, 50])); P.line(8, 6, 6, 1, [70, 140, 50]); P.line(8, 6, 10, 1, [70, 140, 50]); },
  chorus(P) { P.disc(7.5, 8.5, 5.5, lit([150, 90, 160])); P.px(5, 6, [200, 160, 210]); P.px(9, 10, [110, 60, 120]); },
  star(P) { P.poly([[8, 0.5], [10, 6], [15.5, 6.5], [11, 10], [12.5, 15.5], [8, 12.5], [3.5, 15.5], [5, 10], [0.5, 6.5], [6, 6]], lit([240, 240, 220])); },
  shell(P) { P.disc(8, 9, 6, lit([220, 196, 170])); for (let a = 0; a < 6.2; a += 0.3) P.px(8 + Math.cos(a) * a * 0.8, 9 + Math.sin(a) * a * 0.8, [150, 110, 90]); },
  horn(P) { P.poly([[2, 12], [10, 4], [14, 1], [13, 5], [5, 14]], lit([196, 186, 170])); P.line(3, 13, 12, 3, [150, 140, 126]); },
  disc(P, m) { P.disc(7.5, 7.5, 6.8, [34, 34, 38]); P.disc(7.5, 7.5, 2.4, m); P.px(7, 7, [10, 10, 10]); P.px(4, 4, [80, 80, 90]); },
  tag(P) { P.poly([[4, 2], [14, 2], [14, 11], [7, 14], [2, 9]], lit([214, 196, 150])); P.px(11, 4, [80, 60, 40]); P.line(4, 7, 9, 7, [150, 130, 100]); }
,
  spawn_egg(P, m, m2) { P.disc(7.5, 8.5, 5, lit(m), 6.2); for (const sp of [[5, 6], [9, 5], [10, 10], [6, 11], [8, 8]]) P.disc(sp[0], sp[1], 1.1, m2); P.px(5, 4, mul(m, 1.4)); },
  saddle(P) { P.poly([[2, 9], [5, 5], [11, 5], [14, 9], [12, 12], [4, 12]], lit([140, 80, 40])); P.rect(5, 11, 6, 14, [120, 120, 126]); P.rect(10, 11, 11, 14, [120, 120, 126]); P.rect(6, 5, 10, 6, [100, 56, 26]); },
  lead(P) { for (let a = 0; a < 6.2; a += 0.25) P.px(7.5 + Math.cos(a) * 5, 7.5 + Math.sin(a) * 5, [196, 160, 110]); P.line(12, 11, 14, 14, [196, 160, 110]); },
  eye(P) { P.disc(7.5, 7.5, 5.5, lit([40, 120, 90])); P.disc(7.5, 7.5, 2.6, [30, 200, 140]); P.rect(7, 4, 8, 11, [16, 30, 24]); },
  fire_charge(P) { P.disc(7.5, 7.5, 5.5, lit([60, 40, 30])); for (const sp of [[5, 6], [9, 5], [8, 9], [6, 10], [10, 10]]) P.px(sp[0], sp[1], [250, 150, 40]); P.px(7, 7, [255, 230, 120]); },
  skull(P, m) { P.rect(3, 3, 12, 12, lit(m)); P.rect(5, 6, 6, 7, [10, 10, 10]); P.rect(9, 6, 10, 7, [10, 10, 10]); P.rect(6, 10, 9, 10, [10, 10, 10]); },
  brush(P) { P.line(2, 13, 9, 6, WOOD_H); P.line(3, 13, 9, 7, WOOD_D); P.rect(9, 3, 13, 7, [200, 120, 80]); P.rect(10, 1, 14, 4, [236, 220, 190]); },
  horse_armor(P, m) { P.poly([[2, 6], [8, 3], [14, 6], [13, 12], [3, 12]], lit(m)); P.rect(4, 12, 5, 14, mul(m, 0.7)); P.rect(11, 12, 12, 14, mul(m, 0.7)); P.px(7, 5, mul(m, 1.4)); },
  fish_bucket(P, m) { ICONS.bucket(P, [50, 100, 220]); P.disc(7.5, 6, 2.6, lit(m), 1.6); P.px(10, 6, mul(m, 0.7)); },
  xp_bottle(P) { P.rect(6, 1, 9, 3, [200, 220, 230]); P.poly([[3.5, 5], [12.5, 5], [13, 14.5], [3, 14.5]], lit([120, 230, 80])); P.px(6, 8, [230, 255, 200]); },
  wolf_armor(P) { P.poly([[2, 5], [13, 5], [14, 11], [8, 13], [1, 11]], lit([170, 130, 100])); P.line(3, 7, 12, 7, [200, 160, 130]); P.px(4, 9, [110, 80, 60]); P.px(11, 9, [110, 80, 60]); }
};

// ---------- registry ----------
let nextItemId = ITEM_BASE;
function defItem(key, name, cat, icon, props) {
  const it = Object.assign({ id: nextItemId++, key: key, name: name, cat: cat, icon: icon, stack: 64 }, props || {});
  if (it.dur) it.stack = 1;
  ITEMS[it.id] = it;
  I[key] = it.id;
  return it;
}
// Blocks become items with the same ID.
BLOCKS.forEach(function (b) {
  if (!b.id || b.hidden) return;
  ITEMS[b.id] = { id: b.id, key: b.key, name: b.name, cat: b.cat, block: b.id, stack: 64 };
  I[b.key] = b.id;
});

// 67
// Tools and weapons
const TIERS = [
  ['wooden', 'Wooden', [160, 124, 70], 59, 2, 0, '#planks'],
  ['stone', 'Stone', [140, 140, 142], 131, 4, 1, '#stone_mat'],
  ['iron', 'Iron', [226, 226, 230], 250, 6, 2, 'iron_ingot'],
  ['golden', 'Golden', [250, 220, 80], 32, 12, 0, 'gold_ingot'],
  ['diamond', 'Diamond', [100, 236, 226], 1561, 8, 3, 'diamond']
];
const TOOL_STATS = {
  sword: { dmg: [4, 5, 6, 4, 7], spd: [1.6, 1.6, 1.6, 1.6, 1.6] },
  axe: { dmg: [7, 9, 9, 7, 9], spd: [0.8, 0.8, 0.9, 1.0, 1.0] },
  pickaxe: { dmg: [2, 3, 4, 2, 5], spd: [1.2, 1.2, 1.2, 1.2, 1.2] },
  shovel: { dmg: [2.5, 3.5, 4.5, 2.5, 5.5], spd: [1, 1, 1, 1, 1] },
  hoe: { dmg: [1, 1, 1, 1, 1], spd: [1, 2, 3, 1, 4] },
  spear: { dmg: [2, 2.5, 3, 2, 3.5], spd: [1.1, 1.1, 1.1, 1.1, 1.1] }
};
TIERS.forEach(function (t, ti) {
  Object.keys(TOOL_STATS).forEach(function (kind) {
    const nice = kind.charAt(0).toUpperCase() + kind.slice(1);
    defItem(t[0] + '_' + kind, t[1] + ' ' + nice, kind === 'sword' || kind === 'spear' ? 'Combat' : 'Tools', [kind, t[2]], {
      kind: kind, dur: t[3], dmg: TOOL_STATS[kind].dmg[ti], aspd: TOOL_STATS[kind].spd[ti],
      tool: kind === 'sword' || kind === 'spear' ? null : { type: kind, tier: t[5], speed: t[4] },
      tierIndex: ti, mat: t[6], fuel: t[0] === 'wooden' ? 200 : 0
    });
  });
});
defItem('mace', 'Mace', 'Combat', ['mace'], { kind: 'mace', dur: 500, dmg: 6, aspd: 0.6 });
defItem('bow', 'Bow', 'Combat', ['bow'], { kind: 'bow', dur: 384, use: 'bow', fuel: 300 });
defItem('arrow', 'Arrow', 'Combat', ['arrow']);
defItem('shield', 'Shield', 'Combat', ['shield'], { kind: 'shield', dur: 336, use: 'shield', fuel: 300 });
defItem('golden_apple', 'Golden Apple', 'Combat', ['apple', [250, 210, 60]], { food: { h: 4, s: 9.6, always: true, fx: [['regeneration', 2, 5], ['absorption', 1, 120]] } });
defItem('enchanted_golden_apple', 'Enchanted Golden Apple', 'Combat', ['apple', [250, 210, 60]], { glint: true, food: { h: 4, s: 9.6, always: true, fx: [['regeneration', 2, 20], ['absorption', 4, 120], ['resistance', 1, 300], ['fire_resistance', 1, 300]] } });
defItem('elytra', 'Elytra', 'Combat', ['elytra'], { kind: 'elytra', dur: 432, armor: { slot: 1, pts: 0, tough: 0 }, mat: 'phantom_membrane' });
defItem('firework_rocket', 'Firework Rocket', 'Combat', ['firework'], { use: 'rocket' });
defItem('totem_of_undying', 'Totem of Undying', 'Combat', ['totem'], { stack: 1 });
defItem('ender_pearl', 'Ender Pearl', 'Combat', ['pearl'], { stack: 16, use: 'pearl' });
defItem('snowball', 'Snowball', 'Combat', ['ball', [244, 248, 252]], { stack: 16, use: 'snowball' });

// Armour: three materials, four pieces each
const ARMORS = [
  ['leather', [150, 92, 52], 5, [1, 3, 2, 1], 0, 'leather', ['Leather Cap', 'Leather Tunic', 'Leather Pants', 'Leather Boots']],
  ['iron', [214, 214, 220], 15, [2, 6, 5, 2], 0, 'iron_ingot', ['Iron Helmet', 'Iron Chestplate', 'Iron Leggings', 'Iron Boots']],
  ['diamond', [96, 230, 220], 33, [3, 8, 6, 3], 2, 'diamond', ['Diamond Helmet', 'Diamond Chestplate', 'Diamond Leggings', 'Diamond Boots']]
];
const ARMOR_PIECES = [['helmet', 11], ['chestplate', 16], ['leggings', 15], ['boots', 13]];
ARMORS.forEach(function (a) {
  ARMOR_PIECES.forEach(function (piece, slot) {
    defItem(a[0] + '_' + piece[0], a[6][slot], 'Combat', [piece[0], a[1]], { kind: piece[0], dur: piece[1] * a[2], armor: { slot: slot, pts: a[3][slot], tough: a[4], mat: a[0], color: a[1] }, mat: a[5] });
  });
});

// Tools
defItem('bucket', 'Bucket', 'Tools', ['bucket'], { stack: 16, use: 'bucket' });
defItem('water_bucket', 'Water Bucket', 'Tools', ['bucket', [50, 100, 220]], { stack: 1, use: 'water_bucket' });
defItem('lava_bucket', 'Lava Bucket', 'Tools', ['bucket', [240, 110, 20]], { stack: 1, use: 'lava_bucket', fuel: 20000 });
defItem('milk_bucket', 'Milk Bucket', 'Tools', ['bucket', [246, 246, 246]], { stack: 1, use: 'milk' });
defItem('flint_and_steel', 'Flint and Steel', 'Tools', ['flint_and_steel'], { kind: 'flint', dur: 64, use: 'flint' });
defItem('fishing_rod', 'Fishing Rod', 'Tools', ['fishing_rod'], { kind: 'rod', dur: 64, use: 'rod', fuel: 300 });
defItem('clock', 'Clock', 'Tools', ['clock']);
defItem('compass', 'Compass', 'Tools', ['compass']);

// Food: h = hunger points, s = saturation
[
  ['apple', 'Apple', ['apple'], 4, 2.4],
  ['bread', 'Bread', ['bread'], 5, 6],
  ['beef', 'Raw Beef', ['meat', [204, 62, 62]], 3, 1.8], ['cooked_beef', 'Steak', ['meat', [140, 84, 44]], 8, 12.8],
  ['porkchop', 'Raw Porkchop', ['meat', [240, 150, 150]], 3, 1.8], ['cooked_porkchop', 'Cooked Porkchop', ['meat', [196, 130, 76]], 8, 12.8],
  ['mutton', 'Raw Mutton', ['meat', [214, 80, 80]], 2, 1.2], ['cooked_mutton', 'Cooked Mutton', ['meat', [160, 96, 54]], 6, 9.6],
  ['chicken', 'Raw Chicken', ['drumstick', [240, 190, 170]], 2, 1.2, [['hunger', 1, 30, 0.3]]], ['cooked_chicken', 'Cooked Chicken', ['drumstick', [200, 140, 70]], 6, 7.2],
  ['rabbit', 'Raw Rabbit', ['meat', [230, 160, 150]], 3, 1.8], ['cooked_rabbit', 'Cooked Rabbit', ['meat', [190, 120, 70]], 5, 6],
  ['cod', 'Raw Cod', ['fish', [176, 150, 116]], 2, 0.4], ['cooked_cod', 'Cooked Cod', ['fish', [210, 170, 110]], 5, 6],
  ['salmon', 'Raw Salmon', ['fish', [220, 90, 80]], 2, 0.4], ['cooked_salmon', 'Cooked Salmon', ['fish', [210, 120, 70]], 6, 9.6],
  ['tropical_fish', 'Tropical Fish', ['fish', [242, 140, 30], [250, 250, 250]], 1, 0.2],
  ['pufferfish', 'Pufferfish', ['puffer'], 1, 0.2, [['hunger', 3, 15], ['poison', 2, 60], ['nausea', 1, 15]]],
  ['carrot', 'Carrot', ['carrot'], 3, 3.6], ['golden_carrot', 'Golden Carrot', ['carrot', [250, 210, 60]], 6, 14.4],
  ['potato', 'Potato', ['potato', [196, 156, 76]], 1, 0.6], ['baked_potato', 'Baked Potato', ['potato', [220, 170, 70]], 5, 6],
  ['melon_slice', 'Melon Slice', ['melon_slice'], 2, 1.2],
  ['cookie', 'Cookie', ['cookie'], 2, 0.4],
  ['pumpkin_pie', 'Pumpkin Pie', ['pie'], 8, 4.8],
  ['mushroom_stew', 'Mushroom Stew', ['bowl', [190, 140, 90]], 6, 7.2, null, 'bowl'],
  ['rotten_flesh', 'Rotten Flesh', ['meat', [120, 140, 64]], 4, 0.8, [['hunger', 1, 30, 0.8]]],
  ['dried_kelp', 'Dried Kelp', ['strip', [60, 84, 40]], 1, 0.6]
].forEach(function (f) {
  defItem(f[0], f[1], 'Food', f[2], { food: { h: f[3], s: f[4], fx: f[5] || null, returns: f[6] || null, time: f[0] === 'dried_kelp' ? 0.8 : 1.6 }, stack: f[6] ? 1 : 64 });
});

// Ingredients and materials
[
  ['stick', 'Stick', ['stick'], { fuel: 100 }],
  ['coal', 'Coal', ['lump', [44, 44, 48]], { fuel: 1600 }], ['charcoal', 'Charcoal', ['lump', [70, 58, 46]], { fuel: 1600 }],
  ['raw_iron', 'Raw Iron', ['lump', [204, 172, 140]]], ['raw_gold', 'Raw Gold', ['lump', [236, 186, 60]]], ['raw_copper', 'Raw Copper', ['lump', [196, 112, 80]]],
  ['iron_ingot', 'Iron Ingot', ['ingot', [224, 224, 228]]], ['gold_ingot', 'Gold Ingot', ['ingot', [252, 216, 70]]],
  ['copper_ingot', 'Copper Ingot', ['ingot', [224, 132, 92]]], ['netherite_ingot', 'Netherite Ingot', ['ingot', [76, 68, 72]]],
  ['iron_nugget', 'Iron Nugget', ['nugget', [220, 220, 224]]], ['gold_nugget', 'Gold Nugget', ['nugget', [252, 216, 70]]],
  ['diamond', 'Diamond', ['gem', [100, 236, 226]]], ['emerald', 'Emerald', ['hexgem', [50, 210, 100]]],
  ['lapis_lazuli', 'Lapis Lazuli', ['gem', [40, 70, 190]]], ['redstone', 'Redstone Dust', ['dust', [210, 20, 16]]],
  ['quartz_crystal', 'Nether Quartz', ['shard', [236, 230, 222]]], ['amethyst_shard', 'Amethyst Shard', ['shard', [170, 120, 230]]],
  ['glowstone_dust', 'Glowstone Dust', ['dust', [250, 210, 110]]], ['gunpowder', 'Gunpowder', ['dust', [110, 110, 112]]],
  ['sugar', 'Sugar', ['dust', [246, 246, 246]]], ['bone_meal', 'Bone Meal', ['dust', [226, 226, 214]]],
  ['flint', 'Flint', ['flint']], ['string', 'String', ['string']], ['feather', 'Feather', ['feather']],
  ['leather', 'Leather', ['hide', [150, 92, 52]]], ['rabbit_hide', 'Rabbit Hide', ['hide', [196, 158, 116]]],
  ['bone', 'Bone', ['bone']], ['paper', 'Paper', ['paper']], ['book', 'Book', ['book']],
  ['ink_sac', 'Ink Sac', ['sac', [36, 36, 44]]], ['wheat', 'Wheat', ['wheat']], ['egg', 'Egg', ['egg'], { stack: 16 }],
  ['slime_ball', 'Slimeball', ['ball', [110, 200, 90]]], ['clay_ball', 'Clay Ball', ['ball', [164, 170, 186]]],
  ['brick', 'Brick', ['ingot', [176, 84, 60]]], ['nether_brick', 'Nether Brick', ['ingot', [76, 34, 40]]],
  ['bowl', 'Bowl', ['bowl'], { fuel: 100 }], ['turtle_scute', 'Turtle Scute', ['hexgem', [70, 150, 60]]], ['armadillo_scute', 'Armadillo Scute', ['hexgem', [150, 110, 90]]]
].forEach(function (m) { defItem(m[0], m[1], 'Ingredients', m[2], m[3]); });
WOOL_COLORS.forEach(function (w) { defItem(w[0] + '_dye', w[1] + ' Dye', 'Ingredients', ['dust', w[2]]); });
defItem('enchanted_book', 'Enchanted Book', 'Enchanted Books', ['book', [150, 80, 170]], { stack: 1, glint: true, kind: 'book' });

// More vanilla items
defItem('trident', 'Trident', 'Combat', ['trident'], { kind: 'trident', dur: 250, dmg: 9, aspd: 1.1, use: 'trident' });
defItem('crossbow', 'Crossbow', 'Combat', ['crossbow'], { kind: 'crossbow', dur: 465, use: 'crossbow', fuel: 300 });
defItem('turtle_helmet', 'Turtle Shell', 'Combat', ['helmet', [70, 150, 60]], { kind: 'helmet', dur: 275, armor: { slot: 0, pts: 2, tough: 0, mat: 'turtle', color: [70, 150, 60] }, mat: 'turtle_scute' });
defItem('heavy_core', 'Heavy Core', 'Ingredients', ['lump', [70, 70, 80]]);
defItem('breeze_rod', 'Breeze Rod', 'Ingredients', ['strip', [170, 190, 240]]);
defItem('spyglass', 'Spyglass', 'Tools', ['spyglass'], { stack: 1, use: 'spyglass' });
defItem('goat_horn', 'Goat Horn', 'Tools', ['horn'], { stack: 1, use: 'horn' });
defItem('name_tag', 'Name Tag', 'Tools', ['tag'], { use: 'name_tag' });
[['13', [240, 200, 60]], ['cat', [90, 200, 60]], ['pigstep', [230, 120, 160]]].forEach(function (d) {
  defItem('music_disc_' + d[0], 'Music Disc', 'Tools', ['disc', d[1]], { stack: 1, disc: d[0] });
  ITEMS[I['music_disc_' + d[0]]].name = 'Music Disc (' + d[0] + ')';
});
[
  ['sweet_berries', 'Sweet Berries', ['berries', [200, 30, 40]], 2, 1.2], ['glow_berries', 'Glow Berries', ['berries', [250, 180, 60]], 2, 0.4],
  ['beetroot', 'Beetroot', ['beetroot'], 1, 1.2], ['beetroot_soup', 'Beetroot Soup', ['bowl', [170, 30, 50]], 6, 7.2, null, 'bowl'],
  ['rabbit_stew', 'Rabbit Stew', ['bowl', [170, 110, 60]], 10, 12, null, 'bowl'], ['spider_eye', 'Spider Eye', ['ball', [150, 30, 50]], 2, 3.2, [['poison', 1, 5]]],
  ['honey_bottle', 'Honey Bottle', ['bottle', [240, 170, 40]], 6, 1.2, null, 'glass_bottle'], ['chorus_fruit', 'Chorus Fruit', ['chorus'], 4, 2.4]
].forEach(function (f) {
  defItem(f[0], f[1], 'Food', f[2], { food: { h: f[3], s: f[4], fx: f[5] || null, returns: f[6] || null, time: f[0] === 'honey_bottle' ? 2 : 1.6, always: f[0] === 'chorus_fruit' }, stack: f[6] === 'bowl' ? 1 : f[0] === 'honey_bottle' ? 16 : 64 });
});
[
  ['glass_bottle', 'Glass Bottle', ['bottle']], ['phantom_membrane', 'Phantom Membrane', ['hide', [180, 190, 210]]], ['honeycomb', 'Honeycomb', ['hexgem', [240, 170, 40]]],
  ['glow_ink_sac', 'Glow Ink Sac', ['sac', [60, 200, 190]]], ['rabbit_foot', "Rabbit's Foot", ['hide', [200, 170, 130]]], ['nautilus_shell', 'Nautilus Shell', ['shell']],
  ['heart_of_the_sea', 'Heart of the Sea', ['gem', [40, 110, 200]]], ['prismarine_shard', 'Prismarine Shard', ['shard', [96, 170, 160]]],
  ['prismarine_crystals', 'Prismarine Crystals', ['dust', [200, 240, 230]]], ['nether_star', 'Nether Star', ['star']]
].forEach(function (m) { defItem(m[0], m[1], 'Ingredients', m[2]); });

// 67
// Orbital cannon shots from Unstable SMP. Each is a fishing rod with 1 durability:
// pull it and the payload lands on the block you are looking at. Creative inventory and /give only.
[['nuke_shot', 'Nuke Shot', 'nuke'], ['stab_shot', 'Stab Shot', 'stab'], ['wither_shot', 'Orbital Wither Shot', 'wither'],
  ['wolf_shot', 'Wolf Cannon Shot', 'wolf'], ['compressed_shot', 'Compressed Orbital Shot', 'compressed']
].forEach(function (o) { defItem(o[0], o[1], 'Combat', ['fishing_rod'], { kind: 'rod', dur: 1, use: 'orbital', orbital: o[2], stack: 1 }); });

// Burn times in ticks (20 per second) for blocks
BLOCKS.forEach(function (b) {
  if (!ITEMS[b.id]) return;
  if (/_(log|planks|fence|stairs|trapdoor)$|^stripped_|bookshelf|crafting_table|chest|barrel|ladder|jukebox|note_block|_table$|loom|composter/.test(b.key) && b.cat !== 'Stone') ITEMS[b.id].fuel = 300;
  if (/_slab$/.test(b.key) && b.cat === 'Wood') ITEMS[b.id].fuel = 150;
  if (/_sapling$|^wool_/.test(b.key)) ITEMS[b.id].fuel = 100;
  if (/^carpet_/.test(b.key)) ITEMS[b.id].fuel = 67;
  if (b.key === 'coal_block') ITEMS[b.id].fuel = 16000;
  if (/_door$/.test(b.key) && b.key !== 'iron_door') { ITEMS[b.id].fuel = 200; ITEMS[b.id].stack = 64; }
});

function itemDef(id) { return ITEMS[id]; }
function maxStack(id) { return (ITEMS[id] && ITEMS[id].stack) || 64; }
function stack(key, n, extra) {
  const id = typeof key === 'number' ? key : I[key];
  if (!ITEMS[id]) return null;
  return Object.assign({ id: id, n: n || 1 }, extra || {});
}
function sameItem(a, b) {
  return a && b && a.id === b.id && (a.dmg || 0) === (b.dmg || 0) && JSON.stringify(a.ench || null) === JSON.stringify(b.ench || null) && (a.name || '') === (b.name || '');
}
function stackName(s) {
  if (!s) return '';
  if (s.name) return s.name;
  return ITEMS[s.id].name;
}

// ---------- icons ----------
const itemCanvasCache = {}, itemIconCache = {};
function itemCanvas(id) {
  if (itemCanvasCache[id]) return itemCanvasCache[id];
  const it = ITEMS[id];
  let c;
  if (it.block) c = blockIconCanvas(it.block);
  else {
    const P = new Pix();
    ICONS[it.icon[0]](P, it.icon[1], it.icon[2]);
    P.outline();
    c = P.canvas();
  }
  return (itemCanvasCache[id] = c);
}
function itemIcon(id) {
  if (!itemIconCache[id]) itemIconCache[id] = ITEMS[id].block ? blockIcon(id) : itemCanvas(id).toDataURL();
  return itemIconCache[id];
}

// ---------- enchantments ----------
const MELEE = ['sword', 'axe', 'spear', 'mace'];
const TOOLS = ['pickaxe', 'axe', 'shovel', 'hoe'];
const ARMOR_KINDS = ['helmet', 'chestplate', 'leggings', 'boots'];
const DURABLE = MELEE.concat(TOOLS, ARMOR_KINDS, ['bow', 'crossbow', 'trident', 'shield', 'elytra', 'rod', 'flint']);
const ENCHANTS = {
  sharpness: { name: 'Sharpness', max: 5, on: ['sword', 'axe', 'spear'], group: 'damage', desc: 'Adds 0.5 damage per level, plus 0.5.' },
  smite: { name: 'Smite', max: 5, on: MELEE, group: 'damage', desc: 'Adds 2.5 damage per level against zombies and skeletons.' },
  bane_of_arthropods: { name: 'Bane of Arthropods', max: 5, on: MELEE, group: 'damage', desc: 'Adds 2.5 damage per level against spiders and scorpions.' },
  knockback: { name: 'Knockback', max: 2, on: ['sword', 'spear'], desc: 'Hits push targets much further.' },
  fire_aspect: { name: 'Fire Aspect', max: 2, on: ['sword', 'mace', 'spear'], desc: 'Sets the target on fire for 4 seconds per level.' },
  looting: { name: 'Looting', max: 3, on: ['sword', 'spear'], desc: 'Animals and mobs drop more items.' },
  efficiency: { name: 'Efficiency', max: 5, on: TOOLS, desc: 'Mines blocks faster.' },
  fortune: { name: 'Fortune', max: 3, on: TOOLS, group: 'mining', desc: 'Ores drop more.' },
  silk_touch: { name: 'Silk Touch', max: 1, on: TOOLS, group: 'mining', desc: 'Blocks drop themselves, even glass and ores.' },
  unbreaking: { name: 'Unbreaking', max: 3, on: DURABLE, desc: 'Items wear out more slowly.' },
  mending: { name: 'Mending', max: 1, on: DURABLE, group: 'xp', desc: 'Experience you collect repairs the item.' },
  protection: { name: 'Protection', max: 4, on: ARMOR_KINDS, group: 'protect', desc: 'Reduces most damage by 4% per level.' },
  fire_protection: { name: 'Fire Protection', max: 4, on: ARMOR_KINDS, group: 'protect', desc: 'Reduces fire and lava damage by 8% per level.' },
  blast_protection: { name: 'Blast Protection', max: 4, on: ARMOR_KINDS, group: 'protect', desc: 'Reduces explosion damage by 8% per level.' },
  projectile_protection: { name: 'Projectile Protection', max: 4, on: ARMOR_KINDS, group: 'protect', desc: 'Reduces arrow damage by 8% per level.' },
  feather_falling: { name: 'Feather Falling', max: 4, on: ['boots'], desc: 'Reduces fall damage by 12% per level.' },
  respiration: { name: 'Respiration', max: 3, on: ['helmet'], desc: 'Adds 15 seconds of breath underwater per level.' },
  thorns: { name: 'Thorns', max: 3, on: ARMOR_KINDS, desc: 'Sometimes hurts whoever hits you.' },
  power: { name: 'Power', max: 5, on: ['bow'], desc: 'Arrows deal 25% more damage per level.' },
  punch: { name: 'Punch', max: 2, on: ['bow'], desc: 'Arrows knock targets back.' },
  flame: { name: 'Flame', max: 1, on: ['bow'], desc: 'Arrows set targets on fire.' },
  infinity: { name: 'Infinity', max: 1, on: ['bow'], group: 'xp', desc: 'Shooting needs one arrow but never uses it up.' },
  density: { name: 'Density', max: 5, on: ['mace'], group: 'mace', desc: 'Smash attacks deal 0.5 more damage per block fallen, per level.' },
  breach: { name: 'Breach', max: 4, on: ['mace'], group: 'mace', desc: 'Ignores 15% of the target\'s armour per level.' },
  wind_burst: { name: 'Wind Burst', max: 3, on: ['mace'], desc: 'A smash attack launches you back into the air.' },
  lunge: { name: 'Lunge', max: 3, on: ['spear'], desc: 'Jabbing dashes you forward. Uses a little hunger.' },
  luck_of_the_sea: { name: 'Luck of the Sea', max: 3, on: ['rod'], desc: 'Better chance of treasure when fishing.' },
  lure: { name: 'Lure', max: 3, on: ['rod'], desc: 'Fish bite 5 seconds sooner per level.' }
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function enchName(key, lvl) { return ENCHANTS[key].name + (ENCHANTS[key].max > 1 || lvl > 1 ? ' ' + (ROMAN[lvl] || lvl) : ''); }
function enchLevel(s, key) { return (s && s.ench && s.ench[key]) || 0; }
function canEnchant(s, key) {
  if (!s) return false;
  const it = ITEMS[s.id];
  if (it.kind === 'book') return true;
  return ENCHANTS[key].on.indexOf(it.kind) >= 0;
}
function enchCompatible(a, b) {
  if (a === b) return true;
  const ga = ENCHANTS[a].group, gb = ENCHANTS[b].group;
  return !(ga && ga === gb);
}

// 67
// ---------- combat numbers ----------
function attackDamage(s) { return s && ITEMS[s.id].dmg ? ITEMS[s.id].dmg : 1; }
function attackSpeed(s) { return s && ITEMS[s.id].aspd ? ITEMS[s.id].aspd : 4; }

// ---------- recipes ----------
const TAGS = {
  '#planks': WOODS.map(function (w) { return w[0] + '_planks'; }).concat(['crimson_planks', 'warped_planks', 'bamboo_planks']),
  '#logs': [].concat.apply([], WOODS.map(function (w) { return [w[0] + '_log', 'stripped_' + w[0] + '_log']; })).concat(['crimson_stem', 'warped_stem', 'stripped_crimson_stem', 'stripped_warped_stem']),
  '#wool': WOOL_COLORS.map(function (w) { return 'wool_' + w[0]; }),
  '#stone_mat': ['cobblestone', 'cobbled_deepslate', 'blackstone'],
  '#coals': ['coal', 'charcoal'],
  '#sand': ['sand', 'red_sand']
};
function matches(ing, id) {
  if (!ing) return !id;
  if (!id) return false;
  const key = ITEMS[id].key;
  return ing.charAt(0) === '#' ? TAGS[ing].indexOf(key) >= 0 : ing === key;
}

const RECIPES = [];
function shaped(out, n, rows, keys) {
  const pat = rows.map(function (r) { return r.split('').map(function (ch) { return ch === ' ' ? null : keys[ch]; }); });
  RECIPES.push({ out: out, n: n, w: rows[0].length, h: rows.length, pat: pat });
}
function shapeless(out, n, ings) { RECIPES.push({ out: out, n: n, ings: ings }); }

WOODS.forEach(function (w) {
  const k = w[0], p = k + '_planks';
  shapeless(p, 4, [k + '_log']); shapeless(p, 4, ['stripped_' + k + '_log']);
  shaped(k + '_slab', 6, ['ppp'], { p: p });
  shaped(k + '_stairs', 4, ['p  ', 'pp ', 'ppp'], { p: p });
  shaped(k + '_door', 3, ['pp', 'pp', 'pp'], { p: p });
  shaped(k + '_trapdoor', 2, ['ppp', 'ppp'], { p: p });
  shaped(k + '_fence', 3, ['psp', 'psp'], { p: p, s: 'stick' });
});
shaped('stick', 4, ['p', 'p'], { p: '#planks' });
shaped('crafting_table', 1, ['pp', 'pp'], { p: '#planks' });
shaped('chest', 1, ['ppp', 'p p', 'ppp'], { p: '#planks' });
shaped('barrel', 1, ['psp', 'p p', 'psp'], { p: '#planks', s: 'oak_slab' });
shaped('furnace', 1, ['ccc', 'c c', 'ccc'], { c: '#stone_mat' });
shaped('smoker', 1, [' l ', 'lfl', ' l '], { l: '#logs', f: 'furnace' });
shaped('blast_furnace', 1, ['iii', 'ifi', 'sss'], { i: 'iron_ingot', f: 'furnace', s: 'smooth_stone' });
shaped('torch', 4, ['c', 's'], { c: '#coals', s: 'stick' });
shaped('lantern', 1, ['nnn', 'ntn', 'nnn'], { n: 'iron_nugget', t: 'torch' });
shaped('ladder', 3, ['s s', 'sss', 's s'], { s: 'stick' });
shaped('red_bed', 1, ['www', 'ppp'], { w: '#wool', p: '#planks' });
shaped('bookshelf', 1, ['ppp', 'bbb', 'ppp'], { p: '#planks', b: 'book' });
shaped('enchanting_table', 1, [' b ', 'dod', 'ooo'], { b: 'book', d: 'diamond', o: 'obsidian' });
shaped('anvil', 1, ['BBB', ' i ', 'iii'], { B: 'iron_block', i: 'iron_ingot' });
shaped('jukebox', 1, ['ppp', 'pdp', 'ppp'], { p: '#planks', d: 'diamond' });
shaped('note_block', 1, ['ppp', 'prp', 'ppp'], { p: '#planks', r: 'redstone' });
shaped('iron_door', 3, ['ii', 'ii', 'ii'], { i: 'iron_ingot' });
shaped('iron_trapdoor', 1, ['ii', 'ii'], { i: 'iron_ingot' });
shaped('iron_bars', 16, ['iii', 'iii'], { i: 'iron_ingot' });
shaped('glass_pane', 16, ['ggg', 'ggg'], { g: 'glass' });
shaped('tnt', 1, ['gsg', 'sgs', 'gsg'], { g: 'gunpowder', s: '#sand' });
shaped('smithing_table', 1, ['ii', 'pp', 'pp'], { i: 'iron_ingot', p: '#planks' });
shaped('cartography_table', 1, ['aa', 'pp', 'pp'], { a: 'paper', p: '#planks' });
shaped('fletching_table', 1, ['ff', 'pp', 'pp'], { f: 'flint', p: '#planks' });
shaped('loom', 1, ['ss', 'pp'], { s: 'string', p: '#planks' });
shaped('composter', 1, ['s s', 's s', 'sss'], { s: 'oak_slab' });
shaped('stone_bricks', 4, ['ss', 'ss'], { s: 'stone' });
shaped('stone_slab', 6, ['sss'], { s: 'stone' });
shaped('smooth_stone_slab', 6, ['sss'], { s: 'smooth_stone' });
shaped('cobblestone_slab', 6, ['sss'], { s: 'cobblestone' });
shaped('cobblestone_stairs', 4, ['s  ', 'ss ', 'sss'], { s: 'cobblestone' });
shaped('stone_brick_slab', 6, ['sss'], { s: 'stone_bricks' });
shaped('stone_brick_stairs', 4, ['s  ', 'ss ', 'sss'], { s: 'stone_bricks' });
shaped('brick_slab', 6, ['sss'], { s: 'bricks' });
shaped('brick_stairs', 4, ['s  ', 'ss ', 'sss'], { s: 'bricks' });
shaped('sandstone_slab', 6, ['sss'], { s: 'sandstone' });
shaped('sandstone_stairs', 4, ['s  ', 'ss ', 'sss'], { s: 'sandstone' });
shaped('chiseled_stone_bricks', 1, ['s', 's'], { s: 'stone_brick_slab' });
shaped('bricks', 1, ['bb', 'bb'], { b: 'brick' });
shaped('nether_bricks', 1, ['bb', 'bb'], { b: 'nether_brick' });
shaped('sandstone', 1, ['ss', 'ss'], { s: 'sand' });
shaped('red_sandstone', 1, ['ss', 'ss'], { s: 'red_sand' });
shaped('cut_sandstone', 4, ['ss', 'ss'], { s: 'sandstone' });
shaped('polished_granite', 4, ['ss', 'ss'], { s: 'granite' });
shaped('polished_diorite', 4, ['ss', 'ss'], { s: 'diorite' });
shaped('polished_andesite', 4, ['ss', 'ss'], { s: 'andesite' });
shaped('deepslate_bricks', 4, ['ss', 'ss'], { s: 'polished_deepslate' });
shaped('deepslate_tiles', 4, ['ss', 'ss'], { s: 'deepslate_bricks' });
shaped('polished_deepslate', 4, ['ss', 'ss'], { s: 'cobbled_deepslate' });
shaped('quartz', 1, ['qq', 'qq'], { q: 'quartz_crystal' });
shaped('quartz_pillar', 2, ['q', 'q'], { q: 'quartz' });
shaped('quartz_bricks', 4, ['qq', 'qq'], { q: 'quartz' });
shaped('mud_bricks', 4, ['mm', 'mm'], { m: 'packed_mud' });
shapeless('packed_mud', 1, ['mud', 'wheat']);
shapeless('mossy_cobblestone', 1, ['cobblestone', 'moss_block']);
shapeless('mossy_stone_bricks', 1, ['stone_bricks', 'moss_block']);
shaped('glowstone', 1, ['gg', 'gg'], { g: 'glowstone_dust' });
shaped('snow', 1, ['ss', 'ss'], { s: 'snowball' });
shaped('clay', 1, ['cc', 'cc'], { c: 'clay_ball' });
shaped('packed_ice', 1, ['iii', 'iii', 'iii'], { i: 'ice' });
shaped('blue_ice', 1, ['iii', 'iii', 'iii'], { i: 'packed_ice' });
shaped('hay_bale', 1, ['www', 'www', 'www'], { w: 'wheat' });
shapeless('wheat', 9, ['hay_bale']);
shaped('slime_block', 1, ['sss', 'sss', 'sss'], { s: 'slime_ball' });
shapeless('slime_ball', 9, ['slime_block']);
shaped('jack_o_lantern', 1, ['p', 't'], { p: 'pumpkin', t: 'torch' });
shaped('melon', 1, ['mmm', 'mmm', 'mmm'], { m: 'melon_slice' });
[['coal', 'coal_block'], ['iron_ingot', 'iron_block'], ['gold_ingot', 'gold_block'], ['diamond', 'diamond_block'], ['emerald', 'emerald_block'],
  ['lapis_lazuli', 'lapis_block'], ['redstone', 'redstone_block'], ['copper_ingot', 'copper_block'], ['raw_iron', 'raw_iron_block'],
  ['raw_gold', 'raw_gold_block'], ['raw_copper', 'raw_copper_block'], ['netherite_ingot', 'netherite_block'], ['amethyst_shard', 'amethyst_block']
].forEach(function (p) { shaped(p[1], 1, ['xxx', 'xxx', 'xxx'], { x: p[0] }); shapeless(p[0], 9, [p[1]]); });
shaped('iron_ingot', 1, ['nnn', 'nnn', 'nnn'], { n: 'iron_nugget' }); shapeless('iron_nugget', 9, ['iron_ingot']);
shaped('gold_ingot', 1, ['nnn', 'nnn', 'nnn'], { n: 'gold_nugget' }); shapeless('gold_nugget', 9, ['gold_ingot']);
shapeless('netherite_ingot', 1, ['gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'ancient_debris', 'ancient_debris', 'ancient_debris', 'ancient_debris']);

// tools, weapons and armour
TIERS.forEach(function (t) {
  const m = t[6];
  shaped(t[0] + '_sword', 1, ['m', 'm', 's'], { m: m, s: 'stick' });
  shaped(t[0] + '_pickaxe', 1, ['mmm', ' s ', ' s '], { m: m, s: 'stick' });
  shaped(t[0] + '_axe', 1, ['mm', 'ms', ' s'], { m: m, s: 'stick' });
  shaped(t[0] + '_shovel', 1, ['m', 's', 's'], { m: m, s: 'stick' });
  shaped(t[0] + '_hoe', 1, ['mm', ' s', ' s'], { m: m, s: 'stick' });
  shaped(t[0] + '_spear', 1, ['  m', ' s ', 's  '], { m: m, s: 'stick' });
});
ARMORS.forEach(function (a) {
  const m = a[5];
  shaped(a[0] + '_helmet', 1, ['mmm', 'm m'], { m: m });
  shaped(a[0] + '_chestplate', 1, ['m m', 'mmm', 'mmm'], { m: m });
  shaped(a[0] + '_leggings', 1, ['mmm', 'm m', 'm m'], { m: m });
  shaped(a[0] + '_boots', 1, ['m m', 'm m'], { m: m });
});
shaped('mace', 1, ['h', 'b'], { h: 'heavy_core', b: 'breeze_rod' });
shaped('shield', 1, ['pip', 'ppp', ' p '], { p: '#planks', i: 'iron_ingot' });
shaped('bow', 1, [' st', 's t', ' st'], { s: 'stick', t: 'string' });
shaped('arrow', 4, ['f', 's', 'e'], { f: 'flint', s: 'stick', e: 'feather' });
shaped('bucket', 1, ['i i', ' i '], { i: 'iron_ingot' });
shapeless('flint_and_steel', 1, ['iron_ingot', 'flint']);
shaped('fishing_rod', 1, ['  s', ' st', 's t'], { s: 'stick', t: 'string' });
shaped('clock', 1, [' g ', 'grg', ' g '], { g: 'gold_ingot', r: 'redstone' });
shaped('compass', 1, [' i ', 'iri', ' i '], { i: 'iron_ingot', r: 'redstone' });
shaped('golden_apple', 1, ['ggg', 'gag', 'ggg'], { g: 'gold_ingot', a: 'apple' });
shaped('enchanted_golden_apple', 1, ['GGG', 'GaG', 'GGG'], { G: 'gold_block', a: 'apple' });
shaped('golden_carrot', 1, ['nnn', 'ncn', 'nnn'], { n: 'gold_nugget', c: 'carrot' });
shapeless('firework_rocket', 3, ['paper', 'gunpowder']);
shaped('crossbow', 1, ['sis', 'tit', ' s '], { s: 'stick', i: 'iron_ingot', t: 'string' });
shaped('spyglass', 1, ['a', 'c', 'c'], { a: 'amethyst_shard', c: 'copper_ingot' });
shaped('glass_bottle', 3, ['g g', ' g '], { g: 'glass' });
shapeless('beetroot_soup', 1, ['bowl', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot']);
shapeless('rabbit_stew', 1, ['bowl', 'cooked_rabbit', 'baked_potato', 'carrot', 'brown_mushroom']);
shaped('beacon', 1, ['ggg', 'gng', 'ooo'], { g: 'glass', n: 'nether_star', o: 'obsidian' });
shaped('honeycomb_block', 1, ['hh', 'hh'], { h: 'honeycomb' });
shaped('beehive', 1, ['ppp', 'hhh', 'ppp'], { p: '#planks', h: 'honeycomb' });
shaped('prismarine', 1, ['ss', 'ss'], { s: 'prismarine_shard' });
shaped('prismarine_bricks', 1, ['sss', 'sss', 'sss'], { s: 'prismarine_shard' });
shaped('dark_prismarine', 1, ['sss', 'sds', 'sss'], { s: 'prismarine_shard', d: 'black_dye' });
shaped('sea_lantern', 1, ['scs', 'ccc', 'scs'], { s: 'prismarine_shard', c: 'prismarine_crystals' });
shaped('dried_kelp_block', 1, ['kkk', 'kkk', 'kkk'], { k: 'dried_kelp' });
shapeless('dried_kelp', 9, ['dried_kelp_block']);
shaped('target', 1, [' r ', 'rhr', ' r '], { r: 'redstone', h: 'hay_bale' });
shaped('lodestone', 1, ['sss', 'sns', 'sss'], { s: 'chiseled_stone_bricks', n: 'netherite_ingot' });
shaped('respawn_anchor', 1, ['ccc', 'ggg', 'ccc'], { c: 'crying_obsidian', g: 'glowstone' });
shaped('cake', 1, ['mmm', 'ses', 'www'], { m: 'milk_bucket', s: 'sugar', e: 'egg', w: 'wheat' });
shaped('moss_carpet', 3, ['mm'], { m: 'moss_block' });
shaped('cut_copper', 4, ['cc', 'cc'], { c: 'copper_block' });
shaped('bamboo_mosaic', 1, ['s', 's'], { s: 'bamboo_planks' });
shapeless('bamboo_planks', 2, ['bamboo_block']);
shapeless('tinted_glass', 2, ['glass', 'amethyst_shard', 'amethyst_shard', 'amethyst_shard', 'amethyst_shard']);
['crimson', 'warped'].forEach(function (k) {
  const p = k + '_planks';
  shapeless(p, 4, [k + '_stem']); shapeless(p, 4, ['stripped_' + k + '_stem']);
  shaped(k + '_slab', 6, ['ppp'], { p: p });
  shaped(k + '_stairs', 4, ['p  ', 'pp ', 'ppp'], { p: p });
  shaped(k + '_door', 3, ['pp', 'pp', 'pp'], { p: p });
  shaped(k + '_trapdoor', 2, ['ppp', 'ppp'], { p: p });
  shaped(k + '_fence', 3, ['psp', 'psp'], { p: p, s: 'stick' });
});
shaped('leather', 1, ['hh', 'hh'], { h: 'rabbit_hide' });
shaped('turtle_helmet', 1, ['sss', 's s'], { s: 'turtle_scute' });

// food and paper
shaped('bread', 1, ['www'], { w: 'wheat' });
shaped('cookie', 8, ['wsw'], { w: 'wheat', s: 'sugar' });
shapeless('pumpkin_pie', 1, ['pumpkin', 'sugar', 'egg']);
shapeless('mushroom_stew', 1, ['bowl', 'red_mushroom', 'brown_mushroom']);
shaped('bowl', 4, ['p p', ' p '], { p: '#planks' });
shaped('paper', 3, ['ccc'], { c: 'sugar_cane' });
shapeless('sugar', 1, ['sugar_cane']);
shapeless('book', 1, ['paper', 'paper', 'paper', 'leather']);
shapeless('bone_meal', 3, ['bone']);
shaped('dried_kelp', 9, ['k'], { k: 'kelp' });

// 67
// dyes and colours
[['poppy', 'red'], ['red_tulip', 'red'], ['dandelion', 'yellow'], ['cornflower', 'blue'], ['lapis_lazuli', 'blue'], ['allium', 'magenta'],
  ['azure_bluet', 'light_gray'], ['oxeye_daisy', 'light_gray'], ['white_tulip', 'light_gray'], ['lily_of_the_valley', 'white'], ['bone_meal', 'white'],
  ['orange_tulip', 'orange'], ['pink_tulip', 'pink'], ['blue_orchid', 'light_blue'], ['ink_sac', 'black'], ['brown_mushroom', 'brown']
].forEach(function (d) { shapeless(d[1] + '_dye', 1, [d[0]]); });
[['orange', 'red', 'yellow'], ['pink', 'red', 'white'], ['light_blue', 'blue', 'white'], ['purple', 'blue', 'red'], ['magenta', 'purple', 'pink'],
  ['lime', 'green', 'white'], ['cyan', 'blue', 'green'], ['gray', 'black', 'white'], ['light_gray', 'gray', 'white']
].forEach(function (d) { shapeless(d[0] + '_dye', 2, [d[1] + '_dye', d[2] + '_dye']); });
WOOL_COLORS.forEach(function (w) {
  const c = w[0], dye = c + '_dye';
  if (c !== 'white') shapeless('wool_' + c, 1, [dye, 'wool_white']);
  shaped('carpet_' + c, 3, ['ww'], { w: 'wool_' + c });
  shapeless('concrete_powder_' + c, 8, [dye, 'sand', 'sand', 'sand', 'sand', 'gravel', 'gravel', 'gravel', 'gravel']);
  shaped('stained_glass_' + c, 8, ['ggg', 'gdg', 'ggg'], { g: 'glass', d: dye });
  shaped('terracotta_' + c, 8, ['ttt', 'tdt', 'ttt'], { t: 'terracotta', d: dye });
});
shaped('wool_white', 1, ['ss', 'ss'], { s: 'string' });

// Find what a crafting grid makes. grid: array of stacks (w x w).
function matchRecipe(grid, w) {
  let minX = w, minY = w, maxX = -1, maxY = -1;
  for (let i = 0; i < grid.length; i++) if (grid[i]) { const x = i % w, y = i / w | 0; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const at = function (x, y) { const s = grid[(minY + y) * w + minX + x]; return s ? s.id : 0; };
  const filled = grid.filter(Boolean).map(function (s) { return s.id; });
  for (const r of RECIPES) {
    if (r.ings) {
      if (r.ings.length !== filled.length) continue;
      const left = filled.slice();
      let ok = true;
      for (const ing of r.ings) {
        const k = left.findIndex(function (id) { return matches(ing, id); });
        if (k < 0) { ok = false; break; }
        left.splice(k, 1);
      }
      if (ok) return r;
      continue;
    }
    if (r.w !== bw || r.h !== bh) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < bh && ok; y++) for (let x = 0; x < bw && ok; x++) {
        const ing = r.pat[y][mirror ? bw - 1 - x : x];
        if (!matches(ing, at(x, y))) ok = false;
      }
      if (ok) return r;
    }
  }
  return null;
}

// ---------- smelting ----------
const SMELT = {};
function smelt(inKey, outKey, xp, kind) { SMELT[inKey] = { out: outKey, xp: xp, kind: kind || 'misc' }; }
smelt('raw_iron', 'iron_ingot', 0.7, 'ore'); smelt('raw_gold', 'gold_ingot', 1, 'ore'); smelt('raw_copper', 'copper_ingot', 0.7, 'ore');
smelt('iron_ore', 'iron_ingot', 0.7, 'ore'); smelt('gold_ore', 'gold_ingot', 1, 'ore'); smelt('copper_ore', 'copper_ingot', 0.7, 'ore');
smelt('diamond_ore', 'diamond', 1, 'ore'); smelt('emerald_ore', 'emerald', 1, 'ore'); smelt('coal_ore', 'coal', 0.1, 'ore');
smelt('lapis_ore', 'lapis_lazuli', 0.2, 'ore'); smelt('redstone_ore', 'redstone', 0.7, 'ore'); smelt('ancient_debris', 'netherite_ingot', 2, 'ore');
smelt('sand', 'glass', 0.1); smelt('red_sand', 'glass', 0.1); smelt('cobblestone', 'stone', 0.1); smelt('stone', 'smooth_stone', 0.1);
smelt('cobbled_deepslate', 'deepslate', 0.1); smelt('clay_ball', 'brick', 0.3); smelt('clay', 'terracotta', 0.35); smelt('netherrack', 'nether_brick', 0.1);
smelt('sandstone', 'smooth_sandstone', 0.1); smelt('stone_bricks', 'cracked_stone_bricks', 0.1); smelt('cactus', 'green_dye', 1); smelt('kelp', 'dried_kelp', 0.1, 'food');
smelt('mud', 'packed_mud', 0.1);
TAGS['#logs'].forEach(function (k) { smelt(k, 'charcoal', 0.15); });
['white', 'light_blue', 'yellow', 'magenta'].forEach(function (c) { smelt('terracotta_' + c, 'glazed_terracotta_' + c, 0.1); });
[['beef', 'cooked_beef'], ['porkchop', 'cooked_porkchop'], ['mutton', 'cooked_mutton'], ['chicken', 'cooked_chicken'],
  ['rabbit', 'cooked_rabbit'], ['cod', 'cooked_cod'], ['salmon', 'cooked_salmon'], ['potato', 'baked_potato']
].forEach(function (p) { smelt(p[0], p[1], 0.35, 'food'); });
function smeltResult(id) { const r = ITEMS[id] && SMELT[ITEMS[id].key]; return r && I[r.out] ? r : null; }
function fuelTicks(id) { return (ITEMS[id] && ITEMS[id].fuel) || 0; }

// ---------- drops ----------
function parseDrop(spec, rnd) {
  const m = /^([a-z_]+)(?:\*(\d+)(?:-(\d+))?)?$/.exec(spec);
  if (!m) return null;
  const lo = +(m[2] || 1), hi = +(m[3] || lo);
  return { key: m[1], n: lo + Math.floor(rnd() * (hi - lo + 1)) };
}
function toolQualifies(b, tool) {
  if (!b.needsTool) return true;
  const it = tool && ITEMS[tool.id];
  if (b.tool === 'sword') return !!(it && it.kind === 'sword');
  return !!(it && it.tool && it.tool.type === b.tool && it.tool.tier >= b.tier);
}
// What breaking a block gives you: { items: [stacks], xp }
function blockDrops(id, tool, rnd) {
  const b = BLOCKS[id];
  const out = { items: [], xp: 0 };
  if (!toolQualifies(b, tool)) return out;
  const silk = enchLevel(tool, 'silk_touch') > 0, fortune = enchLevel(tool, 'fortune');
  if (silk && ITEMS[id] && (b.drop !== undefined || /_leaves$/.test(b.key))) { out.items.push(stack(id, 1)); return out; }
  if (/_leaves$/.test(b.key)) {
    const wood = b.key.replace('_leaves', '');
    if (rnd() < 0.05 + fortune * 0.02) out.items.push(stack(wood + '_sapling', 1));
    if ((wood === 'oak' || wood === 'dark_oak') && rnd() < 0.005 + fortune * 0.003) out.items.push(stack('apple', 1));
    if (rnd() < 0.02) out.items.push(stack('stick', 1 + (rnd() * 2 | 0)));
    return out;
  }
  if (b.key === 'gravel') { out.items.push(stack(rnd() < 0.1 + fortune * 0.04 ? 'flint' : 'gravel', 1)); return out; }
  if (b.key === 'tall_grass' || b.key === 'fern') { if (rnd() < 0.125) out.items.push(stack('wheat', 1)); return out; }
  if (b.drop === 'none') return out;
  if (b.drop) {
    const d = parseDrop(b.drop, rnd);
    if (d && I[d.key]) {
      let n = d.n;
      if (fortune && /_ore$/.test(b.key)) n *= 1 + Math.floor(rnd() * (fortune + 1));
      out.items.push(stack(d.key, n));
    }
  } else if (ITEMS[id]) out.items.push(stack(id, 1));
  if (b.xp && !silk) out.xp = b.xp[0] + Math.floor(rnd() * (b.xp[1] - b.xp[0] + 1));
  return out;
}

// Mining time in seconds (vanilla formula).
function breakSeconds(id, tool, inWater, onGround) {
  const b = BLOCKS[id];
  if (b.hardness < 0) return Infinity;
  if (b.hardness === 0) return 0;
  const it = tool && ITEMS[tool.id];
  let speed = 1;
  if (it && it.tool && it.tool.type === b.tool) {
    speed = it.tool.speed;
    const eff = enchLevel(tool, 'efficiency');
    if (eff) speed += eff * eff + 1;
  }
  if (it && it.kind === 'sword' && b.web) speed = 15;
  let dmg = speed / b.hardness / (toolQualifies(b, tool) ? 30 : 100);
  if (inWater) dmg /= 5;
  if (!onGround) dmg /= 5;
  if (dmg >= 1) return 0;
  return Math.ceil(1 / dmg) / 20;
}

// 67

// ---------- version 4: about 100 more vanilla items (added last so saved item ids never move) ----------
[
  ['blaze_rod', 'Blaze Rod', 'Ingredients', ['strip', [250, 190, 40]], { fuel: 2400 }], ['blaze_powder', 'Blaze Powder', 'Ingredients', ['dust', [250, 170, 40]]],
  ['ghast_tear', 'Ghast Tear', 'Ingredients', ['shard', [220, 240, 250]]], ['magma_cream', 'Magma Cream', 'Ingredients', ['ball', [230, 120, 30]]],
  ['ender_eye', 'Eye of Ender', 'Tools', ['eye'], { use: 'throw', throws: 'eye' }], ['fire_charge', 'Fire Charge', 'Tools', ['fire_charge'], { use: 'fire_charge' }],
  ['shulker_shell', 'Shulker Shell', 'Ingredients', ['shell']], ['echo_shard', 'Echo Shard', 'Ingredients', ['shard', [30, 80, 90]]],
  ['disc_fragment_5', 'Disc Fragment', 'Ingredients', ['shard', [60, 60, 66]]], ['recovery_compass', 'Recovery Compass', 'Tools', ['compass']],
  ['brush', 'Brush', 'Tools', ['brush'], { stack: 1, dur: 64 }], ['experience_bottle', "Bottle o' Enchanting", 'Tools', ['xp_bottle'], { use: 'throw', throws: 'xp_bottle', glint: true }],
  ['saddle', 'Saddle', 'Tools', ['saddle'], { stack: 1 }], ['lead', 'Lead', 'Tools', ['lead']],
  ['wolf_armor', 'Wolf Armor', 'Combat', ['wolf_armor'], { stack: 1, use: 'wolf_armor' }],
  ['leather_horse_armor', 'Leather Horse Armor', 'Combat', ['horse_armor', [160, 100, 60]], { stack: 1 }], ['iron_horse_armor', 'Iron Horse Armor', 'Combat', ['horse_armor', [200, 200, 206]], { stack: 1 }],
  ['golden_horse_armor', 'Golden Horse Armor', 'Combat', ['horse_armor', [240, 200, 60]], { stack: 1 }], ['diamond_horse_armor', 'Diamond Horse Armor', 'Combat', ['horse_armor', [100, 220, 220]], { stack: 1 }],
  ['wither_skeleton_skull', 'Wither Skeleton Skull', 'Ingredients', ['skull', [40, 40, 40]]], ['skeleton_skull', 'Skeleton Skull', 'Ingredients', ['skull', [200, 200, 190]]],
  ['zombie_head', 'Zombie Head', 'Ingredients', ['skull', [90, 140, 70]]], ['creeper_head', 'Creeper Head', 'Ingredients', ['skull', [90, 190, 70]]],
  ['trial_key', 'Trial Key', 'Tools', ['tag']], ['ominous_bottle', 'Ominous Bottle', 'Ingredients', ['bottle', [60, 90, 70]]]
].forEach(function (d) { defItem(d[0], d[1], d[2], d[3], d[4] || {}); });
[['cod', [176, 140, 100]], ['salmon', [170, 60, 50]], ['tropical_fish', [240, 140, 40]], ['pufferfish', [230, 200, 60]], ['axolotl', [240, 170, 200]], ['tadpole', [90, 70, 50]]].forEach(function (f) {
  defItem(f[0] + '_bucket', 'Bucket of ' + f[0].split('_').map(function (w) { return w[0].toUpperCase() + w.slice(1); }).join(' '), 'Tools', ['fish_bucket', f[1]], { stack: 1, use: 'fish_bucket', fish: f[0] });
});
[['mall', [90, 110, 200]], ['chirp', [200, 60, 50]], ['far', [120, 200, 80]], ['strad', [236, 236, 236]], ['ward', [60, 140, 90]], ['stal', [40, 40, 44]], ['mellohi', [200, 120, 230]],
  ['blocks', [230, 110, 50]], ['wait', [70, 170, 220]], ['otherside', [60, 110, 200]], ['relic', [100, 200, 200]], ['creator', [240, 200, 60]], ['precipice', [200, 120, 70]], ['5', [40, 60, 70]]
].forEach(function (d) {
  defItem('music_disc_' + d[0], 'Music Disc', 'Tools', ['disc', d[1]], { stack: 1, disc: d[0] });
  ITEMS[I['music_disc_' + d[0]]].name = 'Music Disc (' + d[0] + ')';
});
// Cubicmetre's original orbital strike cannon: one shot, seemingly one TNT that blooms into rings.
defItem('cubicmetre_shot', 'Cubicmetre Orbital Strike Cannon', 'Combat', ['fishing_rod'], { kind: 'rod', dur: 1, use: 'orbital', orbital: 'cubic', stack: 1 });

// Recipes for the new items and blocks.
shapeless('blaze_powder', 2, ['blaze_rod']);
shapeless('ender_eye', 1, ['ender_pearl', 'blaze_powder']);
shapeless('fire_charge', 3, ['blaze_powder', 'coal', 'gunpowder']);
shapeless('magma_cream', 1, ['blaze_powder', 'slime_ball']);
shaped('recovery_compass', 1, ['eee', 'ece', 'eee'], { e: 'echo_shard', c: 'compass' });
shaped('brush', 1, ['f', 'c', 's'], { f: 'feather', c: 'copper_ingot', s: 'stick' });
shaped('lead', 2, ['ss ', 'sb ', '  s'], { s: 'string', b: 'slime_ball' });
shaped('wolf_armor', 1, ['a  ', 'aaa', 'a a'], { a: 'armadillo_scute' });
shaped('leather_horse_armor', 1, ['l l', 'lll', 'l l'], { l: 'leather' });
shaped('bell', 1, ['sss', 'sgs', 'g g'], { s: 'stick', g: 'gold_ingot' });
shaped('lectern', 1, ['sss', ' b ', ' s '], { s: 'oak_slab', b: 'bookshelf' });
shaped('grindstone', 1, ['tst', 'p p'], { t: 'stick', s: 'stone_slab', p: 'oak_planks' });
shaped('stonecutter', 1, [' i ', 'sss'], { i: 'iron_ingot', s: 'stone' });
shaped('cauldron', 1, ['i i', 'i i', 'iii'], { i: 'iron_ingot' });
shaped('campfire', 1, [' s ', 'sCs', 'lll'], { s: 'stick', C: 'coal', l: 'oak_log' });
shaped('soul_lantern', 1, ['nnn', 'nTn', 'nnn'], { n: 'iron_nugget', T: 'soul_torch' });
shaped('soul_torch', 4, ['c', 's', 'S'], { c: 'coal', s: 'stick', S: 'soul_sand' });
shaped('chain', 1, ['n', 'i', 'n'], { n: 'iron_nugget', i: 'iron_ingot' });
shaped('lightning_rod', 1, ['c', 'c', 'c'], { c: 'copper_ingot' });
shaped('bone_block', 1, ['bbb', 'bbb', 'bbb'], { b: 'bone_meal' });
shaped('redstone_lamp', 1, [' r ', 'rgr', ' r '], { r: 'redstone', g: 'glowstone' });
shaped('chiseled_bookshelf', 1, ['ppp', 'sss', 'ppp'], { p: 'oak_planks', s: 'oak_slab' });
shaped('decorated_pot', 1, [' b ', 'b b', ' b '], { b: 'brick' });
shaped('crafter', 1, ['iii', 'iCi', 'rdr'], { i: 'iron_ingot', C: 'crafting_table', r: 'redstone', d: 'redstone' });
WOOL_COLORS.forEach(function (w) {
  shaped(w[0] + '_stained_glass_pane', 16, ['ggg', 'ggg'], { g: 'stained_glass_' + w[0] });
  if (w[0] !== 'red') shaped(w[0] + '_bed', 1, ['www', 'ppp'], { w: 'wool_' + w[0], p: '#planks' });
});
BLOCKS.forEach(function (b) {
  if (b.shape === 'wall' && b.id > 397) { const base = b.key.replace(/_wall$/, ''); const k = I[base + 's'] ? base + 's' : I[base] ? base : null; if (k) shaped(b.key, 6, ['bbb', 'bbb'], { b: k }); }
});
BLOCKS.forEach(function (b) {
  if (b.id <= 397) return;
  const k = b.key.replace(/_(stairs|slab)$/, ''), base = [k, k + 's', k + '_block'].find(function (x) { return I[x] !== undefined && x !== b.key; });
  if (!base) return;
  if (b.shape === 'stairs') shaped(b.key, 4, ['b  ', 'bb ', 'bbb'], { b: base });
  if (b.shape === 'slab') shaped(b.key, 6, ['bbb'], { b: base });
});
['coal', 'iron', 'copper', 'gold', 'redstone', 'lapis', 'diamond', 'emerald'].forEach(function (o) { if (SMELT[o + '_ore']) SMELT['deepslate_' + o + '_ore'] = SMELT[o + '_ore']; });
