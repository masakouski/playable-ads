/**
 * engine.js — a very small retained-mode 2D scene graph.
 *
 * Merge Master was authored in Cocos Creator, where every screen is a tree of
 * Nodes carrying Graphics (vector draw calls) and Labels, animated with tweens.
 * Shipping the Cocos runtime inside a playable would cost megabytes, so this
 * file reimplements just the slice of that API the creative actually uses:
 *
 *   Node        transform tree, opacity, touch events, world<->local maths
 *   Graphics    the Cocos draw-call API (moveTo/roundRect/circle/fill/stroke)
 *   Label       text with an optional outline
 *   tween()     to/by/delay/call/set/repeatForever/start + easings
 *
 * Everything is Y-UP with the origin at the centre of the stage, exactly like
 * Cocos, so the drawing code ported over unchanged. The canvas transform does
 * the flip; only text has to flip back (see Label.render).
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ maths */

  function Vec3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  Vec3.prototype.clone = function () { return new Vec3(this.x, this.y, this.z); };
  Vec3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z || 0; return this; };

  function Color(r, g, b, a) {
    this.r = r | 0; this.g = g | 0; this.b = b | 0;
    this.a = a === undefined ? 255 : a | 0;
    this._css = null;
  }
  Color.prototype.css = function () {
    if (this._css === null) {
      this._css = this.a >= 255
        ? 'rgb(' + this.r + ',' + this.g + ',' + this.b + ')'
        : 'rgba(' + this.r + ',' + this.g + ',' + this.b + ',' + (this.a / 255).toFixed(3) + ')';
    }
    return this._css;
  };
  Color.prototype.clone = function () { return new Color(this.r, this.g, this.b, this.a); };

  /** Parse "#rrggbb" into a Color. */
  function col(hex, a) {
    var h = hex.charAt(0) === '#' ? hex.substring(1) : hex;
    return new Color(
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
      a === undefined ? 255 : a
    );
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* --------------------------------------------------------------- easings */

  var EASE = {
    linear: function (t) { return t; },
    quadIn: function (t) { return t * t; },
    quadOut: function (t) { return t * (2 - t); },
    quadInOut: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    sineInOut: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    sineOut: function (t) { return Math.sin((t * Math.PI) / 2); },
    backOut: function (t) { var s = 1.70158; t -= 1; return t * t * ((s + 1) * t + s) + 1; },
    backIn: function (t) { var s = 1.70158; return t * t * ((s + 1) * t - s); },
    cubicOut: function (t) { t -= 1; return t * t * t + 1; },
  };

  /* ------------------------------------------------------------------ Node */

  var _nodeId = 1;

  function Node(name, w, h) {
    this.id = _nodeId++;
    this.name = name || 'node';
    this.x = 0; this.y = 0;
    this.scaleX = 1; this.scaleY = 1;
    this.angle = 0;              // degrees, CCW, matching Cocos
    this.opacity = 255;
    this.active = true;
    this.w = w || 0; this.h = h || 0;
    this.children = [];
    this.parent = null;
    this.graphics = null;
    this.labels = [];
    this.handlers = null;
    this.destroyed = false;
    this._m = [1, 0, 0, 1, 0, 0];
    this._mDirty = true;
  }

  Node.prototype.addChild = function (child) {
    if (child.parent === this) return child;
    if (child.parent) child.parent.removeChild(child);
    child.parent = this;
    this.children.push(child);
    child._markDirty();
    return child;
  };

  Node.prototype.removeChild = function (child) {
    var i = this.children.indexOf(child);
    if (i >= 0) { this.children.splice(i, 1); child.parent = null; }
  };

  Node.prototype.removeFromParent = function () {
    if (this.parent) this.parent.removeChild(this);
  };

  Node.prototype.destroy = function () {
    this.destroyed = true;
    Tween.stopAllByTarget(this);
    for (var i = this.children.length - 1; i >= 0; i--) this.children[i].destroy();
    this.children.length = 0;
    this.removeFromParent();
    this.handlers = null;
  };

  Node.prototype.setSiblingIndex = function (i) {
    if (!this.parent) return;
    var list = this.parent.children;
    var cur = list.indexOf(this);
    if (cur < 0) return;
    list.splice(cur, 1);
    list.splice(clamp(i, 0, list.length), 0, this);
  };

  Node.prototype._markDirty = function () {
    this._mDirty = true;
    for (var i = 0; i < this.children.length; i++) this.children[i]._markDirty();
  };

  Node.prototype.setPosition = function (x, y) {
    if (typeof x === 'object') { this.y = x.y; this.x = x.x; }
    else { this.x = x; this.y = y; }
    this._markDirty();
    return this;
  };

  Object.defineProperty(Node.prototype, 'position', {
    get: function () { return new Vec3(this.x, this.y, 0); },
    set: function (v) { this.setPosition(v.x, v.y); },
  });

  Node.prototype.setScale = function (sx, sy) {
    if (typeof sx === 'object') { this.scaleX = sx.x; this.scaleY = sx.y; }
    else { this.scaleX = sx; this.scaleY = sy === undefined ? sx : sy; }
    this._markDirty();
    return this;
  };

  Object.defineProperty(Node.prototype, 'scale', {
    get: function () { return new Vec3(this.scaleX, this.scaleY, 1); },
    set: function (v) { this.setScale(v.x, v.y); },
  });

  Node.prototype.setContentSize = function (w, h) { this.w = w; this.h = h; return this; };

  /** Local -> parent 2x3 matrix [a,b,c,d,e,f]. */
  Node.prototype.localMatrix = function () {
    var r = this.angle * Math.PI / 180;
    var cs = Math.cos(r), sn = Math.sin(r);
    return [cs * this.scaleX, sn * this.scaleX, -sn * this.scaleY, cs * this.scaleY, this.x, this.y];
  };

  function matMul(p, l) {
    return [
      p[0] * l[0] + p[2] * l[1],
      p[1] * l[0] + p[3] * l[1],
      p[0] * l[2] + p[2] * l[3],
      p[1] * l[2] + p[3] * l[3],
      p[0] * l[4] + p[2] * l[5] + p[4],
      p[1] * l[4] + p[3] * l[5] + p[5],
    ];
  }

  Node.prototype.worldMatrix = function () {
    if (!this._mDirty) return this._m;
    var l = this.localMatrix();
    this._m = this.parent ? matMul(this.parent.worldMatrix(), l) : l;
    this._mDirty = false;
    return this._m;
  };

  function applyMat(m, x, y) { return new Vec3(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5], 0); }

  function invertMat(m) {
    var det = m[0] * m[3] - m[1] * m[2];
    if (!det) return [1, 0, 0, 1, 0, 0];
    var id = 1 / det;
    return [
      m[3] * id, -m[1] * id, -m[2] * id, m[0] * id,
      (m[2] * m[5] - m[3] * m[4]) * id,
      (m[1] * m[4] - m[0] * m[5]) * id,
    ];
  }

  Node.prototype.getWorldPosition = function () {
    var m = this.worldMatrix();
    return new Vec3(m[4], m[5], 0);
  };

  Node.prototype.setWorldPosition = function (x, y) {
    if (typeof x === 'object') { y = x.y; x = x.x; }
    if (this.parent) {
      var p = applyMat(invertMat(this.parent.worldMatrix()), x, y);
      this.setPosition(p.x, p.y);
    } else {
      this.setPosition(x, y);
    }
    return this;
  };

  Object.defineProperty(Node.prototype, 'worldPosition', {
    get: function () { return this.getWorldPosition(); },
    set: function (v) { this.setWorldPosition(v.x, v.y); },
  });

  /** Cocos' UITransform.convertToNodeSpaceAR. */
  Node.prototype.toLocal = function (wx, wy) {
    if (typeof wx === 'object') { wy = wx.y; wx = wx.x; }
    return applyMat(invertMat(this.worldMatrix()), wx, wy);
  };

  /** Cocos' UITransform.convertToWorldSpaceAR. */
  Node.prototype.toWorld = function (lx, ly) {
    if (typeof lx === 'object') { ly = lx.y; lx = lx.x; }
    return applyMat(this.worldMatrix(), lx, ly);
  };

  /* ---- events ---- */

  Node.prototype.on = function (type, fn, ctx) {
    if (!this.handlers) this.handlers = {};
    (this.handlers[type] || (this.handlers[type] = [])).push({ fn: fn, ctx: ctx });
    return this;
  };

  Node.prototype.off = function (type, fn) {
    if (!this.handlers || !this.handlers[type]) return;
    var list = this.handlers[type];
    for (var i = list.length - 1; i >= 0; i--) if (list[i].fn === fn) list.splice(i, 1);
  };

  Node.prototype.emit = function (type, ev) {
    if (!this.handlers || !this.handlers[type]) return false;
    var list = this.handlers[type].slice();
    for (var i = 0; i < list.length; i++) list[i].fn.call(list[i].ctx, ev);
    return list.length > 0;
  };

  Node.prototype.hasHandler = function (type) {
    return !!(this.handlers && this.handlers[type] && this.handlers[type].length);
  };

  /** True when a world point falls inside this node's content box. */
  Node.prototype.hitTest = function (wx, wy) {
    if (this.w <= 0 || this.h <= 0) return false;
    var p = this.toLocal(wx, wy);
    return Math.abs(p.x) <= this.w / 2 && Math.abs(p.y) <= this.h / 2;
  };

  Node.prototype.worldOpacity = function () {
    var o = this.opacity / 255;
    var n = this.parent;
    while (n) { o *= n.opacity / 255; n = n.parent; }
    return o;
  };

  Node.prototype.isVisible = function () {
    var n = this;
    while (n) { if (!n.active || n.destroyed) return false; n = n.parent; }
    return true;
  };

  Node.prototype.addGraphics = function () {
    this.graphics = new Graphics(this);
    return this.graphics;
  };

  /* -------------------------------------------------------------- Graphics */

  /**
   * Records draw calls the way Cocos does: paths accumulate, and fill()/stroke()
   * paint everything queued since the previous fill()/stroke(). The next command
   * that starts a path then begins a fresh batch. Reproducing that exactly is
   * what lets the ported drawing code stay byte-for-byte identical.
   */
  function Graphics(node) {
    this.node = node;
    this.fillColor = new Color(255, 255, 255, 255);
    this.strokeColor = new Color(0, 0, 0, 255);
    this.lineWidth = 2;
    this.ops = [];        // rendered display list
    this._sub = [];       // subpaths queued since the last paint
    this._cur = null;
  }

  Graphics.prototype.clear = function () {
    this.ops.length = 0;
    this._sub.length = 0;
    this._cur = null;
    return this;
  };

  Graphics.prototype._begin = function () {
    this._cur = { cmds: [], closed: false };
    this._sub.push(this._cur);
    return this._cur;
  };

  Graphics.prototype.moveTo = function (x, y) { this._begin().cmds.push(['M', x, y]); return this; };

  Graphics.prototype.lineTo = function (x, y) {
    if (!this._cur) this._begin().cmds.push(['M', x, y]);
    else this._cur.cmds.push(['L', x, y]);
    return this;
  };

  Graphics.prototype.close = function () { if (this._cur) this._cur.closed = true; return this; };

  Graphics.prototype.rect = function (x, y, w, h) {
    this._begin().cmds.push(['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h]);
    this._cur.closed = true;
    return this;
  };

  Graphics.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    if (r <= 0) return this.rect(x, y, w, h);
    var c = this._begin().cmds;
    c.push(['M', x + r, y]);
    c.push(['L', x + w - r, y]);
    c.push(['A', x + w - r, y + r, r, -Math.PI / 2, 0, false]);
    c.push(['L', x + w, y + h - r]);
    c.push(['A', x + w - r, y + h - r, r, 0, Math.PI / 2, false]);
    c.push(['L', x + r, y + h]);
    c.push(['A', x + r, y + h - r, r, Math.PI / 2, Math.PI, false]);
    c.push(['L', x, y + r]);
    c.push(['A', x + r, y + r, r, Math.PI, Math.PI * 1.5, false]);
    this._cur.closed = true;
    return this;
  };

  Graphics.prototype.circle = function (cx, cy, r) {
    this._begin().cmds.push(['A', cx, cy, r, 0, Math.PI * 2, false]);
    this._cur.closed = true;
    return this;
  };

  Graphics.prototype.ellipse = function (cx, cy, rx, ry) {
    this._begin().cmds.push(['E', cx, cy, rx, ry]);
    this._cur.closed = true;
    return this;
  };

  Graphics.prototype.arc = function (cx, cy, r, a0, a1, ccw) {
    this._begin().cmds.push(['A', cx, cy, r, a0, a1, !!ccw]);
    return this;
  };

  Graphics.prototype._paint = function (kind) {
    if (!this._sub.length) {
      // Repainting the previous batch (Cocos: fill() then stroke() with no new path).
      var last = this.ops.length ? this.ops[this.ops.length - 1] : null;
      if (!last) return this;
      this.ops.push({
        kind: kind, sub: last.sub,
        color: (kind === 'fill' ? this.fillColor : this.strokeColor).clone(),
        lw: this.lineWidth,
      });
      return this;
    }
    this.ops.push({
      kind: kind, sub: this._sub,
      color: (kind === 'fill' ? this.fillColor : this.strokeColor).clone(),
      lw: this.lineWidth,
    });
    this._sub = [];
    this._cur = null;
    return this;
  };

  Graphics.prototype.fill = function () { return this._paint('fill'); };
  Graphics.prototype.stroke = function () { return this._paint('stroke'); };

  Graphics.prototype.render = function (ctx) {
    var ops = this.ops;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      ctx.beginPath();
      for (var s = 0; s < op.sub.length; s++) {
        var sub = op.sub[s], cmds = sub.cmds, started = false;
        for (var c = 0; c < cmds.length; c++) {
          var k = cmds[c];
          if (k[0] === 'M') { ctx.moveTo(k[1], k[2]); started = true; }
          else if (k[0] === 'L') { if (!started) { ctx.moveTo(k[1], k[2]); started = true; } else ctx.lineTo(k[1], k[2]); }
          else if (k[0] === 'A') { ctx.arc(k[1], k[2], k[3], k[4], k[5], k[6]); started = true; }
          else if (k[0] === 'E') { ctx.ellipse(k[1], k[2], k[3], k[4], 0, 0, Math.PI * 2); started = true; }
        }
        if (sub.closed) ctx.closePath();
      }
      if (op.kind === 'fill') {
        ctx.fillStyle = op.color.css();
        ctx.fill();
      } else {
        ctx.strokeStyle = op.color.css();
        ctx.lineWidth = op.lw;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
    }
  };

  /* ----------------------------------------------------------------- Label */

  var FONT_STACK = '"Trebuchet MS", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif';

  function Label(node, text, x, y, o) {
    o = o || {};
    this.node = node;
    this.string = text == null ? '' : String(text);
    this.x = x || 0; this.y = y || 0;
    this.size = o.size === undefined ? 36 : o.size;
    this.color = o.color || new Color(255, 255, 255, 255);
    this.bold = o.bold === undefined ? true : o.bold;
    this.align = o.align || 'center';
    this.outline = o.outline || null;
    this.outlineWidth = o.outlineWidth === undefined ? 4 : o.outlineWidth;
    this.scaleX = 1; this.scaleY = 1;   // tweened independently of the node
    this.opacity = 255;
    this.maxWidth = o.maxWidth || 0;
  }

  Label.prototype.render = function (ctx) {
    if (!this.string) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
    ctx.scale(1, -1);   // undo the global Y flip so glyphs read the right way up
    ctx.font = (this.bold ? '700 ' : '400 ') + this.size + 'px ' + FONT_STACK;
    ctx.textAlign = this.align;
    ctx.textBaseline = 'middle';
    if (this.opacity < 255) ctx.globalAlpha *= this.opacity / 255;
    if (this.outline && this.outlineWidth > 0) {
      ctx.lineWidth = this.outlineWidth * 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.outline.css();
      ctx.strokeText(this.string, 0, 0);
    }
    ctx.fillStyle = this.color.css();
    ctx.fillText(this.string, 0, 0);
    ctx.restore();
  };

  /* ----------------------------------------------------------------- tween */

  var activeTweens = [];

  /** Expand the shorthand props Cocos accepts into flat numeric channels. */
  function expandProps(target, props) {
    var out = [];
    for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      var v = props[k];
      if (k === 'position') { out.push(['x', v.x], ['y', v.y]); }
      else if (k === 'scale') { out.push(['scaleX', v.x], ['scaleY', v.y]); }
      else if (k === 'worldPosition') { out.push(['__wx', v.x], ['__wy', v.y]); }
      else out.push([k, v]);
    }
    return out;
  }

  function readChannel(target, name) {
    if (name === '__wx') return target.getWorldPosition().x;
    if (name === '__wy') return target.getWorldPosition().y;
    return target[name];
  }

  function writeChannels(target, pairs) {
    var wx = null, wy = null;
    for (var i = 0; i < pairs.length; i++) {
      var n = pairs[i][0], v = pairs[i][1];
      if (n === '__wx') wx = v;
      else if (n === '__wy') wy = v;
      else target[n] = v;
    }
    if (wx !== null || wy !== null) {
      var cur = target.getWorldPosition();
      target.setWorldPosition(wx === null ? cur.x : wx, wy === null ? cur.y : wy);
    } else if (target._markDirty) {
      target._markDirty();
    }
  }

  function Tween(target) {
    this.target = target;
    this.actions = [];
    this.idx = 0;
    this.time = 0;
    this.running = false;
    this.repeat = false;
    this.startState = null;
  }

  Tween.prototype.to = function (dur, props, opts) {
    this.actions.push({ type: 'to', dur: dur, props: props, ease: (opts && opts.easing) || 'linear', rel: false });
    return this;
  };

  Tween.prototype.by = function (dur, props, opts) {
    this.actions.push({ type: 'to', dur: dur, props: props, ease: (opts && opts.easing) || 'linear', rel: true });
    return this;
  };

  Tween.prototype.set = function (props) {
    this.actions.push({ type: 'set', props: props });
    return this;
  };

  Tween.prototype.delay = function (d) {
    this.actions.push({ type: 'delay', dur: d });
    return this;
  };

  Tween.prototype.call = function (fn) {
    this.actions.push({ type: 'call', fn: fn });
    return this;
  };

  Tween.prototype.repeatForever = function (inner) {
    this.actions = inner ? inner.actions.slice() : this.actions;
    this.repeat = true;
    return this;
  };

  Tween.prototype.start = function () {
    this.idx = 0;
    this.time = 0;
    this.running = true;
    this._prime();
    activeTweens.push(this);
    return this;
  };

  Tween.prototype.stop = function () {
    this.running = false;
    var i = activeTweens.indexOf(this);
    if (i >= 0) activeTweens.splice(i, 1);
  };

  Tween.prototype._prime = function () {
    var a = this.actions[this.idx];
    if (!a) return;
    if (a.type === 'to') {
      var pairs = expandProps(this.target, a.props);
      this.from = [];
      this.to = [];
      for (var i = 0; i < pairs.length; i++) {
        var n = pairs[i][0];
        var f = readChannel(this.target, n);
        this.from.push([n, f]);
        this.to.push([n, a.rel ? f + pairs[i][1] : pairs[i][1]]);
      }
    }
  };

  Tween.prototype.update = function (dt) {
    if (!this.running) return;
    if (this.target && this.target.destroyed) { this.stop(); return; }
    var guard = 0;
    while (this.running && guard++ < 64) {
      var a = this.actions[this.idx];
      if (!a) {
        if (this.repeat && this.actions.length) { this.idx = 0; this.time = 0; this._prime(); continue; }
        this.stop();
        return;
      }
      if (a.type === 'call') { this.idx++; this.time = 0; a.fn(); this._prime(); continue; }
      if (a.type === 'set') {
        var pairs = expandProps(this.target, a.props);
        writeChannels(this.target, pairs);
        this.idx++; this.time = 0; this._prime(); continue;
      }
      this.time += dt;
      var dur = a.dur || 0;
      if (a.type === 'delay') {
        if (this.time >= dur) { dt = this.time - dur; this.idx++; this.time = 0; this._prime(); continue; }
        return;
      }
      // 'to' / 'by'
      var t = dur <= 0 ? 1 : Math.min(1, this.time / dur);
      var e = (EASE[a.ease] || EASE.linear)(t);
      var vals = [];
      for (var j = 0; j < this.from.length; j++) {
        vals.push([this.from[j][0], this.from[j][1] + (this.to[j][1] - this.from[j][1]) * e]);
      }
      writeChannels(this.target, vals);
      if (t >= 1) { dt = this.time - dur; this.idx++; this.time = 0; this._prime(); continue; }
      return;
    }
  };

  Tween.stopAllByTarget = function (target) {
    for (var i = activeTweens.length - 1; i >= 0; i--) {
      if (activeTweens[i].target === target) { activeTweens[i].running = false; activeTweens.splice(i, 1); }
    }
  };

  function tween(target) { return new Tween(target); }

  function updateTweens(dt) {
    var list = activeTweens.slice();
    for (var i = 0; i < list.length; i++) list[i].update(dt);
  }

  /* -------------------------------------------------------------- renderer */

  function renderNode(node, ctx) {
    if (!node.active || node.destroyed) return;
    var a = node.opacity / 255;
    if (a <= 0.002) return;
    ctx.save();
    ctx.translate(node.x, node.y);
    if (node.angle) ctx.rotate(node.angle * Math.PI / 180);
    if (node.scaleX !== 1 || node.scaleY !== 1) ctx.scale(node.scaleX, node.scaleY);
    if (a < 1) ctx.globalAlpha *= a;
    if (node.graphics) node.graphics.render(ctx);
    for (var c = 0; c < node.children.length; c++) renderNode(node.children[c], ctx);
    // Labels paint last. In Cocos each label was its own child node created
    // after the panel's background graphics; here they hang off the parent, so
    // drawing them after the children preserves that stacking order.
    for (var i = 0; i < node.labels.length; i++) node.labels[i].render(ctx);
    ctx.restore();
  }

  /* ------------------------------------------------------------ hit testing */

  Node.prototype.isTouchable = function () {
    if (!this.handlers) return false;
    for (var k in this.handlers) {
      if (k.indexOf('touch') === 0 && this.handlers[k].length) return true;
    }
    return false;
  };

  /**
   * Deepest, topmost touchable node under a world point. Children are walked
   * back-to-front so the node drawn last (on top) wins, matching Cocos.
   */
  function pick(node, wx, wy) {
    if (!node.active || node.destroyed) return null;
    for (var i = node.children.length - 1; i >= 0; i--) {
      var hit = pick(node.children[i], wx, wy);
      if (hit) return hit;
    }
    if (node.isTouchable() && node.hitTest(wx, wy)) return node;
    return null;
  }

  global.E = {
    Vec3: Vec3, Color: Color, col: col, clamp: clamp,
    Node: Node, Graphics: Graphics, Label: Label,
    tween: tween, Tween: Tween, updateTweens: updateTweens,
    renderNode: renderNode, pick: pick, EASE: EASE,
    FONT_STACK: FONT_STACK,
  };
})(window);
