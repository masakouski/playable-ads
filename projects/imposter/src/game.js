/**
 * game.js — Imposter playable: scripted clue round, one vote, end card.
 *
 *   intro (wide) → cut to player 1 + clue bubble → cut to player 2 + clue bubble
 *   → wide shot + "Who is the imposter?" with Alex / Max / Keep playing
 *   → outcome sequence → end card (CTA opens the store)
 */
(function () {
  'use strict';

  var CFG = window.PLAYABLE_CONFIG;
  var ART = window.ImposterArt;
  var SVGNS = 'http://www.w3.org/2000/svg';

  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage');
  var world = $('world');
  var root = document.documentElement;

  var phase = 'boot';      // boot → clues → question → outcome → end
  var chosen = null;
  var resolveChoice = null;

  /* ---------------- sizing ---------------- */

  function fit() {
    var r = stage.getBoundingClientRect();
    root.style.setProperty('--u', (Math.min(r.width, r.height) / 100) + 'px');
    if (!cam.anim && cam.shot) applyView(frame(cam.shot));
  }

  /* ---------------- camera (animated viewBox) ----------------
   * A shot keeps the focus point (fx,fy) at screen fraction (sx,sy) while
   * showing at least w × h world units, whatever the screen aspect. */

  var SHOTS = {
    wide:     { fx: 500, fy: 440, sx: 0.5, sy: 0.46, w: 800, h: 760 },
    p1:       { fx: 300, fy: 360, sx: 0.5, sy: 0.40, w: 620, h: 640 },
    p2:       { fx: 700, fy: 360, sx: 0.5, sy: 0.40, w: 620, h: 640 },
    // end shots leave room for the end card: below in portrait, on the right in landscape
    endWide:  { fx: 500, fy: 380, sx: 0.5, sy: 0.30, w: 800, h: 700, land: { fy: 430, sx: 0.3, sy: 0.45, h: 820 } },
    endP1:    { fx: 300, fy: 330, sx: 0.5, sy: 0.28, w: 640, h: 620, land: { fy: 380, sx: 0.3, sy: 0.45, h: 700 } },
  };
  var cam = { view: null, shot: null, anim: null };

  function aspect() {
    var r = stage.getBoundingClientRect();
    return r.width / Math.max(1, r.height);
  }
  function frame(s) {
    var a = aspect();
    if (a > 1.2 && s.land) {
      var m = {};
      for (var k in s) m[k] = s[k];
      for (var j in s.land) m[j] = s.land[j];
      s = m;
    }
    var w = Math.max(s.w, s.h * a);
    var h = w / a;
    return { x: s.fx - s.sx * w, y: s.fy - s.sy * h, w: w, h: h };
  }
  function applyView(v) {
    cam.view = v;
    world.setAttribute('viewBox', v.x.toFixed(2) + ' ' + v.y.toFixed(2) + ' ' + v.w.toFixed(2) + ' ' + v.h.toFixed(2));
  }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function moveCamera(name, ms) {
    var shot = SHOTS[name];
    cam.shot = shot;
    var from = cam.view, to = frame(shot);
    ms = ms == null ? CFG.cameraMs : ms;
    if (!from || ms <= 0) { applyView(to); return Promise.resolve(); }
    return new Promise(function (done) {
      var t0 = performance.now();
      cam.anim = true;
      (function step(now) {
        var t = Math.min(1, (now - t0) / ms);
        var k = ease(t);
        to = frame(shot); // follows a resize mid-move
        applyView({
          x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k,
          w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k,
        });
        if (t < 1) requestAnimationFrame(step);
        else { cam.anim = null; done(); }
      })(t0);
    });
  }

  /* ---------------- scene helpers ---------------- */

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function person(id) { return $(id); }
  function setState(id, cls, on) { person(id).classList.toggle(cls, on !== false); }

  function badge(id, text, innocent) {
    var p = person(id);
    p.querySelector('.badge-text').textContent = text;
    p.classList.toggle('innocent', !!innocent);
    p.classList.remove('badged');
    void p.getBoundingClientRect();
    p.classList.add('badged');
  }

  function el(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  var bubbles = {};

  /* kind: 'speech' | 'think' */
  function showBubble(id, text, kind) {
    hideBubble(id);
    var dir = id === 'p1' ? 1 : -1;
    var hx = ART.SEATS[id];
    var bx = hx + dir * 55;
    var by = ART.HEAD_Y - 138;

    var g = el('g', { 'class': 'bubble', transform: 'translate(' + bx + ' ' + by + ')' });
    var pop = el('g', { 'class': 'pop' }, g);
    pop.style.setProperty('--ox', dir > 0 ? '30%' : '70%');
    $('bubbles').appendChild(g);

    var t = el('text', { 'class': 'svg-font bubble-text' + (kind === 'think' ? ' think-dots' : ''), 'text-anchor': 'middle', 'font-size': 64, x: 0, y: -48 });
    if (kind === 'think') {
      for (var i = 0; i < text.length; i++) {
        var ts = document.createElementNS(SVGNS, 'tspan');
        ts.textContent = text[i];
        t.appendChild(ts);
      }
    } else {
      t.textContent = text;
    }
    pop.appendChild(t);
    var tw = 0;
    try { tw = t.getComputedTextLength(); } catch (e) { /* not rendered yet */ }
    if (!tw) tw = text.length * 36;
    var w = Math.max(190, tw + 80), h = 116;

    var shape;
    if (kind === 'think') {
      shape = el('g', {});
      el('rect', { x: -w / 2, y: -h - 10, width: w, height: h + 10, rx: 60, fill: '#fff', stroke: '#1b1030', 'stroke-width': 7 }, shape);
      el('circle', { cx: -dir * 20, cy: 32, r: 18, fill: '#fff', stroke: '#1b1030', 'stroke-width': 6 }, shape);
      el('circle', { cx: -dir * 42, cy: 66, r: 10, fill: '#fff', stroke: '#1b1030', 'stroke-width': 5 }, shape);
    } else {
      var tx = -dir * 30;
      shape = el('g', {});
      el('path', { d: 'M' + (tx - 22) + ' -8 L' + (tx - dir * 38) + ' 62 L' + (tx + 22) + ' -8Z', fill: '#fff', stroke: '#1b1030', 'stroke-width': 7, 'stroke-linejoin': 'round' }, shape);
      el('rect', { x: -w / 2, y: -h, width: w, height: h, rx: 36, fill: '#fff', stroke: '#1b1030', 'stroke-width': 7 }, shape);
      el('rect', { x: tx - 18, y: -6, width: 36, height: 11, fill: '#fff' }, shape); // hides the seam over the tail
    }
    pop.insertBefore(shape, t);
    bubbles[id] = g;
    return g;
  }
  function hideBubble(id) {
    if (bubbles[id]) { bubbles[id].remove(); bubbles[id] = null; }
  }

  function banner(text, ms) {
    var b = $('banner');
    b.textContent = text;
    b.className = 'banner';
    b.hidden = false;
    return wait(ms).then(function () {
      b.classList.add('out');
      return wait(300);
    }).then(function () { b.hidden = true; });
  }

  /* ---------------- timer ---------------- */

  var timer = { total: CFG.roundSeconds, left: CFG.roundSeconds, running: false, last: 0, drain: null, onZero: null };
  var RING = 119.4;

  function paintTimer() {
    var s = Math.max(0, Math.ceil(timer.left));
    $('timerText').textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    $('timerRing').style.strokeDashoffset = (RING * (1 - Math.max(0, timer.left) / timer.total)).toFixed(2);
    $('timer').classList.toggle('warn', timer.left <= 5 && timer.left > 0);
  }
  function tickTimer(now) {
    if (!timer.running) return;
    var dt = (now - timer.last) / 1000;
    timer.last = now;
    if (timer.drain) {
      var t = Math.min(1, (now - timer.drain.t0) / timer.drain.ms);
      timer.left = timer.drain.from * (1 - t);
      if (t >= 1) { var d = timer.drain.done; timer.drain = null; timer.running = false; timer.left = 0; paintTimer(); d(); return; }
    } else {
      timer.left -= dt;
      if (timer.left <= 0) {
        timer.left = 0; timer.running = false; paintTimer();
        if (timer.onZero) timer.onZero();
        return;
      }
    }
    paintTimer();
    requestAnimationFrame(tickTimer);
  }
  function startTimer() {
    timer.running = true;
    timer.last = performance.now();
    requestAnimationFrame(tickTimer);
  }
  function stopTimer() { timer.running = false; timer.drain = null; $('timer').classList.remove('warn'); }
  function drainTimer(ms) {
    return new Promise(function (done) {
      timer.drain = { t0: performance.now(), ms: ms, from: timer.left, done: done };
      if (timer.left <= 0) { timer.drain = null; done(); return; }
      if (!timer.running) startTimer();
    });
  }

  /* ---------------- flow ---------------- */

  async function clue(id) {
    await moveCamera(id);
    setState(id, 'talking');
    showBubble(id, CFG.players[id].word, 'speech');
    await wait(750);
    setState(id, 'talking', false);
    await wait(Math.max(0, CFG.clueHoldMs - 750));
  }

  async function run() {
    moveCamera('wide', 0);
    await wait(250);
    Playable.ready();
    await banner(CFG.introBanner, CFG.introMs);

    phase = 'clues';
    startTimer();
    await clue('p1');
    await clue('p2');
    await moveCamera('wide');

    phase = 'question';
    stage.classList.add('dim', 'questioning');
    $('question').hidden = false;
    $('choices').hidden = false;

    var key = await new Promise(function (resolve) {
      resolveChoice = resolve;
      timer.onZero = function () { resolve('timeout'); };
    });
    resolveChoice = null;
    timer.onZero = null;
    chosen = key;

    phase = 'outcome';
    $('question').hidden = true;
    $('choices').hidden = true;
    stage.classList.remove('questioning');

    if (key === 'p1') await outcomeCaught();
    else if (key === 'p2') await outcomeWrongVote();
    else await outcomeKeepPlaying(key === 'timeout');

    showEnd(key === 'timeout' ? 'keep' : key);
  }

  async function outcomeCaught() {
    stopTimer();
    stage.classList.remove('dim');
    hideBubble('p2');
    await moveCamera('p1', 650);
    hideBubble('p1');
    setState('p1', 'shocked');
    badge('p1', 'IMPOSTER');
    confetti();
    await wait(900);
    await moveCamera('endP1', 600);
  }

  async function outcomeWrongVote() {
    stopTimer();
    hideBubble('p1');
    await moveCamera('p2', 650);
    hideBubble('p2');
    badge('p2', 'INNOCENT', true);
    setState('p2', 'shocked');
    await wait(900);
    await moveCamera('p1', 700);
    setState('p1', 'evil');
    badge('p1', 'IMPOSTER');
    await wait(800);
    await moveCamera('endWide', 600);
  }

  async function outcomeKeepPlaying(alreadyZero) {
    stage.classList.remove('dim');
    hideBubble('p2');
    await moveCamera('p1', 700);
    setState('p1', 'thinking');
    showBubble('p1', '???', 'think');
    if (!alreadyZero) await drainTimer(CFG.keepPlayingDrainMs);
    else await wait(900);
    stopTimer();
    $('stamp').hidden = false;
    await wait(1100);
    $('stamp').hidden = true;
    hideBubble('p1');
    setState('p1', 'thinking', false);
    setState('p1', 'evil');
    badge('p1', 'IMPOSTER');
    await moveCamera('endP1', 650);
  }

  function showEnd(key) {
    var o = CFG.outcomes[key];
    phase = 'end';
    stage.classList.add('ended');
    $('endTitle').textContent = o.title;
    $('endSub').textContent = o.sub || '';
    $('ctaBtn').textContent = o.cta || CFG.ctaLabel;
    $('end').classList.toggle('win', !!o.win);
    $('end').hidden = false;
    Playable.end();
  }

  function confetti() {
    var box = $('confetti');
    var colors = ['#ff3b5c', '#ffd166', '#22c7b8', '#ff8a2a', '#9f7bff', '#3ee07f'];
    for (var i = 0; i < 70; i++) {
      var c = document.createElement('i');
      c.style.left = (Math.random() * 100) + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (1.8 + Math.random() * 1.8) + 's';
      c.style.animationDelay = (Math.random() * 0.6) + 's';
      c.style.setProperty('--dx', ((Math.random() - 0.5) * 120) + 'px');
      c.style.setProperty('--rot', ((Math.random() - 0.5) * 1440) + 'deg');
      box.appendChild(c);
    }
  }

  function choose(key) {
    if (phase !== 'question' || !resolveChoice) return;
    Playable.start();
    resolveChoice(key);
  }

  /* ---------------- boot ---------------- */

  function init() {
    world.innerHTML = ART.scene();
    ['p1', 'p2'].forEach(function (id) {
      $(id + '-front').querySelector('.name').textContent = CFG.players[id].name;
    });
    $('logoText').textContent = CFG.appName.toUpperCase();
    $('taglineText').textContent = CFG.tagline;
    $('secretWord').textContent = CFG.secretWord;
    $('question').textContent = CFG.question;
    $('voteP1').querySelector('span').textContent = CFG.players.p1.name;
    $('voteP2').querySelector('span').textContent = CFG.players.p2.name;
    $('keepBtn').textContent = CFG.keepPlayingLabel;
    paintTimer();

    $('voteP1').addEventListener('click', function () { choose('p1'); });
    $('voteP2').addEventListener('click', function () { choose('p2'); });
    $('keepBtn').addEventListener('click', function () { choose('keep'); });
    $('ctaBtn').addEventListener('click', function () { Playable.install('endcard'); });

    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', function () { setTimeout(fit, 150); });
    document.addEventListener('touchmove', function (e) {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });

    fit();
    run();
  }

  /* ---- headless test hook: only with ?e2e=1, never active in a shipped ad ---- */
  if (/[?&]e2e=1/.test(window.location.search)) {
    window.IMP = {
      phase: function () { return phase; },
      chosen: function () { return chosen; },
      timeLeft: function () { return timer.left; },
      choose: choose,
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
