/**
 * art.js — everything that puts pixels on the canvas.
 *
 * The one interesting trick is how a tilted bottle keeps a level surface.
 * The liquid is never drawn as a shape: the cavity outline is used as a CLIP,
 * and the liquid is then painted as plain horizontal bands in screen space.
 * Finding where each band boundary sits is a pure area problem — clip the
 * cavity polygon with the half-plane y >= L (Sutherland-Hodgman), measure it
 * with the shoelace formula, and bisect L until the area matches the volume.
 * Upright bottles all share one geometry, so their answers are precomputed
 * into a lookup table and only the single pouring bottle is solved per frame.
 */
(function (global) {
  'use strict';

  var CAP = 4;
  var LUT_N = 128;

  /* ------------------------------------------------------------- colours */

  function hex2rgb(h) {
    h = h.charAt(0) === '#' ? h.substring(1) : h;
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
  }
  function mix(rgb, target, t) {
    return [
      Math.round(rgb[0] + (target - rgb[0]) * t),
      Math.round(rgb[1] + (target - rgb[1]) * t),
      Math.round(rgb[2] + (target - rgb[2]) * t),
    ];
  }
  function css(rgb, a) {
    return a === undefined || a >= 1
      ? 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'
      : 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
  }

  var PAL = [];
  function setPalette(list) {
    PAL = list.map(function (h) {
      var rgb = hex2rgb(h);
      return {
        base: css(rgb),
        light: css(mix(rgb, 255, 0.28)),
        dark: css(mix(rgb, 0, 0.3)),
        glow: css(mix(rgb, 255, 0.45), 0.55),
        rgb: rgb,
      };
    });
  }
  function colorOf(i) { return PAL[i % PAL.length]; }

  /* ------------------------------------------------------ tube geometry */

  /** Cached per w|h: cavity path segments, polygon samples and the level LUT. */
  var geomCache = {};

  function geom(w, h) {
    var k = w + '|' + h;
    if (geomCache[k]) return geomCache[k];

    var wall = Math.max(4, w * 0.075);
    var cw = w - wall * 2;
    var ch = h - wall * 2;
    var rb = cw * 0.48;

    // polygon sample of the cavity, local coords, origin at the tube centre
    var pts = [];
    function push(x, y) { pts.push(x, y); }
    push(-cw / 2, -ch / 2);
    push(-cw / 2, ch / 2 - rb);
    var S = 10, i, t, mt;
    for (i = 1; i <= S; i++) {           // bottom-left quadratic
      t = i / S; mt = 1 - t;
      push(mt * mt * (-cw / 2) + 2 * mt * t * (-cw / 2) + t * t * (-cw / 2 + rb),
           mt * mt * (ch / 2 - rb) + 2 * mt * t * (ch / 2) + t * t * (ch / 2));
    }
    push(cw / 2 - rb, ch / 2);
    for (i = 1; i <= S; i++) {           // bottom-right quadratic
      t = i / S; mt = 1 - t;
      push(mt * mt * (cw / 2 - rb) + 2 * mt * t * (cw / 2) + t * t * (cw / 2),
           mt * mt * (ch / 2) + 2 * mt * t * (ch / 2) + t * t * (ch / 2 - rb));
    }
    push(cw / 2, -ch / 2);

    var g = { w: w, h: h, wall: wall, cw: cw, ch: ch, rb: rb, poly: pts };
    g.area = polyArea(pts);
    g.lut = buildLut(pts, g.area);
    geomCache[k] = g;
    return g;
  }

  function cavityPath(ctx, g) {
    var cw = g.cw, ch = g.ch, rb = g.rb;
    ctx.beginPath();
    ctx.moveTo(-cw / 2, -ch / 2);
    ctx.lineTo(-cw / 2, ch / 2 - rb);
    ctx.quadraticCurveTo(-cw / 2, ch / 2, -cw / 2 + rb, ch / 2);
    ctx.lineTo(cw / 2 - rb, ch / 2);
    ctx.quadraticCurveTo(cw / 2, ch / 2, cw / 2, ch / 2 - rb);
    ctx.lineTo(cw / 2, -ch / 2);
    ctx.closePath();
  }

  function glassPath(ctx, g) {
    var w = g.w, h = g.h, rb = g.rb + g.wall, rt = g.w * 0.1;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + rt, -h / 2);
    ctx.lineTo(-w / 2, -h / 2 + rt);
    ctx.lineTo(-w / 2, h / 2 - rb);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2 + rb, h / 2);
    ctx.lineTo(w / 2 - rb, h / 2);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2, h / 2 - rb);
    ctx.lineTo(w / 2, -h / 2 + rt);
    ctx.lineTo(w / 2 - rt, -h / 2);
    ctx.closePath();
  }

  /* --------------------------------------------- polygon area maths ---- */

  function polyArea(p) {
    var a = 0;
    for (var i = 0, n = p.length; i < n; i += 2) {
      var j = (i + 2) % n;
      a += p[i] * p[j + 1] - p[j] * p[i + 1];
    }
    return Math.abs(a) / 2;
  }

  /** Part of the polygon at or below the screen line y = L (y grows downward). */
  function clipBelow(p, L) {
    var out = [];
    for (var i = 0, n = p.length; i < n; i += 2) {
      var j = (i + 2) % n;
      var px = p[i], py = p[i + 1], qx = p[j], qy = p[j + 1];
      var pin = py >= L, qin = qy >= L;
      if (pin) out.push(px, py);
      if (pin !== qin) {
        var t = (L - py) / (qy - py);
        out.push(px + (qx - px) * t, L);
      }
    }
    return out;
  }

  function bounds(p) {
    var mn = Infinity, mx = -Infinity;
    for (var i = 1; i < p.length; i += 2) {
      if (p[i] < mn) mn = p[i];
      if (p[i] > mx) mx = p[i];
    }
    return [mn, mx];
  }

  /** y such that the polygon area below it is `frac` of the whole. */
  function levelFor(p, total, frac) {
    var b = bounds(p);
    if (frac <= 0) return b[1];
    if (frac >= 1) return b[0];
    var lo = b[0], hi = b[1], want = total * frac, mid = 0;
    for (var i = 0; i < 22; i++) {
      mid = (lo + hi) / 2;
      if (polyArea(clipBelow(p, mid)) > want) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function buildLut(poly, total) {
    var lut = new Float64Array(LUT_N + 1);
    for (var i = 0; i <= LUT_N; i++) lut[i] = levelFor(poly, total, i / LUT_N);
    return lut;
  }

  function lutLevel(g, frac) {
    if (frac <= 0) return g.lut[0];
    if (frac >= 1) return g.lut[LUT_N];
    var x = frac * LUT_N, i = x | 0, f = x - i;
    return g.lut[i] + (g.lut[i + 1] - g.lut[i]) * f;
  }

  function rotatePoly(p, cx, cy, ang) {
    var c = Math.cos(ang), s = Math.sin(ang), out = new Array(p.length);
    for (var i = 0; i < p.length; i += 2) {
      out[i] = cx + p[i] * c - p[i + 1] * s;
      out[i + 1] = cy + p[i] * s + p[i + 1] * c;
    }
    return out;
  }

  /**
   * Screen-space y of every band boundary, bottom-most first.
   * `fracs` are cumulative fill fractions (0..1 of capacity).
   */
  function boundaries(o, fracs) {
    var g = geom(o.w, o.h), i, out = new Array(fracs.length);
    if (Math.abs(o.ang) < 0.002) {
      for (i = 0; i < fracs.length; i++) out[i] = o.cy + lutLevel(g, fracs[i]);
    } else {
      var wp = rotatePoly(g.poly, o.cx, o.cy, o.ang);
      var total = g.area;
      for (i = 0; i < fracs.length; i++) out[i] = levelFor(wp, total, fracs[i]);
    }
    return out;
  }

  /** Screen y of the liquid surface, used to aim a pouring stream. */
  function surfaceY(o, units) {
    return boundaries(o, [Math.max(0, Math.min(1, units / CAP))])[0];
  }

  /* ------------------------------------------------------------ drawing */

  /**
   * o = { cx, cy, w, h, ang, layers:[{c,u}], glow, wob, clock, done, dim }
   */
  function tube(ctx, o) {
    var g = geom(o.w, o.h);
    var upright = Math.abs(o.ang) < 0.002;

    // ---- ground shadow
    if (upright) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#020615';
      ctx.beginPath();
      ctx.ellipse(o.cx, o.cy + o.h / 2 + o.w * 0.1, o.w * 0.52, o.w * 0.14, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    // ---- glass body behind the liquid
    ctx.save();
    ctx.translate(o.cx, o.cy);
    ctx.rotate(o.ang);
    glassPath(ctx, g);
    ctx.fillStyle = 'rgba(190,225,255,0.10)';
    ctx.fill();
    ctx.restore();

    // ---- liquid: clip to the cavity, then paint level bands in screen space
    var layers = o.layers || [];
    if (layers.length) {
      var fracs = [0], cum = 0, i;
      for (i = 0; i < layers.length; i++) { cum += layers[i].u; fracs.push(Math.min(1, cum / CAP)); }
      var ys = boundaries(o, fracs);

      ctx.save();
      ctx.translate(o.cx, o.cy);
      ctx.rotate(o.ang);
      cavityPath(ctx, g);
      ctx.clip();
      ctx.rotate(-o.ang);
      ctx.translate(-o.cx, -o.cy);

      var x0 = o.cx - o.h, x1 = o.cx + o.h, wide = x1 - x0;
      for (i = 0; i < layers.length; i++) {
        var yLow = ys[i], yHigh = ys[i + 1];
        if (yLow - yHigh < 0.01) continue;
        var col = colorOf(layers[i].c);
        ctx.fillStyle = o.dim ? col.dark : col.base;
        var top = (i === layers.length - 1);
        if (top && upright) {
          var amp = (2 + 9 * (o.wob || 0)) * (o.w / 170);
          var ph = (o.clock || 0) * 6 + o.cx * 0.02;
          ctx.beginPath();
          ctx.moveTo(x0, yLow + 2);
          ctx.lineTo(x0, yHigh);
          for (var s = 0; s <= 16; s++) {
            var xx = x0 + (wide * s) / 16;
            ctx.lineTo(xx, yHigh + Math.sin(ph + (xx - x0) * 0.055) * amp);
          }
          ctx.lineTo(x1, yLow + 2);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(x0, yHigh, wide, yLow - yHigh + 2);
        }
        // seam between two different colours
        if (i > 0 && layers[i - 1].c !== layers[i].c) {
          ctx.fillStyle = 'rgba(0,0,0,0.16)';
          ctx.fillRect(x0, yLow - 2, wide, 4);
        }
      }

      // gloss over the whole liquid column
      ctx.save();
      ctx.translate(o.cx, o.cy);
      ctx.rotate(o.ang);
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(-g.cw / 2 + g.cw * 0.1, -g.ch / 2, g.cw * 0.14, g.ch);
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fillRect(g.cw / 2 - g.cw * 0.2, -g.ch / 2, g.cw * 0.2, g.ch);
      ctx.restore();
      ctx.restore();
    }

    // ---- glass in front: rim, outline, highlight
    ctx.save();
    ctx.translate(o.cx, o.cy);
    ctx.rotate(o.ang);

    glassPath(ctx, g);
    ctx.lineWidth = Math.max(2, o.w * 0.045);
    ctx.strokeStyle = 'rgba(226,244,255,0.55)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillRect(-g.w / 2 + g.w * 0.13, -g.h / 2 + g.h * 0.06, g.w * 0.05, g.h * 0.62);

    // open rim
    ctx.beginPath();
    ctx.ellipse(0, -g.h / 2, g.w / 2, g.w * 0.11, 0, 0, 6.2832);
    ctx.fillStyle = 'rgba(10,22,52,0.55)';
    ctx.fill();
    ctx.lineWidth = Math.max(2, o.w * 0.035);
    ctx.strokeStyle = 'rgba(226,244,255,0.75)';
    ctx.stroke();

    if (o.glow) {
      glassPath(ctx, g);
      ctx.lineWidth = Math.max(3, o.w * 0.07);
      ctx.strokeStyle = 'rgba(110,240,216,' + (0.35 + 0.45 * o.glow).toFixed(3) + ')';
      ctx.stroke();
    }
    if (o.done) {
      var c = colorOf(layers.length ? layers[0].c : 0);
      glassPath(ctx, g);
      ctx.lineWidth = Math.max(3, o.w * 0.06);
      ctx.strokeStyle = c.glow;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The falling stream between a tilted bottle's lip and the target surface. */
  function stream(ctx, x0, y0, x1, y1, colorIndex, w) {
    var c = colorOf(colorIndex);
    var mx = x0 + (x1 - x0) * 0.62, my = y0 + (y1 - y0) * 0.25;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = c.base;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
    ctx.strokeStyle = c.light;
    ctx.lineWidth = w * 0.34;
    ctx.beginPath();
    ctx.moveTo(x0 - w * 0.1, y0);
    ctx.quadraticCurveTo(mx - w * 0.2, my, x1 - w * 0.18, y1);
    ctx.stroke();
    ctx.fillStyle = c.base;
    ctx.beginPath();
    ctx.arc(x0, y0, w * 0.62, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  /* --------------------------------------------------------- background */

  var bubbles = null;
  function background(ctx, W, H, clock) {
    var gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#12224c');
    gr.addColorStop(0.55, '#0d1836');
    gr.addColorStop(1, '#080f24');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);

    var rg = ctx.createRadialGradient(W * 0.5, H * 0.32, 0, W * 0.5, H * 0.32, W * 0.85);
    rg.addColorStop(0, 'rgba(46,196,255,0.20)');
    rg.addColorStop(1, 'rgba(46,196,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    if (!bubbles) {
      bubbles = [];
      for (var i = 0; i < 16; i++) {
        bubbles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 6 + Math.random() * 26,
          s: 12 + Math.random() * 26,
          o: 0.05 + Math.random() * 0.07,
        });
      }
    }
    ctx.save();
    for (var b = 0; b < bubbles.length; b++) {
      var bb = bubbles[b];
      var y = (bb.y - clock * bb.s) % (H + 120);
      if (y < -120) y += H + 120;
      ctx.globalAlpha = bb.o;
      ctx.fillStyle = '#bfe9ff';
      ctx.beginPath();
      ctx.arc(bb.x, y, bb.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ----------------------------------------------------------- confetti */

  function confettiPiece(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.globalAlpha = p.life > 0.25 ? 1 : p.life / 0.25;
    ctx.fillStyle = p.col;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }

  function drop(ctx, p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.fillStyle = colorOf(p.c).light;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  /** Ghost hand used by the idle hint. */
  function hand(ctx, x, y, pulse) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, 6.2832);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - pulse)).toFixed(3) + ')';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y, 26 + pulse * 44, 0, 6.2832);
    ctx.stroke();
    ctx.restore();
  }

  global.Art = {
    setPalette: setPalette,
    colorOf: colorOf,
    geom: geom,
    tube: tube,
    stream: stream,
    surfaceY: surfaceY,
    background: background,
    confettiPiece: confettiPiece,
    drop: drop,
    hand: hand,
  };
})(window);
