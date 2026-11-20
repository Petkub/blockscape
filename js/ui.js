'use strict';
// Heads-up display and inventory screens: health, hunger, armour, air and XP bars,
// the hotbar, and the inventory, crafting, furnace, chest, anvil, enchanting and
// creative screens. Slot clicks follow Minecraft's rules.

// 67
const $ui = function (id) { return document.getElementById(id); };
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

// ---------- pixel icons for the bars ----------
const BAR_PAL = { k: [24, 12, 12], r: [220, 30, 30], w: [255, 160, 160], d: [70, 20, 20], y: [236, 196, 40], Y: [255, 240, 150],
  m: [196, 116, 54], M: [236, 168, 100], b: [232, 224, 206], a: [214, 214, 220], A: [255, 255, 255], c: [60, 60, 66], u: [126, 196, 248], g: [80, 200, 80], G: [180, 240, 160], e: [40, 40, 44] };
const HEART = ['.kk...kk.', 'krrk.krrk', 'krwrkrrrk', 'krrrrrrrk', '.krrrrrk.', '..krrrk..', '...krk...', '....k....', '.........'];
const DRUM = ['....kkkk.', '...kmmmmk', '..kmmMmmk', '..kmmmmmk', '..kkmmmk.', '.kbkkkk..', 'kbbk.....', 'kbk......', '.k.......'];
const ARMOR = ['.kkk.kkk.', 'kaaakaaak', 'kaAaaaaak', '.kaaaaak.', '.kaaaaak.', '.kaaaaak.', '.kaaaaak.', '.kkkkkkk.', '.........'];
const BUBBLE = ['..kkkkk..', '.kuuuuuk.', 'kuAuuuuuk', 'kuAuuuuuk', 'kuuuuuuuk', 'kuuuuuuuk', '.kuuuuuk.', '..kkkkk..', '.........'];
function barIcon(rows, swap, half) {
  const c = document.createElement('canvas'); c.width = c.height = 9;
  const ctx = c.getContext('2d');
  rows.forEach(function (row, y) {
    for (let x = 0; x < 9; x++) {
      let ch = row[x];
      if (ch === '.') continue;
      if (swap && ch !== 'k' && (half === undefined || x >= half)) ch = swap[ch] || swap['*'] || ch;
      ctx.fillStyle = rgba(BAR_PAL[ch]); ctx.fillRect(x, y, 1, 1);
    }
  });
  return 'url(' + c.toDataURL() + ')';
}
let BAR_IMG = null;
function barImages() {
  if (BAR_IMG) return BAR_IMG;
  const empty = { r: 'd', w: 'd', m: 'e', M: 'e', b: 'e', a: 'c', A: 'c' };
  BAR_IMG = {
    heart: barIcon(HEART), heartHalf: barIcon(HEART, empty, 5), heartEmpty: barIcon(HEART, empty),
    gold: barIcon(HEART, { r: 'y', w: 'Y' }), goldHalf: barIcon(HEART, { r: 'y', w: 'Y' }, 9),
    poison: barIcon(HEART, { r: 'g', w: 'G' }), poisonHalf: barIcon(HEART, { r: 'g', w: 'G', '*': 'd' }, 5),
    wither: barIcon(HEART, { r: 'e', w: 'c' }), witherHalf: barIcon(HEART, { r: 'e', w: 'c' }, 5),
    food: barIcon(DRUM), foodHalf: barIcon(DRUM, empty, 5), foodEmpty: barIcon(DRUM, empty),
    armor: barIcon(ARMOR), armorHalf: barIcon(ARMOR, empty, 5), armorEmpty: barIcon(ARMOR, empty),
    bubble: barIcon(BUBBLE)
  };
  return BAR_IMG;
}

// ---------- slots ----------
let cursor = null, hoverRef = null, openUI = null;
function stackHTML(s) {
  if (!s) return '';
  const it = ITEMS[s.id];
  let h = '<img alt="" src="' + itemIcon(s.id) + '">';
  if ((s.ench && Object.keys(s.ench).length) || it.glint) h += '<span class="glint"></span>';
  if (s.n > 1) h += '<b class="count">' + s.n + '</b>';
  if (s.dmg && it.dur) {
    const f = 1 - s.dmg / it.dur;
    h += '<span class="dur"><i style="width:' + Math.round(f * 100) + '%;background:hsl(' + Math.round(f * 120) + ',90%,50%)"></i></span>';
  }
  return h;
}
function tooltipHTML(s) {
  const it = ITEMS[s.id];
  const ench = s.ench ? Object.keys(s.ench) : [];
  let h = '<b class="' + (ench.length || it.glint ? 'tt-ench' : '') + '">' + esc(stackName(s)) + '</b>';
  for (const k of ench) if (ENCHANTS[k]) h += '<span class="tt-line">' + enchName(k, s.ench[k]) + '</span>';
  if (it.food) h += '<span class="tt-dim">Restores ' + it.food.h / 2 + ' hunger' + (it.food.fx ? ' &middot; has effects' : '') + '</span>';
  if (it.dmg) h += '<span class="tt-dim">When in main hand: ' + it.dmg + ' attack damage, ' + it.aspd + ' attack speed</span>';
  if (it.armor && it.armor.pts) h += '<span class="tt-dim">+' + it.armor.pts + ' armor' + (it.armor.tough ? ', +' + it.armor.tough + ' toughness' : '') + '</span>';
  if (it.kind === 'mace') h += '<span class="tt-dim">Smash attack: more damage the further you fall</span>';
  if (it.kind === 'spear') h += '<span class="tt-dim">More damage the faster you move. Hold right click to charge.</span>';
  if (it.kind === 'elytra') h += '<span class="tt-dim">Wear it, jump, then press Space in mid-air to glide</span>';
  if (it.dur) h += '<span class="tt-dim">Durability: ' + (it.dur - (s.dmg || 0)) + ' / ' + it.dur + '</span>';
  if (it.block) h += '<span class="tt-dim">' + esc(it.cat) + '</span>';
  return h;
}
function renderSlot(el, ref) {
  const s = ref.get();
  el.innerHTML = stackHTML(s) || (ref.ghost ? '<span class="ghost">' + ref.ghost + '</span>' : '');
}
function makeSlot(ref, cls) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'slot' + (cls ? ' ' + cls : '');
  el.addEventListener('mousedown', function (e) { e.preventDefault(); slotClick(ref, e.button, e.shiftKey); });
  el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  el.addEventListener('mouseenter', function () { hoverRef = ref; showTooltip(ref.get()); });
  el.addEventListener('mouseleave', function () { if (hoverRef === ref) hoverRef = null; showTooltip(null); });
  ref.el = el;
  renderSlot(el, ref);
  return el;
}
function mainRef(i) { return { get: function () { return player.inv.main[i]; }, set: function (s) { player.inv.main[i] = s; }, inv: true, idx: i }; }
function armorRef(slot) {
  return {
    get: function () { return player.inv.armor[slot]; }, set: function (s) { player.inv.armor[slot] = s; },
    accept: function (s) { const a = ITEMS[s.id].armor; return !!a && a.slot === slot; }, ghost: ['Helmet', 'Chest', 'Legs', 'Boots'][slot], max: 1
  };
}
function offRef() { return { get: function () { return player.inv.offhand; }, set: function (s) { player.inv.offhand = s; }, ghost: 'Shield' }; }

// 67
function slotClick(ref, button, shift) {
  if (ref.output) { takeOutput(ref, shift); return; }
  const s = ref.get();
  if (shift && s) { quickMove(ref); return; }
  if (cursor && ref.accept && !ref.accept(cursor)) return;
  const max = Math.min(ref.max || 64, cursor ? maxStack(cursor.id) : 64);
  if (button === 0) {
    if (cursor && s && sameItem(cursor, s)) {
      const k = Math.min(cursor.n, max - s.n); s.n += k; cursor.n -= k; if (!cursor.n) cursor = null;
    } else if (cursor && cursor.n > max) {
      if (!s) { ref.set(Object.assign({}, cursor, { n: max })); cursor.n -= max; }
    } else { ref.set(cursor); cursor = s; }
  } else if (button === 2) {
    if (!cursor && s) { const k = Math.ceil(s.n / 2); cursor = Object.assign({}, s, { n: k }); s.n -= k; if (!s.n) ref.set(null); }
    else if (cursor && (!s || (sameItem(cursor, s) && s.n < max))) {
      if (!s) ref.set(Object.assign({}, cursor, { n: 1 })); else s.n++;
      cursor.n--; if (!cursor.n) cursor = null;
    } else if (cursor) { ref.set(cursor); cursor = s; }
  }
  afterChange();
}
// Shift-click: send a stack between the open container and the inventory, or hotbar <-> backpack.
function quickMove(ref) {
  const s = ref.get();
  if (!s) return;
  let targets;
  if (ref.inv) {
    targets = openUI && openUI.quickTargets ? openUI.quickTargets(s) : [];
    if (!targets.length && openUI && openUI.kind === 'inventory') {
      const a = ITEMS[s.id].armor;
      if (a && !player.inv.armor[a.slot]) targets = [armorRef(a.slot)];
    }
    if (!targets.length) targets = (ref.idx < 9 ? range(9, 36) : range(0, 9)).map(mainRef);
  } else targets = range(0, 36).map(mainRef);
  let left = s.n;
  const max = maxStack(s.id);
  for (const t of targets) { const c = t.get(); if (c && sameItem(c, s) && c.n < max && (!t.accept || t.accept(s))) { const k = Math.min(left, max - c.n); c.n += k; left -= k; if (!left) break; } }
  for (const t of targets) { if (left && !t.get() && (!t.accept || t.accept(s))) { const k = Math.min(left, t.max || max); t.set(Object.assign({}, s, { n: k })); left -= k; } }
  s.n = left;
  if (!left) ref.set(null);
  afterChange();
}
function range(a, b) { const out = []; for (let i = a; i < b; i++) out.push(i); return out; }
function takeOutput(ref, shift) {
  const s = ref.get();
  if (!s) return;
  if (ref.canTake && !ref.canTake()) return;
  if (shift) {
    for (let i = 0; i < 64; i++) {
      const cur = ref.get();
      if (!cur || addItem(cur) > 0) break;
      ref.onTake();
      if (!ref.repeat) break;
    }
  } else {
    if (cursor && !(sameItem(cursor, s) && cursor.n + s.n <= maxStack(s.id))) return;
    if (cursor) cursor.n += s.n; else cursor = Object.assign({}, s);
    ref.onTake();
  }
  afterChange();
}
function afterChange() {
  if (openUI && openUI.update) openUI.update();
  if (openUI && openUI.onChange) openUI.onChange();
  for (const r of (openUI ? openUI.refs : [])) renderSlot(r.el, r);
  renderCursor();
  UI.refresh();
}
function renderCursor() {
  const el = $ui('cursor-stack');
  el.innerHTML = stackHTML(cursor);
  el.hidden = !cursor;
}
document.addEventListener('mousemove', function (e) {
  const c = $ui('cursor-stack'), t = $ui('tooltip');
  c.style.transform = 'translate(' + (e.clientX - 20) + 'px,' + (e.clientY - 20) + 'px)';
  t.style.transform = 'translate(' + Math.min(e.clientX + 16, window.innerWidth - t.offsetWidth - 8) + 'px,' + (e.clientY + 14) + 'px)';
});
function showTooltip(s) {
  const t = $ui('tooltip');
  if (!s) { t.hidden = true; return; }
  t.innerHTML = tooltipHTML(s);
  t.hidden = false;
}

// ---------- screens ----------
// Every screen is one compact panel: the block's own slots on top, your inventory right under them.
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
function grid(refs, cols, cls) {
  const g = el('div', 'slot-grid ' + (cls || ''));
  g.style.gridTemplateColumns = 'repeat(' + cols + ', var(--slot))';
  refs.forEach(function (r) { g.appendChild(makeSlot(r)); });
  return g;
}
function inventorySection(ui) {
  const sec = el('div', 'inv-section');
  sec.appendChild(el('div', 'inv-label', '<span>Inventory</span>'));
  const main = range(9, 36).map(mainRef), hot = range(0, 9).map(mainRef);
  sec.appendChild(grid(main, 9));
  sec.appendChild(grid(hot, 9, 'hotbar-grid'));
  ui.refs.push.apply(ui.refs, main.concat(hot));
  return sec;
}
function arrow(cls) { return el('div', 'ui-arrow ' + (cls || ''), '<i></i>'); }
function craftingSection(ui, w) {
  ui.grid = new Array(w * w).fill(null);
  const refs = ui.grid.map(function (_, i) { return { get: function () { return ui.grid[i]; }, set: function (s) { ui.grid[i] = s; } }; });
  const out = {
    output: true, repeat: true,
    get: function () { return ui.result; },
    onTake: function () {
      for (let i = 0; i < ui.grid.length; i++) if (ui.grid[i]) { ui.grid[i].n--; if (!ui.grid[i].n) ui.grid[i] = null; }
      GAME.sound('pop');
      ui.update();
    }
  };
  ui.update = function () { const r = matchRecipe(ui.grid, w); ui.result = r ? stack(r.out, r.n) : null; };
  ui.update();
  ui.refs.push.apply(ui.refs, refs.concat([out]));
  ui.returnOnClose = function () { return ui.grid; };
  const row = el('div', 'craft-row');
  row.appendChild(grid(refs, w));
  row.appendChild(arrow());
  row.appendChild(makeSlot(out, 'big result'));
  return row;
}
function openScreen(kind, title, icon, build) {
  closeScreen(true);
  const ui = { kind: kind, refs: [] };
  const panel = $ui('screen-panel');
  panel.innerHTML = '';
  panel.className = 'mc-panel slab panel-' + kind;
  const head = el('div', 'panel-head');
  head.innerHTML = (icon ? '<img alt="" src="' + itemIcon(icon) + '">' : '') + '<h2>' + esc(title) + '</h2><button type="button" class="x" id="screen-close" aria-label="Close">&times;</button>';
  panel.appendChild(head);
  const top = el('div', 'panel-top');
  panel.appendChild(top);
  build(ui, top, panel);
  if (!ui.noInventory) panel.appendChild(inventorySection(ui));
  panel.appendChild(el('p', 'panel-tip', 'Click: pick up &middot; Right click: half / one &middot; Shift-click: move &middot; 1&ndash;9 over a slot: swap &middot; <kbd>E</kbd> or <kbd>Esc</kbd>: close'));
  openUI = ui;
  $ui('screen').hidden = false;
  $ui('screen-close').addEventListener('click', function () { GAME.closeMenus(true); });
  GAME.menuOpened();
  GAME.sound('ui_click');
  afterChange();
}
function closeScreen(silent) {
  if (!openUI) return false;
  const ui = openUI;
  if (ui.returnOnClose) for (const s of ui.returnOnClose()) if (s) giveItem(s);
  if (ui.onClose) ui.onClose();
  if (cursor) { giveItem(cursor); cursor = null; }
  openUI = null;
  hoverRef = null;
  $ui('screen').hidden = true;
  showTooltip(null);
  renderCursor();
  UI.refresh();
  return true;
}

// 67
function openInventory() {
  if (player.gamemode === 'creative') { openCreative(); return; }
  openScreen('inventory', 'Inventory', null, function (ui, top) {
    const armor = el('div', 'armor-col');
    const ar = [0, 1, 2, 3].map(armorRef);
    armor.appendChild(grid(ar, 1));
    const portrait = el('div', 'portrait');
    const img = el('img'); img.alt = 'Your character'; img.src = GAME.playerPortrait ? GAME.playerPortrait() : '';
    portrait.appendChild(img);
    const o = offRef();
    const off = el('div', 'off-slot'); off.appendChild(el('span', 'mini-label', 'Off hand')); off.appendChild(grid([o], 1));
    portrait.appendChild(off);
    const craft = el('div', 'craft-box');
    craft.appendChild(el('div', 'inv-label', '<span>Crafting</span>'));
    craft.appendChild(craftingSection(ui, 2));
    const stats = el('div', 'stat-chips');
    craft.appendChild(stats);
    top.appendChild(armor); top.appendChild(portrait); top.appendChild(craft);
    ui.refs.push.apply(ui.refs, ar.concat([o]));
    const upd = ui.update;
    ui.stats = stats;
    ui.update = function () {
      upd();
      const a = armorPoints();
      stats.innerHTML = '<span><i class="ic-heart"></i>' + Math.ceil(player.health) + '</span><span><i class="ic-food"></i>' + player.food + '</span><span><i class="ic-armor"></i>' + a.pts + '</span><span class="lvl">Lv ' + player.xpLevel + '</span>';
      if (GAME.playerPortrait && ui.armorKey !== player.inv.armor.map(function (s) { return s ? s.id : 0; }).join()) { ui.armorKey = player.inv.armor.map(function (s) { return s ? s.id : 0; }).join(); img.src = GAME.playerPortrait(); }
    };
  });
}
function openCrafting() {
  openScreen('craft', 'Crafting Table', B.crafting_table, function (ui, top) {
    const box = el('div', 'craft-box wide');
    box.appendChild(craftingSection(ui, 3));
    const book = el('button', 'btn small recipe-btn', 'Recipe book');
    book.type = 'button';
    book.addEventListener('click', function () { GAME.openManual('crafting'); });
    box.appendChild(book);
    top.appendChild(box);
  });
}

// ---------- furnace ----------
function furnaceState(idx) {
  let f = GAME.world.furnaces.get(idx);
  if (!f) { f = { input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0, xp: 0 }; GAME.world.furnaces.set(idx, f); }
  return f;
}
// Runs 20 times a second: the shared furnace logic lives in entities.js so the server can run it too.
function tickFurnaces() {
  tickFurnaceStates(GAME.world);
  if (openUI && openUI.kind === 'furnace') openUI.tick();
}
function openFurnace(idx, kind) {
  const f = furnaceState(idx);
  const blockId = GAME.world.data[idx];
  openScreen('furnace', BLOCKS[blockId].name, blockId, function (ui, top) {
    const inR = { get: function () { return f.input; }, set: function (s) { f.input = s; }, ghost: 'Cook' };
    const fuelR = { get: function () { return f.fuel; }, set: function (s) { f.fuel = s; }, accept: function (s) { return fuelTicks(s.id) > 0 || s.id === I.bucket; }, ghost: 'Fuel' };
    const outR = {
      output: true, repeat: false, get: function () { return f.output; },
      onTake: function () { f.output = null; if (f.xp >= 1) { addXp(Math.floor(f.xp)); f.xp -= Math.floor(f.xp); } }
    };
    const row = el('div', 'furnace-row');
    const col = el('div', 'furnace-col');
    col.appendChild(makeSlot(inR));
    const flame = el('div', 'flame', '<i></i>');
    col.appendChild(flame);
    col.appendChild(makeSlot(fuelR));
    const prog = arrow('progress');
    row.appendChild(col); row.appendChild(prog); row.appendChild(makeSlot(outR, 'big result'));
    top.appendChild(row);
    const help = el('p', 'hint', kind === 'smoker' ? 'Cooks food twice as fast.' : kind === 'blast_furnace' ? 'Smelts ores twice as fast.' : 'Food or ore on top, fuel below. 10 seconds an item.');
    top.appendChild(help);
    ui.refs.push(inR, fuelR, outR);
    ui.onChange = function () { GAME.containerChanged('furnace', idx); };
    ui.quickTargets = function (s) { return fuelTicks(s.id) && !smeltResult(s.id) ? [fuelR] : smeltResult(s.id) ? [inR] : fuelTicks(s.id) ? [fuelR] : []; };
    ui.tick = function () {
      flame.firstChild.style.height = (f.burnMax ? Math.round(f.burn / f.burnMax * 100) : 0) + '%';
      prog.firstChild.style.width = Math.round(f.cook / 200 * 100) + '%';
      for (const r of [inR, fuelR, outR]) renderSlot(r.el, r);
    };
    ui.tick();
  });
}

// ---------- chest ----------
function openChest(idx, name) {
  const world = GAME.world;
  if (!world.chests.has(idx)) world.chests.set(idx, new Array(27).fill(null));
  const slots = world.chests.get(idx);
  openScreen('chest', name, world.data[idx], function (ui, top) {
    const refs = slots.map(function (_, i) { return { get: function () { return slots[i]; }, set: function (s) { slots[i] = s; } }; });
    top.appendChild(grid(refs, 9));
    ui.refs.push.apply(ui.refs, refs);
    ui.quickTargets = function () { return refs; };
    ui.onChange = function () { GAME.containerChanged('chest', idx); };
    GAME.sound('chest_open');
  });
}

// 67
// ---------- anvil ----------
function anvilResult(left, right, rename) {
  if (!left) return null;
  const it = ITEMS[left.id];
  const out = JSON.parse(JSON.stringify(left));
  out.n = 1;
  let cost = 0, rightUse = 0, changed = false;
  const notes = [];
  if (right) {
    const book = right.id === I.enchanted_book;
    const repairMat = it.mat && (it.mat.charAt(0) === '#' ? matches(it.mat, right.id) : I[it.mat] === right.id);
    if (repairMat && left.dmg) {
      const per = Math.floor(it.dur / 4);
      const k = Math.min(right.n, Math.ceil(left.dmg / per));
      out.dmg = Math.max(0, left.dmg - k * per);
      cost += k; rightUse = k; changed = true;
      notes.push('Repairs ' + (left.dmg - out.dmg) + ' durability with ' + k + ' ' + ITEMS[right.id].name);
    } else if (book || right.id === left.id) {
      if (!book && it.dur) {
        const remain = (it.dur - (left.dmg || 0)) + (it.dur - (right.dmg || 0)) + Math.floor(it.dur * 0.12);
        const nd = Math.max(0, it.dur - remain);
        if (nd < (left.dmg || 0)) { notes.push('Repairs ' + ((left.dmg || 0) - nd) + ' durability'); out.dmg = nd; cost += 2; changed = true; }
      }
      rightUse = 1;
      for (const k in (right.ench || {})) {
        if (!ENCHANTS[k] || (!canEnchant(out, k) && it.kind !== 'book')) continue;
        out.ench = out.ench || {};
        if (Object.keys(out.ench).some(function (e) { return !enchCompatible(e, k); })) { cost += 1; continue; }
        const cur = out.ench[k] || 0, lvl = right.ench[k];
        const nl = Math.min(ENCHANTS[k].max, cur === lvl ? lvl + 1 : Math.max(cur, lvl));
        if (nl !== cur) { out.ench[k] = nl; changed = true; notes.push((cur ? 'Upgrades to ' : 'Adds ') + enchName(k, nl)); }
        cost += nl * (book ? 1 : 2);
      }
    } else return null;
  }
  if (rename && rename !== stackName(left)) { out.name = rename; cost += 1; changed = true; notes.push('Renames to “' + rename + '”'); }
  if (!changed) return null;
  cost += (left.work || 0) + (right && right.work || 0);
  out.work = Math.max(left.work || 0, right && right.work || 0) * 2 + 1;
  return { out: out, cost: cost, rightUse: rightUse, notes: notes };
}
function openAnvil() {
  const st = { left: null, right: null, res: null };
  openScreen('anvil', 'Repair & Name', B.anvil, function (ui, top) {
    const lR = { get: function () { return st.left; }, set: function (s) { st.left = s; }, ghost: 'Item' };
    const rR = { get: function () { return st.right; }, set: function (s) { st.right = s; }, ghost: 'Book or material' };
    const oR = {
      output: true, get: function () { return st.res && st.res.out; },
      canTake: function () { return st.res && (player.gamemode === 'creative' || (player.xpLevel >= st.res.cost && st.res.cost < 40)); },
      onTake: function () {
        if (player.gamemode !== 'creative') addLevels(-st.res.cost);
        st.left = null;
        if (st.right) { st.right.n -= st.res.rightUse; if (st.right.n <= 0) st.right = null; }
        name.value = '';
        GAME.sound('anvil');
        ui.update();
      }
    };
    const nameRow = el('label', 'anvil-name-row');
    nameRow.innerHTML = '<span class="pencil" aria-hidden="true">✎</span>';
    const name = el('input', 'anvil-name');
    name.id = 'anvil-name'; name.placeholder = 'Put an item in to rename it'; name.maxLength = 40; name.disabled = true;
    name.addEventListener('input', function () { afterChange(); });
    nameRow.appendChild(name);
    top.appendChild(nameRow);
    const row = el('div', 'anvil-row');
    row.appendChild(makeSlot(lR, 'big'));
    row.appendChild(el('span', 'plus', '+'));
    row.appendChild(makeSlot(rR, 'big'));
    row.appendChild(el('span', 'hammer', '<i></i>'));
    row.appendChild(makeSlot(oR, 'big result'));
    top.appendChild(row);
    const info = el('div', 'anvil-info');
    top.appendChild(info);
    ui.refs.push(lR, rR, oR);
    ui.returnOnClose = function () { return [st.left, st.right]; };
    ui.update = function () {
      name.disabled = !st.left;
      if (!st.left) name.value = '';
      else if (!name.value && document.activeElement !== name) name.placeholder = stackName(st.left);
      st.res = anvilResult(st.left, st.right, name.value.trim());
      if (!st.left) { info.innerHTML = '<p class="hint">Left: the item to work on. Right: an enchanted book, the same item, or its repair material (iron for iron tools, diamonds for diamond, membranes for elytra).</p>'; return; }
      if (!st.res) { info.innerHTML = '<p class="hint">Nothing to change yet. Add a book or material on the right, or type a new name.</p>'; return; }
      const tooMuch = st.res.cost >= 40 && player.gamemode !== 'creative';
      const afford = player.gamemode === 'creative' || player.xpLevel >= st.res.cost;
      info.innerHTML = '<ul class="anvil-notes">' + st.res.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' +
        '<span class="cost-pill ' + (tooMuch || !afford ? 'bad' : '') + '">' + (tooMuch ? 'Too Expensive!' : 'Cost: ' + st.res.cost + ' level' + (st.res.cost === 1 ? '' : 's') + (afford ? '' : ' (you have ' + player.xpLevel + ')')) + '</span>';
    };
  });
}

// ---------- enchanting table ----------
function bookshelvesAround(x, y, z) {
  let n = 0;
  for (let dy = 0; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
    if (GAME.world.get(x + dx, y + dy, z + dz) === B.bookshelf) n++;
  }
  return Math.min(15, n);
}
function enchantOffers(s, shelves, seed) {
  const r = mulberry32(seed);
  const base = 1 + Math.floor(r() * 8) + Math.floor(shelves / 2) + Math.floor(r() * (shelves + 1));
  const costs = [Math.max(Math.floor(base / 3), 1), Math.floor(base * 2 / 3) + 1, Math.max(base, shelves * 2)];
  const kind = s.id === I.book ? 'book' : ITEMS[s.id].kind;
  const pool = Object.keys(ENCHANTS).filter(function (k) { return kind === 'book' || ENCHANTS[k].on.indexOf(kind) >= 0; });
  if (!pool.length) return [];
  return costs.map(function (c, i) {
    const ench = {};
    const first = pool[Math.floor(r() * pool.length)];
    ench[first] = clamp(Math.round(c / 30 * ENCHANTS[first].max + r() * 0.6), 1, ENCHANTS[first].max);
    if (r() < c / 45) {
      const second = pool[Math.floor(r() * pool.length)];
      if (second !== first && enchCompatible(first, second)) ench[second] = clamp(Math.round(c / 45 * ENCHANTS[second].max), 1, ENCHANTS[second].max);
    }
    return { cost: c, levels: i + 1, ench: ench, clue: first };
  });
}
const RUNES = 'ᔑʖᓵ↸ᒷ⎓⊣⍑╎⋮ꖌꖎᒲリ𝙹!¡ᑑ∷ᓭℸ⚍⍊∴̇/||⨅';
function runes(seed) { const r = mulberry32(seed); let s = ''; for (let i = 0; i < 9; i++) s += RUNES[r() * RUNES.length | 0]; return s; }
function openEnchanting(x, y, z) {
  const st = { item: null, lapis: null };
  const shelves = bookshelvesAround(x, y, z);
  if (!player.enchSeed) player.enchSeed = Math.random() * 1e9 | 0;
  openScreen('enchant', 'Enchant', B.enchanting_table, function (ui, top) {
    const iR = {
      get: function () { return st.item; }, set: function (s) { st.item = s; }, ghost: 'Item', max: 1,
      accept: function (s) {
        if (s.id === I.book) return true;
        const k = ITEMS[s.id].kind;
        return !!k && k !== 'book' && !(s.ench && Object.keys(s.ench).length) && Object.keys(ENCHANTS).some(function (e) { return ENCHANTS[e].on.indexOf(k) >= 0; });
      }
    };
    const lR = { get: function () { return st.lapis; }, set: function (s) { st.lapis = s; }, accept: function (s) { return s.id === I.lapis_lazuli; }, ghost: 'Lapis' };
    const row = el('div', 'enchant-row');
    const left = el('div', 'enchant-left');
    left.appendChild(el('div', 'ench-book', '<i></i>'));
    const slots = el('div', 'slot-pair');
    slots.appendChild(makeSlot(iR)); slots.appendChild(makeSlot(lR));
    left.appendChild(slots);
    left.appendChild(el('span', 'mini-label', shelves + ' / 15 bookshelves'));
    const offersEl = el('div', 'offers');
    row.appendChild(left); row.appendChild(offersEl);
    top.appendChild(row);
    ui.refs.push(iR, lR);
    ui.returnOnClose = function () { return [st.item, st.lapis]; };
    ui.quickTargets = function (s) { return s.id === I.lapis_lazuli ? [lR] : [iR]; };
    ui.update = function () {
      offersEl.innerHTML = '';
      if (!st.item) { offersEl.innerHTML = '<p class="hint">Place a tool, weapon, armour piece or book on the left, and lapis lazuli beside it. Bookshelves around the table give stronger offers.</p>'; return; }
      enchantOffers(st.item, shelves, player.enchSeed + st.item.id).forEach(function (o, i) {
        const b = el('button', 'offer');
        b.type = 'button';
        const creative = player.gamemode === 'creative';
        const ok = creative || (player.xpLevel >= o.cost && st.lapis && st.lapis.n >= o.levels);
        b.disabled = !ok;
        b.innerHTML = '<b class="lv">' + o.levels + '</b><span class="rune">' + runes(player.enchSeed + i) + '</span><span class="clue">' + enchName(o.clue, o.ench[o.clue]) + ' . . . ?</span><span class="need">' + o.cost + '</span>';
        b.title = 'Needs level ' + o.cost + '. Costs ' + o.levels + ' level' + (o.levels > 1 ? 's' : '') + ' and ' + o.levels + ' lapis.';
        b.addEventListener('click', function () {
          if (!creative) { addLevels(-o.levels); st.lapis.n -= o.levels; if (!st.lapis.n) st.lapis = null; }
          if (st.item.id === I.book) st.item = stack('enchanted_book', 1, { ench: o.ench });
          else st.item.ench = Object.assign({}, o.ench);
          player.enchSeed = Math.random() * 1e9 | 0;
          GAME.sound('enchant');
          afterChange();
        });
        offersEl.appendChild(b);
      });
    };
  });
}

// 67
// ---------- creative inventory ----------
const CREATIVE_TABS = [
  ['Search', 'compass'], ['Building', 'bricks'], ['Colored', 'wool_magenta'], ['Natural', 'grass'], ['Wood', 'oak_log'], ['Stone', 'stone_bricks'],
  ['Ores & Minerals', 'diamond_ore'], ['Functional', 'crafting_table'], ['Plants', 'poppy'], ['Tools', 'iron_pickaxe'], ['Combat', 'diamond_sword'],
  ['Food', 'apple'], ['Ingredients', 'iron_ingot'], ['Enchanted Books', 'enchanted_book'], ['Spawn Eggs', 'creeper_spawn_egg'], ['Survival Inventory', 'chest']
];
let creativeTab = 'Building';
function creativeItems(tab, q) {
  const out = [];
  if (tab === 'Enchanted Books' || (tab === 'Search' && q)) {
    for (const k in ENCHANTS) for (let l = 1; l <= ENCHANTS[k].max; l++) {
      const s = stack('enchanted_book', 1, { ench: { [k]: l } });
      if (tab === 'Search' && (enchName(k, l) + ' enchanted book').toLowerCase().indexOf(q) < 0) continue;
      out.push(s);
    }
    if (tab === 'Enchanted Books') return out;
  }
  ITEMS.forEach(function (it) {
    if (!it || it.key === 'enchanted_book') return;
    if (tab === 'Search') { if (q && it.name.toLowerCase().indexOf(q) < 0 && it.key.indexOf(q) < 0) return; }
    else if (it.cat !== tab) return;
    out.push(stack(it.id, 1));
  });
  return out;
}
function openCreative() {
  openScreen('creative', 'Creative Inventory', null, function (ui, top) {
    ui.noInventory = true;
    const tabs = el('div', 'icon-tabs');
    const label = el('span', 'tab-name');
    CREATIVE_TABS.forEach(function (t) {
      const b = el('button', 'icon-tab', '<img alt="" src="' + itemIcon(I[t[1]]) + '">');
      b.type = 'button'; b.title = t[0]; b.setAttribute('aria-label', t[0]); b.setAttribute('aria-pressed', t[0] === creativeTab);
      b.addEventListener('click', function () { creativeTab = t[0]; tabs.querySelectorAll('.icon-tab').forEach(function (c) { c.setAttribute('aria-pressed', c.title === t[0]); }); fill(); if (t[0] === 'Search') search.focus(); });
      tabs.appendChild(b);
    });
    const search = el('input', 'field creative-search');
    search.type = 'search'; search.id = 'creative-search'; search.placeholder = 'Search ' + ITEMS.filter(Boolean).length + ' items';
    search.addEventListener('input', function () { creativeTab = 'Search'; tabs.querySelectorAll('.icon-tab').forEach(function (c) { c.setAttribute('aria-pressed', c.title === 'Search'); }); fill(); });
    const bar = el('div', 'creative-bar');
    bar.appendChild(label); bar.appendChild(search);
    top.appendChild(tabs); top.appendChild(bar);
    const g = el('div', 'creative-grid');
    top.appendChild(g);
    const hotRow = el('div', 'creative-hotbar');
    const hot = range(0, 9).map(mainRef);
    hotRow.appendChild(grid(hot, 9, 'hotbar-grid'));
    const trash = el('button', 'slot trash', '<span class="ghost">Delete</span>');
    trash.type = 'button'; trash.title = 'Drop an item here to delete it';
    trash.addEventListener('mousedown', function (e) { e.preventDefault(); cursor = null; afterChange(); });
    trash.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    hotRow.appendChild(trash);
    top.appendChild(el('div', 'inv-label', '<span>Hotbar</span><small>Click an item to pick it up, then click a slot to put it there. Right click: pick up one. Shift-click: straight into your inventory. 1-9 over an item: put it in that hotbar slot.</small>'));
    top.appendChild(hotRow);
    ui.refs.push.apply(ui.refs, hot);
    let tabRefs = [];
    // An item in the creative grid behaves like an endless slot.
    function creativeClick(s, e) {
      const max = maxStack(s.id);
      if (e.shiftKey) addItem(Object.assign({}, s, { n: max }));
      else if (cursor && !sameItem(cursor, s)) cursor = null;           // clicking the grid while holding something deletes it
      else if (cursor) cursor.n = e.button === 2 ? Math.min(max, cursor.n + 1) : max;
      else cursor = Object.assign({}, s, { n: e.button === 2 ? 1 : max });
      GAME.sound('ui_click');
      afterChange();
    }
    function fill() {
      label.textContent = creativeTab;
      g.innerHTML = '';
      g.classList.toggle('survival-tab', creativeTab === 'Survival Inventory');
      ui.refs = ui.refs.filter(function (r) { return tabRefs.indexOf(r) < 0; });
      tabRefs = [];
      if (creativeTab === 'Survival Inventory') {
        // Your whole inventory, armour and offhand, so you can rearrange it like in survival.
        const gear = el('div', 'creative-gear');
        const armor = [0, 1, 2, 3].map(armorRef);
        armor.concat([offRef()]).forEach(function (r) { gear.appendChild(makeSlot(r)); tabRefs.push(r); });
        const main = range(9, 36).map(mainRef);
        g.appendChild(gear);
        g.appendChild(grid(main, 9));
        tabRefs = tabRefs.concat(main);
        ui.refs.push.apply(ui.refs, tabRefs);
        return;
      }
      const list = creativeItems(creativeTab, search.value.trim().toLowerCase());
      list.forEach(function (s) {
        const b = el('button', 'slot', stackHTML(s));
        b.type = 'button';
        const ref = { get: function () { return s; }, set: function () {}, creative: true };
        b.addEventListener('mouseenter', function () { hoverRef = ref; showTooltip(s); });
        b.addEventListener('mouseleave', function () { if (hoverRef === ref) hoverRef = null; showTooltip(null); });
        b.addEventListener('mousedown', function (e) { e.preventDefault(); creativeClick(s, e); });
        b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        g.appendChild(b);
      });
      if (!list.length) g.innerHTML = '<p class="hint">Nothing matches. Try a shorter word like "sword", "wool" or "oak".</p>';
    }
    fill();
  });
}

// ---------- HUD ----------
const UI = {
  refresh: function () {
    if (!GAME.world) return;
    renderHotbar();
    renderBars();
    renderEffects();
    if (openUI) { for (const r of openUI.refs) renderSlot(r.el, r); if (openUI.stats && openUI.update) openUI.update(); }
  },
  toast: function (msg) { GAME.toast(msg); },
  openInventory: openInventory, openCrafting: openCrafting, openFurnace: openFurnace, openChest: openChest, openAnvil: openAnvil, openEnchanting: openEnchanting,
  close: closeScreen,
  isOpen: function () { return !!openUI; },
  hoverSwap: function (n) {
    if (!hoverRef || hoverRef.output) return false;
    if (hoverRef.creative) { const c = hoverRef.get(); player.inv.main[n] = Object.assign({}, c, { n: maxStack(c.id) }); afterChange(); return true; }
    const a = hoverRef.get(), b = player.inv.main[n];
    if (b && hoverRef.accept && !hoverRef.accept(b)) return true;
    hoverRef.set(b); player.inv.main[n] = a;
    afterChange();
    return true;
  },
  showDeath: function (msg) {
    $ui('death-msg').textContent = msg;
    $ui('death-score').textContent = 'Score: ' + (player.xpLevel * 7 + player.xpPoints);
    $ui('death-screen').hidden = false;
    GAME.menuOpened();
  },
  hideDeath: function () { $ui('death-screen').hidden = true; },
  totemFlash: function () {
    const el = $ui('totem-flash');
    el.innerHTML = '<img alt="" src="' + itemIcon(I.totem_of_undying) + '">';
    el.hidden = false; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    setTimeout(function () { el.hidden = true; }, 1600);
  },
  sleep: function (cb) {
    const el = $ui('sleep-fade');
    el.hidden = false; el.classList.add('on');
    setTimeout(function () { cb(); el.classList.remove('on'); setTimeout(function () { el.hidden = true; }, 900); GAME.toast('Good morning. Respawn point set.'); }, 1400);
  }
};

function renderHotbar() {
  const el = $ui('hotbar');
  if (!el.children.length) for (let i = 0; i < 9; i++) { const d = document.createElement('div'); d.className = 'slot'; el.appendChild(d); }
  for (let i = 0; i < 9; i++) {
    const d = el.children[i];
    d.className = 'slot' + (i === player.sel ? ' sel' : '');
    d.innerHTML = '<span class="num">' + (i + 1) + '</span>' + stackHTML(player.inv.main[i]);
  }
  const off = $ui('offhand');
  off.innerHTML = stackHTML(player.inv.offhand);
  off.hidden = !player.inv.offhand || player.gamemode === 'spectator';
}
function iconRow(el, count, fn) {
  if (el.children.length !== count) { el.innerHTML = ''; for (let i = 0; i < count; i++) el.appendChild(document.createElement('i')); }
  for (let i = 0; i < count; i++) el.children[i].style.backgroundImage = fn(i) || 'none';
}
function renderBars() {
  const img = barImages(), p = player, surv = p.gamemode === 'survival';
  $ui('bars').hidden = !surv;
  $ui('xp').hidden = p.gamemode === 'spectator' || p.gamemode === 'creative';
  if (surv) {
    const poisoned = hasEffect('poison'), withered = hasEffect('wither');
    iconRow($ui('hearts'), 10, function (i) {
      const v = p.health - i * 2;
      return v >= 2 ? (withered ? img.wither : poisoned ? img.poison : img.heart) : v >= 1 ? (withered ? img.witherHalf : poisoned ? img.poisonHalf : img.heartHalf) : img.heartEmpty;
    });
    $ui('hearts').classList.toggle('shake', p.health <= 4);
    const gold = Math.ceil(p.absorption / 2);
    iconRow($ui('absorb'), gold, function (i) { return p.absorption - i * 2 >= 2 ? img.gold : img.goldHalf; });
    iconRow($ui('food'), 10, function (i) { const v = p.food - i * 2; return v >= 2 ? img.food : v >= 1 ? img.foodHalf : img.foodEmpty; });
    const a = armorPoints().pts;
    $ui('armor').hidden = a === 0;
    iconRow($ui('armor'), 10, function (i) { const v = a - i * 2; return v >= 2 ? img.armor : v >= 1 ? img.armorHalf : img.armorEmpty; });
    const bubbles = p.air < 15 ? Math.ceil(p.air / 1.5) : 0;
    $ui('air').hidden = !(p.headInWater || p.air < 15);
    iconRow($ui('air'), 10, function (i) { return 9 - i < bubbles ? img.bubble : null; });
  }
  $ui('xp-fill').style.width = (p.xpPoints / xpNeeded(p.xpLevel) * 100).toFixed(1) + '%';
  $ui('xp-level').textContent = p.xpLevel > 0 ? p.xpLevel : '';
}
function renderEffects() {
  const el = $ui('effects'), keys = Object.keys(player.effects);
  el.hidden = !keys.length || player.gamemode === 'spectator';
  el.innerHTML = keys.map(function (k) {
    const e = player.effects[k], E = EFFECTS[k];
    const t = e.t === Infinity ? '∞' : Math.floor(e.t / 60) + ':' + ('0' + Math.floor(e.t % 60)).slice(-2);
    return '<div class="effect"><i style="background:' + E.color + '"></i><span>' + E.name + ' ' + (ROMAN[e.lvl] || e.lvl) + '</span><b>' + t + '</b></div>';
  }).join('');
}
// Small things that change every frame.
let effectsClock = 0;
function updateHudFrame(dt) {
  const p = player;
  const ind = $ui('attack-ind');
  const charge = attackCharge();
  ind.hidden = charge >= 1 || p.gamemode === 'spectator';
  ind.firstChild.style.width = Math.round(charge * 100) + '%';
  effectsClock -= dt;
  if (effectsClock <= 0) { effectsClock = 0.5; renderEffects(); }
  const flash = $ui('hurt-flash');
  p.hurtFlash = Math.max(0, p.hurtFlash - dt * 2.5);
  flash.style.opacity = p.hurtFlash * 0.45;
  $ui('fire-overlay').hidden = !(p.fire > 0 && p.gamemode === 'survival') || hasEffect('fire_resistance');
}

// 67