/**
 * game.js — drag interaction, the tutorial state machine, and the boot code.
 * Port of assets/scripts/flow/DragController.ts and assets/scripts/GameRoot.ts.
 *
 * The 30-second flow:
 *   1. Drag the shop Shuriken onto the Shuriken already in the bag  -> MERGE payoff
 *   2. Drag the 2x1 Machete into the free row                       -> spatial hook
 *   3. Tap Battle!                                                  -> auto-battle
 *   4. End card                                                     -> CTA
 *
 * A pointing hand loops on every step. If the viewer never touches the screen,
 * autoStep() plays the step for them after CFG.tutorial.autoPlayAfter seconds,
 * so the ad always reaches its end card. Input is gated to the one item each
 * step needs (DragController.gateItemUid).
 *
 * SDK note: Playable.start() fires on the viewer's FIRST REAL INPUT, never from
 * the autoplay fallback — reporting a play nobody had would poison the stats.
 */
(function (global) {
  'use strict';

  var E = global.E, A = global.ART, M = global.MM, V = global.VIEWS, H = global.HUD, B = global.BATTLE;
  var Color = E.Color, col = E.col, Vec3 = E.Vec3, tween = E.tween;
  var C = A.C, mkNode = A.mkNode, mkLabel = A.mkLabel, shake = A.shake;
  var CFG = M.CFG, EV = M.EV;
  var UI = global.PLAYABLE_CONFIG || {};

  /* ------------------------------------------------------- DragController */

  /**
   * Owns the pick-up / drag / drop interaction for both shop items and items
   * already sitting in the backpack.
   */
  function DragController(state, backpack, shop, dragLayer, events) {
    this.state = state;
    this.backpack = backpack;
    this.shop = shop;
    this.dragLayer = dragLayer;
    this.events = events || {};
    this.dragging = null;
    this.bound = {};
    this.origin = null;
    this._locked = false;
    /** When set, only this item may be dragged (tutorial gating). */
    this.gateItemUid = null;

    var self = this;
    this.shop.onGrab = function (slot) { self.grabFromShop(slot); };
    this._onMove = function (e) { self.onMove(e); };
    this._onEnd = function (e) { self.onEnd(e); };
  }

  Object.defineProperties(DragController.prototype, {
    locked: {
      get: function () { return this._locked; },
      set: function (v) { this._locked = v; },
    },
    isDragging: { get: function () { return !!this.dragging; } },
  });

  /** Wire a backpack item so it can be picked up and re-arranged (idempotent). */
  DragController.prototype.bindGridItem = function (view) {
    if (this.bound[view.uid]) return;
    this.bound[view.uid] = true;
    var self = this;
    view.node.on('touchstart', function () { self.grabFromGrid(view); });
  };

  DragController.prototype.canStart = function (uid) {
    if (this._locked || this.dragging) return false;
    if (this.gateItemUid !== null && this.gateItemUid !== uid) return false;
    return true;
  };

  DragController.prototype.grabFromShop = function (slot) {
    var view = slot.view;
    if (!view || !this.canStart(view.uid)) return;
    if (this.events.onAnyInput) this.events.onAnyInput();
    if (!this.state.canAfford(view.item.def.price)) {
      if (this.events.onRejected) this.events.onRejected(view.item, 'coins');
      return;
    }
    var detached = this.shop.detach(slot);
    if (!detached) return;
    this.origin = { kind: 'shop', slot: slot };
    this.startDrag(detached);
  };

  DragController.prototype.grabFromGrid = function (view) {
    if (!this.canStart(view.uid)) return;
    if (this.events.onAnyInput) this.events.onAnyInput();
    var it = view.item;
    this.origin = { kind: 'grid', col: it.col, row: it.row };
    this.state.grid.remove(it);
    this.startDrag(view);
  };

  DragController.prototype.startDrag = function (view) {
    this.dragging = view;
    var world = view.node.getWorldPosition();
    this.dragLayer.addChild(view.node);
    view.node.setScale(1, 1);
    view.node.setWorldPosition(world);
    view.lift(true);
    view.setHighlight('none');
    this.state.select(view.item);
    if (this.events.onPickUp) this.events.onPickUp(view.item);
    this.refreshMergeHints(view.item);

    view.node.on('touchmove', this._onMove);
    view.node.on('touchend', this._onEnd);
    view.node.on('touchcancel', this._onEnd);
  };

  DragController.prototype.onMove = function (e) {
    var view = this.dragging;
    if (!view) return;
    var p = e.getUILocation();
    var local = this.dragLayer.toLocal(p.x, p.y);
    // Lift the item above the finger so it stays visible.
    view.node.setPosition(local.x, local.y + 70);
    this.updateGhost(view);
  };

  DragController.prototype.toBackpackLocal = function (view) {
    var w = view.node.getWorldPosition();
    return this.backpack.node.toLocal(w.x, w.y);
  };

  DragController.prototype.updateGhost = function (view) {
    var local = this.toBackpackLocal(view);
    if (!this.backpack.containsLocal(local.x, local.y)) {
      this.backpack.hideGhost();
      this.clearTargetHighlights();
      return;
    }
    var it = view.item;
    var cell = this.backpack.snapCell(local.x, local.y, it.w, it.h);
    var res = this.state.grid.evaluateDrop(it, cell.col, cell.row);
    this.backpack.showGhost(res.col, res.row, it.w, it.h, res.kind);
    this.clearTargetHighlights();
    if (res.kind === 'merge' && res.target) {
      var tv = this.backpack.viewOf(res.target.uid);
      if (tv) tv.setHighlight('merge');
    }
  };

  DragController.prototype.clearTargetHighlights = function () {
    var self = this;
    this.backpack.forEachView(function (v) {
      if (v !== self.dragging) v.setHighlight('none');
    });
  };

  DragController.prototype.onEnd = function () {
    var view = this.dragging;
    if (!view) return;
    view.node.off('touchmove', this._onMove);
    view.node.off('touchend', this._onEnd);
    view.node.off('touchcancel', this._onEnd);

    var it = view.item;
    var local = this.toBackpackLocal(view);
    this.backpack.hideGhost();
    this.clearTargetHighlights();
    this.clearMergeHints();

    var handled = false;
    if (this.backpack.containsLocal(local.x, local.y)) {
      var cell = this.backpack.snapCell(local.x, local.y, it.w, it.h);
      var res = this.state.grid.evaluateDrop(it, cell.col, cell.row);
      if (res.kind === 'place') handled = this.commitPlace(view, res.col, res.row);
      else if (res.kind === 'merge' && res.target) handled = this.commitMerge(view, res.target);
    }

    if (!handled) {
      this.revert(view);
      if (this.events.onRejected) this.events.onRejected(it, 'space');
    }
    this.dragging = null;
    this.origin = null;
  };

  DragController.prototype.commitPlace = function (view, colIdx, row) {
    var it = view.item;
    var bought = this.origin && this.origin.kind === 'shop';
    if (bought && !this.state.spend(it.def.price)) return false;
    if (!this.state.placeOnGrid(it, colIdx, row)) return false;
    if (bought) this.state.takeFromShop(it);

    this.backpack.itemsParent.addChild(view.node);
    view.node.setPosition(this.backpack.cellCenter(colIdx, row, it.w, it.h));
    view.lift(false);
    this.backpack.registerExternalView(it.uid, view);
    this.bindGridItem(view);
    if (this.events.onPlaced) this.events.onPlaced(it, colIdx, row, bought);
    return true;
  };

  DragController.prototype.commitMerge = function (view, target) {
    var self = this;
    var it = view.item;
    var bought = this.origin && this.origin.kind === 'shop';
    if (bought && !this.state.spend(it.def.price)) return false;
    if (bought) this.state.takeFromShop(it);

    var targetView = this.backpack.viewOf(target.uid);
    var dest = this.backpack.cellCenter(target.col, target.row, target.w, target.h);
    var worldNow = view.node.getWorldPosition();
    this.backpack.itemsParent.addChild(view.node);
    view.node.setWorldPosition(worldNow);

    // Fly the dragged item into the target, then upgrade.
    var worldDest = this.backpack.itemsParent.toWorld(dest.x, dest.y);
    tween(view.node)
      .to(0.13, { worldPosition: worldDest }, { easing: 'quadIn' })
      .call(function () {
        view.destroy();
        var survivor = self.state.mergeOnGrid(it, target);
        if (targetView) targetView.celebrate();
        if (self.events.onMerged) self.events.onMerged(survivor);
      })
      .start();
    return true;
  };

  DragController.prototype.revert = function (view) {
    var self = this;
    var o = this.origin;
    view.lift(false);
    if (o && o.kind === 'shop') {
      o.slot.root.addChild(view.node);
      var ts = this.shop.trayScale;
      o.slot.view = view;
      tween(view.node)
        .to(0.18, { position: new Vec3(0, 14, 0), scale: new Vec3(ts, ts, 1) }, { easing: 'backOut' })
        .call(function () { self.shop.setItems(self.state.shop); })
        .start();
    } else if (o && o.kind === 'grid') {
      var it = view.item;
      var back = this.state.grid.canPlace(it, o.col, o.row)
        ? { col: o.col, row: o.row }
        : this.state.grid.firstFit(it);
      if (back) {
        this.state.placeOnGrid(it, back.col, back.row);
        this.backpack.itemsParent.addChild(view.node);
        var p = this.backpack.cellCenter(back.col, back.row, it.w, it.h);
        tween(view.node).to(0.18, { position: p }, { easing: 'backOut' }).start();
        this.backpack.registerExternalView(it.uid, view);
        this.bindGridItem(view);
      } else {
        view.destroy();
      }
    }
  };

  /** Outline any board item the dragged item could merge with. */
  DragController.prototype.refreshMergeHints = function (dragged) {
    this.backpack.forEachView(function (v) {
      if (dragged.canMergeWith(v.item) && v.item.w === dragged.w && v.item.h === dragged.h) {
        v.setMergeHint(true);
      }
    });
  };

  DragController.prototype.clearMergeHints = function () {
    this.backpack.forEachView(function (v) { v.setMergeHint(false); });
  };

  /**
   * Autoplay: fly a shop item into a target cell and commit the drop exactly
   * as a real drag would. Used when the viewer never touches the screen.
   */
  DragController.prototype.autoDropFromShop = function (slotIndex, colIdx, row, onDone) {
    var self = this;
    var done = function () { if (onDone) onDone(); };
    if (this.dragging || this._locked) { done(); return; }
    var slot = this.shop.slots[slotIndex];
    if (!slot || !slot.view) { done(); return; }
    var view = slot.view;
    if (!this.state.canAfford(view.item.def.price)) { done(); return; }

    this.shop.detach(slot);
    this.origin = { kind: 'shop', slot: slot };
    this.dragging = view;
    var world = view.node.getWorldPosition();
    this.dragLayer.addChild(view.node);
    view.node.setScale(1, 1);
    view.node.setWorldPosition(world);
    view.lift(true);
    this.state.select(view.item);
    if (this.events.onPickUp) this.events.onPickUp(view.item);
    this.refreshMergeHints(view.item);

    var it = view.item;
    var localTarget = this.backpack.cellCenter(colIdx, row, it.w, it.h);
    var worldTarget = this.backpack.itemsParent.toWorld(localTarget.x, localTarget.y);
    var preview = this.state.grid.evaluateDrop(it, colIdx, row);
    this.backpack.showGhost(preview.col, preview.row, it.w, it.h, preview.kind);

    tween(view.node)
      .to(0.55, { worldPosition: worldTarget }, { easing: 'quadInOut' })
      .call(function () {
        self.backpack.hideGhost();
        self.clearMergeHints();
        self.clearTargetHighlights();
        var res = self.state.grid.evaluateDrop(it, colIdx, row);
        var ok = false;
        if (res.kind === 'place') ok = self.commitPlace(view, res.col, res.row);
        else if (res.kind === 'merge' && res.target) ok = self.commitMerge(view, res.target);
        if (!ok) self.revert(view);
        self.dragging = null;
        self.origin = null;
        done();
      })
      .start();
  };

  /** Cancel any in-flight drag (used when the battle starts). */
  DragController.prototype.cancel = function () {
    if (this.dragging) this.revert(this.dragging);
    this.dragging = null;
    this.origin = null;
    this.backpack.hideGhost();
  };

  /* -------------------------------------------------------------- GameRoot */

  var Step = { Merge: 0, Place: 1, Battle: 2, Fighting: 3, Done: 4 };

  /** Cell the tutorial wants each item to land on. */
  var TARGET_MERGE = { slot: 0, col: 1, row: 1 };
  var TARGET_PLACE = { slot: 2, col: 1, row: 2 };

  function GameRoot(rootNode, vw, vh, scale) {
    this.node = rootNode;
    this.state = new M.GameState();
    this.step = Step.Merge;
    this.idle = 0;
    this.autoRunning = false;
    this.timers = [];
    this.vw = vw;
    this.vh = vh;
    this.uiScale = scale;

    this.build();
    // bindState BEFORE seed: seed() ends with state.select(hero), and the Cocos
    // original bound afterwards, so that first selection never reached the info
    // panel and the ad opened on the empty "Tap an item" placeholder.
    this.bindState();
    this.seed();
    this.setStep(Step.Merge);
  }

  GameRoot.prototype.scheduleOnce = function (fn, delay) {
    this.timers.push({ fn: fn, t: delay });
  };

  GameRoot.prototype.update = function (dt) {
    for (var i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        var fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    if (this.battle) this.battle.update(dt);
    if (this.step === Step.Merge || this.step === Step.Place || this.step === Step.Battle) {
      this.idle += dt;
      if (!this.autoRunning && !this.drag.isDragging && this.idle > CFG.tutorial.autoPlayAfter) {
        this.autoStep();
      }
    }
  };

  GameRoot.prototype.build = function () {
    var self = this;
    var vw = this.vw, vh = this.vh;

    this.root = mkNode(this.node, 'UIRoot', vw, vh);
    this.root.setScale(this.uiScale, this.uiScale);

    H.drawBackground(this.root, vw + 40, vh + 40);

    var top = function (px) { return vh / 2 - px; };

    // --- vertical flow ---------------------------------------------------
    var H_HEADER = 64, H_INFO = 236, H_SYN = 62;
    var H_BAG = CFG.grid.rows * CFG.grid.cell + 190;
    var H_RES = 84, H_SHOP = 210, H_COIN = 66, H_ACT = 170;
    var fixed = H_HEADER + H_INFO + H_SYN + H_BAG + H_RES + H_SHOP + H_COIN + H_ACT;
    var padTop = 26, padBottom = 34, gaps = 7;
    var free = Math.max(0, vh - padTop - padBottom - fixed);
    var g = free / gaps;

    var y = padTop;
    var place = function (h) {
      var centre = top(y + h / 2);
      y += h + g;
      return centre;
    };

    new H.ChapterHeader(this.root, 0, place(H_HEADER));
    this.info = new H.InfoPanel(this.root, 0, place(H_INFO));
    this.synergy = new H.SynergyBar(this.root, 0, place(H_SYN));
    this.backpack = new V.BackpackView(this.root, this.state.grid, 0, place(H_BAG));
    this.resources = new H.ResourceBar(this.root, 0, place(H_RES));
    this.shop = new V.ShopView(this.root, 0, place(H_SHOP));
    this.coinBar = new H.CoinBar(this.root, 0, place(H_COIN));
    this.actions = new H.ActionBar(this.root, 0, place(H_ACT), {
      onBuySlot: function () { self.onBuySlot(); },
      onReroll: function () { self.onReroll(); },
      onBattle: function () { self.onBattle(); },
    });

    // --- layers on top ----------------------------------------------------
    this.dragLayer = mkNode(this.root, 'DragLayer', vw, vh);
    this.overlay = mkNode(this.root, 'Overlay', vw, vh);
    this.hand = new B.HandHint(this.overlay);
    this.battle = new B.BattleView(this.overlay, vw, vh, this.state);
    this.endCard = new B.EndCard(this.overlay, vw, vh);

    this.drag = new DragController(this.state, this.backpack, this.shop, this.dragLayer, {
      onAnyInput: function () { self.onAnyInput(); },
      onPickUp: function (item) { self.info.setItem(item); },
      onPlaced: function (item) { self.onItemPlaced(item); },
      onMerged: function (item) { self.onItemMerged(item); },
      onRejected: function (_item, reason) { self.onRejected(reason); },
    });
  };

  /** Starting backpack contents and shop offers. */
  GameRoot.prototype.seed = function () {
    var self = this;
    var put = function (defId, c, r, tier) {
      var it = new M.ItemInstance(defId, tier || 1);
      if (self.state.grid.place(it, c, r)) {
        self.drag.bindGridItem(self.backpack.addItemView(it));
      }
      return it;
    };
    put('dagger', 0, 0);
    var hero = put('shuriken', 1, 1);
    put('glove', 0, 2);
    put('sword', 1, 3);

    this.state.recomputeSynergies();
    this.state.setShop(['shuriken', 'dagger', 'machete']);
    this.shop.setItems(this.state.shop);

    this.state.select(hero);
    this.refreshHud();
    this.refreshSynergy();
  };

  GameRoot.prototype.bindState = function () {
    var self = this;
    this.state.on(EV.SELECT, function (i) { self.info.setItem(i); });
    this.state.on(EV.COINS, function () {
      self.coinBar.set(self.state.coins);
      self.coinBar.bump();
      self.refreshButtons();
    });
    this.state.on(EV.GRID, function () { self.refreshSynergy(); });
    this.state.on(EV.UNLOCK, function (p) { self.backpack.onUnlock(p.col, p.row); });
  };

  GameRoot.prototype.refreshHud = function () {
    this.coinBar.set(this.state.coins);
    this.resources.set(this.state.trophies, this.state.shields, this.state.hearts);
    this.refreshButtons();
  };

  GameRoot.prototype.refreshButtons = function () {
    var interactive = this.step === Step.Battle;
    this.actions.battle.setEnabled(this.step === Step.Battle);
    this.actions.reroll.setEnabled(interactive && this.state.canAfford(CFG.economy.rerollCost));
    this.actions.buySlot.setEnabled(interactive && this.state.canAfford(CFG.economy.buySlotCost));
  };

  GameRoot.prototype.refreshSynergy = function () {
    var n = this.state.shurikenCount;
    var pct = Math.max(0, n - 1) * 35;
    this.synergy.set(
      n > 1
        ? '+' + pct + '% ATK per [Shuriken]  -  ' + n + ' in bag'
        : '+35% ATK per [Shuriken] in your bag',
      n > 1
    );
    this.info.refresh();
  };

  GameRoot.prototype.resetIdle = function () { this.idle = 0; };

  /** First genuine touch: this is the only place the network hears gameStart(). */
  GameRoot.prototype.onAnyInput = function () {
    this.resetIdle();
    if (global.Playable) global.Playable.start();
  };

  GameRoot.prototype.setStep = function (s) {
    var self = this;
    this.step = s;
    this.idle = 0;
    this.autoRunning = false;
    this.refreshButtons();
    this.hand.hide();

    if (s === Step.Merge) {
      this.drag.gateItemUid = this.shopItemUid(TARGET_MERGE.slot);
      this.scheduleOnce(function () { self.showMergeHint(); }, 0.55);
    } else if (s === Step.Place) {
      this.drag.gateItemUid = this.shopItemUid(TARGET_PLACE.slot);
      this.scheduleOnce(function () { self.showPlaceHint(); }, 0.5);
    } else if (s === Step.Battle) {
      this.drag.gateItemUid = -1; // nothing draggable, focus the button
      this.scheduleOnce(function () {
        self.hand.tapAt(self.actions.battle.node.getWorldPosition());
      }, 0.4);
    } else {
      this.drag.gateItemUid = -1;
    }
  };

  GameRoot.prototype.shopItemUid = function (slot) {
    var s = this.shop.slots[slot];
    return s && s.view ? s.view.uid : null;
  };

  GameRoot.prototype.cellWorld = function (c, r, w, h) {
    var local = this.backpack.cellCenter(c, r, w, h);
    return this.backpack.itemsParent.toWorld(local.x, local.y);
  };

  GameRoot.prototype.mergeTargetUid = function () {
    var t = this.state.grid.itemAt(TARGET_MERGE.col, TARGET_MERGE.row);
    return t ? t.uid : -1;
  };

  GameRoot.prototype.showMergeHint = function () {
    var s = this.shop.slots[TARGET_MERGE.slot];
    if (!s || !s.view) return;
    var tv = this.backpack.viewOf(this.mergeTargetUid());
    if (tv) tv.setHighlight('synergy');
    this.hand.dragFrom(
      s.view.node.getWorldPosition(),
      this.cellWorld(TARGET_MERGE.col, TARGET_MERGE.row)
    );
  };

  GameRoot.prototype.showPlaceHint = function () {
    var s = this.shop.slots[TARGET_PLACE.slot];
    if (!s || !s.view) return;
    this.hand.dragFrom(
      s.view.node.getWorldPosition(),
      this.cellWorld(TARGET_PLACE.col, TARGET_PLACE.row, 2, 1)
    );
  };

  /** Plays the current step for the viewer when they have not interacted. */
  GameRoot.prototype.autoStep = function () {
    var self = this;
    if (this.autoRunning) return;
    this.autoRunning = true;
    this.hand.hide();
    var target = this.step === Step.Merge ? TARGET_MERGE : (this.step === Step.Place ? TARGET_PLACE : null);
    if (target) {
      // If the step's item is already gone (the viewer dropped it elsewhere),
      // skip ahead instead of retrying an autoplay that can never fire.
      if (this.shopItemUid(target.slot) === null) {
        this.setStep(this.step === Step.Merge ? Step.Place : Step.Battle);
        return;
      }
      this.drag.autoDropFromShop(target.slot, target.col, target.row, function () {
        self.autoRunning = false;
      });
    } else if (this.step === Step.Battle) {
      this.onBattle();
    }
  };

  GameRoot.prototype.onItemPlaced = function (item) {
    var self = this;
    this.shop.setItems(this.state.shop);
    this.info.setItem(item);
    this.info.flash();
    this.resetIdle();
    this.backpack.forEachView(function (v) { v.setHighlight('none'); });
    // The step's shop item is spent either way. If the viewer dropped the merge
    // item on an empty cell instead of onto its twin they still learned the drag,
    // so move on rather than waiting for a merge that can no longer happen.
    if (this.step === Step.Place) this.scheduleOnce(function () { self.setStep(Step.Battle); }, 0.45);
    else if (this.step === Step.Merge) this.scheduleOnce(function () { self.setStep(Step.Place); }, 0.6);
  };

  GameRoot.prototype.onItemMerged = function (survivor) {
    var self = this;
    this.shop.setItems(this.state.shop);
    var v = this.backpack.viewOf(survivor.uid);
    if (v) { v.redraw(); v.celebrate(); }
    this.info.setItem(survivor);
    this.info.flash();
    this.floatText(
      UI.mergedText || 'MERGED!',
      this.cellWorld(survivor.col, survivor.row, survivor.w, survivor.h)
    );
    this.resetIdle();
    this.backpack.forEachView(function (x) { x.setHighlight('none'); });
    if (this.step === Step.Merge) this.scheduleOnce(function () { self.setStep(Step.Place); }, 0.75);
  };

  GameRoot.prototype.onRejected = function (reason) {
    if (reason === 'coins') shake(this.coinBar.node, 10, 0.3);
    this.resetIdle();
  };

  GameRoot.prototype.onBuySlot = function () {
    this.onAnyInput();
    if (!this.state.spend(CFG.economy.buySlotCost)) return;
    this.state.unlockSlot();
  };

  GameRoot.prototype.onReroll = function () {
    this.onAnyInput();
    if (!this.state.spend(CFG.economy.rerollCost)) return;
    var pool = ['shuriken', 'dagger', 'machete', 'sword', 'glove', 'charm'];
    var pick = function () { return pool[Math.floor(Math.random() * pool.length)]; };
    this.state.setShop([pick(), pick(), pick()]);
    this.shop.setItems(this.state.shop);
  };

  GameRoot.prototype.onBattle = function () {
    var self = this;
    if (this.step === Step.Fighting || this.step === Step.Done) return;
    this.resetIdle();
    this.hand.hide();
    this.drag.cancel();
    this.drag.locked = true;
    this.setStep(Step.Fighting);
    this.battle.start(function () { self.onVictory(); });
  };

  GameRoot.prototype.onVictory = function () {
    this.step = Step.Done;
    this.state.trophies += 1;
    this.resources.set(this.state.trophies, this.state.shields, this.state.hearts);
    this.resources.bumpTrophy();
    this.endCard.show();
  };

  GameRoot.prototype.floatText = function (text, world) {
    var n = mkNode(this.overlay, 'float', 400, 80);
    n.setWorldPosition(world.x, world.y + 60);
    mkLabel(n, text, 0, 0, {
      size: 58, color: col('#ffd34d'), outline: new Color(60, 20, 0, 220), outlineWidth: 7,
    });
    n.setScale(0.4, 0.4);
    tween(n)
      .to(0.2, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
      .by(0.6, { position: new Vec3(0, 120, 0) }, { easing: 'quadOut' })
      .call(function () { n.destroy(); })
      .start();
  };

  /* ------------------------------------------------------------------ boot */

  var canvas = document.getElementById('game');
  var stage = document.getElementById('stage');
  var ctx = canvas.getContext('2d');

  var DESIGN_W = 1080;
  var stageRoot = null;
  var game = null;
  var designH = 1920;
  var fit = { scale: 1, ox: 0, oy: 0 };
  var started = false;

  function measure() {
    var r = stage.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height), left: r.left, top: r.top };
  }

  function resizeCanvas() {
    var m = measure();
    var dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(m.w * dpr);
    canvas.height = Math.round(m.h * dpr);
    canvas.style.width = m.w + 'px';
    canvas.style.height = m.h + 'px';
    // Contain-fit the design box so nothing is ever cropped.
    var s = Math.min(m.w / DESIGN_W, m.h / designH) * dpr;
    fit.scale = s;
    fit.ox = canvas.width / 2;
    fit.oy = canvas.height / 2;
    fit.cssScale = Math.min(m.w / DESIGN_W, m.h / designH);
    fit.cssW = m.w;
    fit.cssH = m.h;
  }

  function boot() {
    var m = measure();
    designH = Math.round(DESIGN_W * (m.h / m.w));
    // Scale the whole creative down on short viewports so nothing collides.
    var uiScale = Math.min(1, designH / 1760);
    var vw = DESIGN_W / uiScale;
    var vh = designH / uiScale;

    stageRoot = new E.Node('Stage', DESIGN_W, designH);
    game = new GameRoot(stageRoot, vw, vh, uiScale);
    resizeCanvas();
    if (global.Playable) global.Playable.ready();
  }

  /** Rebuild for a new aspect ratio, but only while nothing has happened yet. */
  function maybeRelayout() {
    var m = measure();
    var wantH = Math.round(DESIGN_W * (m.h / m.w));
    if (Math.abs(wantH - designH) < 40) { resizeCanvas(); return; }
    if (started || !game || game.step !== Step.Merge || game.drag.isDragging) {
      resizeCanvas();
      return;
    }
    stageRoot = null;
    game = null;
    boot();
  }

  /* ---- input ---- */

  function toWorld(clientX, clientY) {
    var m = measure();
    var s = fit.cssScale || 1;
    return {
      x: (clientX - m.left - m.w / 2) / s,
      y: -(clientY - m.top - m.h / 2) / s,
    };
  }

  var capture = null;

  function mkEvent(p) {
    return { x: p.x, y: p.y, getUILocation: function () { return { x: p.x, y: p.y }; } };
  }

  function onDown(clientX, clientY) {
    if (!stageRoot) return;
    var p = toWorld(clientX, clientY);
    // ANY touch counts as engagement, even one the tutorial gate refuses:
    // it resets the autoplay timer and is what reports gameStart() upstream.
    started = true;
    if (game) game.onAnyInput();
    var hit = E.pick(stageRoot, p.x, p.y);
    if (!hit) return;
    capture = hit;
    hit.emit('touchstart', mkEvent(p));
  }

  function onMove(clientX, clientY) {
    if (!capture) return;
    var p = toWorld(clientX, clientY);
    capture.emit('touchmove', mkEvent(p));
  }

  function onUp(clientX, clientY) {
    if (!capture) return;
    var p = toWorld(clientX, clientY);
    var node = capture;
    capture = null;
    // Cocos fires TOUCH_END only when the touch lifts inside the node.
    if (!node.destroyed && node.hitTest(p.x, p.y)) node.emit('touchend', mkEvent(p));
    else if (!node.destroyed) node.emit('touchcancel', mkEvent(p));
  }

  function bindInput() {
    var opts = { passive: false };
    if (global.PointerEvent) {
      canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
        onDown(e.clientX, e.clientY);
      }, opts);
      canvas.addEventListener('pointermove', function (e) { e.preventDefault(); onMove(e.clientX, e.clientY); }, opts);
      canvas.addEventListener('pointerup', function (e) { e.preventDefault(); onUp(e.clientX, e.clientY); }, opts);
      canvas.addEventListener('pointercancel', function (e) { onUp(e.clientX, e.clientY); }, opts);
    } else {
      canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        var t = e.changedTouches[0];
        onDown(t.clientX, t.clientY);
      }, opts);
      canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        var t = e.changedTouches[0];
        onMove(t.clientX, t.clientY);
      }, opts);
      canvas.addEventListener('touchend', function (e) {
        e.preventDefault();
        var t = e.changedTouches[0];
        onUp(t.clientX, t.clientY);
      }, opts);
      canvas.addEventListener('mousedown', function (e) { onDown(e.clientX, e.clientY); }, opts);
      canvas.addEventListener('mousemove', function (e) { onMove(e.clientX, e.clientY); }, opts);
      canvas.addEventListener('mouseup', function (e) { onUp(e.clientX, e.clientY); }, opts);
    }
  }

  /* ---- main loop ---- */

  var last = 0;

  function frame(now) {
    global.requestAnimationFrame(frame);
    if (!stageRoot) return;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;

    E.updateTweens(dt);
    if (game) game.update(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#12152a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(fit.scale, 0, 0, -fit.scale, fit.ox, fit.oy);
    ctx.globalAlpha = 1;
    E.renderNode(stageRoot, ctx);
  }

  function init() {
    boot();
    bindInput();
    global.addEventListener('resize', maybeRelayout);
    global.addEventListener('orientationchange', function () { setTimeout(maybeRelayout, 250); });
    global.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.MERGE_MASTER = { get game() { return game; }, get root() { return stageRoot; }, Step: Step };
})(window);
