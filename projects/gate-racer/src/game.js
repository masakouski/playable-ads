/**
 * game.js — Gate Racer 3D.
 *
 * Flow:
 *   boot  -> demo  (scripted, NOT controllable: the car takes one green gate,
 *                   then two red ones and loses the race to the rival)
 *         -> demoOver ("Think you can do better?", LET ME RACE)
 *         -> race  (drag to steer, pick a gate out of every pair)
 *         -> cine  (win: burnout spin / lose: the rival drives off)
 *         -> end card (score vs rival + CTA)
 *   an empty tank during `race` short-circuits to `stall` -> OUT OF FUEL card.
 *
 * Note on the SDK: the demo's defeat is a *narrative* one. window.gameStart()
 * fires when the player's own race begins and window.gameEnd() only when that
 * race is over — firing them during the attract loop would report a play the
 * user never had.
 */
(function () {
  'use strict';

  var C = window.PLAYABLE_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };

  var stage = $('stage'), canvas = $('gl');
  var hud = $('hud'), pointsEl = $('points'), targetEl = $('target');
  var fuelEl = $('fuel'), fuelFill = $('fuelFill');
  var trackFill = $('trackFill'), trackCar = $('trackCar');
  var speedo = $('speedo'), kmhEl = $('kmh');
  var banner = $('banner'), hint = $('hint'), hintText = $('hintText');
  var gateLabels = $('gateLabels'), pops = $('pops'), flash = $('flash');
  var overlay = $('overlay'), card = $('card'), cardBadge = $('cardBadge');
  var cardTitle = $('cardTitle'), cardText = $('cardText'), cardTally = $('cardTally');
  var tallyYou = $('tallyYou'), tallyRival = $('tallyRival');
  var tallyYouLabel = $('tallyYouLabel'), tallyRivalLabel = $('tallyRivalLabel');
  var cardBtn = $('cardBtn'), cardBtn2 = $('cardBtn2');
  var cornerCta = $('cornerCta'), speedLines = $('speedLines');

  /* ------------------------------------------------------------ utilities */

  function col(hex) {
    return [
      parseInt(hex.substr(1, 2), 16) / 255,
      parseInt(hex.substr(3, 2), 16) / 255,
      parseInt(hex.substr(5, 2), 16) / 255,
    ];
  }
  function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = rng(20260904);
  function rr(a, b) { return a + rand() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function approach(v, t, k) { return v + (t - v) * Math.min(1, k); }

  /* --------------------------------------------------------------- colours */

  var GOOD = col('#2fd166'), BAD = col('#ff3b46');
  var TARMAC = col('#2b3340');
  var PALETTE = {
    leaf: ['#3f8f4d', '#4f9d4f', '#357f45', '#5aa84e'],
    trunk: '#7a5230',
    hill: ['#7fa9c9', '#8fb6d2', '#749fbe'],
  };

  /* ------------------------------------------------------------ car models
   * Parts are local to the car (origin on the road, car faces +Z). They are
   * drawn through a composed matrix so the car can yaw and roll properly.
   */

  function part(mesh, p, s, c, r, glow, mode, alpha) {
    return {
      mesh: mesh, p: p, s: s, c: c, r: r || [0, 0, 0],
      ns: [1 / s[0], 1 / s[1], 1 / s[2]],   // normal matrix scale, see engine.js
      glow: glow || 0, mode: mode || 0, alpha: alpha === undefined ? 1 : alpha,
    };
  }

  function carModel(bodyHex, trimHex) {
    var b = col(bodyHex), d = shade(b, 0.68), trim = col(trimHex);
    var glass = col('#6fbde2'), dark = col('#1b1e25'), chrome = col('#cfd8e2');
    var stripe = col('#f7f9fb');
    var head = col('#fff6cf'), tail = col('#ff2a20');
    return {
      parts: [
        part('box', [0, 0.68, 0], [1.86, 0.58, 4.5], b),
        part('box', [0, 0.42, 0], [1.72, 0.30, 4.2], d),
        part('box', [0, 0.56, 0], [2.0, 0.16, 2.9], d),
        part('box', [0, 1.14, -0.5], [1.64, 0.58, 2.1], b),
        part('box', [0, 1.16, -0.5], [1.72, 0.40, 1.72], glass),
        part('box', [0, 1.42, -0.55], [1.58, 0.16, 1.9], b),
        part('box', [-0.3, 1.5, -0.55], [0.2, 0.05, 1.8], stripe),
        part('box', [0.3, 1.5, -0.55], [0.2, 0.05, 1.8], stripe),
        part('box', [-0.3, 0.98, 1.35], [0.2, 0.05, 1.7], stripe),
        part('box', [0.3, 0.98, 1.35], [0.2, 0.05, 1.7], stripe),
        part('box', [0, 1.04, 0.92], [1.62, 0.52, 0.9], glass, 0, 0, 1),
        part('box', [0, 1.34, -1.98], [1.92, 0.13, 0.52], trim),
        part('box', [-0.78, 1.14, -1.96], [0.15, 0.36, 0.3], dark),
        part('box', [0.78, 1.14, -1.96], [0.15, 0.36, 0.3], dark),
        part('box', [0, 0.92, 2.28], [1.46, 0.24, 0.14], chrome),
        part('box', [0, 0.44, 2.24], [1.9, 0.22, 0.2], trim),
        part('box', [-0.66, 0.76, 2.3], [0.5, 0.22, 0.12], head, 0.75),
        part('box', [0.66, 0.76, 2.3], [0.5, 0.22, 0.12], head, 0.75),
        part('box', [-0.66, 0.9, -2.3], [0.48, 0.2, 0.12], tail, 0.55),
        part('box', [0.66, 0.9, -2.3], [0.48, 0.2, 0.12], tail, 0.55),
      ],
      wheels: [[-0.96, 0.44, 1.5], [0.96, 0.44, 1.5], [-0.96, 0.44, -1.55], [0.96, 0.44, -1.55]],
      tyre: dark,
      rim: col('#e2e8ef'),
    };
  }

  /* ---------------------------------------------------------------- state */

  var R = null, minSide = 320;
  var W = C.roadHalf || 6, LIMIT = C.laneLimit || 5;

  var phase = 'boot';
  var run = null;                  // the active run config (demo or race)
  var gates = [], props = [], propStart = 0, debris = [], puffs = [];
  var car = { x: 0, y: 0, z: 0, yaw: 0, roll: 0, spin: 0, v: 0 };
  var rival = { x: 3, y: 0, z: 0, yaw: 0, roll: 0, spin: 0, v: 0 };
  var cam = { x: 0, y: 6, z: -12, lx: 0, ly: 2, lz: 10, shake: 0, ang: 0, dist: 13 };
  var points = 0, fuel = 100, finishZ = 800, rivalPoints = 0;
  var cine = null, stallT = 0, cardShown = false, hintShown = false;
  var demoIdx = 0, auto = null;
  var mine = null, theirs = null, rivalLabel = null;

  /**
   * The camera looks down +Z with Y up, so in a right-handed world +X ends up
   * on the LEFT of the screen. Everything the player reads as "left" therefore
   * lives at +x. One helper owns that flip: side -1 = screen-left, +1 = right.
   */
  function laneX(side) { return -side * (W / 2); }
  function sideX(i) { return i === 0 ? W / 2 : -W / 2; }

  /* ------------------------------------------------------------- the world */

  function label(kind, value) {
    var good, big, small;
    if (kind === 'mul') {
      good = value >= 1;
      big = good ? '×' + value : '÷' + Math.round(1 / value);
      small = 'POINTS';
    } else if (kind === 'add') {
      good = value >= 0;
      big = (good ? '+' : '−') + Math.abs(value);
      small = 'POINTS';
    } else if (kind === 'fuel') {
      good = value >= 0;
      big = (good ? '+' : '−') + Math.abs(value);
      small = 'FUEL';
    } else {
      good = value >= 0;
      big = good ? 'BOOST' : 'BRAKE';
      small = good ? '+SPEED' : '−SPEED';
    }
    return { good: good, big: big, small: small };
  }

  function makeGate(def) {
    var sides = [def.left, def.right].map(function (s) {
      var l = label(s.k, s.v);
      var el = document.createElement('div');
      el.className = 'glabel ' + (l.good ? 'good' : 'bad');
      el.innerHTML = '<b></b><em></em>';
      el.firstChild.textContent = l.big;
      el.lastChild.textContent = l.small;
      el.hidden = true;
      gateLabels.appendChild(el);
      return { k: s.k, v: s.v, good: l.good, el: el };
    });
    return { z: def.z, sides: sides, done: false };
  }

  function genProps(len) {
    var out = [], z, i;
    var railColor = col('#c8ced6'), poleColor = col('#8b939c');
    for (z = -80; z < len + 220; z += 40) {
      // guard rails on both shoulders, one long box per 40 units
      out.push({ z: z, list: [
        { mesh: 'box', x: -(W + 1.7), y: 0.85, z: z + 20, sx: 0.28, sy: 0.5, sz: 38, color: railColor },
        { mesh: 'box', x: (W + 1.7), y: 0.85, z: z + 20, sx: 0.28, sy: 0.5, sz: 38, color: railColor },
        { mesh: 'box', x: -(W + 1.7), y: 0.45, z: z + 20, sx: 0.2, sy: 0.9, sz: 0.2, color: poleColor },
        { mesh: 'box', x: (W + 1.7), y: 0.45, z: z + 20, sx: 0.2, sy: 0.9, sz: 0.2, color: poleColor },
      ] });
    }
    for (z = -40; z < len + 220; z += 17) {
      var side = rand() < 0.5 ? -1 : 1;
      var x = side * (W + 5 + rand() * 16);
      var h = rr(2.6, 4.6), leaf = col(PALETTE.leaf[(rand() * PALETTE.leaf.length) | 0]);
      out.push({ z: z, list: [
        { mesh: 'cyl', x: x, y: h * 0.3, z: z, sx: 0.5, sy: h * 0.6, sz: 0.5, color: col(PALETTE.trunk) },
        { mesh: 'cone', x: x, y: h * 0.95, z: z, sx: h * 0.95, sy: h * 1.25, sz: h * 0.95, color: leaf },
      ] });
    }
    for (z = 30; z < len + 220; z += 62) {
      out.push({ z: z, list: [
        { mesh: 'cyl', x: -(W + 3.2), y: 3.2, z: z, sx: 0.3, sy: 6.4, sz: 0.3, color: poleColor },
        { mesh: 'box', x: -(W + 2.1), y: 6.3, z: z, sx: 2.4, sy: 0.22, sz: 0.3, color: poleColor },
        { mesh: 'box', x: -(W + 1.1), y: 6.1, z: z, sx: 0.9, sy: 0.3, sz: 0.6, color: col('#ffeaa8') },
      ] });
    }
    for (z = -100; z < len + 400; z += 190) {                    // distant hills
      for (i = 0; i < 4; i++) {
        var hx = (i < 2 ? -1 : 1) * rr(150, 300), hh = rr(22, 46);
        out.push({ z: z + i * 26, list: [{
          mesh: 'cone', x: hx, y: hh * 0.45, z: z + i * 26,
          sx: hh * 2.6, sy: hh, sz: hh * 2.6,
          color: col(PALETTE.hill[(rand() * PALETTE.hill.length) | 0]),
        }] });
      }
    }
    out.sort(function (a, b) { return a.z - b.z; });
    out.forEach(function (g) {                 // precompute normal scales once
      g.list.forEach(function (o) { o.ns = [1 / o.sx, 1 / o.sy, 1 / o.sz]; });
    });
    return out;
  }

  function buildRun(cfg) {
    gateLabels.innerHTML = '';
    gates = cfg.gates.map(makeGate);
    finishZ = cfg.finishZ;
    rivalPoints = cfg.rivalPoints;
    props = genProps(finishZ);
    propStart = 0;
    debris.length = 0; puffs.length = 0;
    car.x = 0; car.y = 0; car.z = -18; car.yaw = 0; car.roll = 0; car.spin = 0;
    car.v = cfg.speed || C.baseSpeed || 36;
    rival.x = laneX(1); rival.z = finishZ + 34; rival.yaw = 0; rival.v = 0; rival.spin = 0;
    points = C.startPoints || 10;
    fuel = C.fuelMax || 100;
    cam.z = car.z - 13; cam.x = 0; cam.ang = 0; cam.shake = 0;
    cine = null; cardShown = false; demoIdx = 0; auto = null;

    if (rivalLabel) rivalLabel.remove();
    rivalLabel = document.createElement('div');
    rivalLabel.className = 'glabel rival';
    rivalLabel.innerHTML = '<b></b><em></em>';
    rivalLabel.firstChild.textContent = rivalPoints;
    rivalLabel.lastChild.textContent = C.rivalLabel || 'RIVAL';
    rivalLabel.hidden = true;
    gateLabels.appendChild(rivalLabel);

    targetEl.textContent = rivalPoints;
    syncHud();
  }

  /* ------------------------------------------------------------- feedback */

  function pop(text, bad) {
    var el = document.createElement('div');
    el.className = 'pop' + (bad ? ' bad' : '');
    el.textContent = text;
    pops.appendChild(el);
    setTimeout(function () { el.remove(); }, 820);
  }

  function screenFlash(bad) {
    flash.classList.remove('good', 'bad');
    void flash.offsetWidth;
    flash.classList.add(bad ? 'bad' : 'good');
  }

  function shatter(x, z, c) {
    for (var i = 0; i < 16; i++) {
      debris.push({
        x: x + rr(-2.4, 2.4), y: rr(0.4, 4.6), z: z + rr(-0.3, 0.3),
        vx: rr(-7, 7), vy: rr(3, 11), vz: rr(-3, 9),
        rx: rr(0, 6), ry: rr(0, 6), rz: rr(0, 6),
        sx: rr(0.25, 0.6), sy: rr(0.25, 0.6), sz: rr(0.08, 0.2),
        c: c, life: 1.5,
      });
    }
  }

  function puff(x, y, z, big) {
    puffs.push({
      x: x, y: y, z: z, vx: rr(-1.6, 1.6), vy: rr(1.2, 3.4), vz: rr(-3, -0.5),
      s: big ? rr(0.9, 1.6) : rr(0.5, 1.0), life: 1, t: 0,
    });
  }

  /* ------------------------------------------------------------------ HUD */

  function syncHud() {
    pointsEl.textContent = Math.round(points);
    var f = clamp(fuel / (C.fuelMax || 100), 0, 1);
    fuelFill.style.width = (f * 100) + '%';
    fuelEl.classList.toggle('low', f < 0.25);
    var t = clamp((car.z + 18) / (finishZ + 18), 0, 1);
    trackFill.style.width = (t * 100) + '%';
    trackCar.style.left = (t * 100) + '%';
    kmhEl.textContent = Math.round(car.v * (C.kmhPerUnit || 3.2));
    var over = clamp((car.v - (C.baseSpeed || 36)) / ((C.maxSpeed || 78) - (C.baseSpeed || 36)), 0, 1);
    speedLines.style.opacity = (over * 0.75).toFixed(2);
  }

  function bumpPoints() {
    pointsEl.classList.remove('bump');
    void pointsEl.offsetWidth;
    pointsEl.classList.add('bump');
  }

  function showCard(badge, title, text, main, second, tally) {
    cardBadge.textContent = badge || '';
    cardBadge.hidden = !badge;
    cardBadge.classList.toggle('good', !!(tally && tally.win));
    cardTitle.textContent = title;
    cardText.textContent = text;
    if (tally) {
      cardTally.hidden = false;
      cardTally.className = 'tally ' + (tally.win ? 'win' : 'lose');
      tallyYou.textContent = Math.round(tally.you);
      tallyRival.textContent = tally.rival;
      tallyYouLabel.textContent = C.youLabel || 'YOU';
      tallyRivalLabel.textContent = C.rivalLabel || 'RIVAL';
    } else {
      cardTally.hidden = true;
    }
    cardBtn.textContent = main.label;
    cardBtn.onclick = main.fn;
    if (second) {
      cardBtn2.hidden = false;
      cardBtn2.textContent = second.label;
      cardBtn2.onclick = second.fn;
    } else {
      cardBtn2.hidden = true;
    }
    overlay.hidden = false;
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');
  }

  /* ----------------------------------------------------------- run control */

  function startDemo() {
    phase = 'demo';
    buildRun(C.demo);
    overlay.hidden = true;
    hud.hidden = false;
    speedo.hidden = false;
    hint.hidden = true;
    cornerCta.hidden = true;
    banner.textContent = C.demoBannerText || 'WATCH';
    banner.hidden = false;
  }

  function startRace() {
    phase = 'race';
    buildRun(C.race);
    car.v = C.baseSpeed || 36;
    overlay.hidden = true;
    banner.hidden = true;
    hud.hidden = false;
    speedo.hidden = false;
    hint.hidden = false;
    hintShown = true;
    cornerCta.hidden = !C.showCornerCta;
    Playable.start();          // the player's own race -> window.gameStart()
  }

  function beginCine(win, demo) {
    phase = 'cine';
    banner.hidden = true;
    hint.hidden = true;
    cine = { t: 0, win: win, demo: !!demo, spinV: win ? 7.5 : 0 };
    if (!demo) Playable.end();  // the real end of the playable -> window.gameEnd()
  }

  function outOfFuel() {
    phase = 'stall';
    stallT = 0;
    hint.hidden = true;
    screenFlash(true);
    cam.shake = 0.8;
    Playable.end();
  }

  function endCard() {
    if (phase === 'stall') {
      showCard('OUT OF FUEL', C.fuelTitle, C.fuelText,
        { label: C.ctaLabel || 'PLAY NOW', fn: function () { Playable.install('endcard'); } },
        { label: C.retryLabel || 'TRY AGAIN', fn: startRace },
        { you: points, rival: rivalPoints, win: false });
      return;
    }
    if (cine.demo) {
      showCard('', C.demoOverTitle, C.demoOverText,
        { label: C.demoOverBtn || 'LET ME RACE', fn: startRace },
        null,
        { you: points, rival: rivalPoints, win: false });
      return;
    }
    var win = cine.win;
    showCard(win ? 'YOU WIN' : 'DEFEAT',
      win ? C.winTitle : C.loseTitle,
      win ? C.winText : C.loseText,
      { label: C.ctaLabel || 'PLAY NOW', fn: function () { Playable.install('endcard'); } },
      { label: C.retryLabel || 'TRY AGAIN', fn: startRace },
      { you: points, rival: rivalPoints, win: win });
  }

  /* --------------------------------------------------------------- driving */

  function applySide(g, si) {
    var s = g.sides[si];
    var px = sideX(si);
    shatter(px, g.z, s.good ? GOOD : BAD);
    screenFlash(!s.good);
    if (s.k === 'mul') {
      points = Math.max(1, Math.round(points * s.v));
      pop(s.good ? '×' + s.v : '÷' + Math.round(1 / s.v), !s.good);
    } else if (s.k === 'add') {
      points = Math.max(0, points + s.v);
      pop((s.v > 0 ? '+' : '−') + Math.abs(s.v), !s.good);
    } else if (s.k === 'fuel') {
      fuel = clamp(fuel + s.v, 0, C.fuelMax || 100);
      pop('FUEL ' + (s.v > 0 ? '+' : '−') + Math.abs(s.v), !s.good);
    } else {
      car.v = clamp(car.v + s.v, C.minSpeed || 18, C.maxSpeed || 78);
      pop(s.good ? 'BOOST!' : 'BRAKE!', !s.good);
    }
    if (s.k !== 'fuel') bumpPoints();
    if (!s.good) cam.shake = 0.75;
    g.sides[0].el.hidden = true;
    g.sides[1].el.hidden = true;
  }

  function checkGates(prevZ) {
    for (var i = 0; i < gates.length; i++) {
      var g = gates[i];
      if (g.done || g.z > car.z || g.z <= prevZ) continue;
      g.done = true;
      applySide(g, car.x > 0 ? 0 : 1);   // +x is the left half of the screen
    }
  }

  var drag = null, keys = {}, steerIn = 0;

  function toPoint(e) {
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    var r = stage.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function onDown(e) {
    if (phase !== 'race') return;
    var p = toPoint(e);
    drag = { x: p.x, ox: p.x };
    e.preventDefault();
  }
  function onMove(e) {
    if (phase !== 'race' || !drag) return;
    var p = toPoint(e);
    drag.x = p.x;
    if (hintShown && Math.abs(p.x - drag.ox) > 10) { hintShown = false; hint.hidden = true; }
    e.preventDefault();
  }
  function onUp() { drag = null; }

  function steer(dt) {
    var wx = 0;                                  // wanted velocity along world x
    if (auto !== null) {
      wx = clamp((auto - car.x) * 0.6, -1, 1);
    } else {
      var sx = 0;                                // screen direction: +1 = right
      if (drag) {
        var reach = minSide * 0.16;
        sx = clamp((drag.x - drag.ox) / reach, -1, 1);
        var maxLen = minSide * 0.2;              // let the anchor trail the finger
        if (Math.abs(drag.x - drag.ox) > maxLen) {
          drag.ox = drag.x - (drag.x > drag.ox ? maxLen : -maxLen);
        }
      }
      if (keys.ArrowLeft || keys.a) sx = -1;
      if (keys.ArrowRight || keys.d) sx = 1;
      wx = -sx;
    }
    steerIn = approach(steerIn, wx, dt * 9);
    car.x = clamp(car.x + steerIn * (C.steerSpeed || 24) * dt, -LIMIT, LIMIT);
    car.roll = approach(car.roll, steerIn * 0.10, dt * 8);
    car.yaw = approach(car.yaw, steerIn * 0.13, dt * 8);
  }

  function demoSteer() {
    var picks = (C.demo && C.demo.picks) || [];
    var i, target = 0;
    for (i = 0; i < gates.length; i++) {
      if (!gates[i].done) { target = laneX(picks[i] === undefined ? 0 : picks[i]); break; }
    }
    if (i >= gates.length) target = rival.x;    // line up next to the rival at the end
    auto = target;
  }

  /* ------------------------------------------------------------ simulation */

  function stepDrive(dt) {
    var prevZ = car.z;
    car.z += car.v * dt;
    car.spin += car.v * dt * 1.5;
    checkGates(prevZ);
    if (car.z >= finishZ) {
      if (phase === 'demo') beginCine(points >= rivalPoints, true);
      else beginCine(points >= rivalPoints, false);
    }
  }

  function stepCine(dt) {
    cine.t += dt;
    if (cine.win) {
      car.v = approach(car.v, 0, dt * 2.2);      // pull up just short of the rival
      car.yaw += cine.spinV * dt;
      cine.spinV = approach(cine.spinV, 0, dt * 0.5);
      if (rand() < 0.5) puff(car.x + rr(-1.2, 1.2), 0.4, car.z - 2, true);
    } else {
      car.v = approach(car.v, 7, dt * 1.6);
      if (cine.t > 0.3) {
        rival.v = Math.min(112, rival.v + 85 * dt);
        rival.z += rival.v * dt;
        rival.spin += rival.v * dt * 1.5;
        if (rand() < 0.55) puff(rival.x + rr(-1, 1), 0.4, rival.z - 2.6, true);
      }
    }
    car.z += car.v * dt;
    car.spin += car.v * dt * 1.5;
    if (cine.t > (cine.demo ? 1.7 : 2.4) && !cardShown) { cardShown = true; endCard(); }
  }

  function stepStall(dt) {
    stallT += dt;
    car.v = approach(car.v, 0, dt * 1.3);
    car.z += car.v * dt;
    car.spin += car.v * dt * 1.5;
    if (rand() < 0.45) puff(car.x + rr(-0.6, 0.6), 1.3, car.z + 2.3, false);
    if (stallT > 1.5 && !cardShown) { cardShown = true; endCard(); }
  }

  function stepParticles(dt) {
    var i, d;
    for (i = debris.length - 1; i >= 0; i--) {
      d = debris[i];
      d.vy -= 22 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.rx += dt * 5; d.ry += dt * 4; d.rz += dt * 6;
      d.life -= dt;
      if (d.y < 0.1 || d.life <= 0) debris.splice(i, 1);
    }
    for (i = puffs.length - 1; i >= 0; i--) {
      d = puffs[i];
      d.t += dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.s += dt * 1.5;
      if (d.t > d.life) puffs.splice(i, 1);
    }
  }

  function updateCamera(dt) {
    var ex, ey, ez, lx, ly, lz;
    if (phase === 'cine') {
      var e = clamp(cine.t / 1.4, 0, 1); e = e * e * (3 - 2 * e);
      // A win swings around the car for the burnout; a defeat stays behind it
      // and looks down the road, so the rival visibly shrinks into the distance.
      var ang = e * (cine.win ? 1.1 : 0.26), dist = cine.win ? 19 : 14;
      var cx = car.x, cz = car.z;
      ex = cx + Math.sin(ang) * dist;
      ey = cine.win ? 5.4 + ang * 2.4 : 5.0;
      ez = cz - Math.cos(ang) * dist;
      lx = cx * (cine.win ? 0.85 : 0.5);
      // defeat: watch the rival leave first, then pull the look-at back towards
      // the camera (the hole-eater trick) so the player's own car rises above
      // the end card instead of hiding behind it
      var give = clamp((cine.t - 0.9) / 1.1, 0, 1);
      ly = cine.win ? 0.6 : 1.4 - give * 0.5;
      lz = cz + (cine.win ? 2 : 17 - give * 21);
    } else {
      var back = 12.5 + (car.v - (C.baseSpeed || 36)) * 0.07;
      cam.x = approach(cam.x, car.x * 0.4, dt * 6);
      cam.z = approach(cam.z, car.z - back, dt * 9);
      cam.y = approach(cam.y, 5.7, dt * 4);
      ex = cam.x; ey = cam.y; ez = cam.z;
      lx = car.x * 0.55; ly = 1.9; lz = car.z + 17;
    }
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 2.2);
      var k = cam.shake * cam.shake;
      ex += rr(-1, 1) * k * 1.1; ey += rr(-1, 1) * k * 0.7;
    }
    cam.z = phase === 'cine' ? ez : cam.z;
    R.camera(ex, ey, ez, lx, ly, lz);
    cam.eyeZ = ez;
  }

  /* ------------------------------------------------------------ rendering */

  var _cm = null, _pm = null, _om = null;

  function drawCar(o, m) {
    Engine.model(_cm, o.x, o.y, o.z, 0, o.yaw, o.roll, 1, 1, 1);
    var i, p, w;
    for (i = 0; i < m.parts.length; i++) {
      p = m.parts[i];
      Engine.model(_pm, p.p[0], p.p[1], p.p[2], p.r[0], p.r[1], p.r[2], p.s[0], p.s[1], p.s[2]);
      Engine.multiply(_om, _cm, _pm);
      R.draw({ mesh: p.mesh, mat: _om, ns: p.ns, color: p.c, glow: p.glow, mode: p.mode, alpha: p.alpha });
    }
    for (i = 0; i < m.wheels.length; i++) {
      w = m.wheels[i];
      Engine.model(_pm, w[0], w[1], w[2], 0, o.spin, Math.PI / 2, 0.9, 0.42, 0.9);
      Engine.multiply(_om, _cm, _pm);
      R.draw({ mesh: 'cyl', mat: _om, ns: [1.11, 2.38, 1.11], color: m.tyre });
      Engine.model(_pm, w[0], w[1], w[2], 0, o.spin, Math.PI / 2, 0.5, 0.46, 0.5);
      Engine.multiply(_om, _cm, _pm);
      R.draw({ mesh: 'cyl', mat: _om, ns: [2, 2.17, 2], color: m.rim });
      Engine.model(_pm, w[0], w[1], w[2], 0, o.spin, Math.PI / 2, 0.74, 0.48, 0.16);
      Engine.multiply(_om, _cm, _pm);
      R.draw({ mesh: 'box', mat: _om, ns: [1.35, 2.08, 6.25], color: m.rim });
    }
  }

  function drawProps() {
    while (propStart < props.length && props[propStart].z < cam.z - 70) propStart++;
    for (var i = propStart; i < props.length; i++) {
      var p = props[i];
      if (p.z > cam.z + 320) break;
      for (var j = 0; j < p.list.length; j++) R.draw(p.list[j]);
    }
  }

  function drawGates() {
    for (var i = 0; i < gates.length; i++) {
      var g = gates[i];
      if (g.done || g.z < cam.z - 12 || g.z > cam.z + 260) continue;
      R.draw({ mesh: 'box', x: -W, y: 3.5, z: g.z, sx: 0.55, sy: 7.0, sz: 0.55, color: TARMAC });
      R.draw({ mesh: 'box', x: 0, y: 3.5, z: g.z, sx: 0.45, sy: 7.0, sz: 0.45, color: TARMAC });
      R.draw({ mesh: 'box', x: W, y: 3.5, z: g.z, sx: 0.55, sy: 7.0, sz: 0.55, color: TARMAC });
      R.draw({ mesh: 'box', x: 0, y: 7.3, z: g.z, sx: 2 * W + 1.1, sy: 0.66, sz: 0.62, color: TARMAC });
      for (var s = 0; s < 2; s++) {
        var c = g.sides[s].good ? GOOD : BAD;
        var px = sideX(s);
        R.draw({ mesh: 'box', x: px, y: 6.75, z: g.z, sx: W - 0.6, sy: 0.42, sz: 0.5, color: c, glow: 0.6 });
        R.draw({ mesh: 'box', x: px, y: 0.14, z: g.z, sx: W - 0.6, sy: 0.28, sz: 0.8, color: c, glow: 0.6 });
      }
    }
  }

  function drawPanels() {
    for (var i = 0; i < gates.length; i++) {
      var g = gates[i];
      if (g.done || g.z < cam.z - 12 || g.z > cam.z + 260) continue;
      for (var s = 0; s < 2; s++) {
        var c = g.sides[s].good ? GOOD : BAD;
        var px = sideX(s);
        R.draw({ mesh: 'box', x: px, y: 3.4, z: g.z, sx: W - 0.62, sy: 6.3, sz: 0.1,
          color: c, mode: 2, alpha: 0.34 });
      }
    }
  }

  function drawFinish() {
    if (finishZ < cam.z - 40 || finishZ > cam.z + 340) return;
    var white = col('#f2f5f8'), black = col('#12161c');
    R.draw({ mesh: 'box', x: -(W + 1.0), y: 4.4, z: finishZ, sx: 0.75, sy: 8.8, sz: 0.75, color: TARMAC });
    R.draw({ mesh: 'box', x: (W + 1.0), y: 4.4, z: finishZ, sx: 0.75, sy: 8.8, sz: 0.75, color: TARMAC });
    R.draw({ mesh: 'box', x: 0, y: 8.2, z: finishZ, sx: 2 * W + 2.6, sy: 1.7, sz: 0.5, color: TARMAC });
    for (var i = 0; i < 8; i++) {
      R.draw({ mesh: 'box', x: -W - 0.6 + (i + 0.5) * ((2 * W + 1.2) / 8), y: 8.2, z: finishZ - 0.3,
        sx: (2 * W + 1.2) / 8, sy: 1.2, sz: 0.2, color: i % 2 ? black : white });
    }
    // the rival's floating scoreboard — only while the race is still on
    if (phase === 'demo' || phase === 'race') {
      R.draw({ mesh: 'box', x: rival.x, y: 5.0, z: rival.z, sx: 4.4, sy: 2.3, sz: 0.3, color: TARMAC });
      R.draw({ mesh: 'box', x: rival.x, y: 5.0, z: rival.z - 0.2, sx: 4.0, sy: 1.9, sz: 0.2,
        color: col('#ffd85a'), glow: 0.35 });
    }
  }

  function drawDebris() {
    for (var i = 0; i < debris.length; i++) {
      var d = debris[i];
      R.draw({ mesh: 'box', x: d.x, y: d.y, z: d.z, rx: d.rx, ry: d.ry, rz: d.rz,
        sx: d.sx, sy: d.sy, sz: d.sz, color: d.c, glow: 0.35 });
    }
  }

  function drawShadow(o, w, l) {
    R.draw({ mesh: 'disc', x: o.x, y: 0.05, z: o.z, ry: o.yaw, sx: w, sy: 0.02, sz: l,
      color: [0.06, 0.09, 0.14], mode: 2, alpha: 0.3 });
  }

  function drawPuffs() {
    for (var i = 0; i < puffs.length; i++) {
      var p = puffs[i], a = 0.36 * (1 - p.t / p.life);
      R.draw({ mesh: 'sphere', x: p.x, y: p.y, z: p.z, sx: p.s, sy: p.s, sz: p.s,
        color: [0.86, 0.87, 0.9], mode: 2, alpha: Math.max(0, a) });
    }
  }

  function render() {
    R.begin(W, finishZ, 0);
    R.draw({ mesh: 'ground', x: 0, y: 0, z: cam.z + 230, sx: 1, sy: 1, sz: 1, ns: [1, 1, 1],
      color: [0.3, 0.5, 0.3], mode: 1 });
    drawProps();
    drawGates();
    drawFinish();
    drawDebris();
    drawCar(car, mine);
    if (rival.z < cam.z + 340) drawCar(rival, theirs);
    R.blend(true);
    drawShadow(car, 2.6, 5.0);
    if (rival.z < cam.z + 340) drawShadow(rival, 2.6, 5.0);
    drawPanels();
    drawPuffs();
    R.blend(false);
  }

  /* ------------------------------------------- DOM labels tracked in 3D */

  function place(el, x, y, z, w, h, minS, maxS) {
    var p = R.project(x, y, z, w, h);
    if (!p || p.d < 3 || p.d > 165) { el.hidden = true; return; }
    var s = clamp(64 / p.d, minS, maxS);
    el.hidden = false;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.transform = 'translate(-50%,-50%) scale(' + s.toFixed(3) + ')';
    el.style.opacity = clamp((165 - p.d) / 45, 0, 1).toFixed(2);
  }

  function updateLabels() {
    var w = stage.clientWidth, h = stage.clientHeight, ahead = 0;
    for (var i = 0; i < gates.length; i++) {
      var g = gates[i];
      var live = !g.done && g.z > car.z - 2 && ahead < 2;
      if (live) ahead++;
      for (var s = 0; s < 2; s++) {
        var el = g.sides[s].el;
        if (!live) { el.hidden = true; continue; }
        place(el, sideX(s), 3.3, g.z, w, h, 0.34, 1.35);
      }
    }
    if (rivalLabel) {
      if (phase === 'cine' || phase === 'stall') rivalLabel.hidden = true;
      else place(rivalLabel, rival.x, 5.0, rival.z, w, h, 0.35, 1.25);
    }
  }

  /* ----------------------------------------------------------------- loop */

  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;

    if (phase === 'demo') { demoSteer(); steer(dt); stepDrive(dt); }
    if (phase === 'race') {
      steer(dt);
      stepDrive(dt);
      fuel -= ((C.fuelBurnBase || 3) + (C.fuelBurnSpeed || 3) * (car.v / (C.baseSpeed || 36))) * dt;
      if (fuel <= 0) { fuel = 0; outOfFuel(); }
    }
    if (phase === 'cine') stepCine(dt);
    if (phase === 'stall') stepStall(dt);
    stepParticles(dt);
    updateCamera(dt);
    render();
    updateLabels();
    if (phase !== 'boot') syncHud();
  }

  /* ------------------------------------------------------------------ boot */

  function fit() {
    var w = stage.clientWidth, h = stage.clientHeight;
    minSide = Math.min(w, h);
    document.documentElement.style.setProperty('--u', minSide / 100 + 'px');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    R.resize(w, h, dpr);
  }

  function noWebGL() {
    stage.classList.add('nogl');
    showCard('', C.appName || 'Play now', C.tagline || '',
      { label: C.ctaLabel || 'PLAY NOW', fn: function () { Playable.install('nogl'); } });
  }

  function init() {
    try {
      R = Engine.Renderer(canvas, C.sky || [0.55, 0.78, 0.94]);
    } catch (e) {
      R = null;
    }
    if (!R) { noWebGL(); return; }

    _cm = Engine.mat4(); _pm = Engine.mat4(); _om = Engine.mat4();
    mine = carModel(C.carColor || '#ff3f2e', '#22262e');
    theirs = carModel(C.rivalColor || '#2b3ce0', '#e8ecf2');

    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', function () { setTimeout(fit, 150); });

    stage.addEventListener('touchstart', onDown, { passive: false });
    stage.addEventListener('touchmove', onMove, { passive: false });
    stage.addEventListener('touchend', onUp);
    stage.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', function (e) { keys[e.key] = 1; });
    window.addEventListener('keyup', function (e) { keys[e.key] = 0; });

    cornerCta.textContent = C.ctaLabel || 'PLAY NOW';
    cornerCta.addEventListener('click', function () { Playable.install('corner'); });
    hintText.textContent = C.hintText || 'DRAG TO STEER';

    startDemo();
    requestAnimationFrame(frame);
    Playable.ready();
  }

  /* ---- headless test hook: only with ?e2e=1, never active in a shipped ad ---- */
  if (/[?&]e2e=1/.test(window.location.search)) {
    window.GR = {
      phase: function () { return phase; },
      points: function () { return Math.round(points); },
      fuel: function () { return fuel; },
      speed: function () { return car.v; },
      z: function () { return car.z; },
      x: function () { return car.x; },
      finish: function () { return finishZ; },
      rival: function () { return rivalPoints; },
      gates: function () {
        return gates.map(function (g) {
          return { z: g.z, done: g.done, left: g.sides[0].k + ':' + g.sides[0].v,
            right: g.sides[1].k + ':' + g.sides[1].v };
        });
      },
      aim: function (side) { auto = side === null ? null : laneX(side); },
      race: startRace,
      card: function () { return overlay.hidden ? null : cardTitle.textContent; },
      tap: function () { cardBtn.click(); },
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
