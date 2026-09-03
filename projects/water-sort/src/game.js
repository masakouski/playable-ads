/**
 * game.js — flow, input and animation for the Water Sort playable.
 *
 *   intro  scripted demo: three pours that finish two bottles
 *   card   "Your turn"
 *   play   generated levels, one at a time
 *   win    end card + CTA
 *
 * The bottles live in a 1080x1920 design box that is contain-fitted into the
 * stage, so the same file fills a phone and shrinks into a gallery card.
 */
(function () {
  'use strict';

  var C = window.PLAYABLE_CONFIG || {};
  var P = window.Puzzle;
  var CAP = P.CAP;

  var DW = 1080, DH = 1920;
  var TOP = 350, BOT = 1660, ROW_GAP = 120, GAP = 56;

  var stage = document.getElementById('stage');
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var hud = document.getElementById('hud');
  var levelPill = document.getElementById('levelPill');
  var restartBtn = document.getElementById('restart');
  var banner = document.getElementById('banner');
  var toastEl = document.getElementById('toast');
  var hintEl = document.getElementById('hint');
  var hintText = document.getElementById('hintText');
  var overlay = document.getElementById('overlay');
  var cardBadge = document.getElementById('cardBadge');
  var cardTitle = document.getElementById('cardTitle');
  var cardText = document.getElementById('cardText');
  var cardBtn = document.getElementById('cardBtn');
  var cornerCta = document.getElementById('cornerCta');

  var view = { s: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };

  var phase = 'intro';
  var tubes = [];            // model, index 0 = bottom of each bottle
  var startTubes = [];       // for the restart button
  var views = [];            // per-bottle screen state
  var sel = -1;
  var anim = null;
  var drops = [], confetti = [];
  var levelIndex = 0;
  var clock = 0, idle = 0, toastT = 0;
  var hintMove = null, hintT = 0;
  var demoQueue = [], demoT = 0;
  var started = false;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }

  /* ------------------------------------------------------------- layout */

  function rowsFor(n) {
    if (n <= 3) return [n];
    if (n === 4) return [2, 2];
    if (n === 5) return [3, 2];
    if (n === 6) return [3, 3];
    return [4, n - 4];
  }

  function layout() {
    var n = tubes.length;
    var rows = rowsFor(n);
    var maxPer = Math.max.apply(null, rows);
    var tw = Math.min(rows.length > 1 ? 190 : 210, (DW - 160 - (maxPer - 1) * GAP) / maxPer);
    var th = Math.min(tw * (rows.length > 1 ? 3.1 : 3.4),
                      (BOT - TOP - (rows.length - 1) * ROW_GAP) / rows.length);
    var blockH = rows.length * th + (rows.length - 1) * ROW_GAP;
    var y0 = (TOP + BOT) / 2 - blockH / 2 + th / 2;

    views = [];
    var idx = 0;
    for (var r = 0; r < rows.length; r++) {
      var count = rows[r];
      var cy = y0 + r * (th + ROW_GAP);
      for (var i = 0; i < count; i++) {
        var cx = DW / 2 + (i - (count - 1) / 2) * (tw + GAP);
        views.push({ hx: cx, hy: cy, w: tw, h: th, wob: 0, shake: 0, pop: 0, glow: 0, done: false });
        idx++;
      }
    }
    for (var k = 0; k < views.length; k++) views[k].done = P.isDone(tubes[k]) && tubes[k].length > 0;
  }

  /* --------------------------------------------------------- model view */

  /** Bottom-up colour bands, including the fractional amount mid-pour. */
  function layersOf(i) {
    var t = tubes[i], out = [], k;
    for (k = 0; k < t.length; k++) {
      if (out.length && out[out.length - 1].c === t[k]) out[out.length - 1].u++;
      else out.push({ c: t[k], u: 1 });
    }
    if (anim && anim.moved > 0) {
      var m = anim.moved;
      if (i === anim.a) {
        for (k = out.length - 1; k >= 0 && m > 0; k--) {
          var take = Math.min(out[k].u, m);
          out[k].u -= take; m -= take;
          if (out[k].u <= 0.0001) out.pop();
        }
      } else if (i === anim.b) {
        if (out.length && out[out.length - 1].c === anim.color) out[out.length - 1].u += m;
        else out.push({ c: anim.color, u: m });
      }
    }
    return out;
  }

  function unitsIn(layers) {
    var u = 0;
    for (var i = 0; i < layers.length; i++) u += layers[i].u;
    return u;
  }

  /* ------------------------------------------------------------- pours */

  function startPour(a, b) {
    var run = P.topRun(tubes[a]);
    var units = P.canPour(tubes, a, b, false);
    if (!units) return false;
    anim = {
      a: a, b: b, units: units, color: run.color,
      t: 0, dur: C.pourSeconds || 0.85, moved: 0,
      dir: views[b].hx >= views[a].hx ? 1 : -1,
      ang: 0, cx: views[a].hx, cy: views[a].hy,
    };
    idle = 0; hintMove = null;
    return true;
  }

  function stepPour(dt) {
    var A = anim, va = views[A.a], vb = views[A.b];
    A.t += dt;
    var p = clamp(A.t / A.dur, 0, 1);

    var angMax = A.dir * 2.15;
    var mix, angle;
    if (p < 0.20) { angle = 0; mix = 0; }
    else if (p < 0.38) { var q = ease((p - 0.20) / 0.18); angle = angMax * q; mix = q; }
    else if (p < 0.78) { angle = angMax; mix = 1; }
    else if (p < 0.90) { angle = angMax * (1 - ease((p - 0.78) / 0.12)); mix = 1; }
    else { angle = 0; mix = 1 - ease((p - 0.90) / 0.10); }
    A.ang = angle;

    // anchor the lip just above the target's rim, so the bottle swings around it
    var lipX = vb.hx, lipY = vb.hy - vb.h / 2 - vb.w * 0.30;
    var lsx = A.dir * va.w / 2, lsy = -va.h / 2;
    var cs = Math.cos(angle), sn = Math.sin(angle);
    var ax = lipX - (lsx * cs - lsy * sn);
    var ay = lipY - (lsx * sn + lsy * cs);
    var liftY = va.hy - va.h * 0.10;
    A.cx = va.hx + (ax - va.hx) * mix;
    A.cy = liftY + (ay - liftY) * mix;

    // A steep tilt can push the raised end off the top of the design box; drop
    // the whole bottle just far enough to keep it in frame (the lip slides a
    // little deeper into the target, which reads fine).
    var exY = Math.abs(va.w / 2 * sn) + Math.abs(va.h / 2 * cs);
    if (A.cy - exY < 40) A.cy += 40 - (A.cy - exY);

    // transfer window
    var t0 = 0.42, t1 = 0.78;
    if (p > t0) {
      var q2 = clamp((p - t0) / (t1 - t0), 0, 1);
      var was = A.moved;
      A.moved = A.units * q2;
      if (A.moved > was) {
        vb.wob = 1;
        if (Math.random() < 0.55) spawnDrop(vb, A.color);
      }
    }

    if (p >= 1) {
      P.pour(tubes, A.a, A.b);
      views[A.a].wob = 1; views[A.b].wob = 1;
      var justDone = [];
      for (var i = 0; i < tubes.length; i++) {
        var d = P.isDone(tubes[i]) && tubes[i].length > 0;
        if (d && !views[i].done) { views[i].pop = 1; justDone.push(i); }
        views[i].done = d;
      }
      anim = null;
      for (var j = 0; j < justDone.length; j++) burst(justDone[j], 16);
      afterMove();
    }
  }

  function afterMove() {
    if (phase === 'intro') return;
    if (P.isSolved(tubes)) { levelClear(); return; }
    if (!P.anyMove(tubes)) {
      toast(C.stuckToast || 'No moves left — resetting');
      setTimeout(function () { if (phase === 'play') resetLevel(); }, 1100);
    }
  }

  /* -------------------------------------------------------- particles */

  function spawnDrop(v, color) {
    var top = Math.max(0, v.hy - v.h / 2 + 40);
    drops.push({
      x: v.hx + (Math.random() - 0.5) * v.w * 0.5,
      y: top + Math.random() * 30,
      vx: (Math.random() - 0.5) * 220,
      vy: -80 - Math.random() * 160,
      r: 4 + Math.random() * 7, c: color, life: 0.5,
    });
  }

  function burst(i, n) {
    var v = views[i];
    var cols = C.colors || ['#2ec4ff'];
    for (var k = 0; k < n; k++) {
      confetti.push({
        x: v.hx, y: v.hy - v.h * 0.2,
        vx: (Math.random() - 0.5) * 700, vy: -300 - Math.random() * 520,
        a: Math.random() * 6.28, va: (Math.random() - 0.5) * 12,
        w: 10 + Math.random() * 14, h: 16 + Math.random() * 16,
        col: cols[(Math.random() * cols.length) | 0], life: 1.1,
      });
    }
  }

  function bigBurst() {
    var cols = C.colors || ['#2ec4ff'];
    for (var k = 0; k < 90; k++) {
      confetti.push({
        x: DW * Math.random(), y: DH * (0.25 + Math.random() * 0.45),
        vx: (Math.random() - 0.5) * 800, vy: -420 - Math.random() * 620,
        a: Math.random() * 6.28, va: (Math.random() - 0.5) * 12,
        w: 12 + Math.random() * 16, h: 18 + Math.random() * 18,
        col: cols[(Math.random() * cols.length) | 0], life: 1.9,
      });
    }
  }

  function stepParticles(dt) {
    var i;
    for (i = drops.length - 1; i >= 0; i--) {
      var d = drops[i];
      d.vy += 1500 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt;
      if (d.life <= 0) drops.splice(i, 1);
    }
    for (i = confetti.length - 1; i >= 0; i--) {
      var c = confetti[i];
      c.vy += 1300 * dt; c.vx *= 0.99;
      c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.va * dt; c.life -= dt;
      if (c.life <= 0 || c.y > DH + 120) confetti.splice(i, 1);
    }
  }

  /* ------------------------------------------------------------- input */

  function toDesign(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) - view.ox) / view.s,
      y: ((clientY - r.top) - view.oy) / view.s,
    };
  }

  function hit(x, y) {
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      // keep the boxes narrower than the column pitch, or neighbours overlap
      if (x > v.hx - v.w * 0.62 && x < v.hx + v.w * 0.62 &&
          y > v.hy - v.h * 0.60 && y < v.hy + v.h * 0.60) return i;
    }
    return -1;
  }

  function onDown(e) {
    var pt = e.touches && e.touches.length ? e.touches[0] : e;
    if (e.cancelable) e.preventDefault();
    var d = toDesign(pt.clientX, pt.clientY);

    if (phase === 'intro') { skipIntro(); return; }
    if (phase !== 'play' || anim) return;

    idle = 0; hintMove = null;
    var i = hit(d.x, d.y);
    if (i < 0) { sel = -1; return; }
    handleTap(i);
  }

  function handleTap(i) {
    if (phase !== 'play' || anim) return;
    idle = 0; hintMove = null;

    if (!started) {
      started = true;
      Playable.start();          // real play begins here -> window.gameStart()
      hintEl.hidden = true;
    }

    if (sel < 0) {
      if (tubes[i].length && !views[i].done) sel = i;
      else views[i].shake = 1;
      return;
    }
    if (sel === i) { sel = -1; return; }
    if (P.canPour(tubes, sel, i, false)) {
      startPour(sel, i);
      sel = -1;
    } else {
      views[i].shake = 1;
      sel = (tubes[i].length && !views[i].done) ? i : -1;
    }
  }

  /* -------------------------------------------------------------- flow */

  function showCard(badge, title, text, btnLabel, onClick) {
    cardBadge.hidden = !badge;
    cardBadge.textContent = badge || '';
    cardTitle.textContent = title;
    cardText.textContent = text;
    cardBtn.textContent = btnLabel;
    cardBtn.onclick = onClick;
    overlay.hidden = false;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastT = 1.5;
  }

  function startIntro() {
    phase = 'intro';
    tubes = [[0, 0, 1, 1], [1, 1, 0, 0], []];
    layout();
    demoQueue = P.solve(tubes, 20000) || [];
    demoT = 0.7;
    banner.textContent = C.introBannerText || 'WATCH';
    banner.hidden = false;
    hintEl.hidden = false;
    hintText.textContent = 'ONE COLOUR PER BOTTLE';
  }

  function stepIntro(dt) {
    if (anim) return;
    demoT -= dt;
    if (demoT > 0) return;
    if (demoQueue.length) {
      var m = demoQueue.shift();
      startPour(m[0], m[1]);
      demoT = (C.introMoveDelay || 0.55) + (C.pourSeconds || 0.85);
    } else {
      skipIntro();
    }
  }

  function skipIntro() {
    if (phase !== 'intro') return;
    phase = 'card';
    anim = null;
    banner.hidden = true;
    hintEl.hidden = true;
    showCard('', C.introOverTitle || 'Your turn!', C.introOverText || '',
      C.introOverBtn || 'PLAY', function () {
        overlay.hidden = true;
        levelIndex = 0;
        startLevel();
      });
  }

  function startLevel() {
    var spec = (C.levels || [])[levelIndex] || { colors: 4, empty: 2, minMoves: 6 };
    var made = P.generate(spec);
    startTubes = P.clone(made.tubes);
    tubes = P.clone(made.tubes);
    sel = -1; anim = null; idle = 0; hintMove = null;
    phase = 'play';
    layout();
    hud.hidden = false;
    levelPill.textContent = 'LEVEL ' + (levelIndex + 1);
    hintEl.hidden = started;
    hintText.textContent = 'TAP A BOTTLE, THEN ANOTHER';
    cornerCta.hidden = !(C.showCornerCta !== false);
  }

  function resetLevel() {
    tubes = P.clone(startTubes);
    sel = -1; anim = null; idle = 0; hintMove = null;
    drops.length = 0;
    layout();
  }

  function levelClear() {
    phase = 'clear';
    sel = -1;
    bigBurst();
    toast(C.levelClearText || 'LEVEL CLEAR!');
    var last = levelIndex >= (C.levels || []).length - 1;
    setTimeout(function () {
      if (last) win();
      else { levelIndex++; startLevel(); }
    }, 1500);
  }

  function win() {
    phase = 'win';
    hud.hidden = true;
    hintEl.hidden = true;
    cornerCta.hidden = true;
    Playable.end();            // the real end of the playable -> window.gameEnd()
    showCard(C.winBadge || 'SOLVED', C.winTitle || 'All sorted!', C.winText || '',
      C.ctaLabel || 'PLAY NOW', function () { Playable.install('endcard'); });
  }

  /* --------------------------------------------------------------- hint */

  function stepHint(dt) {
    if (phase !== 'play' || anim) { return; }
    idle += dt;
    if (idle < (C.hintAfterSeconds || 4.5)) return;
    if (!hintMove) {
      var sol = P.solve(tubes, 60000);
      if (sol && sol.length) { hintMove = sol[0]; hintT = 0; }
      else { idle = 0; return; }
    }
    hintT += dt / 1.6;
    if (hintT > 1) hintT = 0;
  }

  /* ------------------------------------------------------------- render */

  function draw() {
    var dpr = view.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Art.background(ctx, view.w, view.h, clock);

    ctx.setTransform(view.s * dpr, 0, 0, view.s * dpr, view.ox * dpr, view.oy * dpr);

    var i, v;
    for (i = 0; i < views.length; i++) {
      if (anim && i === anim.a) continue;
      v = views[i];
      var lift = (sel === i ? -v.h * 0.09 : 0);
      var shakeX = v.shake > 0 ? Math.sin(v.shake * 34) * 16 * v.shake : 0;
      var s = 1 + 0.09 * v.pop;
      var cx = v.hx + shakeX, cy = v.hy + lift;
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
      Art.tube(ctx, {
        cx: cx, cy: cy, w: v.w, h: v.h, ang: 0,
        layers: layersOf(i), wob: v.wob, clock: clock,
        glow: sel === i ? 1 : (hintMove && (i === hintMove[0] || i === hintMove[1])
          ? 0.35 + 0.3 * Math.sin(clock * 6) : 0),
        done: v.done,
      });
      ctx.restore();
    }

    if (anim) {
      var A = anim, va = views[A.a], vb = views[A.b];
      var srcLayers = layersOf(A.a);
      var o = { cx: A.cx, cy: A.cy, w: va.w, h: va.h, ang: A.ang, layers: srcLayers, wob: 0, clock: clock };

      if (A.moved > 0 && A.moved < A.units) {
        var cs = Math.cos(A.ang), sn = Math.sin(A.ang);
        var lsx = A.dir * va.w / 2, lsy = -va.h / 2;
        var sx = A.cx + lsx * cs - lsy * sn;
        var sy = A.cy + lsx * sn + lsy * cs;
        var tgt = { cx: vb.hx, cy: vb.hy, w: vb.w, h: vb.h, ang: 0 };
        var ty = Art.surfaceY(tgt, unitsIn(layersOf(A.b)));
        Art.stream(ctx, sx, sy, vb.hx, Math.min(ty, vb.hy + vb.h / 2), A.color, va.w * 0.16);
      }
      Art.tube(ctx, o);
    }

    for (i = 0; i < drops.length; i++) Art.drop(ctx, drops[i]);
    for (i = 0; i < confetti.length; i++) Art.confettiPiece(ctx, confetti[i]);

    if (hintMove && phase === 'play' && !anim) {
      var a = views[hintMove[0]], b = views[hintMove[1]];
      var t = hintT < 0.45 ? 0 : clamp((hintT - 0.45) / 0.45, 0, 1);
      var hx = a.hx + (b.hx - a.hx) * easeOut(t);
      var hy = a.hy + (b.hy - a.hy) * easeOut(t);
      Art.hand(ctx, hx, hy, hintT < 0.45 ? hintT / 0.45 : 1 - t);
    }
  }

  /* --------------------------------------------------------------- loop */

  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    clock += dt;

    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      if (v.wob > 0) v.wob = Math.max(0, v.wob - dt * 1.5);
      if (v.shake > 0) v.shake = Math.max(0, v.shake - dt * 4);
      if (v.pop > 0) v.pop = Math.max(0, v.pop - dt * 2.4);
    }

    if (anim) stepPour(dt);
    if (phase === 'intro') stepIntro(dt);
    if (phase === 'play') stepHint(dt);
    stepParticles(dt);

    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.hidden = true; }

    draw();
  }

  /* --------------------------------------------------------------- boot */

  function fit() {
    var w = stage.clientWidth, h = stage.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = w; view.h = h; view.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    view.s = Math.min(w / DW, h / DH);
    view.ox = (w - DW * view.s) / 2;
    view.oy = (h - DH * view.s) / 2;
    document.documentElement.style.setProperty('--u', Math.min(w, h) / 100 + 'px');
  }

  function init() {
    Art.setPalette(C.colors || ['#ff4d6d', '#ffb703', '#2ec4ff', '#34d17a', '#a06bff', '#ff7a1f']);
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', function () { setTimeout(fit, 150); });

    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('mousedown', onDown);

    restartBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (phase === 'play') resetLevel();
    });
    cornerCta.textContent = C.ctaLabel || 'PLAY NOW';
    cornerCta.addEventListener('click', function () { Playable.install('corner'); });

    startIntro();
    requestAnimationFrame(frame);
    Playable.ready();
  }

  /* ---- headless test hook: only with ?e2e=1, never active in a shipped ad ---- */
  if (/[?&]e2e=1/.test(window.location.search)) {
    window.WS = {
      phase: function () { return phase; },
      busy: function () { return !!anim; },
      tubes: function () { return P.clone(tubes); },
      views: function () { return views; },
      level: function () { return levelIndex; },
      solve: function () { return P.solve(tubes, 120000); },
      tap: handleTap,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
