/**
 * art.js — every pixel of the vault, drawn into one canvas.
 *
 * The camera is a tilted top view: a coin is an ellipse (ry = 0.4 * rx) with a
 * short cylinder wall under it, and a column is those cylinders stacked with a
 * `pitch` smaller than the coin thickness — so each coin below the top one
 * shows exactly `pitch` pixels of its rim, the way a real pile of chips reads.
 * Stacks are drawn bottom coin first; the coin above overlaps the one below.
 *
 * Nothing here knows the rules; game.js hands it plain numbers.
 */
(function (global) {
  'use strict';

  var PAL = [];

  function hex2rgb(h) {
    var s = h.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(rgb, target, t) {
    return [
      Math.round(rgb[0] + (target[0] - rgb[0]) * t),
      Math.round(rgb[1] + (target[1] - rgb[1]) * t),
      Math.round(rgb[2] + (target[2] - rgb[2]) * t),
    ];
  }
  function css(rgb, a) {
    return a == null || a >= 1
      ? 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'
      : 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
  }
  var WHITE = [255, 255, 255], BLACK = [0, 0, 0];

  function setPalette(list) { PAL = list.map(hex2rgb); }
  /** Coin values are 1-based; anything past the palette wraps but keeps drifting brighter. */
  function colorOf(v) {
    var i = (v - 1) % PAL.length;
    var base = PAL[i < 0 ? 0 : i];
    var loop = Math.floor((v - 1) / PAL.length);
    return loop > 0 ? mix(base, WHITE, Math.min(0.5, loop * 0.25)) : base;
  }
  function cssOf(v, a) { return css(colorOf(v), a); }

  var RY = 0.40; // how flat the camera makes a coin

  /* ------------------------------------------------------------ vault box */

  var motes = null;

  function background(ctx, W, H, clock) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b2440');
    g.addColorStop(0.5, '#131a30');
    g.addColorStop(1, '#0a0f1e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // one warm lamp above the vault
    var rg = ctx.createRadialGradient(W * 0.5, H * 0.18, 0, W * 0.5, H * 0.18, W * 1.05);
    rg.addColorStop(0, 'rgba(255,207,58,0.16)');
    rg.addColorStop(0.55, 'rgba(255,207,58,0.04)');
    rg.addColorStop(1, 'rgba(255,207,58,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    // floor grid, tightening toward the top so the room has depth
    ctx.save();
    ctx.strokeStyle = 'rgba(150,190,255,0.07)';
    ctx.lineWidth = Math.max(1, W / 420);
    var y = H * 0.16, step = H * 0.035;
    while (y < H) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      step *= 1.09; y += step;
    }
    for (var i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * W * 0.09, H * 0.16);
      ctx.lineTo(W / 2 + i * W * 0.42, H);
      ctx.stroke();
    }
    ctx.restore();

    // dust in the lamp beam
    if (!motes) {
      motes = [];
      for (var k = 0; k < 18; k++) {
        motes.push({
          x: Math.random(), y: Math.random(),
          r: 1 + Math.random() * 3, s: 4 + Math.random() * 10,
          o: 0.05 + Math.random() * 0.10,
        });
      }
    }
    ctx.save();
    ctx.fillStyle = '#ffe9a8';
    for (var m = 0; m < motes.length; m++) {
      var p = motes[m];
      var my = ((p.y * H - clock * p.s) % H + H) % H;
      ctx.globalAlpha = p.o;
      ctx.beginPath();
      ctx.arc(p.x * W, my, p.r * (W / 420), 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();

    // vignette
    var vg = ctx.createRadialGradient(W / 2, H * 0.52, W * 0.35, W / 2, H * 0.52, W * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  /**
   * The back wall of the vault, in DESIGN space (1080x1920) so the lockers
   * line up with the shelves. Drawn after background(), before the shelves.
   */
  function room(ctx, W, H) {
    var HOR = 560;
    var g = ctx.createLinearGradient(0, 0, 0, HOR);
    g.addColorStop(0, '#0e1428');
    g.addColorStop(0.55, '#182142');
    g.addColorStop(1, '#202c52');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HOR);

    // safe-deposit boxes
    ctx.save();
    ctx.globalAlpha = 0.55;
    var bw = 118, bh = 96, gap = 16, cols = 7, rws = 2;
    var x0 = (W - (cols * bw + (cols - 1) * gap)) / 2, y0 = 190;
    for (var r = 0; r < rws; r++) {
      for (var c = 0; c < cols; c++) {
        var bx = x0 + c * (bw + gap), by = y0 + r * (bh + gap);
        roundRect(ctx, bx, by, bw, bh, 10);
        var bg = ctx.createLinearGradient(0, by, 0, by + bh);
        bg.addColorStop(0, '#1d2748');
        bg.addColorStop(1, '#121a33');
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(160,200,255,0.10)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(200,225,255,0.13)';
        ctx.fillRect(bx + bw * 0.30, by + bh * 0.62, bw * 0.40, 7);
        ctx.beginPath();
        ctx.arc(bx + bw * 0.5, by + bh * 0.34, 8, 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.restore();

    // light spilling off the wall onto the floor
    var lg = ctx.createLinearGradient(0, HOR - 90, 0, HOR + 240);
    lg.addColorStop(0, 'rgba(255,215,120,0)');
    lg.addColorStop(0.35, 'rgba(255,215,120,0.13)');
    lg.addColorStop(1, 'rgba(255,215,120,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, HOR - 90, W, 330);
    ctx.fillStyle = 'rgba(190,220,255,0.16)';
    ctx.fillRect(0, HOR - 3, W, 3);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** The steel shelf a row of columns stands on. */
  function shelf(ctx, x0, x1, y, rx) {
    var top = y - rx * RY * 1.7, h = rx * RY * 3.2, lip = rx * 0.20;
    ctx.save();
    // front edge
    ctx.fillStyle = '#0a1124';
    roundRect(ctx, x0, top + lip, x1 - x0, h, rx * 0.28);
    ctx.fill();
    // top face
    var g = ctx.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, '#2b3757');
    g.addColorStop(0.55, '#1d2745');
    g.addColorStop(1, '#151d36');
    ctx.fillStyle = g;
    roundRect(ctx, x0, top, x1 - x0, h, rx * 0.28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,200,255,0.14)';
    ctx.lineWidth = Math.max(1, rx * 0.02);
    ctx.stroke();
    ctx.restore();
  }

  /** The slot a column sits in. */
  function pad(ctx, x, y, rx, empty, glow) {
    var ry = rx * RY;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(x, y + ry * 0.30, rx * 1.16, ry * 1.16, 0, 0, 6.2832);
    ctx.fill();

    var g = ctx.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
    g.addColorStop(0, '#4a5a7e');
    g.addColorStop(0.5, '#2a3552');
    g.addColorStop(1, '#3d4b6c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 1.10, ry * 1.10, 0, 0, 6.2832);
    ctx.fill();

    ctx.fillStyle = '#111a30';
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.96, ry * 0.96, 0, 0, 6.2832);
    ctx.fill();

    if (empty) {
      ctx.setLineDash([rx * 0.16, rx * 0.13]);
      ctx.strokeStyle = 'rgba(160,200,255,0.30)';
      ctx.lineWidth = Math.max(1, rx * 0.035);
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 0.66, ry * 0.66, 0, 0, 6.2832);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (glow) {
      ctx.strokeStyle = 'rgba(255,225,130,' + (0.35 + 0.45 * glow).toFixed(3) + ')';
      ctx.lineWidth = rx * 0.06;
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 1.10, ry * 1.10, 0, 0, 6.2832);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ----------------------------------------------------------------- coin */

  /**
   * One coin. (x, y) is the centre of its TOP face; the wall hangs `th` below.
   * o = { face, rim, alpha, scale, glow, pitch }
   */
  function coin(ctx, x, y, rx, th, v, o) {
    o = o || {};
    var a = o.alpha == null ? 1 : o.alpha;
    if (a <= 0.01) return;
    var ry = rx * RY;
    var base = colorOf(v);
    var dark = mix(base, BLACK, 0.52);
    var mid = mix(base, BLACK, 0.18);
    var lite = mix(base, WHITE, 0.42);

    ctx.save();
    ctx.globalAlpha = a;
    if (o.scale && o.scale !== 1) {
      ctx.translate(x, y); ctx.scale(o.scale, o.scale); ctx.translate(-x, -y);
    }
    if (o.glow) {
      ctx.shadowColor = css(mix(base, WHITE, 0.3), 0.95);
      ctx.shadowBlur = rx * 0.55 * o.glow;
    }

    // --- wall (the band between the two ellipses, front side only)
    ctx.beginPath();
    ctx.moveTo(x - rx, y);
    ctx.lineTo(x - rx, y + th);
    ctx.ellipse(x, y + th, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(x + rx, y);
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI, false);
    ctx.closePath();
    var wg = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
    wg.addColorStop(0, css(dark));
    wg.addColorStop(0.20, css(mid));
    wg.addColorStop(0.44, css(lite));
    wg.addColorStop(0.68, css(mid));
    wg.addColorStop(1, css(mix(base, BLACK, 0.62)));
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.shadowBlur = 0;

    // milled edge
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = a * 0.16;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, rx * 0.022);
    for (var t = 0.30; t < Math.PI - 0.20; t += 0.26) {
      var xi = x + rx * Math.cos(t), yi = ry * Math.sin(t);
      ctx.beginPath();
      ctx.moveTo(xi, y + yi);
      ctx.lineTo(xi, y + th + yi);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = a;

    // --- top face
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, 6.2832);
    var fg = ctx.createRadialGradient(x - rx * 0.30, y - ry * 0.55, ry * 0.12, x, y, rx * 1.05);
    fg.addColorStop(0, css(mix(base, WHITE, 0.62)));
    fg.addColorStop(0.55, css(base));
    fg.addColorStop(1, css(mix(base, BLACK, 0.30)));
    ctx.fillStyle = fg;
    ctx.fill();

    // inner medallion
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.70, ry * 0.70, 0, 0, 6.2832);
    ctx.fillStyle = css(mix(base, WHITE, 0.16), 0.9);
    ctx.fill();
    ctx.strokeStyle = css(mix(base, BLACK, 0.35), 0.55);
    ctx.lineWidth = Math.max(1, rx * 0.03);
    ctx.stroke();

    // sheen across the face
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, 6.2832);
    ctx.clip();
    var sg = ctx.createLinearGradient(x - rx, y - ry, x + rx * 0.4, y + ry);
    sg.addColorStop(0, 'rgba(255,255,255,0.35)');
    sg.addColorStop(0.45, 'rgba(255,255,255,0.06)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    ctx.restore();

    if (o.face !== false) {
      ctx.fillStyle = css(mix(base, BLACK, 0.68));
      ctx.font = '800 ' + Math.round(rx * 0.66) + 'px "Trebuchet MS", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(v), x, y + ry * 0.06);
    }

    // the number repeated small on the exposed sliver of rim
    if (o.rim && o.pitch > rx * 0.12) {
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.font = '800 ' + Math.round(Math.min(o.pitch * 0.78, th * 0.62)) + 'px "Trebuchet MS", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = rx * 0.06;
      ctx.fillText(String(v), x, y + th + ry - o.pitch * 0.48);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  /**
   * A whole column. o = {
   *   x, y (pad centre), rx, th, pitch, values,
   *   lift (px the picked-up run floats), liftFrom (first lifted index),
   *   glow (0..1 on the lifted run), padGlow, hidden (coins not to draw)
   * }
   */
  function stack(ctx, o) {
    var vals = o.values, n = vals.length;
    pad(ctx, o.x, o.y, o.rx, n === 0, o.padGlow || 0);
    for (var i = 0; i < n; i++) {
      var lifted = o.lift && i >= o.liftFrom;
      var hot = o.hot && i >= o.hotFrom ? o.hot : 0;
      var y = o.y - o.th - i * o.pitch - (lifted ? o.lift : 0) - hot * o.pitch * 0.25;
      coin(ctx, o.x, y, o.rx, o.th, vals[i], {
        face: i === n - 1,
        rim: true,
        pitch: i === n - 1 ? o.th : o.pitch,
        glow: Math.max(lifted ? (o.glow || 0.8) : 0, hot),
      });
    }
  }

  /* ------------------------------------------------------------ flourishes */

  function ring(ctx, x, y, r, alpha, color) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color || '#ffe9a8';
    ctx.lineWidth = Math.max(2, r * 0.10);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * RY, 0, 0, 6.2832);
    ctx.stroke();
    ctx.restore();
  }

  function spark(ctx, p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
    ctx.fillStyle = p.col;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  function confettiPiece(ctx, p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.fillStyle = p.col;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }

  function floater(ctx, f) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.2));
    ctx.font = '900 ' + f.size + 'px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = f.size * 0.16;
    ctx.strokeStyle = 'rgba(8,14,30,0.85)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.col;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }

  /** The "×3" tag over a picked-up run. */
  function pickBadge(ctx, x, y, rx, n, v) {
    var w = rx * 0.92, h = rx * 0.44;
    ctx.save();
    roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = 'rgba(10,16,34,0.82)';
    ctx.fill();
    ctx.strokeStyle = cssOf(v, 0.9);
    ctx.lineWidth = Math.max(1, rx * 0.035);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '800 ' + Math.round(h * 0.62) + 'px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('x' + n, x, y + h * 0.04);
    ctx.restore();
  }

  function hand(ctx, x, y, pulse) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, 6.2832);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - pulse)).toFixed(3) + ')';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(x, y, 30 + pulse * 52, 0, 6.2832);
    ctx.stroke();
    ctx.restore();
  }

  global.Art = {
    RY: RY,
    setPalette: setPalette, colorOf: colorOf, cssOf: cssOf,
    background: background, room: room, shelf: shelf, pad: pad, coin: coin, stack: stack,
    ring: ring, spark: spark, confettiPiece: confettiPiece, floater: floater,
    pickBadge: pickBadge, hand: hand, roundRect: roundRect,
  };
})(window);
