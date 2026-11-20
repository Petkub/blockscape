'use strict';
// Every animal and monster, all from vanilla Minecraft, and the box models they are drawn with.
// Part: [type, w, h, d, x, y, z, color, legPhase?]   (16 px = 1 block)
//   b = body box (x, y, z is its centre)       h = head box (all h parts turn together)
//   l = leg, pivot at its top                  j = tentacle, pivot at its top
//   w = wing/flipper, pivot at its inner edge  t = tail, pivot at its front end
// Walkers have their origin at the feet; swimmers and fliers at the body centre.
// weight = how often it appears when a new area is populated (passive) or at night (hostile).

// 67
const D = function (key, lo, hi, chance) { return { key: key, lo: lo, hi: hi, chance: chance || 1 }; };
const LEGS4 = function (w, h, x, y, z, c) { return [['l', w, h, w, x, y, z, c], ['l', w, h, w, -x, y, z, c], ['l', w, h, w, x, y, -z, c], ['l', w, h, w, -x, y, -z, c]]; };
const HUMANOID = function (skin, shirt, pants, extra) {
  return [['l', 4, 12, 4, 2, 12, 0, pants], ['l', 4, 12, 4, -2, 12, 0, pants], ['b', 8, 12, 4, 0, 18, 0, shirt],
    ['b', 4, 4, 12, 6, 22, 4, skin], ['b', 4, 4, 12, -6, 22, 4, skin],
    ['h', 8, 8, 8, 0, 28, 0, skin], ['h', 2, 1, 0.4, 2, 28, 4.1, 0x1a1a1a], ['h', 2, 1, 0.4, -2, 28, 4.1, 0x1a1a1a]].concat(extra || []);
};

const SPECIES = [
  // ----- Plains -----
  { key: 'cow', name: 'Cow', biome: PLAINS, move: 'walk', speed: 1.0, weight: 8, r: 0.45, h: 1.4, grazes: true, hp: 10, xp: 2, drops: [D('beef', 1, 3), D('leather', 0, 2)], sound: 'moo',
    desc: 'Drops beef and leather. Milk it with a bucket.',
    parts: [['b', 12, 10, 18, 0, 15, -1, 0x4a3222], ['b', 12.4, 5, 7, 0, 17, -3, 0xe8e4dc], ['b', 12.4, 4, 5, 0, 14, 4, 0xe8e4dc],
      ['h', 8, 8, 6, 0, 18, 11, 0x4a3222], ['h', 6, 4, 2, 0, 15, 14.5, 0xd9a7a0], ['h', 1, 3, 1, 3.5, 23, 11, 0xe8e0c8], ['h', 1, 3, 1, -3.5, 23, 11, 0xe8e0c8],
      ['b', 2, 8, 2, 0, 15, -11, 0x3a2618]].concat(LEGS4(4, 10, 4, 10, 6, 0x3a2618)) },
  { key: 'pig', name: 'Pig', biome: PLAINS, move: 'walk', speed: 1.1, weight: 8, r: 0.45, h: 0.9, hp: 10, xp: 2, drops: [D('porkchop', 1, 3)], sound: 'oink',
    desc: 'Drops porkchops.',
    parts: [['b', 10, 8, 14, 0, 10, 0, 0xf0a5a2], ['h', 8, 8, 8, 0, 11, 10, 0xf0a5a2], ['h', 4, 3, 1, 0, 10, 14.5, 0xd8807e],
      ['h', 1.5, 1.5, 0.5, 2, 13, 14.2, 0x222222], ['h', 1.5, 1.5, 0.5, -2, 13, 14.2, 0x222222]].concat(LEGS4(4, 6, 3, 6, 4.5, 0xe8958f)) },
  { key: 'sheep', name: 'Sheep', biome: PLAINS, move: 'walk', speed: 0.9, weight: 10, r: 0.45, h: 1.3, grazes: true, hp: 8, xp: 2, drops: [D('mutton', 1, 2), D('wool_white', 1, 1)], sound: 'baa',
    desc: 'Drops mutton and wool.',
    parts: [['b', 12, 10, 16, 0, 14, 0, 0xf2f0ea], ['h', 6, 7, 6, 0, 17, 10, 0x3a3330], ['h', 7, 3, 5, 0, 20.5, 9.5, 0xf2f0ea]].concat(LEGS4(3, 9, 3.5, 9, 5, 0x3a3330)) },
  { key: 'chicken', name: 'Chicken', biome: PLAINS, move: 'walk', speed: 0.9, weight: 8, r: 0.2, h: 0.7, hp: 4, xp: 1, drops: [D('chicken', 1, 1), D('feather', 0, 2), D('egg', 1, 1, 0.3)], sound: 'cluck', slowFall: true,
    desc: 'Drops chicken, feathers and eggs. Flaps to fall slowly.',
    parts: [['b', 6, 6, 8, 0, 7, 0, 0xf8f8f4], ['b', 4, 3, 2, 0, 10, -4.5, 0xf8f8f4], ['h', 4, 6, 3, 0, 12, 4, 0xf8f8f4], ['h', 4, 2, 2, 0, 12, 6.5, 0xf0a020],
      ['h', 2, 2, 1, 0, 10, 6, 0xd02020], ['w', 1, 4, 6, 3, 9, 0, 0xeeeeea], ['w', 1, 4, 6, -3, 9, 0, 0xeeeeea],
      ['l', 1, 4, 1, 1.5, 4, 0, 0xf0b030], ['l', 1, 4, 1, -1.5, 4, 0, 0xf0b030]] },
  { key: 'horse', name: 'Horse', biome: PLAINS, move: 'walk', speed: 1.8, weight: 3, r: 0.6, h: 1.6, grazes: true, hp: 22, xp: 3, drops: [D('leather', 0, 2)], sound: 'neigh',
    desc: 'Fast and tall. Drops leather.',
    parts: [['b', 10, 10, 20, 0, 18, 0, 0x8b5a2b], ['b', 3, 10, 3, 0, 18, -11, 0x3a2414],
      ['h', 6, 11, 6, 0, 26, 9, 0x8b5a2b], ['h', 6, 6, 10, 0, 30, 13, 0x8b5a2b], ['h', 5, 4, 3, 0, 29, 18.5, 0x5a3a1e], ['h', 2, 12, 3, 0, 28, 6.5, 0x3a2414],
      ['h', 1.5, 3, 1, 2, 34.5, 10, 0x8b5a2b], ['h', 1.5, 3, 1, -2, 34.5, 10, 0x8b5a2b]].concat(LEGS4(4, 13, 3.5, 13, 7.5, 0x7a4d24)) },
  { key: 'donkey', name: 'Donkey', biome: PLAINS, move: 'walk', speed: 1.4, weight: 2, r: 0.55, h: 1.5, grazes: true, hp: 20, xp: 3, drops: [D('leather', 0, 2)], sound: 'hee',
    desc: 'A smaller, grey cousin of the horse with long ears.',
    parts: [['b', 9, 9, 17, 0, 16, 0, 0x7a6a5a], ['b', 2, 8, 2, 0, 15, -9.5, 0x4a3e34], ['h', 5, 10, 5, 0, 23, 8, 0x7a6a5a], ['h', 5, 5, 9, 0, 27, 11.5, 0x7a6a5a],
      ['h', 4, 3, 2, 0, 26, 16.5, 0x4a3e34], ['h', 1.5, 6, 1, 1.5, 32.5, 8.5, 0x7a6a5a], ['h', 1.5, 6, 1, -1.5, 32.5, 8.5, 0x7a6a5a]].concat(LEGS4(3, 11, 3, 11, 6.5, 0x6a5a4a)) },
  { key: 'rabbit', name: 'Rabbit', biome: PLAINS, move: 'hop', speed: 2.2, weight: 6, r: 0.2, h: 0.5, shy: true, hp: 3, xp: 1, drops: [D('rabbit', 0, 1), D('rabbit_hide', 0, 1), D('rabbit_foot', 1, 1, 0.1)],
    desc: 'Hops in short bursts and bolts if you get close.',
    parts: [['b', 6, 5, 7, 0, 4.5, 0, 0xb08860], ['b', 2, 2, 2, 0, 5, -4, 0xf4f0ea], ['h', 5, 5, 4, 0, 8, 4, 0xb08860],
      ['h', 1, 5, 1, 1.5, 12.5, 3, 0xb08860], ['h', 1, 5, 1, -1.5, 12.5, 3, 0xb08860], ['h', 1, 1, 0.5, 0, 8, 6.2, 0xe08a8a]].concat(LEGS4(2, 2, 2, 2, 2.5, 0xa07850)) },
  { key: 'bee', name: 'Bee', biome: PLAINS, move: 'fly', speed: 2.2, weight: 4, r: 0.35, h: 0.5, alt: 3, hp: 10, xp: 1, hostile: 'neutral', attack: 2, poison: true, drops: [], sound: 'buzz', group: true,
    desc: 'Buzzes around flowers. Stings, with poison, if you hit it.',
    parts: [['b', 5, 5, 7, 0, 0, 0, 0xf0c020], ['b', 5.2, 5.2, 1.2, 0, 0, 1, 0x2a2010], ['b', 5.2, 5.2, 1.2, 0, 0, -1.5, 0x2a2010], ['h', 4, 4, 2, 0, 0, 4.5, 0x2a2010],
      ['b', 0.6, 0.6, 1.5, 0, 0, -4.2, 0x2a2010], ['w', 5, 0.5, 3, 1, 2.8, 0, 0xdceeff], ['w', 5, 0.5, 3, -1, 2.8, 0, 0xdceeff]] },
  { key: 'llama', name: 'Llama', biome: PLAINS, move: 'walk', speed: 1.1, weight: 2, r: 0.45, h: 1.87, grazes: true, hp: 22, xp: 2, drops: [D('leather', 0, 2)], sound: 'llama',
    desc: 'Woolly and tall-necked. Travels in small caravans.',
    parts: [['b', 8, 9, 16, 0, 16, 0, 0xd6c4a0], ['h', 6, 14, 6, 0, 26, 7, 0xd6c4a0], ['h', 4, 4, 4, 0, 30, 11, 0xc8b490], ['h', 1, 3, 1, 2, 34.5, 7, 0xd6c4a0], ['h', 1, 3, 1, -2, 34.5, 7, 0xd6c4a0],
      ['b', 2, 5, 2, 0, 18, -9, 0xd6c4a0]].concat(LEGS4(3, 12, 2.5, 12, 5.5, 0xcab690)) },
  { key: 'mooshroom', name: 'Mooshroom', biome: PLAINS, move: 'walk', speed: 1.0, weight: 1, r: 0.45, h: 1.4, grazes: true, hp: 10, xp: 2, drops: [D('beef', 1, 3), D('leather', 0, 2)], sound: 'moo',
    desc: 'A red cow with mushrooms on its back. Use a bowl on it for mushroom stew.',
    parts: [['b', 12, 10, 18, 0, 15, -1, 0xb02a2a], ['b', 12.4, 5, 7, 0, 17, -3, 0xe8e4dc], ['b', 3, 3, 3, 3, 21.5, -2, 0xd03030], ['b', 3, 3, 3, -3, 21.5, 3, 0xd03030],
      ['h', 8, 8, 6, 0, 18, 11, 0xb02a2a], ['h', 6, 4, 2, 0, 15, 14.5, 0xd9a7a0], ['h', 3, 3, 3, 0, 23.5, 11, 0xd03030]].concat(LEGS4(4, 10, 4, 10, 6, 0x8a2020)) },
  { key: 'sniffer', name: 'Sniffer', biome: PLAINS, move: 'walk', speed: 0.6, weight: 1, r: 0.9, h: 1.75, grazes: true, hp: 14, xp: 3, drops: [], sound: 'sniff',
    desc: 'An ancient, gentle giant that sniffs the ground for seeds.',
    parts: [['b', 16, 14, 24, 0, 15, 0, 0xb4473a], ['b', 16.4, 4, 20, 0, 21, 0, 0x3f8a3a], ['h', 10, 8, 8, 0, 14, 15, 0xa03a30], ['h', 6, 3, 3, 0, 11, 20, 0x7ac06a]].concat(LEGS4(4, 8, 6, 8, 8, 0x8a3028)) },
  { key: 'frog', name: 'Frog', biome: PLAINS, move: 'hop', speed: 1.6, weight: 2, r: 0.25, h: 0.5, nearWater: true, hp: 10, xp: 1, drops: [], sound: 'croak',
    desc: 'Hops near water and croaks.',
    parts: [['b', 6, 4, 7, 0, 2.5, 0, 0xc78345], ['b', 5.8, 1, 6.8, 0, 0.6, 0, 0xf0d0a0], ['h', 6, 3, 5, 0, 5, 3, 0xc78345], ['h', 2, 2, 2, 2, 7, 3.5, 0xf0c060], ['h', 2, 2, 2, -2, 7, 3.5, 0xf0c060],
      ['l', 2, 2, 3, 3, 2, -2, 0xb07038], ['l', 2, 2, 3, -3, 2, -2, 0xb07038], ['l', 1.5, 2, 1.5, 2, 2, 2.5, 0xb07038], ['l', 1.5, 2, 1.5, -2, 2, 2.5, 0xb07038]] },

// 67
  // ----- Forest -----
  { key: 'wolf', name: 'Wolf', biome: FOREST, move: 'walk', speed: 1.6, weight: 4, r: 0.3, h: 0.85, hp: 8, xp: 3, hostile: 'neutral', attack: 4, drops: [], sound: 'bark', group: true,
    desc: 'Fights back if you hit it. Wolves from a wolf shot are tamed: they attack whatever you attack.',
    parts: [['b', 8, 7, 14, 0, 11, 0, 0x9a9a96], ['b', 9, 8, 6, 0, 12, 4, 0xb4b4b0], ['t', 3, 3, 8, 0, 12.5, -7, 0x8a8a86],
      ['h', 7, 7, 6, 0, 14, 9.5, 0x9a9a96], ['h', 3, 3, 4, 0, 12.5, 14, 0x6a6a66], ['h', 1, 1, 0.5, 0, 13.5, 16.1, 0x111111],
      ['h', 2, 3, 1, 2, 19, 9, 0x8a8a86], ['h', 2, 3, 1, -2, 19, 9, 0x8a8a86]].concat(LEGS4(3, 8, 2.5, 8, 5, 0x8a8a86)) },
  { key: 'fox', name: 'Fox', biome: FOREST, move: 'walk', speed: 1.9, weight: 3, r: 0.3, h: 0.7, shy: true, hp: 10, xp: 2, drops: [], sound: 'yip',
    desc: 'Orange coat, black socks and a bushy white-tipped tail.',
    parts: [['b', 6, 6, 12, 0, 8, 0, 0xd86a22], ['t', 4, 4, 9, 0, 9, -6, 0xd86a22], ['b', 4.2, 4.2, 2, 0, 9, -14, 0xf2ece0],
      ['h', 6, 5, 5, 0, 10, 8, 0xd86a22], ['h', 3, 2, 3, 0, 9, 11.5, 0xf2ece0], ['h', 1, 1, 1, 0, 9.5, 13, 0x111111],
      ['h', 2, 3, 1, 2, 14, 8, 0xd86a22], ['h', 2, 3, 1, -2, 14, 8, 0xd86a22]].concat(LEGS4(2, 5, 2, 5, 4, 0x2a2420)) },
  { key: 'goat', name: 'Goat', biome: FOREST, move: 'walk', speed: 1.2, weight: 3, r: 0.45, h: 1.3, grazes: true, hp: 10, xp: 2, drops: [D('goat_horn', 1, 1, 0.1)], sound: 'bleat',
    desc: 'Climbs the hills and sometimes rams. Rarely drops a goat horn.',
    parts: [['b', 8, 9, 14, 0, 13, 0, 0xe8e2d4], ['h', 6, 7, 6, 0, 17, 9, 0xe8e2d4], ['h', 1.5, 5, 1.5, 2, 23, 8, 0x9a9590], ['h', 1.5, 5, 1.5, -2, 23, 8, 0x9a9590],
      ['h', 2, 3, 1, 0, 12.5, 11.5, 0xd8d0c0]].concat(LEGS4(3, 9, 2.5, 9, 5, 0xd8d2c4)) },
  { key: 'panda', name: 'Panda', biome: FOREST, move: 'walk', speed: 0.6, weight: 2, r: 0.65, h: 1.25, hp: 20, xp: 2, drops: [D('bamboo_block', 0, 1, 0.3)], sound: 'panda',
    desc: 'Slow and sleepy, black and white.',
    parts: [['b', 12, 11, 18, 0, 13, 0, 0xf2f2ee], ['b', 12.4, 5, 6, 0, 15, 4, 0x222222], ['h', 10, 8, 7, 0, 15, 12, 0xf2f2ee],
      ['h', 2.5, 2.5, 0.4, 2.5, 16, 15.6, 0x222222], ['h', 2.5, 2.5, 0.4, -2.5, 16, 15.6, 0x222222], ['h', 3, 3, 2, 4, 20, 11, 0x222222], ['h', 3, 3, 2, -4, 20, 11, 0x222222]].concat(LEGS4(5, 8, 4, 8, 6, 0x222222)) },
  { key: 'parrot', name: 'Parrot', biome: FOREST, move: 'fly', speed: 3.2, weight: 3, r: 0.25, h: 0.9, alt: 7, hp: 6, xp: 1, drops: [D('feather', 1, 2)], sound: 'chirp',
    desc: 'Bright red and blue. Flits between the treetops.',
    parts: [['b', 3, 6, 3, 0, 0, 0, 0xd42a2a], ['h', 3, 3, 3, 0, 4, 1, 0xd42a2a], ['h', 1, 2, 1, 0, 3.5, 3, 0x333333], ['w', 5, 1, 3, 1.5, 1, 0, 0x3a5ad8], ['w', 5, 1, 3, -1.5, 1, 0, 0x3a5ad8], ['b', 2, 1, 4, 0, -3, -2, 0x3a5ad8]] },
  { key: 'ocelot', name: 'Ocelot', biome: FOREST, move: 'walk', speed: 2.0, weight: 2, r: 0.3, h: 0.7, shy: true, hp: 10, xp: 2, drops: [], sound: 'meow',
    desc: 'A shy spotted cat that keeps its distance.',
    parts: [['b', 4, 4, 12, 0, 7, 0, 0xe8c060], ['b', 1, 1, 1, 1.5, 9.2, 2, 0x5a3a1a], ['b', 1, 1, 1, -1, 9.2, -2, 0x5a3a1a], ['h', 5, 4, 5, 0, 9, 8, 0xe8c060], ['h', 1, 1.5, 1, 1.5, 11.5, 7, 0xe8c060], ['h', 1, 1.5, 1, -1.5, 11.5, 7, 0xe8c060],
      ['t', 1, 1, 8, 0, 8, -6, 0xe8c060]].concat(LEGS4(2, 5, 1.5, 5, 4, 0xd8b050)) },

  // ----- Desert -----
  { key: 'camel', name: 'Camel', biome: DESERT, move: 'walk', speed: 1.1, weight: 3, r: 0.85, h: 2.3, hp: 32, xp: 3, drops: [], sound: 'camel',
    desc: 'Long-legged desert wanderer with a single hump.',
    parts: [['b', 10, 10, 18, 0, 20, 0, 0xc8a064], ['b', 8, 6, 8, 0, 28, -1, 0xc8a064], ['b', 2, 8, 2, 0, 19, -10, 0x9a7444],
      ['h', 4, 10, 4, 0, 26, 10, 0xc8a064], ['h', 5, 5, 8, 0, 32, 13, 0xc8a064], ['h', 3, 2, 2, 0, 31, 17.5, 0x8a6a3a]].concat(LEGS4(3, 15, 3, 15, 6, 0xb88c52)) },
  { key: 'armadillo', name: 'Armadillo', biome: DESERT, move: 'walk', speed: 0.8, weight: 3, r: 0.35, h: 0.65, shy: true, hp: 12, xp: 2, drops: [D('armadillo_scute', 0, 1)], sound: 'scuttle',
    desc: 'Rolls up when you get close. Drops armadillo scutes.',
    parts: [['b', 7, 6, 10, 0, 5, 0, 0x9a7a68], ['b', 7.4, 6.4, 1, 0, 5, 2, 0x7a5a4a], ['b', 7.4, 6.4, 1, 0, 5, -2, 0x7a5a4a], ['b', 1.5, 1.5, 5, 0, 3, -7, 0x8a6a58],
      ['h', 3, 3, 4, 0, 4, 6.5, 0xc4a890], ['h', 1, 2, 1, 1, 6.5, 5.5, 0xc4a890], ['h', 1, 2, 1, -1, 6.5, 5.5, 0xc4a890]].concat(LEGS4(1.5, 2, 2.5, 2, 3, 0x8a6a58)) },

// 67
  // ----- Ocean -----
  { key: 'cod', name: 'Cod', biome: OCEAN, move: 'swim', speed: 1.6, weight: 10, r: 0.25, h: 0.3, hp: 3, xp: 1, drops: [D('cod', 1, 1), D('bone_meal', 1, 1, 0.05)], school: true,
    desc: 'Swims in schools. Drops raw cod.',
    parts: [['b', 3, 4, 8, 0, 0, 0, 0xa89070], ['h', 3, 3.5, 3, 0, 0, 5, 0xb8a080], ['b', 1, 2, 4, 0, 3, 0, 0x8a7458], ['t', 1, 4, 3, 0, 0, -5.5, 0x8a7458],
      ['h', 0.5, 1, 1, 1.6, 0.5, 5.5, 0x111111], ['h', 0.5, 1, 1, -1.6, 0.5, 5.5, 0x111111]] },
  { key: 'salmon', name: 'Salmon', biome: OCEAN, move: 'swim', speed: 1.8, weight: 8, r: 0.35, h: 0.4, hp: 3, xp: 1, drops: [D('salmon', 1, 1), D('bone_meal', 1, 1, 0.05)], school: true,
    desc: 'A red-silver fish. Drops raw salmon.',
    parts: [['b', 3, 5, 10, 0, 0, 0, 0xb04a3a], ['b', 3.2, 2, 8, 0, -1.8, 0, 0xd8c8b8], ['h', 3, 4, 3, 0, 0, 6.5, 0xc06050], ['t', 1, 4, 3, 0, 0, -6.5, 0x9a3a2a]] },
  { key: 'tropical_fish', name: 'Tropical Fish', biome: OCEAN, move: 'swim', speed: 1.4, weight: 8, r: 0.25, h: 0.4, hp: 3, xp: 1, drops: [D('tropical_fish', 1, 1)], school: true,
    desc: 'Bright orange and white. Loves the coral reefs.',
    parts: [['b', 2, 5, 5, 0, 0, 0, 0xf28c1e], ['b', 2.2, 5.2, 1, 0, 0, 0.5, 0xffffff], ['b', 2.2, 4, 1, 0, 0, 2.5, 0x222222], ['t', 1, 4, 2, 0, 0, -3.5, 0xf28c1e]] },
  { key: 'pufferfish', name: 'Pufferfish', biome: OCEAN, move: 'swim', speed: 0.8, weight: 3, r: 0.35, h: 0.7, hp: 3, xp: 1, drops: [D('pufferfish', 1, 1)], hostile: 'touch', attack: 1, poison: true,
    desc: 'Puffs up and poisons anything that touches it. Poisonous to eat.',
    parts: [['b', 5, 5, 5, 0, 0, 0, 0xe2c23a], ['b', 1, 1, 1, 3, 0, 0, 0xf4f0d0], ['b', 1, 1, 1, -3, 0, 0, 0xf4f0d0], ['b', 1, 1, 1, 0, 3, 0, 0xf4f0d0], ['b', 1, 1, 1, 0, -3, 0, 0xf4f0d0],
      ['b', 1, 1, 1, 0, 2, 2.5, 0xf4f0d0], ['h', 1, 1, 0.5, 1.5, 1, 2.6, 0x111111], ['h', 1, 1, 0.5, -1.5, 1, 2.6, 0x111111], ['t', 1, 2, 2, 0, 0, -3.5, 0xc8a42a]] },
  { key: 'dolphin', name: 'Dolphin', biome: OCEAN, move: 'swim', speed: 3.0, weight: 3, r: 0.45, h: 0.6, surface: true, minDepth: 4, hp: 10, xp: 2, drops: [D('cod', 0, 1)], hostile: 'neutral', attack: 3, sound: 'click', group: true,
    desc: 'Playful and fast. Stays close to the surface. The whole pod fights back.',
    parts: [['b', 6, 6, 16, 0, 0, 0, 0x7e93a3], ['b', 5, 2, 14, 0, -2.5, 0, 0xd8e0e6], ['h', 3, 2, 5, 0, -1, 10, 0x7e93a3], ['b', 1, 4, 3, 0, 4, -1, 0x6e8393],
      ['t', 8, 1, 3, 0, 0, -9.5, 0x6e8393], ['b', 4, 1, 3, 4, -2, 3, 0x6e8393], ['b', 4, 1, 3, -4, -2, 3, 0x6e8393]] },
  { key: 'squid', name: 'Squid', biome: OCEAN, move: 'swim', speed: 0.9, weight: 4, r: 0.4, h: 0.8, minDepth: 5, hp: 10, xp: 2, drops: [D('ink_sac', 1, 3)],
    desc: 'Drifts through deeper water, trailing eight tentacles.',
    parts: [['b', 7, 10, 7, 0, 4, 0, 0x24304a], ['b', 1, 1.5, 0.5, 2, 4, 3.6, 0xe0e8f0], ['b', 1, 1.5, 0.5, -2, 4, 3.6, 0xe0e8f0]]
      .concat([[2, 2], [-2, 2], [2, -2], [-2, -2], [0, 3], [0, -3], [3, 0], [-3, 0]].map(function (o, i) { return ['j', 1, 7, 1, o[0], -1, o[1], 0x2a3858, i]; })) },
  { key: 'glow_squid', name: 'Glow Squid', biome: OCEAN, move: 'swim', speed: 0.9, weight: 2, r: 0.4, h: 0.8, minDepth: 6, hp: 10, xp: 2, drops: [D('glow_ink_sac', 1, 3)], glow: true,
    desc: 'Glows teal in the deep, even at night.',
    parts: [['b', 7, 10, 7, 0, 4, 0, 0x1a9a96], ['b', 1, 1.5, 0.5, 2, 4, 3.6, 0xb0fff0], ['b', 1, 1.5, 0.5, -2, 4, 3.6, 0xb0fff0]]
      .concat([[2, 2], [-2, 2], [2, -2], [-2, -2], [0, 3], [0, -3], [3, 0], [-3, 0]].map(function (o, i) { return ['j', 1, 7, 1, o[0], -1, o[1], 0x22b8b0, i]; })) },
  { key: 'turtle', name: 'Turtle', biome: OCEAN, move: 'swim', speed: 1.0, weight: 3, r: 0.6, h: 0.4, flapSwim: true, hp: 30, xp: 2, drops: [D('seagrass', 0, 2)],
    desc: 'Glides slowly with big front flippers.',
    parts: [['b', 10, 4, 12, 0, 0, 0, 0x3f6b3a], ['b', 8, 2, 10, 0, 3, 0, 0x55803f], ['h', 4, 3, 5, 0, 0, 8, 0x8aa868], ['h', 1, 1, 0.5, 1.5, 0.8, 10.6, 0x111111], ['h', 1, 1, 0.5, -1.5, 0.8, 10.6, 0x111111],
      ['w', 7, 1, 4, 5, 0.5, 3, 0x8aa868], ['w', 7, 1, 4, -5, 0.5, 3, 0x8aa868], ['b', 3, 1, 3, 4, 0, -6, 0x8aa868], ['b', 3, 1, 3, -4, 0, -6, 0x8aa868]] },
  { key: 'axolotl', name: 'Axolotl', biome: OCEAN, move: 'swim', speed: 1.2, weight: 2, r: 0.4, h: 0.4, hp: 14, xp: 1, drops: [], maxDepth: 6,
    desc: 'A pink salamander with frilly gills that hunts fish in shallow water.',
    parts: [['b', 4, 3, 10, 0, 0, 0, 0xf3a6c8], ['h', 6, 4, 5, 0, 0.5, 7.5, 0xf3a6c8], ['h', 1, 3, 1, 3.5, 2, 7, 0xd85a90], ['h', 1, 3, 1, -3.5, 2, 7, 0xd85a90],
      ['h', 0.8, 0.8, 0.4, 1.6, 1, 10.1, 0x222222], ['h', 0.8, 0.8, 0.4, -1.6, 1, 10.1, 0x222222], ['t', 1, 5, 7, 0, 0.5, -5, 0xf3a6c8],
      ['w', 3, 1, 1.5, 2, -1, 3, 0xf3a6c8], ['w', 3, 1, 1.5, -2, -1, 3, 0xf3a6c8]] }
];

// 67
// Hostile mobs. They appear at night, in dark caves, and some only in certain places.
const MOB_SPECIES = [
  { key: 'zombie', name: 'Zombie', move: 'walk', speed: 1.4, r: 0.3, h: 1.95, hp: 20, xp: 5, hostile: 'always', attack: 3, undead: true, burnsDay: true, weight: 30, where: 'land', sound: 'groan',
    drops: [D('rotten_flesh', 0, 2), D('iron_ingot', 1, 1, 0.025), D('carrot', 1, 1, 0.025), D('potato', 1, 1, 0.025)],
    desc: 'Shuffles toward you with its arms out. Burns in sunlight.', parts: HUMANOID(0x5d8a4a, 0x2b9aa0, 0x3a3a8c) },
  { key: 'husk', name: 'Husk', move: 'walk', speed: 1.4, r: 0.3, h: 1.95, hp: 20, xp: 5, hostile: 'always', attack: 3, undead: true, weight: 30, where: 'desert', hungerHit: true, sound: 'groan',
    drops: [D('rotten_flesh', 0, 2), D('iron_ingot', 1, 1, 0.025)],
    desc: 'A desert zombie. Doesn\'t burn in sunlight, and its hits make you hungry.', parts: HUMANOID(0xc4a77a, 0x8a7a5a, 0x6a5a40) },
  { key: 'drowned', name: 'Drowned', move: 'walk', speed: 1.3, r: 0.3, h: 1.95, hp: 20, xp: 5, hostile: 'always', attack: 3, undead: true, burnsDay: true, amphibious: true, sinks: true, weight: 30, where: 'water', sound: 'gurgle',
    drops: [D('rotten_flesh', 0, 2), D('copper_ingot', 1, 1, 0.11), D('trident', 1, 1, 0.02), D('nautilus_shell', 1, 1, 0.03)],
    desc: 'A zombie that lives underwater. Rarely carries a trident.',
    parts: HUMANOID(0x4a9a8a, 0x3a6a6a, 0x6a5a8a, [['h', 2, 1, 0.5, 2, 28, 4.2, 0x7ff0e0], ['h', 2, 1, 0.5, -2, 28, 4.2, 0x7ff0e0]]) },
  { key: 'skeleton', name: 'Skeleton', move: 'walk', speed: 1.3, r: 0.3, h: 1.99, hp: 20, xp: 5, hostile: 'always', ranged: 'bow', undead: true, burnsDay: true, weight: 25, where: 'land', sound: 'rattle',
    drops: [D('bone', 0, 2), D('arrow', 0, 2)],
    desc: 'Keeps its distance and shoots arrows. Burns in sunlight.',
    parts: [['l', 2, 12, 2, 2, 12, 0, 0xc8c8c4], ['l', 2, 12, 2, -2, 12, 0, 0xc8c8c4], ['b', 6, 10, 2, 0, 19, 0, 0xd0d0cc], ['b', 8, 2, 3, 0, 23, 0, 0xd8d8d4],
      ['b', 2, 2, 12, 5, 22, 4, 0xc8c8c4], ['b', 2, 2, 12, -5, 22, 4, 0xc8c8c4], ['b', 1, 12, 1, -5, 22, 10, 0x7a5a30],
      ['h', 8, 8, 8, 0, 28, 0, 0xd8d8d4], ['h', 2, 2, 0.4, 2, 28, 4.1, 0x202020], ['h', 2, 2, 0.4, -2, 28, 4.1, 0x202020]] },
  { key: 'spider', name: 'Spider', move: 'walk', speed: 1.8, r: 0.7, h: 0.9, hp: 16, xp: 5, hostile: 'always', attack: 2, arthropod: true, leaps: true, weight: 25, where: 'land', sound: 'hiss_spider',
    drops: [D('string', 0, 2), D('spider_eye', 1, 1, 0.33)],
    desc: 'Leaps at you from a few blocks away. Calm in daylight unless hit.',
    parts: [['b', 10, 8, 12, 0, 7, -4, 0x3a2e28], ['h', 8, 8, 8, 0, 7, 6, 0x2e2420], ['h', 1.5, 1.5, 0.4, 2, 8, 10.1, 0xd02020], ['h', 1.5, 1.5, 0.4, -2, 8, 10.1, 0xd02020]]
      .concat([-6, -2, 1, 4].reduce(function (a, z) { return a.concat([['w', 12, 1.5, 1.5, 4, 8, z, 0x2a201c], ['w', 12, 1.5, 1.5, -4, 8, z, 0x2a201c]]); }, [])) },
  { key: 'cave_spider', name: 'Cave Spider', move: 'walk', speed: 2.0, r: 0.35, h: 0.5, scale: 0.6, hp: 12, xp: 5, hostile: 'always', attack: 2, poison: true, arthropod: true, leaps: true, weight: 0, where: 'cave', sound: 'hiss_spider',
    drops: [D('string', 0, 2), D('spider_eye', 1, 1, 0.33)],
    desc: 'A small blue spider of the caves. Its bite poisons you.',
    parts: [['b', 10, 8, 12, 0, 7, -4, 0x1c3a46], ['h', 8, 8, 8, 0, 7, 6, 0x163038], ['h', 1.5, 1.5, 0.4, 2, 8, 10.1, 0xd02020], ['h', 1.5, 1.5, 0.4, -2, 8, 10.1, 0xd02020]]
      .concat([-6, -2, 1, 4].reduce(function (a, z) { return a.concat([['w', 12, 1.5, 1.5, 4, 8, z, 0x163038], ['w', 12, 1.5, 1.5, -4, 8, z, 0x163038]]); }, [])) },
  { key: 'creeper', name: 'Creeper', move: 'walk', speed: 1.3, r: 0.3, h: 1.7, hp: 20, xp: 5, hostile: 'always', explodes: true, weight: 20, where: 'land',
    drops: [D('gunpowder', 0, 2)],
    desc: 'Silent until it hisses. Explodes 1.5 seconds after getting close.',
    parts: [['b', 8, 12, 4, 0, 12, 0, 0x4caf3c], ['h', 8, 8, 8, 0, 22, 0, 0x56b846], ['h', 2, 2, 0.4, 2, 23, 4.1, 0x111111], ['h', 2, 2, 0.4, -2, 23, 4.1, 0x111111],
      ['h', 2, 3, 0.4, 0, 20.5, 4.1, 0x111111], ['h', 4, 1.5, 0.4, 0, 19, 4.1, 0x111111]].concat(LEGS4(4, 6, 2, 6, 3, 0x3f9a32)) },
  { key: 'enderman', name: 'Enderman', move: 'walk', speed: 1.6, r: 0.3, h: 2.9, hp: 40, xp: 5, hostile: 'stare', attack: 7, teleports: true, weight: 8, where: 'any', sound: 'vwoop',
    drops: [D('ender_pearl', 0, 1)],
    desc: 'Neutral until you look it in the eyes. Teleports away from arrows and water.',
    parts: [['l', 2, 30, 2, 2, 30, 0, 0x111111], ['l', 2, 30, 2, -2, 30, 0, 0x111111], ['b', 8, 12, 4, 0, 36, 0, 0x151515],
      ['l', 2, 30, 2, 5, 42, 0, 0x111111, Math.PI], ['l', 2, 30, 2, -5, 42, 0, 0x111111, 0],
      ['h', 8, 8, 8, 0, 46, 0, 0x161616], ['h', 2, 1, 0.4, 2, 45, 4.1, 0xd060ff], ['h', 2, 1, 0.4, -2, 45, 4.1, 0xd060ff]] },
  { key: 'witch', name: 'Witch', move: 'walk', speed: 1.2, r: 0.3, h: 1.95, hp: 26, xp: 5, hostile: 'always', ranged: 'potion', weight: 5, where: 'land', sound: 'witch',
    drops: [D('glowstone_dust', 0, 2), D('redstone', 0, 2), D('sugar', 0, 2), D('gunpowder', 0, 2), D('stick', 0, 2), D('spider_eye', 0, 1)],
    desc: 'Throws splash potions of harming, poison and slowness.',
    parts: [['l', 4, 12, 4, 2, 12, 0, 0x2a1a3a], ['l', 4, 12, 4, -2, 12, 0, 0x2a1a3a], ['b', 8, 12, 6, 0, 18, 0, 0x3a2a4a], ['b', 12, 4, 4, 0, 22, 3, 0x3a2a4a],
      ['h', 8, 9, 8, 0, 28, 0, 0xb8a07a], ['h', 2, 4, 2, 0, 27, 5, 0xb08a6a], ['h', 12, 1, 12, 0, 33, 0, 0x2a2a1a], ['h', 6, 6, 6, 0, 36, 0, 0x2a2a1a], ['h', 3, 3, 3, 0, 40, -1, 0x2a2a1a]] },
  { key: 'slime', name: 'Slime', move: 'hop', speed: 1.4, r: 0.5, h: 1.0, hp: 16, xp: 4, hostile: 'always', attack: 4, translucent: true, split: 'slime_medium', weight: 0, where: 'cave', sound: 'squish',
    drops: [], desc: 'A bouncing green cube that splits into smaller slimes. The smallest drop slimeballs.',
    parts: [['b', 16, 16, 16, 0, 8, 0, 0x6cc85a], ['b', 10, 10, 10, 0, 8, 0, 0x48a03a], ['b', 2, 2, 1, 3, 10, 8.2, 0x1a3a1a], ['b', 2, 2, 1, -3, 10, 8.2, 0x1a3a1a], ['b', 2, 1, 1, 1, 6, 8.2, 0x1a3a1a]] },
  { key: 'phantom', name: 'Phantom', move: 'fly', speed: 6, r: 0.45, h: 0.5, alt: 14, hp: 20, xp: 5, hostile: 'always', attack: 6, undead: true, burnsDay: true, swoops: true, weight: 6, where: 'sky', sound: 'screech',
    drops: [D('phantom_membrane', 0, 1)],
    desc: 'Circles high above at night and swoops down to bite.',
    parts: [['b', 5, 3, 9, 0, 0, 0, 0x435a8a], ['h', 7, 3, 5, 0, 0, 6, 0x435a8a], ['h', 2, 1, 0.4, 2, 0.5, 8.6, 0x8cf05a], ['h', 2, 1, 0.4, -2, 0.5, 8.6, 0x8cf05a],
      ['w', 14, 1, 7, 2.5, 1, 0, 0x3a4c78], ['w', 14, 1, 7, -2.5, 1, 0, 0x3a4c78], ['b', 3, 1.5, 6, 0, 0, -7, 0x3a4c78]] },
  { key: 'pillager', name: 'Pillager', move: 'walk', speed: 1.4, r: 0.3, h: 1.95, hp: 24, xp: 5, hostile: 'always', ranged: 'crossbow', weight: 6, where: 'land', sound: 'hmm',
    drops: [D('arrow', 0, 2), D('crossbow', 1, 1, 0.085)],
    desc: 'A grey-skinned raider with a crossbow.',
    parts: [['l', 4, 12, 4, 2, 12, 0, 0x2a2a34], ['l', 4, 12, 4, -2, 12, 0, 0x2a2a34], ['b', 8, 12, 4, 0, 18, 0, 0x5a5a6a], ['b', 12, 4, 4, 0, 22, 3, 0x6a6a7a],
      ['b', 8, 2, 2, 0, 22, 6, 0x6a4a2a], ['h', 8, 10, 8, 0, 29, 0, 0x8a8a8a], ['h', 2, 1, 0.4, 2, 29, 4.1, 0x2a2a2a], ['h', 2, 1, 0.4, -2, 29, 4.1, 0x2a2a2a], ['h', 2, 4, 2, 0, 27, 5, 0x7a7a7a]] }
];
// Smaller slimes created when a bigger one dies.
(function () {
  const big = MOB_SPECIES.find(function (s) { return s.key === 'slime'; });
  MOB_SPECIES.push(Object.assign({}, big, { key: 'slime_medium', name: 'Slime', scale: 0.5, r: 0.26, h: 0.52, hp: 4, attack: 2, split: 'slime_small', weight: 0, hidden: true }));
  MOB_SPECIES.push(Object.assign({}, big, { key: 'slime_small', name: 'Slime', scale: 0.25, r: 0.13, h: 0.26, hp: 1, attack: 0, split: null, weight: 0, hidden: true, drops: [D('slime_ball', 0, 2)] }));
})();
// ---------- version 4: the rest of Minecraft's mobs ----------
// Many reuse an existing body with new colours (cat from ocelot, stray from skeleton...).
(function () {
  const find = function (k) { return SPECIES.concat(MOB_SPECIES).find(function (s) { return s.key === k; }); };
  const recolor = function (parts, map, extra) {
    return parts.map(function (p) { const q = p.slice(); if (map[q[7]] !== undefined) q[7] = map[q[7]]; else if (map['*'] !== undefined && p[0] !== 'h') q[7] = map['*']; return q; }).concat(extra || []);
  };
  const like = function (base, over, map, extra) { const b = find(base); return Object.assign({}, b, { weight: 0, biome: -1, where: 'none' }, over, { parts: recolor(b.parts, map || {}, extra) }); };
  const ILLAGER = function (robe, sleeves, skin, extra) {
    return [['l', 4, 12, 4, 2, 12, 0, robe], ['l', 4, 12, 4, -2, 12, 0, robe], ['b', 8, 12, 6, 0, 18, 0, robe], ['b', 12, 4, 4, 0, 22, 3, sleeves],
      ['h', 8, 10, 8, 0, 29, 0, skin], ['h', 2, 1, 0.4, 2, 29, 4.1, 0x2a2a2a], ['h', 2, 1, 0.4, -2, 29, 4.1, 0x2a2a2a], ['h', 2, 4, 2, 0, 27, 5, skin]].concat(extra || []);
  };
  const VILLAGER = ILLAGER(0x7a5a3a, 0x6a4a2a, 0xc89a78, [['b', 8.4, 6, 6.4, 0, 21, 0, 0x5a3a20]]);
  const NONE = -1;

  // ----- passive and neutral -----
  const passive = [
    { key: 'villager', name: 'Villager', biome: NONE, move: 'walk', speed: 0.9, weight: 0, r: 0.3, h: 1.95, hp: 20, xp: 0, villager: true, drops: [], sound: 'villager',
      desc: 'Lives in villages, farms and runs home when the bell rings.', parts: VILLAGER },
    { key: 'wandering_trader', name: 'Wandering Trader', biome: NONE, move: 'walk', speed: 0.9, weight: 0, r: 0.3, h: 1.95, hp: 20, xp: 0, villager: true, drops: [], sound: 'villager',
      desc: 'A travelling merchant in a blue robe.', parts: ILLAGER(0x2a4a9a, 0x1a3a7a, 0xc89a78) },
    { key: 'iron_golem', name: 'Iron Golem', biome: NONE, move: 'walk', speed: 0.9, weight: 0, r: 0.7, h: 2.7, hp: 100, xp: 0, hostile: 'neutral', attack: 15, guard: true, knockResist: true, drops: [D('iron_ingot', 3, 5), D('poppy', 0, 2)], sound: 'golem',
      desc: 'Guards villages and attacks monsters. Hits very hard and throws its target into the air.',
      parts: [['l', 6, 11, 5, 4, 11, 0, 0xc8c2b8], ['l', 6, 11, 5, -4, 11, 0, 0xc8c2b8], ['b', 9, 5, 6, 0, 13, 0, 0xb8b2a8], ['b', 18, 12, 11, 0, 23, 0, 0xd2ccc2],
        ['b', 2, 6, 1, 3, 24, 5.6, 0x6a9a3a], ['l', 4, 30, 6, 11, 29, 0, 0xc8c2b8, Math.PI], ['l', 4, 30, 6, -11, 29, 0, 0xc8c2b8, 0],
        ['h', 8, 10, 8, 0, 34, 2, 0xd2ccc2], ['h', 2, 4, 2, 0, 32, 6.5, 0xb8b2a8], ['h', 2, 1, 0.4, 2, 35, 6.1, 0x7a2020], ['h', 2, 1, 0.4, -2, 35, 6.1, 0x7a2020]] },
    { key: 'snow_golem', name: 'Snow Golem', biome: NONE, move: 'walk', speed: 0.9, weight: 0, r: 0.35, h: 1.9, hp: 4, xp: 0, guard: true, ranged: 'snowball', drops: [D('snowball', 0, 15)], sound: 'hiss_small',
      desc: 'Throws snowballs at monsters. Melts in the desert.',
      parts: [['b', 12, 12, 12, 0, 6, 0, 0xf4f8fc], ['b', 10, 10, 10, 0, 17, 0, 0xf4f8fc], ['b', 12, 1, 1, 7, 18, 0, 0x6a4a2a], ['b', 12, 1, 1, -7, 18, 0, 0x6a4a2a],
        ['h', 8, 8, 8, 0, 26, 0, 0xe8901e], ['h', 6, 2, 0.4, 0, 25, 4.1, 0x5a3a10], ['h', 2, 2, 0.4, 2, 28, 4.1, 0x5a3a10], ['h', 2, 2, 0.4, -2, 28, 4.1, 0x5a3a10]] },
    like('ocelot', { key: 'cat', name: 'Cat', biome: NONE, shy: false, sound: 'meow', drops: [D('string', 0, 2)], desc: 'A village cat. Scares away creepers and phantoms.' }, { '*': 0x8a8070 }),
    { key: 'polar_bear', name: 'Polar Bear', biome: NONE, move: 'walk', speed: 1.3, weight: 0, r: 0.7, h: 1.4, hp: 30, xp: 3, hostile: 'neutral', attack: 6, drops: [D('cod', 0, 2), D('salmon', 0, 2)], sound: 'roar',
      desc: 'From the snowy north. Neutral, but defends itself hard.',
      parts: [['b', 14, 14, 24, 0, 16, 0, 0xf2f0e8], ['h', 7, 7, 7, 0, 18, 15, 0xf2f0e8], ['h', 3, 3, 3, 0, 16, 19.5, 0xe0dcd0], ['h', 1, 1, 0.5, 0, 17.5, 21, 0x111111]].concat(LEGS4(5, 10, 4, 10, 8, 0xe8e6de)) },
    { key: 'bat', name: 'Bat', biome: NONE, move: 'fly', speed: 3, weight: 0, r: 0.25, h: 0.9, alt: 1, hp: 6, xp: 0, drops: [], sound: 'squeak', desc: 'Flutters around caves in the dark.',
      parts: [['b', 3, 5, 2, 0, 0, 0, 0x4a3a2a], ['h', 4, 4, 3, 0, 4, 0, 0x4a3a2a], ['w', 8, 6, 0.5, 1.5, 3, 0, 0x2a2018], ['w', 8, 6, 0.5, -1.5, 3, 0, 0x2a2018]] },
    like('donkey', { key: 'mule', name: 'Mule', desc: 'A donkey crossed with a horse.', drops: [D('leather', 0, 2)] }, { '*': 0x4a2a14 }),
    like('horse', { key: 'skeleton_horse', name: 'Skeleton Horse', undead: true, desc: 'Appears in thunderstorms. Swims underwater.', drops: [D('bone', 0, 2)] }, { '*': 0xd8d4c8 }),
    like('horse', { key: 'zombie_horse', name: 'Zombie Horse', undead: true, desc: 'A rare undead horse.', drops: [D('rotten_flesh', 0, 2)] }, { '*': 0x5a7a4a }),
    like('llama', { key: 'trader_llama', name: 'Trader Llama', desc: 'Follows wandering traders, wearing a blue rug.' }, {}, [['b', 13, 4, 19, 0, 22, 0, 0x2a5ab0]]),
    { key: 'tadpole', name: 'Tadpole', biome: OCEAN, move: 'swim', speed: 1.4, weight: 1, r: 0.2, h: 0.3, minDepth: 1, maxDepth: 3, hp: 6, xp: 0, drops: [], school: true,
      desc: 'Baby frogs. Grow up after a while.', parts: [['b', 3, 2, 3, 0, 0, 0, 0x4a3a2a], ['t', 1, 2, 4, 0, 0, -3.5, 0x6a5a40]] },
    { key: 'allay', name: 'Allay', biome: NONE, move: 'fly', speed: 2.5, weight: 0, r: 0.25, h: 0.6, alt: 2, hp: 20, xp: 0, drops: [], sound: 'chirp', glow: false,
      desc: 'A little blue spirit found caged at pillager outposts.',
      parts: [['b', 3, 5, 2, 0, 0, 0, 0x5ad8f0], ['h', 5, 5, 5, 0, 5, 0, 0x7ae8ff], ['h', 1, 1, 0.4, 1, 5.5, 2.6, 0x1a2a4a], ['h', 1, 1, 0.4, -1, 5.5, 2.6, 0x1a2a4a],
        ['w', 6, 5, 0.4, 1, 2, -1, 0xcff8ff], ['w', 6, 5, 0.4, -1, 2, -1, 0xcff8ff]] },
    { key: 'strider', name: 'Strider', biome: NONE, move: 'walk', speed: 1, weight: 0, r: 0.45, h: 1.7, hp: 20, xp: 1, drops: [D('string', 2, 5)], sound: 'squish',
      desc: 'A Nether creature that walks on lava.', parts: [['b', 16, 14, 16, 0, 19, 0, 0xa83a3a], ['b', 1, 6, 16, 8.5, 26, 0, 0x6a2020], ['b', 1, 6, 16, -8.5, 26, 0, 0x6a2020],
        ['h', 2, 1, 0.4, 3, 22, 8.1, 0x111111], ['h', 2, 1, 0.4, -3, 22, 8.1, 0x111111], ['l', 4, 12, 4, 4, 12, 0, 0x7a2a2a], ['l', 4, 12, 4, -4, 12, 0, 0x7a2a2a]] },
    { key: 'piglin', name: 'Piglin', biome: NONE, move: 'walk', speed: 1.4, weight: 0, r: 0.3, h: 1.95, hp: 16, xp: 5, hostile: 'neutral', attack: 5, drops: [D('gold_nugget', 0, 2)], sound: 'oink',
      desc: 'A Nether trader. Attacks anyone not wearing gold.', parts: HUMANOID(0xe8a090, 0x7a5030, 0x5a3a20, [['h', 4, 3, 2, 0, 27, 5, 0xd88878], ['h', 1, 3, 2, 5, 30, 0, 0xe8a090], ['h', 1, 3, 2, -5, 30, 0, 0xe8a090]]) },
    { key: 'zombified_piglin', name: 'Zombified Piglin', biome: NONE, move: 'walk', speed: 1.4, weight: 0, r: 0.3, h: 1.95, hp: 20, xp: 5, hostile: 'neutral', attack: 8, undead: true, group: true,
      drops: [D('rotten_flesh', 0, 1), D('gold_nugget', 0, 1), D('gold_ingot', 1, 1, 0.025)], sound: 'groan',
      desc: 'Neutral, but if you hit one, every one nearby comes for you.', parts: HUMANOID(0xd8909a, 0x6a8a5a, 0x4a5a3a, [['h', 4, 3, 2, 0, 27, 5, 0xc88088]]) }
  ];
  passive.forEach(function (sp) { SPECIES.push(sp); });

  // ----- hostile -----
  const ZOMBIE = find('zombie'), SKEL = find('skeleton'), PILL = find('pillager'), SLIME = find('slime');
  const hostile = [
    Object.assign({}, ZOMBIE, { key: 'zombie_villager', name: 'Zombie Villager', weight: 4, where: 'land', parts: ILLAGER(0x4a6a3a, 0x3a5a2a, 0x5d8a4a), desc: 'A villager that was bitten by a zombie.' }),
    Object.assign({}, SKEL, { key: 'stray', name: 'Stray', weight: 0, where: 'none', strayArrow: true, parts: recolor(SKEL.parts, { '*': 0xb8c8c8 }), desc: 'A frosty skeleton from cold places. Its arrows slow you.' }),
    Object.assign({}, SKEL, { key: 'bogged', name: 'Bogged', weight: 0, where: 'none', poisonArrow: true, hp: 16, parts: recolor(SKEL.parts, { '*': 0x8a9a5a }), desc: 'A mossy skeleton from swamps. Its arrows poison you.' }),
    Object.assign({}, SKEL, { key: 'wither_skeleton', name: 'Wither Skeleton', weight: 0, where: 'none', ranged: null, attack: 8, scale: 1.2, h: 2.4, witherHit: true, burnsDay: false,
      drops: [D('coal', 0, 1), D('bone', 0, 2), D('wither_skeleton_skull', 1, 1, 0.025)], parts: recolor(SKEL.parts, { '*': 0x2a2a2a }), desc: 'A tall black skeleton with a stone sword. Its hits wither you.' }),
    { key: 'blaze', name: 'Blaze', move: 'fly', speed: 1.4, r: 0.3, h: 1.8, alt: 3, hp: 20, xp: 10, hostile: 'always', ranged: 'blaze', fireproof: true, weight: 0, where: 'none', sound: 'blaze', glow: true,
      drops: [D('blaze_rod', 0, 1)], desc: 'Floats in fortresses and shoots bursts of three fireballs.',
      parts: [['h', 8, 8, 8, 0, 4, 0, 0xf0c030], ['h', 2, 1, 0.4, 2, 5, 4.1, 0x5a2a00], ['h', 2, 1, 0.4, -2, 5, 4.1, 0x5a2a00],
        ['b', 2, 8, 2, 5, -6, 5, 0xe8a020], ['b', 2, 8, 2, -5, -6, 5, 0xe8a020], ['b', 2, 8, 2, 5, -6, -5, 0xe8a020], ['b', 2, 8, 2, -5, -6, -5, 0xe8a020],
        ['b', 2, 8, 2, 3, -14, 0, 0xd08010], ['b', 2, 8, 2, -3, -14, 0, 0xd08010], ['b', 2, 8, 2, 0, -14, 3, 0xd08010]] },
    { key: 'ghast', name: 'Ghast', move: 'fly', speed: 1.2, r: 2, h: 4, alt: 10, hp: 10, xp: 5, hostile: 'always', ranged: 'fireball', fireproof: true, weight: 0, where: 'none', sound: 'ghast', range: 64,
      drops: [D('ghast_tear', 0, 1), D('gunpowder', 0, 2)], desc: 'A huge floating jellyfish that spits exploding fireballs. Hit them back!',
      parts: [['h', 64, 64, 64, 0, 0, 0, 0xf0f0f0], ['h', 8, 4, 0.5, 14, 6, 32.1, 0x4a4a4a], ['h', 8, 4, 0.5, -14, 6, 32.1, 0x4a4a4a], ['h', 10, 4, 0.5, 0, -10, 32.1, 0x4a4a4a],
        ['j', 4, 30, 4, 20, -32, 20, 0xe8e8e8], ['j', 4, 36, 4, -20, -32, 20, 0xe8e8e8], ['j', 4, 26, 4, 0, -32, 0, 0xe8e8e8], ['j', 4, 34, 4, 20, -32, -20, 0xe8e8e8], ['j', 4, 28, 4, -20, -32, -20, 0xe8e8e8]] },
    Object.assign({}, SLIME, { key: 'magma_cube', name: 'Magma Cube', weight: 0, where: 'none', fireproof: true, attack: 6, split: 'magma_medium', drops: [D('magma_cream', 0, 1)],
      parts: recolor(SLIME.parts, { 0x6cc85a: 0x5a1a10, 0x48a03a: 0xf08020 }), desc: 'A Nether slime made of magma. Splits like a slime.' }),
    { key: 'hoglin', name: 'Hoglin', move: 'walk', speed: 1.2, r: 0.7, h: 1.4, hp: 40, xp: 5, hostile: 'always', attack: 6, flings: true, weight: 0, where: 'none', sound: 'roar', drops: [D('porkchop', 2, 4), D('leather', 0, 1)],
      desc: 'A huge Nether boar that flings you into the air.',
      parts: [['b', 16, 14, 19, 0, 20, 0, 0xb87a5a], ['b', 2, 6, 14, 0, 30, 0, 0xe8d8a0], ['h', 14, 6, 16, 0, 18, 15, 0xb87a5a], ['h', 2, 6, 2, 6, 22, 22, 0xf0e8d0], ['h', 2, 6, 2, -6, 22, 22, 0xf0e8d0]].concat(LEGS4(5, 13, 5, 13, 6, 0xa86a4a)) },
    { key: 'piglin_brute', name: 'Piglin Brute', move: 'walk', speed: 1.5, r: 0.3, h: 1.95, hp: 50, xp: 20, hostile: 'always', attack: 13, weight: 0, where: 'none', sound: 'oink', drops: [D('golden_axe', 1, 1, 0.085)],
      desc: 'Guards bastions with a golden axe. Always hostile.', parts: HUMANOID(0xe8a090, 0x2a2a2a, 0x3a3a3a, [['h', 4, 3, 2, 0, 27, 5, 0xd88878], ['b', 8.4, 3, 4.4, 0, 21, 0, 0xf0c030]]) },
    { key: 'silverfish', name: 'Silverfish', move: 'walk', speed: 1.4, r: 0.2, h: 0.3, hp: 8, xp: 5, hostile: 'always', attack: 1, weight: 0, where: 'none', sound: 'hiss_small', drops: [],
      desc: 'A tiny bug that hides in stone and calls its friends.', parts: [['b', 4, 3, 3, 0, 1.5, 3, 0x8a8a8a], ['b', 6, 4, 4, 0, 2, 0, 0x9a9a9a], ['b', 4, 3, 3, 0, 1.5, -3, 0x8a8a8a], ['b', 2, 2, 2, 0, 1, -5.5, 0x7a7a7a], ['h', 3, 2, 2, 0, 1, 5.5, 0x7a7a7a]] },
    { key: 'endermite', name: 'Endermite', move: 'walk', speed: 1.4, r: 0.2, h: 0.3, hp: 8, xp: 3, hostile: 'always', attack: 2, weight: 0, where: 'none', sound: 'hiss_small', drops: [],
      desc: 'Sometimes appears when an ender pearl lands.', parts: [['b', 4, 3, 3, 0, 1.5, 2, 0x2a1a3a], ['b', 6, 4, 4, 0, 2, 0, 0x3a2a4a], ['b', 2, 2, 2, 0, 1, -3, 0x2a1a3a], ['h', 3, 2, 2, 0, 1, 4, 0x2a1a3a]] },
    { key: 'guardian', name: 'Guardian', move: 'swim', speed: 1.6, r: 0.45, h: 0.85, minDepth: 3, hp: 30, xp: 10, hostile: 'always', ranged: 'beam', attack: 6, weight: 0, where: 'none', sound: 'guardian',
      drops: [D('prismarine_shard', 0, 2), D('cod', 0, 1), D('prismarine_crystals', 0, 1, 0.4)], desc: 'Guards ocean monuments. Charges a laser at you.',
      parts: [['b', 12, 12, 16, 0, 0, 0, 0x5a9a8a], ['h', 2, 2, 0.5, 0, 1, 8.2, 0xf0f0e0], ['h', 1, 1, 0.5, 0, 1, 8.5, 0x7a3a1a], ['t', 4, 4, 10, 0, 0, -12, 0x4a8a7a],
        ['b', 1, 6, 1, 6.5, 4, 4, 0xd88a3a], ['b', 1, 6, 1, -6.5, 4, -4, 0xd88a3a], ['b', 1, 1, 6, 0, 7, -4, 0xd88a3a], ['b', 1, 1, 6, 0, -7, 4, 0xd88a3a]] },
    Object.assign({}, PILL, { key: 'vindicator', name: 'Vindicator', ranged: null, attack: 13, weight: 0, where: 'none', sound: 'illager', drops: [D('emerald', 0, 1), D('iron_axe', 1, 1, 0.085)],
      parts: ILLAGER(0x3a3a4a, 0x2a2a3a, 0x8a8a8a), desc: 'An axe-wielding illager from woodland mansions.' }),
    Object.assign({}, PILL, { key: 'evoker', name: 'Evoker', ranged: 'fangs', summons: 'vex', hp: 24, xp: 10, weight: 0, where: 'none', sound: 'illager', drops: [D('totem_of_undying', 1, 1), D('emerald', 0, 1)],
      parts: ILLAGER(0x2a2a2a, 0x8a1a1a, 0x8a8a8a, [['b', 8.4, 4, 6.4, 0, 14, 0, 0xc8a030]]), desc: 'Summons vexes and rows of snapping fangs. Drops a totem of undying.' }),
    { key: 'vex', name: 'Vex', move: 'fly', speed: 4, r: 0.2, h: 0.8, alt: 2, hp: 14, xp: 3, hostile: 'always', attack: 9, noclip: true, weight: 0, where: 'none', sound: 'screech', drops: [],
      desc: 'A small winged spirit an evoker summons. Flies through walls.',
      parts: [['b', 4, 5, 2, 0, 0, 0, 0xb8c8d8], ['h', 4, 4, 4, 0, 4, 0, 0xc8d8e8], ['w', 6, 5, 0.4, 1, 2, -1, 0xe8f0ff], ['w', 6, 5, 0.4, -1, 2, -1, 0xe8f0ff], ['b', 1, 4, 1, 2.5, 0, 1, 0x9a9a9a]] },
    Object.assign({}, PILL, { key: 'illusioner', name: 'Illusioner', ranged: 'bow', weight: 0, where: 'none', sound: 'illager', teleports: true, drops: [],
      parts: ILLAGER(0x2a3a8a, 0x1a2a6a, 0x8a8a8a), desc: 'An illager archer that blinks around and blinds you.' }),
    { key: 'ravager', name: 'Ravager', move: 'walk', speed: 1.2, r: 1, h: 2.2, hp: 100, xp: 20, hostile: 'always', attack: 12, flings: true, knockResist: true, weight: 0, where: 'none', sound: 'roar', drops: [D('saddle', 1, 1)],
      desc: 'A huge beast that leads raids, roars and tramples leaves.',
      parts: [['b', 14, 16, 20, 0, 26, 0, 0x5a5a56], ['b', 16, 8, 22, 0, 20, 0, 0x4a4a46], ['h', 16, 20, 16, 0, 28, 16, 0x5a5a56], ['h', 12, 6, 6, 0, 18, 24, 0x3a3a36],
        ['h', 3, 10, 3, 9, 34, 16, 0x2a2a26], ['h', 3, 10, 3, -9, 34, 16, 0x2a2a26]].concat(LEGS4(8, 16, 6, 16, 8, 0x4a4a46)) },
    { key: 'shulker', name: 'Shulker', move: 'walk', speed: 0, r: 0.5, h: 1, hp: 30, xp: 5, hostile: 'always', ranged: 'bullet', knockResist: true, weight: 0, where: 'none', sound: 'click', drops: [D('shulker_shell', 0, 1, 0.5)],
      desc: 'Hides in its purple shell in End cities and shoots homing bullets that make you float.',
      parts: [['b', 16, 8, 16, 0, 4, 0, 0x8a5a8a], ['b', 16, 4, 16, 0, 10, 0, 0x9a6a9a], ['h', 6, 6, 6, 0, 8, 0, 0xe8e0a0]] },
    { key: 'breeze', name: 'Breeze', move: 'hop', speed: 2, r: 0.3, h: 1.77, hp: 30, xp: 10, hostile: 'always', ranged: 'wind', weight: 0, where: 'none', sound: 'hiss_small', drops: [D('breeze_rod', 1, 2)],
      desc: 'A whirlwind from trial chambers. Its wind charges knock you back.',
      parts: [['h', 8, 8, 8, 0, 22, 0, 0xc8d8f0], ['h', 2, 1, 0.4, 2, 23, 4.1, 0x2a3a6a], ['h', 2, 1, 0.4, -2, 23, 4.1, 0x2a3a6a], ['b', 2, 6, 2, 0, 14, 0, 0xa8b8e0],
        ['b', 10, 2, 10, 0, 10, 0, 0xb8c8f0], ['b', 7, 2, 7, 0, 6, 0, 0xb8c8f0], ['b', 4, 2, 4, 0, 2, 0, 0xb8c8f0]] },
    { key: 'warden', name: 'Warden', move: 'walk', speed: 1.1, r: 0.45, h: 2.9, hp: 500, xp: 5, hostile: 'always', attack: 30, ranged: 'sonic', knockResist: true, deep: true, weight: 1, where: 'cave', sound: 'warden',
      drops: [D('sculk_catalyst', 1, 1)], desc: 'Lurks in the deep dark. Blind, but hears everything. Its sonic boom goes through armour. Run!',
      parts: [['l', 6, 13, 6, 4, 13, 0, 0x0e3a44], ['l', 6, 13, 6, -4, 13, 0, 0x0e3a44], ['b', 18, 21, 11, 0, 23.5, 0, 0x123e4a], ['b', 6, 6, 1, 0, 26, 5.6, 0x38c8c8],
        ['l', 8, 28, 8, 13, 33, 0, 0x0e3a44, Math.PI], ['l', 8, 28, 8, -13, 33, 0, 0x0e3a44, 0], ['h', 16, 16, 10, 0, 42, 0, 0x123e4a], ['h', 2, 6, 6, 9, 46, 0, 0x38c8c8], ['h', 2, 6, 6, -9, 46, 0, 0x38c8c8]] },
    { key: 'creaking', name: 'Creaking', move: 'walk', speed: 1.8, r: 0.45, h: 2.7, hp: 1, xp: 0, hostile: 'always', attack: 3, freezesWatched: true, weight: 0, where: 'none', sound: 'rattle', drops: [],
      desc: 'A tree creature from the pale garden. It can only move while nobody is looking at it.',
      parts: [['l', 3, 18, 3, 3, 18, 0, 0x5a504a], ['l', 3, 18, 3, -3, 18, 0, 0x5a504a], ['b', 8, 14, 4, 0, 25, 0, 0x6a605a], ['l', 3, 20, 3, 6, 31, 0, 0x5a504a, Math.PI], ['l', 3, 20, 3, -6, 31, 0, 0x5a504a, 0],
        ['h', 6, 10, 6, 0, 37, 0, 0x6a605a], ['h', 2, 1, 0.4, 1.5, 38, 3.1, 0xf08020], ['h', 2, 1, 0.4, -1.5, 38, 3.1, 0xf08020]] },
    // ----- bosses (spawn egg or /summon only) -----
    { key: 'wither', name: 'Wither', move: 'fly', speed: 1.6, r: 0.9, h: 3.5, alt: 6, hp: 300, xp: 50, hostile: 'always', ranged: 'wither', boss: true, undead: true, fireproof: true, knockResist: true, weight: 0, where: 'none', sound: 'ghast', range: 40,
      drops: [D('nether_star', 1, 1)], desc: 'A three-headed boss that fires exploding wither skulls. Drops a nether star.',
      parts: [['b', 20, 3, 3, 0, 22, 0, 0x2a2a2a], ['b', 3, 10, 3, 0, 14, 0, 0x2a2a2a], ['b', 11, 2, 2, 0, 16, 0, 0x2a2a2a], ['b', 11, 2, 2, 0, 12, 0, 0x2a2a2a], ['b', 3, 6, 3, 0, 6, -1, 0x2a2a2a],
        ['h', 8, 8, 8, 0, 28, 0, 0x1a1a1a], ['h', 2, 1, 0.4, 2, 29, 4.1, 0xd8d8f0], ['h', 2, 1, 0.4, -2, 29, 4.1, 0xd8d8f0], ['b', 6, 6, 6, 10, 26, 0, 0x1a1a1a], ['b', 6, 6, 6, -10, 26, 0, 0x1a1a1a]] },
    { key: 'ender_dragon', name: 'Ender Dragon', move: 'fly', speed: 8, r: 3, h: 3, alt: 20, hp: 200, xp: 500, hostile: 'always', attack: 10, swoops: true, boss: true, fireproof: true, knockResist: true, weight: 0, where: 'none', sound: 'dragon', scale: 2,
      drops: [], desc: 'The boss of the End. Swoops down to strike.',
      parts: [['b', 24, 24, 64, 0, 0, 0, 0x1a1a1e], ['b', 2, 4, 50, 0, 14, 0, 0x3a3a3e], ['t', 10, 10, 60, 0, 0, -62, 0x1a1a1e], ['b', 10, 10, 30, 0, 4, 46, 0x1a1a1e],
        ['h', 16, 16, 16, 0, 6, 68, 0x1a1a1e], ['h', 12, 5, 16, 0, 2, 80, 0x1a1a1e], ['h', 3, 2, 0.5, 5, 10, 76.3, 0xd060e0], ['h', 3, 2, 0.5, -5, 10, 76.3, 0xd060e0],
        ['w', 70, 2, 40, 12, 8, 10, 0x2a2a2e], ['w', 70, 2, 40, -12, 8, 10, 0x2a2a2e]].concat(LEGS4(8, 24, 10, -8, 20, 0x1a1a1e)) }
  ];
  hostile.forEach(function (sp) { MOB_SPECIES.push(sp); });
  const mc = find('magma_cube');
  MOB_SPECIES.push(Object.assign({}, mc, { key: 'magma_medium', name: 'Magma Cube', scale: 0.5, r: 0.26, h: 0.52, hp: 4, attack: 4, split: 'magma_small', hidden: true }));
  MOB_SPECIES.push(Object.assign({}, mc, { key: 'magma_small', name: 'Magma Cube', scale: 0.25, r: 0.13, h: 0.26, hp: 1, attack: 3, split: null, hidden: true }));
  const eg = find('guardian');
  MOB_SPECIES.push(Object.assign({}, eg, { key: 'elder_guardian', name: 'Elder Guardian', hp: 80, attack: 8, scale: 2.35, r: 1, h: 2, xp: 10, drops: [D('sponge', 1, 1), D('prismarine_shard', 0, 2)],
    parts: recolor(eg.parts, { 0x5a9a8a: 0xc8c0b0, 0x4a8a7a: 0xb0a898 }), desc: 'The giant grey guardian of an ocean monument. Gives you Mining Fatigue.' }));
  const hg = find('hoglin');
  MOB_SPECIES.push(Object.assign({}, hg, { key: 'zoglin', name: 'Zoglin', undead: true, drops: [D('rotten_flesh', 1, 3)], parts: recolor(hg.parts, { 0xb87a5a: 0xc87a8a, 0xa86a4a: 0xb86a7a }), desc: 'A zombified hoglin. Attacks everything.' }));
})();

const ALL_SPECIES = SPECIES.concat(MOB_SPECIES);
const SPECIES_BY_KEY = {};
ALL_SPECIES.forEach(function (s) { SPECIES_BY_KEY[s.key] = s; });
function speciesByKey(k) { return SPECIES_BY_KEY[k] || null; }
function isHostileSpecies(sp) { return MOB_SPECIES.indexOf(sp) >= 0; }

// Spawn eggs for every mob, coloured from the mob itself (body colour with head-colour spots).
ALL_SPECIES.forEach(function (sp) {
  if (sp.hidden) return;
  const hex = function (c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; };
  const body = sp.parts[0][7], head = (sp.parts.find(function (p) { return p[0] === 'h' && p[7] !== body; }) || sp.parts[1] || sp.parts[0])[7];
  defItem(sp.key + '_spawn_egg', sp.name + ' Spawn Egg', 'Spawn Eggs', ['spawn_egg', hex(body), hex(head === body ? body * 0.7 | 0 : head)], { use: 'spawn_egg', spawns: sp.key });
});

// The player, seen in third-person views. Armour boxes sit just outside the body.
const PLAYER_SPEC = {
  parts: [['l', 4, 12, 4, 2, 12, 0, 0x3a4f9a], ['l', 4, 12, 4, -2, 12, 0, 0x3a4f9a], ['b', 8, 12, 4, 0, 18, 0, 0x2fa8a0],
    ['l', 4, 12, 4, 6, 24, 0, 0xc8946c, Math.PI], ['l', 4, 12, 4, -6, 24, 0, 0xc8946c, 0],
    ['l', 4.2, 4, 4.2, 6, 24.1, 0, 0x2fa8a0, Math.PI], ['l', 4.2, 4, 4.2, -6, 24.1, 0, 0x2fa8a0, 0],
    ['h', 8, 8, 8, 0, 28, 0, 0xd8a07a], ['h', 8.4, 2.5, 8.4, 0, 31.3, 0, 0x4a2e1c], ['h', 8.4, 6, 1, 0, 28.5, -3.9, 0x4a2e1c],
    ['h', 2, 1, 0.4, 2, 28, 4.1, 0xffffff], ['h', 2, 1, 0.4, -2, 28, 4.1, 0xffffff], ['h', 1, 1, 0.5, 2.5, 28, 4.2, 0x2a3a8a], ['h', 1, 1, 0.5, -1.5, 28, 4.2, 0x2a3a8a]],
  scale: 0.9
};

// 67
const geoCache = {}, matCache = {};
function partGeo(w, h, d) {
  const k = w + '|' + h + '|' + d;
  return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(w, h, d));
}
function partMat(c, translucent, glow) {
  const k = c + (translucent ? 't' : '') + (glow ? 'g' : '');
  if (!matCache[k]) {
    matCache[k] = glow ? new THREE.MeshBasicMaterial({ color: c })
      : new THREE.MeshLambertMaterial({ color: c, transparent: !!translucent, opacity: translucent ? 0.72 : 1 });
  }
  return matCache[k];
}
const hurtMatCache = new Map();
function hurtMat(m) {
  if (!hurtMatCache.has(m)) hurtMatCache.set(m, new THREE.MeshLambertMaterial({ color: m.color.clone().lerp(new THREE.Color(0xff2020), 0.65), transparent: m.transparent, opacity: m.opacity }));
  return hurtMatCache.get(m);
}

// A tamed wolf from the wolf shot wears a red collar, and wolf armour until it breaks.
function dressWolf(model, armored) {
  if (!model.wolfBits) {
    const collar = new THREE.Mesh(partGeo(9.6, 2.4, 1.6), partMat(0xb02e26));
    collar.position.set(0, 12.2, 7.4); model.body.add(collar);
    const plate = new THREE.Mesh(partGeo(9, 8.4, 15), partMat(0x9a7656));
    plate.position.set(0, 11.2, 0); model.body.add(plate);
    const mane = new THREE.Mesh(partGeo(10, 9, 6.6), partMat(0x86664a));
    mane.position.set(0, 12, 4); model.body.add(mane);
    model.wolfBits = { armor: [plate, mane] };
  }
  model.wolfBits.armor.forEach(function (m) { m.visible = !!armored; });
}

function buildModel(spec) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  body.scale.setScalar((spec.scale || 1) / 16);
  const rig = { legs: [], wings: [], tails: [], head: null, meshes: [] };
  for (const p of spec.parts) {
    const t = p[0], w = p[1], h = p[2], d = p[3], x = p[4], y = p[5], z = p[6];
    const mesh = new THREE.Mesh(partGeo(w, h, d), partMat(p[7], spec.translucent, spec.glow));
    rig.meshes.push(mesh);
    if (t === 'b') { mesh.position.set(x, y, z); body.add(mesh); continue; }
    if (t === 'h') {
      if (!rig.head) { rig.head = new THREE.Group(); rig.head.position.set(x, y - h / 2, z); body.add(rig.head); }
      mesh.position.set(x - rig.head.position.x, y - rig.head.position.y, z - rig.head.position.z);
      rig.head.add(mesh);
      continue;
    }
    const pivot = new THREE.Group();
    body.add(pivot);
    pivot.add(mesh);
    if (t === 'l' || t === 'j') {
      pivot.position.set(x, y, z);
      mesh.position.y = -h / 2;
      rig.legs.push({ p: pivot, j: t === 'j', phase: p[8] !== undefined ? p[8] : ((x > 0) !== (z > 0) ? 0 : Math.PI) });
    } else if (t === 'w') {
      const s = x >= 0 ? 1 : -1;
      pivot.position.set(x, y, z);
      mesh.position.set(s * w / 2, -h / 2, 0);
      rig.wings.push({ p: pivot, s: s, phase: z * 0.7 });
    } else if (t === 't') {
      pivot.position.set(x, y, z + d / 2);
      mesh.position.z = -d / 2;
      rig.tails.push(pivot);
    }
  }
  return { root: root, body: body, rig: rig };
}

// 67