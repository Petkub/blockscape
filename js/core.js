'use strict';
// Shared game state. The browser fills in the rendering/sound hooks; the dedicated server
// fills in network versions of the same hooks. Everything else reads from here.
const GAME = {
  world: null, scene: null, player: null,
  mobs: [], items: [], projectiles: [], tnts: [], strikes: [],
  difficulty: 'normal', dayTime: 0.08, weather: 'clear', weatherTimer: 900,
  rules: { keepInventory: false, doDaylightCycle: true, doMobSpawning: true, naturalRegeneration: true, doTileDrops: true, doWeatherCycle: true },
  server: false,   // true inside the dedicated server
  online: false,   // true in a browser connected to a server (the server simulates the world)
  nextId: 1,
  // Players that mobs can see and hurt. Single player: just you. Server: everyone connected.
  players: function () { return GAME.player ? [GAME.player] : []; },
  playerById: function (id) { return GAME.players().find(function (p) { return p.id === id; }) || null; },
  // Hooks with harmless defaults, replaced by game.js or server.js.
  sound: function () {}, particles: function () {}, shake: function () {}, shockwave: function () {}, chat: function () {}, toast: function () {},
  hurtPlayer: function () { return false; }, applyEffectTo: function () {}, addXpTo: function () {}, teleportPlayer: function () {},
  giveTo: function () { return false; }, pushPlayer: function () {}, dropStack: function () {}, markDirty: function () {}, flush: function () {}, removeBlockState: function () {},
  makeItemMesh: function () { return new THREE.Object3D(); }, makeProjectileMesh: function () { return new THREE.Object3D(); },
  makeBlockEntityMesh: function () { return new THREE.Object3D(); }, flashMat: null, blockEntityMat: null,
  add: function (obj) { if (GAME.scene && obj) GAME.scene.add(obj); },
  remove: function (obj) { if (GAME.scene && obj) GAME.scene.remove(obj); }
};

// 67
// 67
// 67
// 67
// 67
// 67
// 67