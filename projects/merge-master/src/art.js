/**
 * art.js — palette, drawing primitives, UI kit and the item icons.
 *
 * Straight port of assets/scripts/core/{Palette,Draw,UIKit}.ts and
 * assets/scripts/view/IconFactory.ts from the Cocos project. The playable
 * ships ZERO image assets: every icon below is vector draw calls, which is
 * what keeps the single-file build tiny and the whole look re-skinnable from
 * the C palette at the top.
 */
(function (global) {
  'use strict';

  var E = global.E;
  var Color = E.Color, col = E.col, Node = E.Node, Label = E.Label, tween = E.tween, Vec3 = E.Vec3;

  /* --------------------------------------------------------------- palette */

  /** Linear blend between two colours. */
  function mix(a, b, t) {
    return new Color(
      Math.round(a.r + (b.r - a.r) * t),
      Math.round(a.g + (b.g - a.g) * t),
      Math.round(a.b + (b.b - a.b) * t),
      Math.round(a.a + (b.a - a.a) * t)
    );
  }

  /** Multiply a colour's RGB (shade/tint helper). */
  function shade(c, k) {
    return new Color(
      Math.max(0, Math.min(255, Math.round(c.r * k))),
      Math.max(0, Math.min(255, Math.round(c.g * k))),
      Math.max(0, Math.min(255, Math.round(c.b * k))),
      c.a
    );
  }

  var C = {
    // Background
    bgTop: col('#232842'),
    bgBottom: col('#12152a'),
    vignette: col('#0a0c18'),

    // Parchment panels
    parch: col('#e8d6ac'),
    parchDark: col('#d3bd8e'),
    parchLight: col('#f6ebcd'),
    frameBrown: col('#5d3d22'),
    frameBrownLight: col('#8a5c33'),

    // Backpack leather
    leather: col('#7a4a28'),
    leatherDark: col('#5a3419'),
    leatherLight: col('#a06b3f'),
    canvasTop: col('#7f93b0'),

    // Grid
    cellFill: col('#dcc79a'),
    cellFillAlt: col('#d2bb8b'),
    cellLine: col('#b39a68'),
    cellLocked: col('#9c8862'),

    // Text
    ink: col('#3a2a16'),
    inkSoft: col('#6b5535'),
    cream: col('#f6e8c4'),
    white: col('#ffffff'),

    // Currency / stats
    gold: col('#ffc93c'),
    goldDark: col('#c98a12'),
    coin: col('#cfdae6'),
    coinDark: col('#8fa3b8'),
    hp: col('#e2453f'),
    hpDark: col('#8e1d1c'),
    shield: col('#59a6e8'),
    atk: col('#ff8a3d'),
    crit: col('#ffb020'),
    cooldown: col('#7fd3ff'),

    // Buttons
    btnGold: col('#f4b62c'),
    btnGoldDark: col('#b8760f'),
    btnStone: col('#cbbb95'),
    btnStoneDark: col('#8d7c58'),

    // Shop tray
    sand: col('#d9b98a'),
    sandDark: col('#b9945f'),

    // Feedback
    ok: col('#5fd35f'),
    bad: col('#e8544a'),
    tagGreen: col('#4faf5a'),

    // Rarity
    rarity: [col('#9aa6b2'), col('#4a90d9'), col('#a45fd6'), col('#e8a020')],
    rarityGlow: [col('#c8d4de'), col('#7fc0ff'), col('#d79bff'), col('#ffd77a')],
  };

  var RARITY_NAMES = ['Common', 'Rare', 'Epic', 'Legendary'];

  /* ------------------------------------------------------------------ draw */
  /* All shapes are drawn around the node's own origin (0,0) unless stated.   */

  /** Filled + stroked rounded rectangle centred on the node origin. */
  function panel(g, w, h, r, fill, stroke, strokeW) {
    strokeW = strokeW === undefined ? 6 : strokeW;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    if (fill) { g.fillColor = fill; g.fill(); }
    if (stroke) { g.lineWidth = strokeW; g.strokeColor = stroke; g.stroke(); }
  }

  /**
   * A chunky game-UI plate: dark outer border, coloured body, and a lighter
   * inner rim along the top to fake a bevel. Reads well without any textures.
   */
  function plate(g, w, h, r, body, border, borderW) {
    borderW = borderW === undefined ? 8 : borderW;
    // Drop shadow
    g.fillColor = new Color(0, 0, 0, 60);
    g.roundRect(-w / 2, -h / 2 - 6, w, h, r);
    g.fill();
    // Border
    g.fillColor = border;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill();
    // Body
    var iw = w - borderW * 2;
    var ih = h - borderW * 2;
    g.fillColor = body;
    g.roundRect(-iw / 2, -ih / 2, iw, ih, Math.max(2, r - borderW * 0.5));
    g.fill();
    // Top highlight
    g.fillColor = shade(body, 1.16);
    g.roundRect(-iw / 2, ih / 2 - ih * 0.28, iw, ih * 0.28, Math.max(2, r - borderW));
    g.fill();
  }

  /** Horizontal progress/health bar. Origin is the bar centre. */
  function bar(g, w, h, pct, fill, back, border) {
    var r = h / 2;
    g.fillColor = back;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill();
    var p = Math.max(0, Math.min(1, pct));
    if (p > 0.001) {
      var fw = Math.max(h, w * p);
      g.fillColor = fill;
      g.roundRect(-w / 2, -h / 2, fw, h, r);
      g.fill();
      g.fillColor = shade(fill, 1.35);
      g.roundRect(-w / 2 + h * 0.22, h * 0.06, Math.max(1, fw - h * 0.44), h * 0.26, h * 0.13);
      g.fill();
    }
    if (border) {
      g.lineWidth = 4;
      g.strokeColor = border;
      g.roundRect(-w / 2, -h / 2, w, h, r);
      g.stroke();
    }
  }

  /** N-pointed star centred on (cx, cy). */
  function star(g, cx, cy, outer, inner, points, rotation) {
    points = points === undefined ? 5 : points;
    rotation = rotation === undefined ? -Math.PI / 2 : rotation;
    var step = Math.PI / points;
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 === 0 ? outer : inner;
      var a = rotation + i * step;
      var x = cx + Math.cos(a) * r;
      var y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.close();
  }

  /** Closed polygon from a flat [x0,y0,x1,y1,...] list. */
  function poly(g, pts) {
    for (var i = 0; i < pts.length; i += 2) {
      if (i === 0) g.moveTo(pts[0], pts[1]); else g.lineTo(pts[i], pts[i + 1]);
    }
    g.close();
  }

  /** Fills a polygon, then re-draws it slightly inset in a lighter tone. */
  function bevelPoly(g, pts, base, lightK, inset) {
    lightK = lightK === undefined ? 1.3 : lightK;
    inset = inset === undefined ? 0.82 : inset;
    g.fillColor = base;
    poly(g, pts);
    g.fill();
    var cx = 0, cy = 0;
    var n = pts.length / 2;
    for (var i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; }
    cx /= n; cy /= n;
    var inner = [];
    for (var j = 0; j < pts.length; j += 2) {
      inner.push(cx + (pts[j] - cx) * inset, cy + (pts[j + 1] - cy) * inset);
    }
    g.fillColor = shade(base, lightK);
    poly(g, inner);
    g.fill();
  }

  /** Soft radial-ish glow faked with concentric translucent discs. */
  function glow(g, cx, cy, radius, c, steps) {
    steps = steps === undefined ? 5 : steps;
    for (var i = steps; i >= 1; i--) {
      var t = i / steps;
      g.fillColor = new Color(c.r, c.g, c.b, Math.round(26 * (1 - t) + 6));
      g.circle(cx, cy, radius * t);
      g.fill();
    }
  }

  /** Dashed rounded rectangle used for drop-target hints. */
  function dashedRect(g, w, h, dash, c, lw) {
    g.lineWidth = lw === undefined ? 5 : lw;
    g.strokeColor = c;
    var drawEdge = function (x0, y0, x1, y1) {
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
    var hw = w / 2, hh = h / 2;
    drawEdge(-hw, -hh, hw, -hh);
    drawEdge(hw, -hh, hw, hh);
    drawEdge(hw, hh, -hw, hh);
    drawEdge(-hw, hh, -hw, -hh);
    g.stroke();
  }

  /** Vertical two-tone backdrop, drawn as horizontal bands. */
  function verticalGradient(g, w, h, top, bottom, bands) {
    bands = bands === undefined ? 24 : bands;
    var bh = h / bands;
    for (var i = 0; i < bands; i++) {
      var t = i / (bands - 1);
      g.fillColor = new Color(
        Math.round(top.r + (bottom.r - top.r) * t),
        Math.round(top.g + (bottom.g - top.g) * t),
        Math.round(top.b + (bottom.b - top.b) * t),
        255
      );
      g.rect(-w / 2, h / 2 - (i + 1) * bh - 1, w, bh + 2);
      g.fill();
    }
  }

  /* ---------------------------------------------------------------- ui kit */

  function mkNode(parent, name, w, h, x, y) {
    var n = new Node(name, w || 0, h || 0);
    n.setPosition(x || 0, y || 0);
    if (parent) parent.addChild(n);
    return n;
  }

  function mkGraphics(parent, name, w, h, x, y) {
    return mkNode(parent, name, w, h, x, y).addGraphics();
  }

  function mkLabel(parent, text, x, y, o) {
    var l = new Label(parent, text, x, y, o || {});
    if (parent) parent.labels.push(l);
    return l;
  }

  function fadeIn(n, dur, delay) {
    n.opacity = 0;
    tween(n).delay(delay || 0).to(dur === undefined ? 0.25 : dur, { opacity: 255 }).start();
  }

  function fadeOut(n, dur, destroy) {
    tween(n).to(dur === undefined ? 0.2 : dur, { opacity: 0 })
      .call(function () { if (destroy) n.destroy(); else n.active = false; })
      .start();
  }

  /** Scale pop used for anything that should feel juicy on appear. */
  function popIn(n, dur, delay, to) {
    dur = dur === undefined ? 0.3 : dur;
    to = to === undefined ? 1 : to;
    n.setScale(0.001, 0.001);
    tween(n).delay(delay || 0)
      .to(dur * 0.6, { scale: new Vec3(to * 1.12, to * 1.12, 1) }, { easing: 'backOut' })
      .to(dur * 0.4, { scale: new Vec3(to, to, 1) }, { easing: 'quadOut' })
      .start();
  }

  function pulse(n, amount, dur) {
    amount = amount === undefined ? 1.08 : amount;
    dur = dur === undefined ? 0.6 : dur;
    var base = n.scaleX;
    tween(n).repeatForever(
      tween(n)
        .to(dur * 0.5, { scale: new Vec3(base * amount, base * amount, 1) }, { easing: 'sineInOut' })
        .to(dur * 0.5, { scale: new Vec3(base, base, 1) }, { easing: 'sineInOut' })
    ).start();
  }

  function shake(n, amount, dur) {
    amount = amount === undefined ? 12 : amount;
    dur = dur === undefined ? 0.3 : dur;
    var px = n.x, py = n.y;
    var t = tween(n);
    var steps = 6;
    for (var i = 0; i < steps; i++) {
      var k = 1 - i / steps;
      t.to(dur / steps, {
        position: new Vec3(px + (Math.random() * 2 - 1) * amount * k, py + (Math.random() * 2 - 1) * amount * k, 0),
      });
    }
    t.to(dur / steps, { position: new Vec3(px, py, 0) }).start();
  }

  /** Chunky plate button with an optional coin+cost row under the label. */
  function UIButton(parent, name, x, y, o) {
    this._o = o;
    this._enabled = true;
    this._pressed = false;
    this.node = mkNode(parent, name, o.w, o.h, x, y);
    this._g = mkGraphics(this.node, 'bg', o.w, o.h);
    this.redraw();

    var hasCost = typeof o.cost === 'number';
    var labelY = hasCost ? o.h * 0.14 : 0;
    this.labelComp = mkLabel(this.node, o.label, 0, labelY, {
      size: o.fontSize === undefined ? 40 : o.fontSize,
      color: o.labelColor || C.white,
      outline: new Color(0, 0, 0, 150),
      outlineWidth: 5,
    });
    if (hasCost) {
      var row = mkNode(this.node, 'cost', o.w, 40, 0, -o.h * 0.22);
      var cg = mkGraphics(row, 'coin', 40, 40, -22, 0);
      cg.fillColor = C.coinDark; cg.circle(0, 0, 17); cg.fill();
      cg.fillColor = C.coin; cg.circle(0, 0, 13); cg.fill();
      mkLabel(row, String(o.cost), 12, 0, {
        size: 30, color: o.costColor || C.hp, outline: new Color(0, 0, 0, 140), outlineWidth: 4,
      });
    }

    var self = this;
    this.node.on('touchstart', function () { self._down(); });
    this.node.on('touchend', function () { self._up(); });
    this.node.on('touchcancel', function () { self._cancel(); });
  }

  UIButton.prototype.redraw = function () {
    var o = this._o;
    this._g.clear();
    var body = this._enabled ? (o.body || C.btnStone) : shade(o.body || C.btnStone, 0.55);
    var border = this._enabled ? (o.border || C.btnStoneDark) : shade(o.border || C.btnStoneDark, 0.6);
    plate(this._g, o.w, o.h, o.radius === undefined ? 22 : o.radius, body, border, 8);
  };

  UIButton.prototype._down = function () {
    if (!this._enabled) return;
    this._pressed = true;
    tween(this.node).to(0.07, { scale: new Vec3(0.94, 0.94, 1) }, { easing: 'quadOut' }).start();
  };

  UIButton.prototype._up = function () {
    if (!this._enabled || !this._pressed) return;
    this._pressed = false;
    tween(this.node).to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    if (this._o.onClick) this._o.onClick();
  };

  UIButton.prototype._cancel = function () {
    this._pressed = false;
    tween(this.node).to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  };

  UIButton.prototype.setEnabled = function (v) {
    if (this._enabled === v) return;
    this._enabled = v;
    this.redraw();
    this.node.opacity = v ? 255 : 170;
  };

  UIButton.prototype.setLabel = function (s) { this.labelComp.string = s; };

  /* ----------------------------------------------------------------- icons */

  var STEEL = col('#8fa6bd');
  var STEEL_DARK = col('#41536b');
  var STEEL_EDGE = col('#dfe9f4');
  var WOOD = col('#8a5a30');
  var WOOD_DARK = col('#5b3718');
  var LEATHER = col('#6d4423');
  var GOLD = col('#f2c14b');
  var GOLD_DARK = col('#a67716');
  var NINJA = col('#2c3646');
  var NINJA_EDGE = col('#6ee08a');

  function outline(g, pts, c, lw) {
    g.lineWidth = lw;
    g.strokeColor = c;
    poly(g, pts);
    g.stroke();
  }

  /** 4-bladed throwing star with a hole in the middle. */
  function iconShuriken(g, s) {
    var o = s * 0.48, i = s * 0.15;
    g.fillColor = NINJA;
    star(g, 0, 0, o, i, 4, Math.PI / 8);
    g.fill();
    g.lineWidth = Math.max(2, s * 0.045);
    g.strokeColor = NINJA_EDGE;
    star(g, 0, 0, o * 0.98, i * 1.0, 4, Math.PI / 8);
    g.stroke();
    g.fillColor = shade(NINJA, 1.5);
    star(g, 0, 0, o * 0.52, i * 0.8, 4, Math.PI / 8);
    g.fill();
    g.fillColor = new Color(0, 0, 0, 210);
    g.circle(0, 0, s * 0.1);
    g.fill();
    g.lineWidth = Math.max(1.5, s * 0.028);
    g.strokeColor = NINJA_EDGE;
    g.circle(0, 0, s * 0.1);
    g.stroke();
  }

  /** Slim upright blade with a guard and wrapped grip. */
  function iconDagger(g, s) {
    var blade = [
      0, s * 0.48,
      s * 0.11, s * 0.12,
      s * 0.08, -s * 0.04,
      -s * 0.08, -s * 0.04,
      -s * 0.11, s * 0.12,
    ];
    bevelPoly(g, blade, STEEL, 1.28, 0.6);
    outline(g, blade, STEEL_DARK, Math.max(1.5, s * 0.03));
    g.fillColor = GOLD;
    g.roundRect(-s * 0.2, -s * 0.12, s * 0.4, s * 0.09, s * 0.035);
    g.fill();
    g.fillColor = GOLD_DARK;
    g.roundRect(-s * 0.2, -s * 0.12, s * 0.4, s * 0.03, s * 0.015);
    g.fill();
    g.fillColor = LEATHER;
    g.roundRect(-s * 0.07, -s * 0.42, s * 0.14, s * 0.31, s * 0.05);
    g.fill();
    g.fillColor = shade(LEATHER, 1.35);
    g.roundRect(-s * 0.07, -s * 0.30, s * 0.14, s * 0.05, s * 0.02);
    g.fill();
    g.fillColor = GOLD;
    g.circle(0, -s * 0.44, s * 0.07);
    g.fill();
  }

  /** Wide 2x1 chopping blade, angled slightly. */
  function iconMachete(g, w, h) {
    var bw = w * 0.44, bh = h * 0.30;
    var blade = [
      -bw, bh * 0.35,
      bw * 0.86, bh * 0.72,
      bw, bh * 0.05,
      bw * 0.5, -bh * 0.62,
      -bw, -bh * 0.32,
    ];
    bevelPoly(g, blade, STEEL, 1.25, 0.72);
    outline(g, blade, STEEL_DARK, Math.max(1.5, h * 0.035));
    g.fillColor = shade(STEEL_DARK, 1.2);
    poly(g, [-bw, bh * 0.35, bw * 0.86, bh * 0.72, bw * 0.8, bh * 0.5, -bw, bh * 0.14]);
    g.fill();
    g.fillColor = GOLD_DARK;
    g.roundRect(-bw * 1.12, -bh * 0.4, bw * 0.16, bh * 0.82, h * 0.02);
    g.fill();
    g.fillColor = WOOD;
    g.roundRect(-w * 0.46, -bh * 0.34, w * 0.24, bh * 0.68, h * 0.05);
    g.fill();
    g.fillColor = WOOD_DARK;
    g.roundRect(-w * 0.46, -bh * 0.34, w * 0.24, bh * 0.2, h * 0.03);
    g.fill();
    g.fillColor = shade(WOOD, 1.3);
    g.roundRect(-w * 0.44, bh * 0.14, w * 0.2, bh * 0.12, h * 0.02);
    g.fill();
  }

  /** Wide 2x1 broadsword pointing left, matching the reference art. */
  function iconSword(g, w, h) {
    var bw = w * 0.5, bh = h * 0.26;
    var blade = [
      -bw, 0,
      -bw * 0.66, bh,
      bw * 0.28, bh,
      bw * 0.28, -bh,
      -bw * 0.66, -bh,
    ];
    bevelPoly(g, blade, STEEL_EDGE, 0.86, 0.55);
    outline(g, blade, STEEL_DARK, Math.max(1.5, h * 0.035));
    g.fillColor = shade(STEEL, 0.82);
    g.roundRect(-bw * 0.6, -bh * 0.22, bw * 0.84, bh * 0.44, h * 0.02);
    g.fill();
    g.fillColor = GOLD;
    g.roundRect(bw * 0.26, -bh * 1.7, w * 0.07, bh * 3.4, h * 0.03);
    g.fill();
    g.fillColor = GOLD_DARK;
    g.roundRect(bw * 0.26, -bh * 1.7, w * 0.07, bh * 1.0, h * 0.03);
    g.fill();
    g.fillColor = LEATHER;
    g.roundRect(bw * 0.35, -bh * 0.6, w * 0.12, bh * 1.2, h * 0.04);
    g.fill();
    g.fillColor = GOLD;
    g.circle(bw * 0.52, 0, h * 0.1);
    g.fill();
  }

  /** Leather glove / gauntlet. */
  function iconGlove(g, s) {
    g.fillColor = LEATHER;
    g.roundRect(-s * 0.26, -s * 0.36, s * 0.52, s * 0.5, s * 0.1);
    g.fill();
    for (var i = 0; i < 3; i++) {
      g.fillColor = shade(LEATHER, 1.12);
      g.roundRect(-s * 0.24 + i * s * 0.17, s * 0.1, s * 0.14, s * 0.3, s * 0.07);
      g.fill();
    }
    g.fillColor = shade(LEATHER, 1.05);
    g.roundRect(s * 0.2, -s * 0.14, s * 0.16, s * 0.26, s * 0.08);
    g.fill();
    g.fillColor = shade(LEATHER, 0.7);
    g.roundRect(-s * 0.3, -s * 0.46, s * 0.6, s * 0.16, s * 0.05);
    g.fill();
    g.fillColor = GOLD_DARK;
    g.roundRect(-s * 0.3, -s * 0.4, s * 0.6, s * 0.04, s * 0.02);
    g.fill();
    for (var j = 0; j < 3; j++) {
      g.fillColor = STEEL;
      g.circle(-s * 0.17 + j * s * 0.17, s * 0.06, s * 0.045);
      g.fill();
    }
  }

  /** Five-pointed lucky charm. */
  function iconCharm(g, s) {
    g.fillColor = new Color(90, 200, 120, 60);
    g.circle(0, 0, s * 0.46);
    g.fill();
    g.fillColor = col('#5ec96f');
    star(g, 0, 0, s * 0.42, s * 0.18, 5);
    g.fill();
    g.lineWidth = Math.max(2, s * 0.05);
    g.strokeColor = col('#2f7a3c');
    star(g, 0, 0, s * 0.42, s * 0.18, 5);
    g.stroke();
    g.fillColor = col('#b8f0c0');
    star(g, 0, s * 0.02, s * 0.2, s * 0.09, 5);
    g.fill();
  }

  /** Green upgrade arrow badge used on merge-ready items. */
  function drawUpgradeArrow(g, s) {
    var pts = [0, s * 0.5, s * 0.42, s * 0.02, s * 0.17, s * 0.02, s * 0.17, -s * 0.5,
      -s * 0.17, -s * 0.5, -s * 0.17, s * 0.02, -s * 0.42, s * 0.02];
    g.fillColor = col('#3fbe57');
    poly(g, pts);
    g.fill();
    g.lineWidth = Math.max(2, s * 0.07);
    g.strokeColor = col('#1d7a2f');
    poly(g, pts);
    g.stroke();
  }

  /** Coin used in the currency bar and buttons. */
  function drawCoin(g, s) {
    g.fillColor = col('#8fa3b8');
    g.circle(0, 0, s * 0.5);
    g.fill();
    g.fillColor = col('#cfdae6');
    g.circle(0, 0, s * 0.4);
    g.fill();
    g.fillColor = col('#8fa3b8');
    g.circle(-s * 0.1, s * 0.1, s * 0.12);
    g.fill();
  }

  /** Small pixel-ish devil head for the Battle button. */
  function drawDevil(g, s) {
    g.fillColor = col('#d8352a');
    g.roundRect(-s * 0.34, -s * 0.34, s * 0.68, s * 0.62, s * 0.16);
    g.fill();
    g.fillColor = col('#8c1c14');
    poly(g, [-s * 0.34, s * 0.16, -s * 0.5, s * 0.5, -s * 0.16, s * 0.28]);
    g.fill();
    poly(g, [s * 0.34, s * 0.16, s * 0.5, s * 0.5, s * 0.16, s * 0.28]);
    g.fill();
    g.fillColor = col('#ffe9a8');
    g.circle(-s * 0.14, s * 0.02, s * 0.08);
    g.fill();
    g.circle(s * 0.14, s * 0.02, s * 0.08);
    g.fill();
  }

  var ICONS = {
    shuriken: function (g, w, h) { iconShuriken(g, Math.min(w, h)); },
    dagger: function (g, w, h) { iconDagger(g, Math.min(w, h)); },
    glove: function (g, w, h) { iconGlove(g, Math.min(w, h)); },
    star: function (g, w, h) { iconCharm(g, Math.min(w, h)); },
    machete: function (g, w, h) { iconMachete(g, w, h); },
    sword: function (g, w, h) { iconSword(g, w, h); },
  };

  function drawIcon(g, kind, w, h) {
    var fn = ICONS[kind];
    if (fn) fn(g, w, h);
    else { g.fillColor = STEEL; g.circle(0, 0, Math.min(w, h) * 0.35); g.fill(); }
  }

  global.ART = {
    C: C, RARITY_NAMES: RARITY_NAMES, mix: mix, shade: shade,
    panel: panel, plate: plate, bar: bar, star: star, poly: poly,
    bevelPoly: bevelPoly, glow: glow, dashedRect: dashedRect, verticalGradient: verticalGradient,
    mkNode: mkNode, mkGraphics: mkGraphics, mkLabel: mkLabel,
    fadeIn: fadeIn, fadeOut: fadeOut, popIn: popIn, pulse: pulse, shake: shake,
    UIButton: UIButton,
    drawIcon: drawIcon, drawUpgradeArrow: drawUpgradeArrow, drawCoin: drawCoin, drawDevil: drawDevil,
    ICON_KINDS: Object.keys(ICONS),
  };
})(window);
