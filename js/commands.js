'use strict';
// Chat and commands. Press T to open chat, or / to start typing a command.
// Tab completes, Up/Down walks through what you typed before.

// 67
const COLOR_ALIASES = WOOL_COLORS.map(function (w) { return w[0]; });
// Accept vanilla names (white_wool, grass_block, minecraft:stone) as well as our own keys.
function resolveItem(name) {
  if (!name) return 0;
  let n = name.toLowerCase().replace(/^minecraft:/, '');
  if (I[n]) return I[n];
  const aliases = { grass_block: 'grass', snow_block: 'snow', quartz_block: 'quartz', purpur: 'purpur_block', nether_quartz: 'quartz_crystal', bed: 'red_bed', steak: 'cooked_beef', heavy_core: 'mace' };
  if (aliases[n] && I[aliases[n]]) return I[aliases[n]];
  for (const c of COLOR_ALIASES) {
    for (const kind of ['wool', 'concrete_powder', 'concrete', 'stained_glass', 'terracotta', 'carpet']) {
      if (n === c + '_' + kind) return I[kind + '_' + c] || 0;
    }
  }
  return 0;
}
function resolveBlock(name) {
  if (!name) return -1;
  const n = name.toLowerCase().replace(/^minecraft:/, '');
  if (n === 'air') return 0;
  if (B[n] !== undefined) return B[n];
  const id = resolveItem(n);
  return id && ITEMS[id].block ? id : -1;
}
function coord(tok, base) {
  if (tok === undefined) return NaN;
  if (tok.charAt(0) === '~') return base + (tok.length > 1 ? parseFloat(tok.slice(1)) : 0);
  return parseFloat(tok);
}
function parseCoords(toks, i, block) {
  const p = player.pos;
  const x = coord(toks[i], block ? Math.floor(p.x) : p.x), y = coord(toks[i + 1], block ? Math.floor(p.y) : p.y), z = coord(toks[i + 2], block ? Math.floor(p.z) : p.z);
  return [x, y, z].some(isNaN) ? null : [x, y, z];
}
// @s, @p, @a, @e, @e[type=zombie,distance=..10]
function selectTargets(sel) {
  const out = { player: false, mobs: [] };
  if (!sel || sel === '@s' || sel === '@p' || sel === '@a' || sel.toLowerCase() === 'player') { out.player = true; return out; }
  const m = /^@e(?:\[(.*)\])?$/.exec(sel);
  if (!m) return null;
  let type = null, not = false, dist = Infinity;
  if (m[1]) for (const part of m[1].split(',')) {
    const kv = part.split('=');
    if (kv[0] === 'type') { type = kv[1].replace(/^minecraft:/, ''); if (type.charAt(0) === '!') { not = true; type = type.slice(1); } }
    if (kv[0] === 'distance') dist = parseFloat(kv[1].replace('..', ''));
  }
  out.player = !type || (type === 'player') !== not;
  out.mobs = type === 'player' && !not ? [] : GAME.mobs.filter(function (mob) {
    if (mob.dead) return false;
    if (type && type !== 'player' && (mob.sp.key === type) === not) return false;
    return mob.pos.distanceTo(player.pos) <= dist;
  });
  return out;
}

// 67
const RULES = { keepInventory: false, doDaylightCycle: true, doMobSpawning: true, naturalRegeneration: true, doTileDrops: true, doWeatherCycle: true };
GAME.rules = RULES;

// 67
const ENTITY_IDS = ALL_SPECIES.map(function (s) { return s.key; }).concat(['tnt']);
const ITEM_KEYS = function () { return ITEMS.filter(Boolean).map(function (it) { return it.key; }); };
const BLOCK_KEYS = function () { return BLOCKS.map(function (b) { return b.key; }); };
const COMMANDS = {
  '?': { usage: '/? [command]', desc: 'Lists every command, or explains one.', args: [['command']], run: cmdHelp },
  help: { usage: '/help [command]', desc: 'Same as /?.', args: [['command']], run: cmdHelp },
  gamemode: { usage: '/gamemode <survival|creative|spectator>', desc: 'Switches game mode. Short forms: s, c, sp, 0, 1, 3.', args: [['survival', 'creative', 'spectator']], run: cmdGamemode },
  give: { usage: '/give <player> <item> [count]', desc: 'Gives items. Add enchantments like diamond_sword[enchantments={sharpness:5}].', args: [['@s', '@p'], 'item', ['1', '16', '64']], run: cmdGive },
  tp: { usage: '/tp <x> <y> <z>', desc: 'Teleports you. Use ~ for "where I am now", e.g. /tp ~ ~20 ~.', args: ['coord', 'coord', 'coord'], run: cmdTp },
  teleport: { usage: '/teleport <x> <y> <z>', desc: 'Same as /tp.', args: ['coord', 'coord', 'coord'], run: cmdTp },
  time: { usage: '/time <set|add|query> <value>', desc: 'Changes the time. day = 1000, noon = 6000, night = 13000, midnight = 18000.', args: [['set', 'add', 'query'], ['day', 'noon', 'night', 'midnight', 'daytime', '1000', '6000']], run: cmdTime },
  weather: { usage: '/weather <clear|rain|thunder> [seconds]', desc: 'Changes the weather.', args: [['clear', 'rain', 'thunder'], ['300', '600']], run: cmdWeather },
  kill: { usage: '/kill [target]', desc: 'Kills you, or mobs: @e[type=zombie], @e[type=!player].', args: [['@s', '@e', '@e[type=!player]', '@e[type=zombie]', '@e[type=creeper]']], run: cmdKill },
  summon: { usage: '/summon <entity> [x y z]', desc: 'Spawns an animal, a mob or lit TNT.', args: ['entity', 'coord', 'coord', 'coord'], run: cmdSummon },
  setblock: { usage: '/setblock <x> <y> <z> <block>', desc: 'Places one block.', args: ['coord', 'coord', 'coord', 'block'], run: cmdSetblock },
  fill: { usage: '/fill <x1> <y1> <z1> <x2> <y2> <z2> <block> [replace|destroy|hollow|outline|keep]', desc: 'Fills a box with blocks (up to 32768).', args: ['coord', 'coord', 'coord', 'coord', 'coord', 'coord', 'block', ['replace', 'destroy', 'hollow', 'outline', 'keep']], run: cmdFill },
  clear: { usage: '/clear [player] [item]', desc: 'Empties your inventory, or removes one kind of item.', args: [['@s'], 'item'], run: cmdClear },
  effect: { usage: '/effect <give|clear> <player> [effect] [seconds|infinite] [amplifier]', desc: 'Gives or removes status effects.', args: [['give', 'clear'], ['@s'], 'effect', ['30', '60', 'infinite'], ['0', '1', '2']], run: cmdEffect },
  enchant: { usage: '/enchant <player> <enchantment> [level]', desc: 'Enchants the item in your hand.', args: [['@s'], 'enchant', ['1', '2', '3', '4', '5']], run: cmdEnchant },
  xp: { usage: '/xp <add|set|query> <player> [amount] [points|levels]', desc: 'Changes experience.', args: [['add', 'set', 'query'], ['@s'], ['10', '30', '100'], ['levels', 'points']], run: cmdXp },
  experience: { usage: '/experience <add|set|query> <player> [amount] [points|levels]', desc: 'Same as /xp.', args: [['add', 'set', 'query'], ['@s'], ['10', '30'], ['levels', 'points']], run: cmdXp },
  seed: { usage: '/seed', desc: 'Shows the world seed. Click it to copy.', args: [], run: cmdSeed },
  spawnpoint: { usage: '/spawnpoint [player] [x y z]', desc: 'Sets where you respawn. Defaults to where you stand.', args: [['@s'], 'coord', 'coord', 'coord'], run: cmdSpawnpoint },
  setworldspawn: { usage: '/setworldspawn [x y z]', desc: 'Sets the world spawn point.', args: ['coord', 'coord', 'coord'], run: cmdSpawnpoint },
  difficulty: { usage: '/difficulty <peaceful|easy|normal|hard>', desc: 'Peaceful removes hostile mobs and hunger damage.', args: [['peaceful', 'easy', 'normal', 'hard']], run: cmdDifficulty },
  gamerule: { usage: '/gamerule <rule> [true|false]', desc: 'Rules: ' + Object.keys(RULES).join(', ') + '.', args: [Object.keys(RULES), ['true', 'false']], run: cmdGamerule },
  locate: { usage: '/locate biome <name> or /locate structure <name>', desc: 'Finds the nearest biome or structure (village, desert_pyramid, shipwreck, dungeon...).', args: [['biome', 'structure'], ['ocean', 'plains', 'forest', 'desert', 'village', 'desert_village', 'desert_pyramid', 'desert_well', 'shipwreck', 'ocean_ruins', 'ocean_monument', 'dungeon', 'ruined_portal', 'pillager_outpost', 'witch_hut']], run: cmdLocate },
  say: { usage: '/say <message>', desc: 'Says something in chat.', args: [], run: function (t) { GAME.chat('[Player] ' + t.slice(1).join(' ')); } },
  me: { usage: '/me <action>', desc: 'Describes what you are doing.', args: [], run: function (t) { GAME.chat('* Player ' + t.slice(1).join(' ')); } },
  list: { usage: '/list', desc: 'Lists players online.', args: [], run: function () { const names = GAME.onlineNames ? GAME.onlineNames() : [player.name]; GAME.chat('There are ' + names.length + ' players online: ' + names.join(', ')); } },
};
const ERR = 'err', OK = 'ok';

function cmdHelp(t) {
  const name = (t[1] || '').replace(/^\//, '');
  if (name && COMMANDS[name]) { GAME.chat(COMMANDS[name].usage, 'cmd'); GAME.chat(COMMANDS[name].desc); return; }
  if (name) { GAME.chat('Unknown command: ' + name, ERR); return; }
  GAME.chat('Commands (type /? <command> for details):', 'cmd');
  Object.keys(COMMANDS).forEach(function (k) { GAME.chat(COMMANDS[k].usage, 'help'); });
}
function cmdGamemode(t) {
  const m = { s: 'survival', '0': 'survival', survival: 'survival', c: 'creative', '1': 'creative', creative: 'creative', sp: 'spectator', '3': 'spectator', spectator: 'spectator' }[(t[1] || '').toLowerCase()];
  if (!m) return GAME.chat('Unknown game mode. Use survival, creative or spectator.', ERR);
  setGamemode(m);
}
function parseEnchSuffix(s) {
  const m = /^([^\[{]+)(?:\[enchantments=\{(.*)\}\]|\{(.*)\})?$/.exec(s);
  if (!m) return null;
  const ench = {}, body = m[2] || m[3];
  if (body) for (const part of body.split(',')) {
    const kv = part.split(':').map(function (x) { return x.trim().replace(/^"|"$/g, '').replace(/^minecraft:/, ''); });
    if (kv.length >= 2 && ENCHANTS[kv[kv.length - 2]]) ench[kv[kv.length - 2]] = Math.max(1, parseInt(kv[kv.length - 1], 10) || 1);
  }
  return { name: m[1], ench: Object.keys(ench).length ? ench : null };
}
function cmdGive(t) {
  let i = 1;
  if (t[1] && (t[1].charAt(0) === '@' || t[1].toLowerCase() === 'player')) i = 2;
  const parsed = parseEnchSuffix(t[i] || '');
  const id = parsed && resolveItem(parsed.name);
  if (!id) return GAME.chat('Unknown item: ' + (t[i] || '(none)'), ERR);
  let count = Math.max(1, Math.min(6400, parseInt(t[i + 1], 10) || 1));
  const total = count;
  while (count > 0) {
    const n = Math.min(count, maxStack(id));
    const s = stack(id, n, parsed.ench ? { ench: Object.assign({}, parsed.ench) } : null);
    giveItem(s);
    count -= n;
  }
  GAME.sound('pop');
  GAME.chat('Gave ' + total + ' [' + ITEMS[id].name + '] to Player', OK);
}
function cmdTp(t) {
  let i = 1;
  if (t[1] && t[1].charAt(0) === '@') i = 2;
  const c = parseCoords(t, i, false);
  if (!c) return GAME.chat('Usage: /tp <x> <y> <z>', ERR);
  player.pos.set(clamp(c[0], 0.3, WX - 0.3), clamp(c[1], -5, WY + 30), clamp(c[2], 0.3, WZ - 0.3));
  player.vel.set(0, 0, 0); player.fallDistance = 0;
  GAME.chat('Teleported Player to ' + player.pos.x.toFixed(1) + ', ' + player.pos.y.toFixed(1) + ', ' + player.pos.z.toFixed(1), OK);
}
function cmdTime(t) {
  const names = { day: 1000, noon: 6000, night: 13000, midnight: 18000, sunrise: 23000, sunset: 12000 };
  if (t[1] === 'query') { GAME.chat('The time is ' + Math.round(GAME.dayTime * 24000), OK); return; }
  const v = names[t[2]] !== undefined ? names[t[2]] : parseInt(t[2], 10);
  if (isNaN(v)) return GAME.chat('Usage: /time <set|add> <day|noon|night|midnight|ticks>', ERR);
  GAME.dayTime = t[1] === 'add' ? (GAME.dayTime + v / 24000) % 1 : ((v / 24000) % 1 + 1) % 1;
  GAME.chat('Set the time to ' + Math.round(GAME.dayTime * 24000), OK);
}
function cmdWeather(t) {
  const w = t[1];
  if (['clear', 'rain', 'thunder'].indexOf(w) < 0) return GAME.chat('Usage: /weather <clear|rain|thunder>', ERR);
  GAME.weather = w; GAME.weatherTimer = parseInt(t[2], 10) || 300 + Math.random() * 600;
  GAME.chat('Changing to ' + (w === 'clear' ? 'clear weather' : w === 'rain' ? 'rain' : 'rain and thunder'), OK);
}
function cmdKill(t) {
  const sel = selectTargets(t[1] || '@s');
  if (!sel) return GAME.chat('Unknown target: ' + t[1], ERR);
  let n = 0;
  for (const m of sel.mobs) { m.invuln = 0; m.hurt(1e6, { type: 'kill' }); n++; }
  if (sel.player && !player.dead && player.gamemode !== 'spectator') { killPlayer('Player fell out of the world'); n++; }
  GAME.chat('Killed ' + n + ' entit' + (n === 1 ? 'y' : 'ies'), OK);
}
function cmdSummon(t) {
  const key = (t[1] || '').replace(/^minecraft:/, '');
  const c = parseCoords(t, 2, false) || [player.pos.x - Math.sin(player.yaw) * 2, player.pos.y, player.pos.z - Math.cos(player.yaw) * 2];
  if (key === 'tnt') { GAME.tnts.push(new PrimedTnt(Math.floor(c[0]), c[1], Math.floor(c[2]), 4)); GAME.chat('Summoned new Primed TNT', OK); return; }
  const sp = speciesByKey(key);
  if (!sp) return GAME.chat('Unknown entity: ' + (t[1] || '(none)') + '. Try zombie, cow, creeper, villager, warden...', ERR);
  spawnMob(sp, c[0], c[1], c[2]).persistent = true;
  GAME.chat('Summoned new ' + sp.name, OK);
}
function cmdSetblock(t) {
  const c = parseCoords(t, 1, true), id = resolveBlock(t[4]);
  if (!c) return GAME.chat('Usage: /setblock <x> <y> <z> <block>', ERR);
  if (id < 0) return GAME.chat('Unknown block: ' + (t[4] || '(none)'), ERR);
  const x = Math.floor(c[0]), y = Math.floor(c[1]), z = Math.floor(c[2]);
  if (x < 0 || z < 0 || y < 0 || x >= WX || z >= WZ || y >= WY) return GAME.chat('That position is outside the world', ERR);
  GAME.placeAt(x, y, z, id, 0);
  GAME.chat('Changed the block at ' + x + ', ' + y + ', ' + z, OK);
}
function cmdFill(t) {
  const a = parseCoords(t, 1, true), b = parseCoords(t, 4, true), id = resolveBlock(t[7]), mode = t[8] || 'replace';
  if (!a || !b) return GAME.chat('Usage: ' + COMMANDS.fill.usage, ERR);
  if (id < 0) return GAME.chat('Unknown block: ' + (t[7] || '(none)'), ERR);
  const x0 = clamp(Math.min(a[0], b[0]), 0, WX - 1), x1 = clamp(Math.max(a[0], b[0]), 0, WX - 1);
  const y0 = clamp(Math.min(a[1], b[1]), 0, WY - 1), y1 = clamp(Math.max(a[1], b[1]), 0, WY - 1);
  const z0 = clamp(Math.min(a[2], b[2]), 0, WZ - 1), z1 = clamp(Math.max(a[2], b[2]), 0, WZ - 1);
  const vol = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
  if (vol > 32768) return GAME.chat('Too many blocks in the specified area (' + vol + ' > 32768)', ERR);
  const world = GAME.world;
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1;
    let put = id;
    if ((mode === 'hollow' || mode === 'outline') && !edge) { if (mode === 'outline') continue; put = 0; }
    const cur = world.get(x, y, z);
    if (mode === 'keep' && cur) continue;
    if (cur === put) continue;
    if (mode === 'destroy' && cur) for (const s of blockDrops(cur, null, Math.random).items) GAME.dropStack(s, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), null);
    GAME.removeBlockState(x, y, z, cur);
    world.set(x, y, z, put); world.setMeta(x, y, z, 0);
    GAME.markDirty(x, y, z);
    n++;
  }
  GAME.flush();
  GAME.chat('Successfully filled ' + n + ' block' + (n === 1 ? '' : 's'), OK);
}
function cmdClear(t) {
  const id = t[2] ? resolveItem(t[2]) : 0;
  let n = 0;
  player.inv.main.forEach(function (s, i) { if (s && (!id || s.id === id)) { n += s.n; player.inv.main[i] = null; } });
  if (!id) { player.inv.armor.forEach(function (s, i) { if (s) { n++; player.inv.armor[i] = null; } }); if (player.inv.offhand) { n += player.inv.offhand.n; player.inv.offhand = null; } }
  UI.refresh();
  GAME.chat('Removed ' + n + ' item' + (n === 1 ? '' : 's') + ' from Player', OK);
}
function cmdEffect(t) {
  if (t[1] === 'clear') { const k = t[3] && t[3].replace(/^minecraft:/, ''); if (k) { delete player.effects[k]; if (k === 'absorption') player.absorption = 0; UI.refresh(); } else clearEffects(); GAME.chat('Removed effects from Player', OK); return; }
  if (t[1] !== 'give') return GAME.chat('Usage: ' + COMMANDS.effect.usage, ERR);
  const key = (t[3] || '').replace(/^minecraft:/, '');
  if (!EFFECTS[key]) return GAME.chat('Unknown effect: ' + (t[3] || '(none)') + '. Try speed, regeneration, night_vision...', ERR);
  const secs = t[4] === 'infinite' ? Infinity : Math.max(1, parseInt(t[4], 10) || 30);
  const amp = Math.max(0, Math.min(9, parseInt(t[5], 10) || 0));
  applyEffect(key, amp + 1, secs);
  GAME.chat('Applied effect ' + EFFECTS[key].name + ' to Player', OK);
}
function cmdEnchant(t) {
  const key = (t[2] || '').replace(/^minecraft:/, '');
  const s = heldStack();
  if (!ENCHANTS[key]) return GAME.chat('Unknown enchantment: ' + (t[2] || '(none)'), ERR);
  if (!s) return GAME.chat('Hold the item you want to enchant', ERR);
  if (!canEnchant(s, key)) return GAME.chat(ITEMS[s.id].name + ' cannot support that enchantment', ERR);
  const lvl = parseInt(t[3], 10) || 1;
  if (lvl > ENCHANTS[key].max) return GAME.chat(lvl + ' is higher than the maximum level of ' + ENCHANTS[key].max + ' supported by that enchantment', ERR);
  s.ench = s.ench || {};
  for (const k in s.ench) if (!enchCompatible(k, key)) return GAME.chat(enchName(k, s.ench[k]) + ' can\'t be combined with ' + ENCHANTS[key].name, ERR);
  s.ench[key] = lvl;
  UI.refresh();
  GAME.chat('Applied enchantment ' + enchName(key, lvl) + ' to Player\'s item', OK);
}
function cmdXp(t) {
  const op = t[1], amt = parseInt(t[3], 10), levels = t[4] === 'levels' || (t[3] && /l$/i.test(t[3]));
  if (op === 'query') { GAME.chat('Player has ' + player.xpLevel + ' experience levels and ' + player.xpPoints + ' points', OK); return; }
  if (isNaN(amt)) return GAME.chat('Usage: ' + COMMANDS.xp.usage, ERR);
  if (op === 'set') { if (levels) player.xpLevel = Math.max(0, amt); else { player.xpLevel = 0; player.xpPoints = 0; addXp(amt); } }
  else if (levels) addLevels(amt); else addXp(amt);
  UI.refresh();
  GAME.chat((op === 'set' ? 'Set ' : 'Gave ') + amt + (levels ? ' experience levels' : ' experience points') + ' to Player', OK);
}
function cmdSeed() { GAME.chat('Seed: [<a class="chat-copy" data-copy="' + esc(GAME.world.seedText) + '">' + esc(GAME.world.seedText) + '</a>]', 'html'); }
function cmdSpawnpoint(t) {
  let i = 1;
  if (t[1] && t[1].charAt(0) === '@') i = 2;
  const c = t[i] ? parseCoords(t, i, true) : [Math.floor(player.pos.x), Math.floor(player.pos.y), Math.floor(player.pos.z)];
  if (!c) return GAME.chat('Usage: /spawnpoint [x y z]', ERR);
  player.spawn = new THREE.Vector3(c[0] + 0.5, c[1], c[2] + 0.5);
  GAME.chat('Set spawn point to ' + c.join(', '), OK);
}
function cmdDifficulty(t) {
  const d = (t[1] || '').toLowerCase();
  if (!t[1]) return GAME.chat('The difficulty is ' + GAME.difficulty, OK);
  if (['peaceful', 'easy', 'normal', 'hard'].indexOf(d) < 0) return GAME.chat('Unknown difficulty: ' + t[1], ERR);
  GAME.difficulty = d;
  if (d === 'peaceful') for (const m of GAME.mobs) if (MOB_SPECIES.indexOf(m.sp) >= 0) m.remove = true;
  GAME.chat('The difficulty has been set to ' + d.charAt(0).toUpperCase() + d.slice(1), OK);
}
function cmdGamerule(t) {
  if (!(t[1] in RULES)) return GAME.chat('Unknown rule. Rules: ' + Object.keys(RULES).join(', '), ERR);
  if (t[2] === undefined) return GAME.chat('Gamerule ' + t[1] + ' is currently set to: ' + RULES[t[1]], OK);
  if (t[2] !== 'true' && t[2] !== 'false') return GAME.chat('Use true or false', ERR);
  RULES[t[1]] = t[2] === 'true';
  GAME.chat('Gamerule ' + t[1] + ' is now set to: ' + RULES[t[1]], OK);
}
function cmdLocate(t) {
  const name = (t[2] || t[1] || '').replace(/^minecraft:/, '');
  if (t[1] === 'structure' || (GAME.world.structures || []).some(function (st) { return st.type === name; }) || name === 'village') {
    const r = nearestStructure(GAME.world, name, player.pos.x, player.pos.z);
    if (!r) return GAME.chat('There is no ' + name.replace(/_/g, ' ') + ' in this world. Try village, desert_pyramid, shipwreck, ocean_ruins, ocean_monument, dungeon, ruined_portal, pillager_outpost or witch_hut.', ERR);
    const ty = r.s.type === 'dungeon' ? r.s.y : GAME.world.topSolid(r.s.x, r.s.z) + 1;
    return GAME.chat('The nearest ' + r.s.type.replace(/_/g, ' ') + ' is at <a class="chat-copy" data-cmd="/tp ' + r.s.x + ' ' + ty + ' ' + r.s.z + '">[' + r.s.x + ', ' + r.s.y + ', ' + r.s.z + ']</a> (' + Math.round(r.d) + ' blocks away). Click to teleport.', 'html');
  }
  const idx = BIOME_INFO.findIndex(function (b) { return b.key === name; });
  if (idx < 0) return GAME.chat('Usage: /locate biome <ocean|plains|forest|desert>', ERR);
  const r = locateBiome(GAME.world, idx, player.pos.x, player.pos.z);
  if (!r) return GAME.chat('Could not find a biome of type ' + name, ERR);
  const y = GAME.world.topSolid(r.x, r.z) + 1;
  GAME.chat('The nearest ' + name + ' is at <a class="chat-copy" data-cmd="/tp ' + r.x + ' ' + y + ' ' + r.z + '">[' + r.x + ', ~, ' + r.z + ']</a> (' + Math.round(r.d) + ' blocks away). Click to teleport.', 'html');
}

// 67
// Commands that change the shared world run on the server when you are playing online.
const SERVER_COMMANDS = ['time', 'weather', 'kill', 'summon', 'difficulty', 'gamerule'];
function runCommand(text) {
  const toks = text.trim().replace(/^\//, '').split(/\s+/).filter(Boolean);
  const name = (toks[0] || '').toLowerCase();
  const cmd = COMMANDS[name];
  if (!cmd) { GAME.chat('Unknown or incomplete command. Type /? for a list.', ERR); return; }
  if (GAME.online && SERVER_COMMANDS.indexOf(name) >= 0 && !(name === 'kill' && (!toks[1] || toks[1] === '@s'))) { GAME.net.send({ t: 'cmd', text: text }); return; }
  try { cmd.run(toks); } catch (e) { GAME.chat('Something went wrong running that command: ' + e.message, ERR); }
}

// 67
// ---------- chat box ----------
const chatHistory = [];
let historyAt = -1, suggestIdx = 0;
const Chat = {
  open: false,
  show: function (prefix) {
    Chat.open = true;
    const box = $ui('chat');
    box.classList.add('open');
    const input = $ui('chat-input');
    input.hidden = false;
    input.value = prefix || '';
    historyAt = chatHistory.length;
    setTimeout(function () { input.focus(); input.setSelectionRange(input.value.length, input.value.length); Chat.suggest(); }, 0);
  },
  hide: function () {
    Chat.open = false;
    $ui('chat').classList.remove('open');
    const input = $ui('chat-input');
    input.blur(); input.hidden = true;
    $ui('chat-suggest').hidden = true;
  },
  candidates: function (value) {
    if (value.charAt(0) !== '/') return [];
    const parts = value.slice(1).split(' ');
    const idx = parts.length - 1, cur = parts[idx].toLowerCase();
    let list;
    if (idx === 0) list = Object.keys(COMMANDS);
    else {
      const cmd = COMMANDS[parts[0].toLowerCase()];
      if (!cmd) return [];
      const spec = cmd.args[idx - 1];
      if (!spec) return [];
      if (Array.isArray(spec)) list = spec[0] === 'command' ? Object.keys(COMMANDS) : spec;
      else if (spec === 'item') list = ITEM_KEYS();
      else if (spec === 'block') list = BLOCK_KEYS();
      else if (spec === 'entity') list = ENTITY_IDS;
      else if (spec === 'effect') list = Object.keys(EFFECTS);
      else if (spec === 'enchant') list = Object.keys(ENCHANTS);
      else if (spec === 'coord') list = ['~'];
      else list = [];
    }
    return list.filter(function (s) { return s.toLowerCase().indexOf(cur) === 0; }).slice(0, 40);
  },
  suggest: function () {
    const input = $ui('chat-input'), box = $ui('chat-suggest');
    const v = input.value;
    const list = Chat.candidates(v);
    const parts = v.slice(1).split(' ');
    const cmd = COMMANDS[(parts[0] || '').toLowerCase()];
    let html = '';
    if (cmd && parts.length > 1) html += '<div class="usage">' + esc(cmd.usage) + '</div>';
    suggestIdx = Math.min(suggestIdx, Math.max(0, list.length - 1));
    html += list.slice(0, 10).map(function (s, i) { return '<div class="sugg' + (i === suggestIdx ? ' on' : '') + '">' + esc(s) + '</div>'; }).join('');
    box.innerHTML = html;
    box.hidden = !html || v.charAt(0) !== '/';
  },
  complete: function (dir) {
    const input = $ui('chat-input');
    const list = Chat.candidates(input.value);
    if (!list.length) return;
    const parts = input.value.split(' ');
    const pick = list[suggestIdx % list.length];
    parts[parts.length - 1] = (parts.length === 1 ? '/' : '') + pick;
    input.value = parts.join(' ') + (list.length === 1 ? ' ' : '');
    suggestIdx = (suggestIdx + (dir || 1) + list.length) % list.length;
    Chat.suggest();
  },
  submit: function () {
    const input = $ui('chat-input'), v = input.value.trim();
    Chat.hide();
    if (!v) return;
    chatHistory.push(v);
    if (v.charAt(0) === '/') { GAME.chat(v, 'echo'); runCommand(v); }
    else if (GAME.online) GAME.net.send({ t: 'chat', text: v });
    else GAME.chat('<' + player.name + '> ' + v);
  }
};
(function wireChat() {
  if (typeof document === 'undefined' || !document.getElementById('chat-input')) return;
  const input = $ui('chat-input');
  input.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); Chat.submit(); GAME.chatClosed(); }
    else if (e.key === 'Escape') { e.preventDefault(); Chat.hide(); GAME.chatClosed(); }
    else if (e.key === 'Tab') { e.preventDefault(); Chat.complete(e.shiftKey ? -1 : 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (historyAt > 0) { historyAt--; input.value = chatHistory[historyAt]; Chat.suggest(); } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (historyAt < chatHistory.length - 1) { historyAt++; input.value = chatHistory[historyAt]; } else { historyAt = chatHistory.length; input.value = ''; } Chat.suggest(); }
  });
  input.addEventListener('keyup', function (e) { e.stopPropagation(); });
  input.addEventListener('input', function () { suggestIdx = 0; Chat.suggest(); });
  $ui('chat-log').addEventListener('click', function (e) {
    const a = e.target.closest('.chat-copy');
    if (!a) return;
    if (a.dataset.copy) { try { navigator.clipboard.writeText(a.dataset.copy).then(function () { GAME.chat('Copied to clipboard', OK); }, function () {}); } catch (err) { /* clipboard blocked */ } }
    if (a.dataset.cmd) { Chat.show(a.dataset.cmd); }
  });
})();

// 67