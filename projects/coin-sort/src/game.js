/**
 * game.js — flow, input and animation for the Coin Sort Vault playable.
 *
 *   intro  scripted demo: three moves that trigger the first merge
 *   card   "Your turn"
 *   play   authored vaults, one at a time, until the goal is collected
 *   win    end card + CTA
 *
 * The vault lives in a 1080x1920 design box that is contain-fitted into the
 * stage, so the same file fills a phone and shrinks into a gallery card.
 */
(function () {
  'use strict';

  var C = window.PLAYABLE_CONFIG || {};
  var B = window.Board;
  var CAP = B.CAP;

  var DW = 1080, DH = 1920;

  var stage = document.getElementById('stage');
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var hud = document.getElementById('hud');
  var levelPill = document.getElementById('levelPill');
  var restartBtn = document.getElementById('restart');
  var goalEl = document.getElementById('goal');
  var goalLabel = document.getElementById('goalLabel');
  var goalCoin = document.getElementById('goalCoin');
  var goalProg = document.getElementById('goalProg');
  var banner = document.getElementById('banner');
  var toastEl = document.getElementById('toast');
  var hintEl = document.getElementById('hint');
  var hintText = document.getElementById('hintText');
  var dropBtn = document.getElementById('dropBtn');
  var dropFill = document.getElementById('dropFill');
  var overlay = document.getElementById('overlay');
  var cardBadge = document.getElementById('cardBadge');
  var cardTitle = document.getElementById('cardTitle');
  var cardText = document.getElementById('cardText');
  var cardBtn = document.getElementById('cardBtn');
  var cornerCta = document.getElementById('cornerCta');

  var view = { s: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };

  var phase = 'intro';
  var cols = [];             // model, index 0 = floor of each column
  var startCols = [];        // for the restart button
  var views = [];            // per-column screen state
  var rows = [];             // [{ y, from, to }] for the shelves
  var geom = { rx: 130, th: 44, pitch: 32 };
  var sel = -1;
  var anim = null;           // a move in flight
  var falls = [];            // coins raining in from the DROP button
  var sparks = [], confetti = [], floaters = [], rings = [];
  var levelIndex = 0, goal = { value: 3, count: 2 };
  var clock = 0, idle = 0, toastT = 0, shake = 0;
  var dropCd = 0;
  var hold = null;            // the beat where a finished run of ten sits and glows
  var flash = 0;
  var hintMove = null, hintT = 0;
  var demoQueue = [], demoT = 0;
  var started = false;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function easeIn(t) { return t * t; }

  /* ------------------------------------------------------------- layout */

  function layout() {
    var n = cols.length;
    var per = n <= 3 ? [n] : [Math.ceil(n / 2), n - Math.ceil(n / 2)];
    var maxPer = Math.max.apply(null, per);
    var margin = 30;
    var pitchX = (DW - margin * 2) / maxPer;
    var rx = Math.min(146, pitchX * 0.41);
    geom.rx = rx;
    geom.th = rx * 0.33;
    geom.pitch = rx * 0.245;

    var stackH = geom.th + (CAP - 1) * geom.pitch;
    var baseYs = per.length > 1 ? [830, 1420] : [1200];

    views = []; rows = [];
    var idx = 0;
    for (var r = 0; r < per.length; r++) {
      var count = per[r], y = baseYs[r];
      var from = idx;
      for (var i = 0; i < count; i++) {
        var x = DW / 2 + (i - (count - 1) / 2) * pitchX;
        views.push({ x: x, y: y, row: r, pitchX: pitchX, pop: 0, shake: 0, glow: 0 });
        idx++;
      }
      rows.push({ y: y, from: from, to: idx - 1, stackH: stackH });
    }
  }

  function coinY(i, index) { return views[i].y - geom.th - index * geom.pitch; }

  /* --------------------------------------------------------- model view */

  /** What column i should draw right now — the model minus coins in flight. */
  function valuesOf(i) {
    var v = cols[i].slice();
    if (anim) {
      if (i === anim.a) v = v.slice(0, v.length - anim.n);
      else if (i === anim.b) for (var k = 0; k < anim.landed; k++) v.push(anim.value);
    }
    return v;
  }

  /* -------------------------------------------------------------- moves */

  function startMove(a, b) {
    var n = B.canMove(cols, a, b, false);
    if (!n) return false;
    anim = {
      a: a, b: b, n: n, value: B.top(cols[a]),
      srcLen: cols[a].length, destLen: cols[b].length,
      t: 0, landed: 0,
      dur: (n - 1) * (C.moveStagger || 0.055) + (C.moveSeconds || 0.34),
    };
    idle = 0; hintMove = null;
    return true;
  }

  function stepMove(dt) {
    var A = anim;
    A.t += dt;
    var f = C.moveSeconds || 0.34, st = C.moveStagger || 0.055;
    var landed = 0;
    for (var k = 0; k < A.n; k++) {
      if ((A.t - k * st) / f >= 1) landed++;
    }
    if (landed > A.landed) {
      views[A.b].pop = 0.8;
      puff(views[A.b].x, coinY(A.b, A.destLen + landed - 1), A.value);
    }
    A.landed = landed;
    if (A.t >= A.dur) {
      B.move(cols, A.a, A.b);
      views[A.a].pop = 0.5;
      anim = null;
      settle();
    }
  }

  /** A column that just filled with ten of a kind gets a beat to be seen. */
  function readyColumn() {
    for (var i = 0; i < cols.length; i++) if (B.topRun(cols[i]).len >= B.RUN) return i;
    return -1;
  }

  /**
   * Runs after anything changes the board. A finished run of ten holds for a
   * moment first — without that beat the merge is over before the player sees
   * what caused it, which is the one rule the ad has to teach.
   */
  function settle() {
    var ready = readyColumn();
    if (ready >= 0 && !hold) {
      hold = { col: ready, t: 0, dur: 0.5 };
      toast(C.readyToast || '10 OF A KIND!');
      return;
    }
    hold = null;
    var events = B.resolve(cols);
    for (var e = 0; e < events.length; e++) mergeFx(events[e]);
    if (events.length) { shake = Math.max(shake, 0.55); flash = 0.5; }
    updateGoal();

    if (phase !== 'play') return;
    if (B.countAtLeast(cols, goal.value) >= goal.count) { levelClear(); return; }
    if (!B.anyMove(cols, false) && B.freeSlots(cols) === 0) {
      toast(C.stuckToast || 'No moves left — resetting');
      setTimeout(function () { if (phase === 'play') resetLevel(); }, 1200);
    }
  }

  function stepHold(dt) {
    hold.t += dt;
    var v = views[hold.col];
    if (Math.random() < 0.5) {
      sparks.push({
        x: v.x + (Math.random() - 0.5) * geom.rx * 2.2,
        y: v.y - geom.th - Math.random() * geom.pitch * B.RUN,
        vx: (Math.random() - 0.5) * 120, vy: -120 - Math.random() * 160,
        r: 3 + Math.random() * 5, col: window.Art.cssOf(B.top(cols[hold.col]), 0.9), life: 0.5,
      });
    }
    if (hold.t >= hold.dur) { hold.t = 0; settle(); }
  }

  function mergeFx(ev) {
    var v = views[ev.col];
    var y = coinY(ev.col, 0) - geom.pitch * 3;
    v.pop = 1;
    rings.push({ x: v.x, y: v.y, r: geom.rx * 0.5, life: 1, col: window.Art.cssOf(ev.to) });
    floaters.push({
      x: v.x, y: y, text: '+' + B.OUT + ' x' + ev.to, size: geom.rx * 0.46,
      col: window.Art.cssOf(ev.to), life: 1.2, vy: -120,
    });
    burst(v.x, y, 26, ev.to);
    if (phase !== 'intro') toast(C.mergeToast || 'MERGE!');
  }

  /* ---------------------------------------------------------- drop helper */

  function doDrop() {
    if (phase !== 'play' || anim || falls.length || hold || dropCd > 0) return;
    var spec = (C.levels || [])[levelIndex] || {};
    if (B.freeSlots(cols) === 0) { toast(C.fullToast || 'Vault is full!'); return; }
    firstInput();

    var count = (C.dropMin || 2) + ((Math.random() * ((C.dropMax || 4) - (C.dropMin || 2) + 1)) | 0);
    var plan = B.dropPlan(cols, count, spec.dropValues || [1, 2]);
    var pending = {};
    for (var i = 0; i < plan.length; i++) {
      var col = plan[i].col;
      pending[col] = (pending[col] || 0) + 1;
      falls.push({
        col: col, value: plan[i].value,
        index: cols[col].length + pending[col] - 1,
        t: 0, delay: i * 0.11, dur: 0.42,
      });
    }
    dropCd = C.dropCooldown || 1.2;
    idle = 0; hintMove = null;
  }

  function stepFalls(dt) {
    for (var i = falls.length - 1; i >= 0; i--) {
      var f = falls[i];
      f.t += dt;
      if (f.t - f.delay >= f.dur) {
        cols[f.col].push(f.value);
        views[f.col].pop = 0.9;
        puff(views[f.col].x, coinY(f.col, f.index), f.value);
        falls.splice(i, 1);
      }
    }
    if (!falls.length && !anim) settle();
  }

  /* -------------------------------------------------------- particles */

  function puff(x, y, v) {
    for (var k = 0; k < 6; k++) {
      sparks.push({
        x: x + (Math.random() - 0.5) * geom.rx * 1.2,
        y: y + geom.th * 0.6,
        vx: (Math.random() - 0.5) * 260, vy: -60 - Math.random() * 160,
        r: 3 + Math.random() * 6, col: window.Art.cssOf(v, 0.9), life: 0.42,
      });
    }
  }

  function burst(x, y, n, v) {
    for (var k = 0; k < n; k++) {
      confetti.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 780, vy: -320 - Math.random() * 540,
        a: Math.random() * 6.28, va: (Math.random() - 0.5) * 12,
        w: 10 + Math.random() * 14, h: 14 + Math.random() * 16,
        col: window.Art.cssOf(v ? v : 1 + ((Math.random() * 5) | 0)), life: 1.2,
      });
    }
  }

  function bigBurst() {
    for (var k = 0; k < 90; k++) {
      confetti.push({
        x: DW * Math.random(), y: DH * (0.2 + Math.random() * 0.4),
        vx: (Math.random() - 0.5) * 820, vy: -420 - Math.random() * 640,
        a: Math.random() * 6.28, va: (Math.random() - 0.5) * 12,
        w: 12 + Math.random() * 16, h: 16 + Math.random() * 18,
        col: window.Art.cssOf(1 + ((Math.random() * 6) | 0)), life: 1.9,
      });
    }
  }

  function stepParticles(dt) {
    var i;
    for (i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.vy += 1400 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0) sparks.splice(i, 1);
    }
    for (i = confetti.length - 1; i >= 0; i--) {
      var c = confetti[i];
      c.vy += 1300 * dt; c.vx *= 0.99;
      c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.va * dt; c.life -= dt;
      if (c.life <= 0 || c.y > DH + 140) confetti.splice(i, 1);
    }
    for (i = floaters.length - 1; i >= 0; i--) {
      var fl = floaters[i];
      fl.y += fl.vy * dt; fl.life -= dt * 0.85;
      if (fl.life <= 0) floaters.splice(i, 1);
    }
    for (i = rings.length - 1; i >= 0; i--) {
      var rg = rings[i];
      rg.r += geom.rx * 3.2 * dt; rg.life -= dt * 1.7;
      if (rg.life <= 0) rings.splice(i, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 2.6);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
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
    var best = -1, bestD = 1e9;
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      var top = v.y - geom.th - CAP * geom.pitch - 30;
      var bot = v.y + geom.rx * window.Art.RY + 40;
      if (y < top || y > bot) continue;
      var dx = Math.abs(x - v.x);
      if (dx > v.pitchX * 0.48) continue;
      if (dx < bestD) { bestD = dx; best = i; }
    }
    return best;
  }

  function firstInput() {
    if (started) return;
    started = true;
    Playable.start();          // real play begins here -> window.gameStart()
    hintEl.hidden = true;
  }

  function onDown(e) {
    var pt = e.touches && e.touches.length ? e.touches[0] : e;
    if (e.cancelable) e.preventDefault();

    if (phase === 'intro') { skipIntro(); return; }
    if (phase !== 'play' || anim || falls.length || hold) return;

    var d = toDesign(pt.clientX, pt.clientY);
    var i = hit(d.x, d.y);
    if (i < 0) { sel = -1; return; }
    handleTap(i);
  }

  function handleTap(i) {
    if (phase !== 'play' || anim || falls.length || hold) return;
    idle = 0; hintMove = null;
    firstInput();

    if (sel < 0) {
      if (cols[i].length) sel = i;
      else views[i].shake = 1;
      return;
    }
    if (sel === i) { sel = -1; return; }
    if (B.canMove(cols, sel, i, false)) {
      startMove(sel, i);
      sel = -1;
    } else {
      views[i].shake = 1;
      sel = cols[i].length ? i : -1;
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
    toastT = 1.4;
  }

  function updateGoal() {
    if (phase === 'intro' || phase === 'card') return;
    var have = Math.min(goal.count, B.countAtLeast(cols, goal.value));
    var next = have + '/' + goal.count;
    if (goalProg.textContent !== next) {
      goalProg.textContent = next;
      goalEl.classList.remove('hit');
      void goalEl.offsetWidth;
      goalEl.classList.add('hit');
    }
  }

  function startIntro() {
    phase = 'intro';
    var demo = C.intro || {};
    cols = B.clone(demo.board || [[1, 1, 1], [1], []]);
    layout();
    demoQueue = (demo.moves || []).slice();
    demoT = 0.75;
    banner.textContent = demo.banner || 'WATCH';
    banner.hidden = false;
    hintText.textContent = demo.hint || '10 OF A KIND = 2 BIGGER COINS';
    hintEl.hidden = false;
  }

  function stepIntro(dt) {
    if (anim || hold) return;
    demoT -= dt;
    if (demoT > 0) return;
    if (demoQueue.length) {
      var m = demoQueue.shift();
      if (startMove(m[0], m[1])) {
        demoT = (C.intro && C.intro.moveDelay || 0.42) + anim.dur;
        return;
      }
    }
    skipIntro();
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
    var spec = (C.levels || [])[levelIndex] || { board: [[1], []], goal: { value: 2, count: 1 } };
    cols = B.clone(spec.board);
    startCols = B.clone(spec.board);
    goal = spec.goal || { value: 3, count: 2 };
    sel = -1; anim = null; falls.length = 0; hold = null; idle = 0; hintMove = null; dropCd = 0;
    phase = 'play';
    layout();

    hud.hidden = false;
    levelPill.textContent = 'VAULT ' + (levelIndex + 1);
    goalLabel.textContent = C.goalLabel || 'COLLECT';
    goalCoin.textContent = String(goal.value);
    goalCoin.style.background = window.Art.cssOf(goal.value);
    goalProg.textContent = '0/' + goal.count;
    goalEl.hidden = false;
    updateGoal();

    hintText.textContent = spec.hint || 'TAP A STACK, THEN WHERE TO PUT IT';
    hintEl.hidden = started;
    dropBtn.hidden = false;
    cornerCta.hidden = !(C.showCornerCta !== false);
  }

  function resetLevel() {
    cols = B.clone(startCols);
    sel = -1; anim = null; falls.length = 0; hold = null; idle = 0; hintMove = null;
    sparks.length = 0;
    layout();
    updateGoal();
  }

  function levelClear() {
    phase = 'clear';
    sel = -1;
    bigBurst();
    toast(C.levelClearText || 'VAULT CLEARED!');
    var last = levelIndex >= (C.levels || []).length - 1;
    setTimeout(function () {
      if (last) win();
      else { levelIndex++; startLevel(); }
    }, 1600);
  }

  function win() {
    phase = 'win';
    hud.hidden = true;
    goalEl.hidden = true;
    hintEl.hidden = true;
    dropBtn.hidden = true;
    cornerCta.hidden = true;
    Playable.end();            // the real end of the playable -> window.gameEnd()
    showCard(C.winBadge || 'RICH', C.winTitle || 'Vault sorted!', C.winText || '',
      C.ctaLabel || 'PLAY NOW', function () { Playable.install('endcard'); });
  }

  /* --------------------------------------------------------------- hint */

  function stepHint(dt) {
    if (phase !== 'play' || anim || falls.length || hold) return;
    idle += dt;
    if (idle < (C.hintAfterSeconds || 4.5)) return;
    if (!hintMove) {
      var m = B.bestMove(cols, goal.value);
      if (m) { hintMove = m; hintT = 0; }
      else { idle = 0; dropBtn.classList.add('ready'); return; }
    }
    hintT += dt / 1.5;
    if (hintT > 1) hintT = 0;
  }

  /* ------------------------------------------------------------- render */

  function drawColumn(i) {
    var v = views[i];
    var vals = valuesOf(i);
    var lift = 0, liftFrom = vals.length;
    if (sel === i && !anim) {
      var run = B.topRun(cols[i]);
      liftFrom = vals.length - run.len;
      lift = geom.rx * 0.18;
    }
    var hinted = hintMove && (i === hintMove[0] || i === hintMove[1]);
    var hot = 0, hotFrom = vals.length;
    if (hold && hold.col === i) {
      hot = 0.55 + 0.45 * Math.sin(hold.t * 22);
      hotFrom = vals.length - B.topRun(cols[i]).len;
    }
    var sh = v.shake > 0 ? Math.sin(v.shake * 34) * geom.rx * 0.10 * v.shake : 0;
    var sc = 1 + 0.08 * v.pop;

    ctx.save();
    ctx.translate(v.x + sh, v.y);
    ctx.scale(sc, sc);
    ctx.translate(-v.x, -v.y);
    window.Art.stack(ctx, {
      x: v.x, y: v.y, rx: geom.rx, th: geom.th, pitch: geom.pitch,
      values: vals, lift: lift, liftFrom: liftFrom, hot: hot, hotFrom: hotFrom,
      glow: sel === i ? 0.9 : 0,
      padGlow: hold && hold.col === i ? 1 : (sel === i ? 1
        : (hinted ? 0.35 + 0.3 * Math.sin(clock * 6) : 0)),
    });
    ctx.restore();

    if (sel === i && vals.length) {
      var run2 = B.topRun(cols[i]);
      if (run2.len > 1) {
        window.Art.pickBadge(ctx, v.x, coinY(i, vals.length - 1) - lift - geom.rx * 0.55,
          geom.rx, run2.len, run2.value);
      }
    }
  }

  function drawFlight() {
    if (!anim) return;
    var A = anim, va = views[A.a], vb = views[A.b];
    var f = C.moveSeconds || 0.34, st = C.moveStagger || 0.055;
    for (var k = 0; k < A.n; k++) {
      var p = clamp((A.t - k * st) / f, 0, 1);
      if (p >= 1) continue;
      var x0 = va.x, y0 = coinY(A.a, A.srcLen - 1 - k) - geom.rx * 0.18;
      var x1 = vb.x, y1 = coinY(A.b, A.destLen + k);
      var e = easeOut(p);
      var x = x0 + (x1 - x0) * e;
      var y = y0 + (y1 - y0) * e - Math.sin(Math.PI * p) * geom.rx * 1.1;
      window.Art.coin(ctx, x, y, geom.rx, geom.th, A.value, {
        face: true, glow: 0.7, scale: 1 + 0.10 * Math.sin(Math.PI * p),
      });
    }
  }

  function drawFalls() {
    for (var i = 0; i < falls.length; i++) {
      var f = falls[i];
      var p = clamp((f.t - f.delay) / f.dur, 0, 1);
      if (f.t < f.delay) continue;
      var v = views[f.col];
      var y1 = coinY(f.col, f.index);
      var y = -geom.rx + (y1 + geom.rx) * easeIn(p);
      window.Art.coin(ctx, v.x, y, geom.rx, geom.th, f.value, { face: true, glow: 0.5 });
    }
  }

  function draw() {
    var dpr = view.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    window.Art.background(ctx, view.w, view.h, clock);

    var sx = shake > 0 ? (Math.random() - 0.5) * 26 * shake : 0;
    var sy = shake > 0 ? (Math.random() - 0.5) * 26 * shake : 0;
    ctx.setTransform(view.s * dpr, 0, 0, view.s * dpr,
      (view.ox + sx * view.s) * dpr, (view.oy + sy * view.s) * dpr);

    window.Art.room(ctx, DW, DH);

    // back row first, so a tall stack overlaps the shelf in front of it
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      window.Art.shelf(ctx, views[row.from].x - geom.rx * 1.7,
        views[row.to].x + geom.rx * 1.7, row.y, geom.rx);
      for (var i = row.from; i <= row.to; i++) drawColumn(i);
    }

    drawFlight();
    drawFalls();

    var k;
    for (k = 0; k < rings.length; k++) {
      window.Art.ring(ctx, rings[k].x, rings[k].y, rings[k].r, rings[k].life * 0.8, rings[k].col);
    }
    for (k = 0; k < sparks.length; k++) window.Art.spark(ctx, sparks[k]);
    for (k = 0; k < confetti.length; k++) window.Art.confettiPiece(ctx, confetti[k]);
    for (k = 0; k < floaters.length; k++) window.Art.floater(ctx, floaters[k]);

    if (flash > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(255,235,170,' + (flash * 0.5).toFixed(3) + ')';
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.setTransform(view.s * dpr, 0, 0, view.s * dpr,
        (view.ox + sx * view.s) * dpr, (view.oy + sy * view.s) * dpr);
    }

    if (hintMove && phase === 'play' && !anim) {
      var a = views[hintMove[0]], b = views[hintMove[1]];
      var ay = coinY(hintMove[0], Math.max(0, cols[hintMove[0]].length - 1));
      var by = coinY(hintMove[1], Math.max(0, cols[hintMove[1]].length - 1));
      var t = hintT < 0.45 ? 0 : clamp((hintT - 0.45) / 0.45, 0, 1);
      var hx = a.x + (b.x - a.x) * easeOut(t);
      var hy = ay + (by - ay) * easeOut(t);
      window.Art.hand(ctx, hx, hy, hintT < 0.45 ? hintT / 0.45 : 1 - t);
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
      if (v.pop > 0) v.pop = Math.max(0, v.pop - dt * 3.2);
      if (v.shake > 0) v.shake = Math.max(0, v.shake - dt * 4);
    }

    if (anim) stepMove(dt);
    else if (hold) stepHold(dt);
    if (falls.length) stepFalls(dt);
    if (phase === 'intro') stepIntro(dt);
    if (phase === 'play') stepHint(dt);
    stepParticles(dt);

    if (dropCd > 0) {
      dropCd = Math.max(0, dropCd - dt);
      var pct = (dropCd / (C.dropCooldown || 1.2)) * 100;
      dropFill.style.width = pct.toFixed(1) + '%';
      dropBtn.classList.toggle('cooling', dropCd > 0);
      if (dropCd === 0) { dropFill.style.width = '0%'; dropBtn.classList.remove('cooling'); }
    }

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
    window.Art.setPalette(C.coinColors ||
      ['#c3d3e2', '#ff9c4a', '#ffcf3a', '#35d986', '#3ab6ff', '#b06bff', '#ff4d6d', '#f4f8ff']);
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', function () { setTimeout(fit, 150); });

    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('mousedown', onDown);

    restartBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (phase === 'play') resetLevel();
    });

    dropBtn.textContent = '';
    dropBtn.appendChild(dropFill);
    dropBtn.appendChild(document.createElement('span'));
    dropBtn.lastChild.className = 'drop-label';
    dropBtn.lastChild.textContent = C.dropLabel || '+ DROP COINS';
    dropBtn.classList.add('ready');
    dropBtn.addEventListener('click', function (e) { e.stopPropagation(); doDrop(); });

    cornerCta.textContent = C.ctaLabel || 'PLAY NOW';
    cornerCta.addEventListener('click', function () { Playable.install('corner'); });

    startIntro();
    requestAnimationFrame(frame);
    Playable.ready();
  }

  /* ---- headless test hook: only with ?e2e=1, never active in a shipped ad ---- */
  if (/[?&]e2e=1/.test(window.location.search)) {
    window.CS = {
      phase: function () { return phase; },
      busy: function () { return !!anim || !!hold || falls.length > 0; },
      cols: function () { return B.clone(cols); },
      views: function () { return views; },
      level: function () { return levelIndex; },
      goal: function () { return goal; },
      best: function () { return B.bestMove(cols, goal.value); },
      tap: handleTap,
      drop: function () { dropCd = 0; doDrop(); },
      skip: skipIntro,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
