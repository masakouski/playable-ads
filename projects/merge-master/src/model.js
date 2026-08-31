/**
 * model.js — pure game logic, no rendering.
 *
 * Port of assets/scripts/{data,model,core/Emitter}.ts. Nothing in here touches
 * the DOM or the scene graph, so the merge rules, footprints and synergies can
 * be reasoned about (and tested) on their own.
 */
(function (global) {
  'use strict';

  var USER = global.PLAYABLE_CONFIG || {};

  /** Every tunable number for the playable. Overridable from config.js. */
  var CFG = {
    grid: USER.grid || { cols: 4, rows: 4, cell: 132 },
    lockedCells: (USER.lockedCells || ['3,0', '3,3']).slice(),
    economy: USER.economy || { startCoins: 42, rerollCost: 19, buySlotCost: 19, shopSlots: 3 },
    merge: USER.merge || { statMul: 2.1, maxTier: 3 },
    battle: USER.battle || { enemyAtk: 34, enemyCd: 1.6, playerHp: 700, maxSeconds: 14, speed: 1 },
    tutorial: USER.tutorial || { nudgeAfter: 2.2, autoPlayAfter: 7.5 },
    chapter: USER.chapter === undefined ? 2 : USER.chapter,
    startTrophies: USER.startTrophies === undefined ? 421 : USER.startTrophies,
  };

  function key(c, r) { return c + ',' + r; }

  /* ------------------------------------------------------------- item defs */

  var ITEMS = {
    shuriken: {
      id: 'shuriken', name: 'Shuriken', kind: 'shuriken', w: 1, h: 1,
      atk: 80, crit: 0, cd: 2, rarity: 2, price: 12,
      desc: 'Mid range but quick ranged attack', tag: 'Precise',
      synergy: '+35% ATK per [Shuriken] in zone',
    },
    dagger: {
      id: 'dagger', name: 'Dagger', kind: 'dagger', w: 1, h: 1,
      atk: 45, crit: 0.15, cd: 1.2, rarity: 0, price: 8,
      desc: 'Fast strikes, high crit chance', tag: 'Swift',
    },
    machete: {
      id: 'machete', name: 'Machete', kind: 'machete', w: 2, h: 1,
      atk: 120, crit: 0.05, cd: 2.6, rarity: 0, price: 14,
      desc: 'Heavy chop with a long reach', tag: 'Cleave',
    },
    sword: {
      id: 'sword', name: 'Broadsword', kind: 'sword', w: 2, h: 1,
      atk: 160, crit: 0.1, cd: 2.8, rarity: 1, price: 18,
      desc: 'Balanced blade that hits hard', tag: 'Sharp',
    },
    glove: {
      id: 'glove', name: 'Leather Glove', kind: 'glove', w: 1, h: 1,
      atk: 0, crit: 0.08, cd: 0, rarity: 1, price: 10,
      desc: '+8% crit to adjacent weapons', tag: 'Support',
    },
    charm: {
      id: 'charm', name: 'Lucky Charm', kind: 'star', w: 1, h: 1,
      atk: 0, crit: 0, cd: 0, rarity: 1, price: 16,
      desc: '+10% ATK to every item', tag: 'Charm',
    },
  };

  var TIER_SUFFIX = ['', '', ' II', ' III'];
  function romanTier(tier) {
    return TIER_SUFFIX[Math.min(tier, TIER_SUFFIX.length - 1)] || '';
  }

  /* ------------------------------------------------------------------ item */

  var _uid = 1;

  /** A concrete item living in the backpack or the shop. */
  function ItemInstance(defId, tier) {
    if (!ITEMS[defId]) throw new Error('unknown item def: ' + defId);
    this.uid = _uid++;
    this.defId = defId;
    this.tier = tier === undefined ? 1 : tier;
    this.col = -1;
    this.row = -1;
    /** Bonus attack contributed by synergies; set by GameState.recomputeSynergies. */
    this.bonusAtk = 0;
  }

  Object.defineProperties(ItemInstance.prototype, {
    def: { get: function () { return ITEMS[this.defId]; } },
    w: { get: function () { return this.def.w; } },
    h: { get: function () { return this.def.h; } },
    mul: { get: function () { return Math.pow(CFG.merge.statMul, this.tier - 1); } },
    name: { get: function () { return this.def.name + romanTier(this.tier); } },
    atk: { get: function () { return Math.round(this.def.atk * this.mul); } },
    totalAtk: { get: function () { return this.atk + this.bonusAtk; } },
    crit: { get: function () { return Math.min(0.95, this.def.crit + (this.tier - 1) * 0.05); } },
    cd: {
      get: function () {
        return this.def.cd === 0 ? 0 : Math.max(0.35, this.def.cd - (this.tier - 1) * 0.15);
      },
    },
    rarity: { get: function () { return Math.min(3, this.def.rarity + (this.tier - 1)); } },
    isWeapon: { get: function () { return this.def.cd > 0; } },
    maxTier: { get: function () { return this.tier >= CFG.merge.maxTier; } },
  });

  ItemInstance.prototype.canMergeWith = function (other) {
    return other !== this && other.defId === this.defId && other.tier === this.tier && !this.maxTier;
  };

  ItemInstance.prototype.clone = function () { return new ItemInstance(this.defId, this.tier); };

  /* ------------------------------------------------------------------- grid */

  /**
   * The backpack. Cells are addressed (col, row) with row 0 at the TOP.
   */
  function GridModel(cols, rows, locked) {
    this.cols = cols;
    this.rows = rows;
    this.locked = {};
    this.items = [];
    this.occ = {};   // cell key -> item uid
    (locked || []).forEach(function (k) { this.locked[k] = true; }, this);
  }

  Object.defineProperties(GridModel.prototype, {
    all: { get: function () { return this.items.slice(); } },
    count: { get: function () { return this.items.length; } },
  });

  GridModel.prototype.inBounds = function (c, r, w, h) {
    w = w || 1; h = h || 1;
    return c >= 0 && r >= 0 && c + w <= this.cols && r + h <= this.rows;
  };

  GridModel.prototype.isLocked = function (c, r) { return !!this.locked[key(c, r)]; };

  /** Unlock the next locked cell; returns it, or null when the board is full. */
  GridModel.prototype.unlockNext = function () {
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        if (this.locked[key(c, r)]) {
          delete this.locked[key(c, r)];
          return { col: c, row: r };
        }
      }
    }
    return null;
  };

  GridModel.prototype.itemAt = function (c, r) {
    var uid = this.occ[key(c, r)];
    if (uid === undefined) return null;
    for (var i = 0; i < this.items.length; i++) if (this.items[i].uid === uid) return this.items[i];
    return null;
  };

  /** Distinct items overlapping the given footprint, excluding `ignore`. */
  GridModel.prototype.overlapping = function (c, r, w, h, ignore) {
    var seen = {}, out = [];
    for (var dy = 0; dy < h; dy++) {
      for (var dx = 0; dx < w; dx++) {
        var it = this.itemAt(c + dx, r + dy);
        if (it && it !== ignore && !seen[it.uid]) { seen[it.uid] = true; out.push(it); }
      }
    }
    return out;
  };

  /** True when every cell of the footprint is in-bounds, unlocked and free. */
  GridModel.prototype.canPlace = function (item, c, r, ignoreSelf) {
    if (ignoreSelf === undefined) ignoreSelf = true;
    if (!this.inBounds(c, r, item.w, item.h)) return false;
    for (var dy = 0; dy < item.h; dy++) {
      for (var dx = 0; dx < item.w; dx++) if (this.isLocked(c + dx, r + dy)) return false;
    }
    return this.overlapping(c, r, item.w, item.h, ignoreSelf ? item : undefined).length === 0;
  };

  /**
   * What would happen if `item` were dropped with its top-left at (c, r)?
   * A merge requires exactly one overlapped item, mergeable, same footprint.
   */
  GridModel.prototype.evaluateDrop = function (item, c, r) {
    if (!this.inBounds(c, r, item.w, item.h)) return { kind: 'invalid', col: c, row: r };
    for (var dy = 0; dy < item.h; dy++) {
      for (var dx = 0; dx < item.w; dx++) {
        if (this.isLocked(c + dx, r + dy)) return { kind: 'invalid', col: c, row: r };
      }
    }
    var hits = this.overlapping(c, r, item.w, item.h, item);
    if (hits.length === 0) return { kind: 'place', col: c, row: r };
    if (hits.length === 1) {
      var t = hits[0];
      if (item.canMergeWith(t) && t.w === item.w && t.h === item.h) {
        return { kind: 'merge', col: t.col, row: t.row, target: t };
      }
    }
    return { kind: 'invalid', col: c, row: r };
  };

  GridModel.prototype.place = function (item, c, r) {
    if (!this.canPlace(item, c, r)) return false;
    if (this.items.indexOf(item) >= 0) this.remove(item);
    item.col = c;
    item.row = r;
    this.items.push(item);
    for (var dy = 0; dy < item.h; dy++) {
      for (var dx = 0; dx < item.w; dx++) this.occ[key(c + dx, r + dy)] = item.uid;
    }
    return true;
  };

  GridModel.prototype.remove = function (item) {
    var i = this.items.indexOf(item);
    if (i < 0) return;
    this.items.splice(i, 1);
    for (var dy = 0; dy < item.h; dy++) {
      for (var dx = 0; dx < item.w; dx++) {
        var k = key(item.col + dx, item.row + dy);
        if (this.occ[k] === item.uid) delete this.occ[k];
      }
    }
    item.col = -1;
    item.row = -1;
  };

  /** Merge `src` into `dst`, bumping the tier. Returns the surviving item. */
  GridModel.prototype.merge = function (src, dst) {
    this.remove(src);
    dst.tier += 1;
    return dst;
  };

  /** First top-left position that fits the footprint, scanning rows then cols. */
  GridModel.prototype.firstFit = function (item) {
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) if (this.canPlace(item, c, r)) return { col: c, row: r };
    }
    return null;
  };

  GridModel.prototype.findMergePartner = function (item) {
    for (var i = 0; i < this.items.length; i++) {
      var o = this.items[i];
      if (item.canMergeWith(o) && o.w === item.w && o.h === item.h) return o;
    }
    return null;
  };

  GridModel.prototype.freeCells = function () {
    var out = [];
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        if (!this.isLocked(c, r) && !this.itemAt(c, r)) out.push({ col: c, row: r });
      }
    }
    return out;
  };

  /* --------------------------------------------------------------- emitter */

  function Emitter() { this.map = {}; }
  Emitter.prototype.on = function (evt, fn) { (this.map[evt] || (this.map[evt] = [])).push(fn); };
  Emitter.prototype.off = function (evt, fn) {
    var l = this.map[evt];
    if (!l) return;
    var i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  };
  Emitter.prototype.emit = function (evt, a, b) {
    var l = this.map[evt];
    if (!l) return;
    l = l.slice();
    for (var i = 0; i < l.length; i++) l[i](a, b);
  };

  var EV = {
    COINS: 'coins', SHOP: 'shop', GRID: 'grid', SELECT: 'select',
    MERGE: 'merge', UNLOCK: 'unlock', STATS: 'stats',
  };

  /* ------------------------------------------------------------ game state */

  /** Whole-run state: economy, shop offers, the backpack, and derived stats. */
  function GameState() {
    Emitter.call(this);
    this.grid = new GridModel(CFG.grid.cols, CFG.grid.rows, CFG.lockedCells.slice());
    this.coins = CFG.economy.startCoins;
    this.trophies = CFG.startTrophies;
    this.shields = 1;
    this.hearts = 0;
    this.round = 1;
    this.shop = [];
    this.selected = null;
  }
  GameState.prototype = Object.create(Emitter.prototype);
  GameState.prototype.constructor = GameState;

  GameState.prototype.setCoins = function (v) {
    this.coins = Math.max(0, v);
    this.emit(EV.COINS, this.coins);
  };

  GameState.prototype.spend = function (n) {
    if (this.coins < n) return false;
    this.setCoins(this.coins - n);
    return true;
  };

  GameState.prototype.canAfford = function (n) { return this.coins >= n; };

  GameState.prototype.setShop = function (defIds) {
    this.shop = defIds.map(function (d) { return d ? new ItemInstance(d) : null; });
    this.emit(EV.SHOP, this.shop);
  };

  GameState.prototype.takeFromShop = function (item) {
    var i = this.shop.indexOf(item);
    if (i >= 0) { this.shop[i] = null; this.emit(EV.SHOP, this.shop); }
  };

  GameState.prototype.returnToShop = function (item, slot) {
    if (slot >= 0 && slot < this.shop.length) { this.shop[slot] = item; this.emit(EV.SHOP, this.shop); }
  };

  GameState.prototype.placeOnGrid = function (item, col, row) {
    var ok = this.grid.place(item, col, row);
    if (ok) { this.recomputeSynergies(); this.emit(EV.GRID, this.grid); }
    return ok;
  };

  GameState.prototype.mergeOnGrid = function (src, dst) {
    var survivor = this.grid.merge(src, dst);
    this.recomputeSynergies();
    this.emit(EV.MERGE, survivor);
    this.emit(EV.GRID, this.grid);
    return survivor;
  };

  GameState.prototype.unlockSlot = function () {
    var p = this.grid.unlockNext();
    if (!p) return false;
    this.emit(EV.UNLOCK, p);
    this.emit(EV.GRID, this.grid);
    return true;
  };

  GameState.prototype.select = function (item) {
    this.selected = item;
    this.emit(EV.SELECT, item);
  };

  /**
   * Recomputes bonus attack for everything on the board.
   *  - Shuriken: +35% of its own base ATK for every OTHER shuriken in the bag.
   *  - Lucky Charm: +10% base ATK to every weapon, per charm.
   */
  GameState.prototype.recomputeSynergies = function () {
    var items = this.grid.all;
    var shurikens = items.filter(function (i) { return i.defId === 'shuriken'; });
    var charms = items.filter(function (i) { return i.defId === 'charm'; });
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var bonus = 0;
      if (it.defId === 'shuriken' && shurikens.length > 1) {
        bonus += it.atk * 0.35 * (shurikens.length - 1);
      }
      if (charms.length > 0 && it.isWeapon) {
        bonus += it.atk * 0.1 * charms.length;
      }
      it.bonusAtk = Math.round(bonus);
    }
    this.emit(EV.STATS, this.totalAtk);
  };

  Object.defineProperties(GameState.prototype, {
    totalAtk: {
      get: function () {
        return this.grid.all.reduce(function (a, i) { return a + (i.isWeapon ? i.totalAtk : 0); }, 0);
      },
    },
    weapons: {
      get: function () { return this.grid.all.filter(function (i) { return i.isWeapon; }); },
    },
    shurikenCount: {
      get: function () {
        return this.grid.all.filter(function (i) { return i.defId === 'shuriken'; }).length;
      },
    },
  });

  global.MM = {
    CFG: CFG, key: key, ITEMS: ITEMS, romanTier: romanTier,
    ItemInstance: ItemInstance, GridModel: GridModel, GameState: GameState,
    Emitter: Emitter, EV: EV,
  };
})(window);
