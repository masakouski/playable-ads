/**
 * views.js — one class per screen region, all procedural art.
 *
 * Port of assets/scripts/view/*.ts. Nothing here reads input; the drag
 * controller in game.js wires that up. Two deliberate differences from the
 * Cocos original:
 *   - labels attach to their parent node instead of getting a node each, so
 *     `tween(someLabel)` replaces `tween(someLabel.node)`;
 *   - the unused Spotlight class was dropped (bytes matter in a playable).
 */
(function (global) {
  'use strict';

  var E = global.E, A = global.ART, M = global.MM;
  var Color = E.Color, col = E.col, Vec3 = E.Vec3, tween = E.tween, Tween = E.Tween;
  var C = A.C, shade = A.shade, mkNode = A.mkNode, mkGraphics = A.mkGraphics, mkLabel = A.mkLabel;
  var plate = A.plate, poly = A.poly, star = A.star, bar = A.bar;
  var drawIcon = A.drawIcon, drawCoin = A.drawCoin, drawDevil = A.drawDevil;
  var popIn = A.popIn, pulse = A.pulse, shake = A.shake, UIButton = A.UIButton;
  var CFG = M.CFG;
  var UI = global.PLAYABLE_CONFIG || {};

  /* -------------------------------------------------------------- ItemView */

  /** Visual for a single item. Sized from its grid footprint. */
  function ItemView(parent, item, cell) {
    cell = cell === undefined ? CFG.grid.cell : cell;
    this.item = item;
    this.w = item.w * cell;
    this.h = item.h * cell;
    this.node = mkNode(parent, 'item_' + item.uid, this.w, this.h);
    this.node.itemView = this;
    this.frame = mkGraphics(this.node, 'frame', this.w, this.h);
    this.iconG = mkGraphics(this.node, 'icon', this.w, this.h);
    this.pips = mkGraphics(this.node, 'pips', this.w, this.h);
    this.badge = null;
    this.highlight = 'none';
    this.redraw();
  }

  Object.defineProperty(ItemView.prototype, 'uid', { get: function () { return this.item.uid; } });

  ItemView.prototype.redraw = function () {
    this.drawFrame();
    this.drawIconLayer();
    this.drawPips();
  };

  ItemView.prototype.drawFrame = function () {
    var g = this.frame;
    g.clear();
    var w = this.w - 10, h = this.h - 10;
    var r = Math.min(w, h) * 0.16;
    var rar = C.rarity[this.item.rarity];

    // Soft rarity wash so the icon sits on something.
    g.fillColor = new Color(rar.r, rar.g, rar.b, 46);
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill();

    var ring = null, ringW = 6;
    switch (this.highlight) {
      case 'selected': ring = col('#5fd0ff'); ringW = 7; break;
      case 'synergy': ring = col('#6ee08a'); ringW = 7; break;
      case 'valid': ring = C.ok; ringW = 8; break;
      case 'merge': ring = col('#ffd34d'); ringW = 9; break;
      case 'invalid': ring = C.bad; ringW = 8; break;
      default: ring = null;
    }
    if (ring) {
      g.fillColor = new Color(ring.r, ring.g, ring.b, 46);
      g.roundRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, r + 4);
      g.fill();
      g.lineWidth = ringW;
      g.strokeColor = ring;
      g.roundRect(-w / 2, -h / 2, w, h, r);
      g.stroke();
    }
  };

  ItemView.prototype.drawIconLayer = function () {
    this.iconG.clear();
    drawIcon(this.iconG, this.item.def.kind, this.w * 0.82, this.h * 0.82);
  };

  ItemView.prototype.drawPips = function () {
    var g = this.pips;
    g.clear();
    if (this.item.tier <= 1) return;
    var n = this.item.tier;
    var r = Math.min(this.w, this.h) * 0.045;
    var gap = r * 3;
    var y = -this.h / 2 + r * 3;
    for (var i = 0; i < n; i++) {
      var x = (i - (n - 1) / 2) * gap;
      g.fillColor = new Color(0, 0, 0, 140);
      g.circle(x, y - r * 0.35, r * 1.25);
      g.fill();
      g.fillColor = C.rarity[this.item.rarity];
      g.circle(x, y, r);
      g.fill();
    }
  };

  ItemView.prototype.setHighlight = function (h) {
    if (this.highlight === h) return;
    this.highlight = h;
    this.drawFrame();
  };

  /** Little green arrow badge shown when this item can be merged right now. */
  ItemView.prototype.setMergeHint = function (on) {
    if (on && !this.badge) {
      var s = Math.min(this.w, this.h) * 0.3;
      this.badge = mkNode(this.node, 'badge', s, s, this.w / 2 - s * 0.55, this.h / 2 - s * 0.55);
      A.drawUpgradeArrow(this.badge.addGraphics(), s);
      tween(this.badge).repeatForever(
        tween(this.badge)
          .by(0.45, { position: new Vec3(0, s * 0.16, 0) }, { easing: 'sineInOut' })
          .by(0.45, { position: new Vec3(0, -s * 0.16, 0) }, { easing: 'sineInOut' })
      ).start();
    } else if (!on && this.badge) {
      this.badge.destroy();
      this.badge = null;
    }
  };

  ItemView.prototype.setOpacity = function (v) { this.node.opacity = v; };

  /** Scale lift used while dragging. */
  ItemView.prototype.lift = function (on) {
    tween(this.node)
      .to(0.12, { scale: on ? new Vec3(1.16, 1.16, 1) : new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
    this.node.opacity = on ? 235 : 255;
  };

  /** Celebration pop after a merge. */
  ItemView.prototype.celebrate = function () {
    this.redraw();
    this.node.setScale(0.6, 0.6);
    tween(this.node)
      .to(0.18, { scale: new Vec3(1.35, 1.35, 1) }, { easing: 'backOut' })
      .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
      .start();
  };

  ItemView.prototype.destroy = function () { this.node.destroy(); };

  /* ---------------------------------------------------------- BackpackView */

  /** The backpack board: leather shell, cell grid, item layer and drop ghost. */
  function BackpackView(parent, grid, x, y) {
    this.grid = grid;
    this.cell = CFG.grid.cell;
    this.boardW = grid.cols * this.cell;
    this.boardH = grid.rows * this.cell;
    this.views = {};

    var shellW = this.boardW + 170;
    var shellH = this.boardH + 190;
    this.node = mkNode(parent, 'Backpack', shellW, shellH, x, y);

    this.drawShell(shellW, shellH);

    this.cellsG = mkGraphics(this.node, 'cells', this.boardW, this.boardH);
    this.ghostG = mkGraphics(this.node, 'ghost', this.boardW, this.boardH);
    this.itemLayer = mkNode(this.node, 'items', this.boardW, this.boardH);
    this.drawCells();
  }

  BackpackView.prototype.drawShell = function (w, h) {
    var g = mkGraphics(this.node, 'shell', w, h);
    // Canvas top flap
    g.fillColor = C.canvasTop;
    g.roundRect(-w * 0.36, h * 0.24, w * 0.72, h * 0.2, 22);
    g.fill();
    g.fillColor = shade(C.canvasTop, 0.82);
    g.roundRect(-w * 0.36, h * 0.24, w * 0.72, h * 0.06, 16);
    g.fill();

    // Leather body
    g.fillColor = C.leatherDark;
    g.roundRect(-w / 2, -h / 2, w, h * 0.9, 46);
    g.fill();
    g.fillColor = C.leather;
    g.roundRect(-w / 2 + 8, -h / 2 + 8, w - 16, h * 0.9 - 16, 40);
    g.fill();
    g.fillColor = shade(C.leather, 1.14);
    g.roundRect(-w / 2 + 8, h * 0.4 - 40, w - 16, 40, 18);
    g.fill();

    // Straps
    var sxs = [-w * 0.29, w * 0.29];
    for (var i = 0; i < sxs.length; i++) {
      var sx = sxs[i];
      g.fillColor = C.leatherDark;
      g.roundRect(sx - 26, -h * 0.5, 52, h * 0.92, 12);
      g.fill();
      g.fillColor = shade(C.leather, 1.05);
      g.roundRect(sx - 20, -h * 0.5, 40, h * 0.92, 9);
      g.fill();
      g.fillColor = col('#c9b27a');
      g.roundRect(sx - 24, -h * 0.5 + 26, 48, 34, 8);
      g.fill();
      g.fillColor = C.leatherDark;
      g.roundRect(sx - 15, -h * 0.5 + 34, 30, 18, 5);
      g.fill();
    }

    // Board plate
    var pw = this.boardW + 46;
    var ph = this.boardH + 46;
    g.fillColor = col('#4a3018');
    g.roundRect(-pw / 2, -ph / 2, pw, ph, 26);
    g.fill();
    g.fillColor = C.parchDark;
    g.roundRect(-pw / 2 + 9, -ph / 2 + 9, pw - 18, ph - 18, 20);
    g.fill();
  };

  BackpackView.prototype.drawCells = function () {
    var g = this.cellsG;
    g.clear();
    var cs = this.cell;
    for (var r = 0; r < this.grid.rows; r++) {
      for (var c = 0; c < this.grid.cols; c++) {
        var x = -this.boardW / 2 + c * cs;
        var y = this.boardH / 2 - (r + 1) * cs;
        var locked = this.grid.isLocked(c, r);
        g.fillColor = locked ? C.cellLocked : ((c + r) % 2 === 0 ? C.cellFill : C.cellFillAlt);
        g.roundRect(x + 4, y + 4, cs - 8, cs - 8, 12);
        g.fill();
        g.lineWidth = 3;
        g.strokeColor = locked ? shade(C.cellLocked, 0.7) : C.cellLine;
        g.roundRect(x + 4, y + 4, cs - 8, cs - 8, 12);
        g.stroke();
        if (locked) {
          // Padlock glyph
          g.fillColor = new Color(0, 0, 0, 90);
          g.roundRect(x + cs * 0.36, y + cs * 0.32, cs * 0.28, cs * 0.22, 5);
          g.fill();
          g.lineWidth = 6;
          g.strokeColor = new Color(0, 0, 0, 90);
          g.arc(x + cs * 0.5, y + cs * 0.54, cs * 0.1, 0, Math.PI, false);
          g.stroke();
        }
      }
    }
  };

  /** Local-space centre of a w x h footprint whose top-left cell is (col,row). */
  BackpackView.prototype.cellCenter = function (colIdx, row, w, h) {
    w = w || 1; h = h || 1;
    return new Vec3(
      -this.boardW / 2 + (colIdx + w / 2) * this.cell,
      this.boardH / 2 - (row + h / 2) * this.cell,
      0
    );
  };

  /** Which top-left cell an item of size w x h centred at (x,y) should snap to. */
  BackpackView.prototype.snapCell = function (x, y, w, h) {
    w = w || 1; h = h || 1;
    return {
      col: Math.round((x + this.boardW / 2) / this.cell - w / 2),
      row: Math.round((this.boardH / 2 - y) / this.cell - h / 2),
    };
  };

  BackpackView.prototype.containsLocal = function (x, y, slack) {
    slack = slack === undefined ? 60 : slack;
    return Math.abs(x) <= this.boardW / 2 + slack && Math.abs(y) <= this.boardH / 2 + slack;
  };

  Object.defineProperty(BackpackView.prototype, 'itemsParent', {
    get: function () { return this.itemLayer; },
  });

  BackpackView.prototype.addItemView = function (item) {
    var v = new ItemView(this.itemLayer, item, this.cell);
    v.node.setPosition(this.cellCenter(item.col, item.row, item.w, item.h));
    this.views[item.uid] = v;
    return v;
  };

  BackpackView.prototype.registerExternalView = function (uid, v) { this.views[uid] = v; };
  BackpackView.prototype.viewOf = function (uid) { return this.views[uid]; };

  BackpackView.prototype.dropView = function (uid) {
    var v = this.views[uid];
    if (v) { v.destroy(); delete this.views[uid]; }
  };

  /** Re-seat every view on its model cell (after a merge or unlock). */
  BackpackView.prototype.syncPositions = function (animate) {
    var all = this.grid.all;
    for (var i = 0; i < all.length; i++) {
      var it = all[i];
      var v = this.views[it.uid];
      if (!v) continue;
      var p = this.cellCenter(it.col, it.row, it.w, it.h);
      if (animate === false) v.node.setPosition(p);
      else tween(v.node).to(0.14, { position: p }, { easing: 'quadOut' }).start();
    }
  };

  BackpackView.prototype.forEachView = function (fn) {
    for (var k in this.views) if (Object.prototype.hasOwnProperty.call(this.views, k)) fn(this.views[k]);
  };

  BackpackView.prototype.showGhost = function (colIdx, row, w, h, kind) {
    var g = this.ghostG;
    g.clear();
    var c = kind === 'invalid' ? C.bad : (kind === 'merge' ? col('#ffd34d') : C.ok);
    var p = this.cellCenter(colIdx, row, w, h);
    var gw = w * this.cell - 12;
    var gh = h * this.cell - 12;
    g.fillColor = new Color(c.r, c.g, c.b, 60);
    g.roundRect(p.x - gw / 2, p.y - gh / 2, gw, gh, 14);
    g.fill();
    this.dashedAt(g, p.x, p.y, gw, gh, c);
  };

  BackpackView.prototype.dashedAt = function (g, cx, cy, w, h, c) {
    var dash = 16;
    g.lineWidth = 6;
    g.strokeColor = c;
    var edge = function (x0, y0, x1, y1) {
      var dx = x1 - x0, dy = y1 - y0;
      var len = Math.hypot(dx, dy);
      var n = Math.max(1, Math.floor(len / (dash * 2)));
      for (var i = 0; i < n; i++) {
        var a = (i * 2 * dash) / len;
        var b = Math.min(1, (i * 2 * dash + dash) / len);
        g.moveTo(x0 + dx * a, y0 + dy * a);
        g.lineTo(x0 + dx * b, y0 + dy * b);
      }
    };
    var l = cx - w / 2, r = cx + w / 2, bo = cy - h / 2, t = cy + h / 2;
    edge(l, bo, r, bo);
    edge(r, bo, r, t);
    edge(r, t, l, t);
    edge(l, t, l, bo);
    g.stroke();
  };

  BackpackView.prototype.hideGhost = function () { this.ghostG.clear(); };

  /** Redraw cells after a slot unlock, with a flash. */
  BackpackView.prototype.onUnlock = function (colIdx, row) {
    this.drawCells();
    var p = this.cellCenter(colIdx, row);
    var fx = mkGraphics(this.node, 'unlockFx', this.cell, this.cell, p.x, p.y);
    fx.fillColor = new Color(255, 255, 255, 200);
    fx.roundRect(-this.cell / 2 + 4, -this.cell / 2 + 4, this.cell - 8, this.cell - 8, 12);
    fx.fill();
    tween(fx.node)
      .to(0.35, { scale: new Vec3(1.4, 1.4, 1), opacity: 0 })
      .call(function () { fx.node.destroy(); })
      .start();
  };

  /* -------------------------------------------------------------- ShopView */

  /** The sand-coloured tray of purchasable items under the backpack. */
  function ShopView(parent, x, y, width) {
    this.w = width === undefined ? 1010 : width;
    this.h = 210;
    this.slots = [];
    this.slotCell = CFG.grid.cell;
    /** Tray items render a touch smaller than they will on the board. */
    this.trayScale = 0.84;
    this.onGrab = null;
    this.node = mkNode(parent, 'Shop', this.w, this.h, x, y);

    var g = mkGraphics(this.node, 'tray', this.w, this.h);
    g.fillColor = C.sandDark;
    g.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, 18);
    g.fill();
    g.fillColor = C.sand;
    g.roundRect(-this.w / 2, -this.h / 2, this.w, this.h - 12, 16);
    g.fill();
    g.fillColor = shade(C.sand, 1.08);
    g.roundRect(-this.w / 2 + 14, this.h / 2 - 30, this.w - 28, 14, 7);
    g.fill();

    var n = CFG.economy.shopSlots;
    var gap = this.w / (n + 1);
    for (var i = 0; i < n; i++) {
      var sx = -this.w / 2 + gap * (i + 1);
      var root = mkNode(this.node, 'slot' + i, this.slotCell * 2.1, this.h - 20, sx, 0);
      this.slots.push({ index: i, root: root, view: null, priceNode: null });
    }
  }

  /** Rebuilds the tray contents from the model. */
  ShopView.prototype.setItems = function (items) {
    var self = this;
    for (var i = 0; i < this.slots.length; i++) {
      var s = this.slots[i];
      var item = items[i] || null;
      if (s.view && (!item || s.view.item !== item)) { s.view.destroy(); s.view = null; }
      if (s.priceNode && !item) { s.priceNode.destroy(); s.priceNode = null; }
      if (item && !s.view) {
        var v = new ItemView(s.root, item, this.slotCell);
        v.node.setPosition(0, 14);
        v.node.setScale(this.trayScale, this.trayScale);
        (function (slot) {
          v.node.on('touchstart', function () { if (self.onGrab) self.onGrab(slot); });
        })(s);
        s.view = v;
        popIn(v.node, 0.28, i * 0.05, this.trayScale);
      }
      if (item && !s.priceNode) {
        var pn = mkNode(s.root, 'price', 130, 44, 0, -this.h / 2 + 34);
        var cg = mkGraphics(pn, 'coin', 34, 34, -34, 0);
        drawCoin(cg, 34);
        mkLabel(pn, String(item.def.price), 8, 0, {
          size: 32, color: C.ink, outline: new Color(255, 255, 255, 120), outlineWidth: 3,
        });
        s.priceNode = pn;
      }
    }
  };

  ShopView.prototype.slotOf = function (item) {
    for (var i = 0; i < this.slots.length; i++) {
      if (this.slots[i].view && this.slots[i].view.item === item) return this.slots[i];
    }
    return null;
  };

  /** Detaches the view so the drag layer can own it. Slot keeps its index. */
  ShopView.prototype.detach = function (slot) {
    var v = slot.view;
    slot.view = null;
    if (slot.priceNode) { slot.priceNode.destroy(); slot.priceNode = null; }
    return v;
  };

  ShopView.prototype.setSlotHighlight = function (index, on) {
    var s = this.slots[index];
    if (!s || !s.view) return;
    s.view.setHighlight(on ? 'selected' : 'none');
  };

  global.VIEWS = { ItemView: ItemView, BackpackView: BackpackView, ShopView: ShopView };
})(window);
