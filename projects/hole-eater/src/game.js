/**
 * game.js — Hole Eater 3D.
 *
 * Flow:
 *   boot  -> intro (scripted, NOT controllable: the hole drives itself, eats a
 *            bus, a tree and a house, then swallows a bomb)
 *         -> introOver ("BOOM!" card, TRY AGAIN)
 *         -> play (drag to steer, 20 s, bombs kill)
 *         -> end card (score + CTA)
 *
 * Note on the SDK: the intro's game-over is a *narrative* one. window.gameEnd()
 * is only fired when the real round finishes, and window.gameStart() on the
 * player's first real input — firing them during the attract loop would report
 * a play the user never had.
 */
(function () {
  'use strict';

  var C = window.PLAYABLE_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };

  var stage = $('stage'), canvas = $('gl');
  var hud = $('hud'), scoreEl = $('score'), timerFill = $('timerFill'), timerEl = $('timer');
  var banner = $('banner'), hint = $('hint'), hintText = $('hintText');
  var overlay = $('overlay'), card = $('card'), cardBadge = $('cardBadge');
  var cardTitle = $('cardTitle'), cardText = $('cardText');
  var cardBtn = $('cardBtn'), cardBtn2 = $('cardBtn2'), cornerCta = $('cornerCta');
  var pops = $('pops'), flash = $('flash');
  var sizeBar = $('sizeBar'), sizeFill = $('sizeFill');

  /* ------------------------------------------------------------ utilities */

  function col(hex) {
    return [
      parseInt(hex.substr(1, 2), 16) / 255,
      parseInt(hex.substr(3, 2), 16) / 255,
      parseInt(hex.substr(5, 2), 16) / 255,
    ];
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = rng(20260831);
  function rr(a, b) { return a + rand() * (b - a); }
  function pick(a) { return a[(rand() * a.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* -------------------------------------------------------------- palette */

  var P = {
    body: ['#e5533d', '#f2b134', '#3d9be9', '#7ec850', '#f2f2f2', '#9b59d0', '#ff8c42'],
    roof: ['#d94f3d', '#e0803a', '#7d8a99', '#c25b4e', '#4f7f9d', '#b8683f'],
    wall: ['#f5efe2', '#eadfc8', '#f0e4d4', '#e6e6e6', '#dfe9ef', '#f3ddd2', '#e4ecdd'],
    leaf: ['#4f9d4f', '#3f8f52', '#61ad4a', '#2f7f47'],
  };

  /* --------------------------------------------------------- object shapes
   * Each builder returns { size, mass, parts:[...] }.
   *   size — footprint radius; the hole must be bigger than this to swallow it
   *   mass — how much the hole grows
   *   part — { mesh, p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz], c:[r,g,b] }
   */

  function part(mesh, p, s, c, r) {
    return {
      mesh: mesh, p: p, s: s, c: c, r: r || [0, 0, 0],
      ns: [1 / s[0], 1 / s[1], 1 / s[2]],   // normal matrix scale, see engine.js
    };
  }

  var SHAPES = {
    cone: function () {
      var o = col('#ff7a1f');
      return { size: 0.45, mass: 0.4, sh: [1.5, 1.5], parts: [
        part('box', [0, 0.06, 0], [0.75, 0.12, 0.75], col('#ff8c3a')),
        part('cone', [0, 0.48, 0], [0.62, 0.85, 0.62], o),
        part('cyl', [0, 0.52, 0], [0.48, 0.16, 0.48], col('#f7f2ea')),
      ] };
    },
    hydrant: function () {
      return { size: 0.4, mass: 0.35, sh: [1.2, 1.2], parts: [
        part('cyl', [0, 0.35, 0], [0.42, 0.7, 0.42], col('#d9382b')),
        part('sphere', [0, 0.74, 0], [0.44, 0.4, 0.44], col('#c22f24')),
        part('box', [0, 0.4, 0], [0.9, 0.16, 0.22], col('#c22f24')),
      ] };
    },
    bin: function () {
      return { size: 0.45, mass: 0.5, sh: [1.6, 1.6], parts: [
        part('taper', [0, 0.42, 0], [0.66, 0.84, 0.66], col('#3f7d5a')),
        part('cyl', [0, 0.88, 0], [0.72, 0.1, 0.72], col('#2c5c42')),
      ] };
    },
    bench: function () {
      var w = col('#a3703c');
      return { size: 0.95, mass: 0.8, sh: [2.4, 1.1], parts: [
        part('box', [0, 0.44, 0], [1.9, 0.12, 0.6], w),
        part('box', [0, 0.72, -0.25], [1.9, 0.5, 0.1], w),
        part('box', [-0.75, 0.22, 0], [0.12, 0.44, 0.5], col('#4c5560')),
        part('box', [0.75, 0.22, 0], [0.12, 0.44, 0.5], col('#4c5560')),
      ] };
    },
    lamp: function () {
      return { size: 0.4, mass: 0.9, sh: [1.4, 1.0], parts: [
        part('cyl', [0, 0.1, 0], [0.5, 0.2, 0.5], col('#59616b')),
        part('cyl', [0, 2.1, 0], [0.18, 4.0, 0.18], col('#6b747f')),
        part('box', [0.42, 4.05, 0], [1.0, 0.16, 0.24], col('#6b747f')),
        part('box', [0.85, 3.9, 0], [0.5, 0.22, 0.4], col('#ffe9a8')),
      ] };
    },
    tree: function () {
      var l = col(pick(P.leaf));
      return { size: 1.15, mass: 1.4, sh: [2.8, 2.8], parts: [
        part('cyl', [0, 0.7, 0], [0.42, 1.4, 0.42], col('#7a5230')),
        part('sphere', [0, 2.0, 0], [2.3, 2.1, 2.3], l),
        part('sphere', [0.55, 2.7, 0.3], [1.5, 1.4, 1.5], l),
      ] };
    },
    bigtree: function () {
      var l = col(pick(P.leaf));
      return { size: 1.7, mass: 2.6, sh: [4.2, 4.2], parts: [
        part('cyl', [0, 1.0, 0], [0.62, 2.0, 0.62], col('#6d4826')),
        part('sphere', [0, 3.0, 0], [3.6, 3.2, 3.6], l),
        part('sphere', [-0.9, 3.9, 0.5], [2.2, 2.0, 2.2], l),
        part('sphere', [1.0, 3.5, -0.5], [2.0, 1.9, 2.0], l),
      ] };
    },
    car: function () {
      var b = col(pick(P.body)), t = col('#20242c'), g = col('#9fd4ef');
      return { size: 1.6, mass: 2.2, sh: [2.2, 4.4], parts: [
        part('box', [0, 0.62, 0], [1.8, 0.66, 4.1], b),
        part('box', [0, 1.12, -0.25], [1.62, 0.62, 2.1], b),
        part('box', [0, 1.16, -0.25], [1.66, 0.4, 1.5], g),
        part('cyl', [0.9, 0.34, 1.35], [0.66, 0.26, 0.66], t, [0, 0, Math.PI / 2]),
        part('cyl', [-0.9, 0.34, 1.35], [0.66, 0.26, 0.66], t, [0, 0, Math.PI / 2]),
        part('cyl', [0.9, 0.34, -1.35], [0.66, 0.26, 0.66], t, [0, 0, Math.PI / 2]),
        part('cyl', [-0.9, 0.34, -1.35], [0.66, 0.26, 0.66], t, [0, 0, Math.PI / 2]),
      ] };
    },
    van: function () {
      var b = col(pick(P.body)), t = col('#20242c');
      return { size: 2.0, mass: 3.4, sh: [2.6, 5.2], parts: [
        part('box', [0, 1.15, 0], [2.1, 1.7, 5.0], b),
        part('box', [0, 1.5, 2.2], [1.9, 0.7, 0.7], col('#9fd4ef')),
        part('box', [0, 0.5, 0], [2.15, 0.4, 5.0], col('#ffffff')),
        part('cyl', [1.05, 0.4, 1.7], [0.78, 0.3, 0.78], t, [0, 0, Math.PI / 2]),
        part('cyl', [-1.05, 0.4, 1.7], [0.78, 0.3, 0.78], t, [0, 0, Math.PI / 2]),
        part('cyl', [1.05, 0.4, -1.7], [0.78, 0.3, 0.78], t, [0, 0, Math.PI / 2]),
        part('cyl', [-1.05, 0.4, -1.7], [0.78, 0.3, 0.78], t, [0, 0, Math.PI / 2]),
      ] };
    },
    bus: function () {
      var b = col('#f2b134'), t = col('#20242c');
      return { size: 2.8, mass: 5.5, sh: [3.2, 9.2], parts: [
        part('box', [0, 1.5, 0], [2.6, 2.4, 9.0], b),
        part('box', [0, 2.1, 0], [2.66, 0.9, 8.0], col('#9fd4ef')),
        part('box', [0, 0.55, 0], [2.7, 0.5, 9.0], col('#e2892a')),
        part('cyl', [1.3, 0.5, 3.0], [0.95, 0.34, 0.95], t, [0, 0, Math.PI / 2]),
        part('cyl', [-1.3, 0.5, 3.0], [0.95, 0.34, 0.95], t, [0, 0, Math.PI / 2]),
        part('cyl', [1.3, 0.5, -2.8], [0.95, 0.34, 0.95], t, [0, 0, Math.PI / 2]),
        part('cyl', [-1.3, 0.5, -2.8], [0.95, 0.34, 0.95], t, [0, 0, Math.PI / 2]),
      ] };
    },
    house: function () {
      var w = col(pick(P.wall)), r = col(pick(P.roof));
      return { size: 3.2, mass: 7, sh: [7.4, 7.4], parts: [
        part('box', [0, 1.6, 0], [6.0, 3.2, 6.0], w),
        part('roof', [0, 4.3, 0], [9.3, 2.6, 9.3], r, [0, Math.PI / 4, 0]),
        part('box', [0, 0.9, 3.02], [1.2, 1.8, 0.16], col('#8a5a34')),
        part('box', [-1.8, 2.1, 3.02], [1.2, 1.0, 0.16], col('#9fd4ef')),
        part('box', [1.8, 2.1, 3.02], [1.2, 1.0, 0.16], col('#9fd4ef')),
      ] };
    },
    tower: function () {
      var w = col(pick(P.wall));
      return { size: 4.2, mass: 11, sh: [7.8, 7.8], parts: [
        part('box', [0, 3.0, 0], [7.4, 6.0, 7.4], w),
        part('box', [0, 6.2, 0], [8.0, 0.5, 8.0], col('#c8bfae')),
        part('box', [0, 2.2, 3.75], [6.0, 2.4, 0.2], col('#8fc6e6')),
        part('box', [0, 4.9, 3.75], [6.0, 1.6, 0.2], col('#8fc6e6')),
        part('box', [3.75, 3.4, 0], [0.2, 4.0, 5.6], col('#8fc6e6')),
        part('box', [1.4, 6.9, 1.4], [1.6, 1.2, 1.6], col('#b9b0a0')),
      ] };
    },
    bomb: function () {
      return { size: 0.9, mass: 0, bomb: true, parts: [
        part('cyl', [0, 0.03, 0], [3.6, 0.06, 3.6], col('#ff2f3c'), null, 1),
        part('sphere', [0, 0.95, 0], [1.8, 1.8, 1.8], col('#1b1d23')),
        part('cyl', [0, 0.95, 0], [2.05, 0.34, 2.05], col('#ff2f3c')),
        part('cyl', [0, 1.95, 0], [0.3, 0.6, 0.3], col('#6b5a3c')),
        part('sphere', [0, 2.35, 0], [0.5, 0.5, 0.5], col('#ffd24a')),
      ] };
    },
  };

  /* ------------------------------------------------------------- the world */

  var R = null;
  var objs = [], debris = [];
  var hole = { x: 0, z: 0, r: 2, tx: 0, tz: 0 };
  var cam = { x: 0, z: 0, shake: 0 };
  var phase = 'boot';
  var score = 0, timeLeft = 0, clock = 0;
  var intro = null;
  var BOUND = 44;
  var GROUND = col('#c9cfc2');
  var TOOTH = col('#fbf3e4');
  /* Radii at which the hole counts as "one size bigger". The bar under the
     hole fills between two neighbouring entries. */
  var TIERS = [2.0, 3.0, 4.2, 5.6, 7.0, 8.5];
  var tier = 0;

  function tierOf(r) {
    var i = 0;
    while (i < TIERS.length - 1 && r >= TIERS[i + 1]) i++;
    return i;
  }

  function updateSizeBar() {
    var i = tierOf(hole.r);
    var lo = TIERS[i], hi = TIERS[Math.min(i + 1, TIERS.length - 1)];
    var f = hi > lo ? (hole.r - lo) / (hi - lo) : 1;
    sizeFill.style.width = clamp(f, 0, 1) * 100 + '%';
    if (i !== tier) {
      tier = i;
      sizeBar.classList.remove('up');
      void sizeBar.offsetWidth;
      sizeBar.classList.add('up');
      popText('BIGGER!');
    }
  }

  function isRoad(x, z) {
    var rx = Math.abs(((x + 15) % 30 + 30) % 30 - 15);
    var rz = Math.abs(((z + 15) % 30 + 30) % 30 - 15);
    return rx < 4.8 || rz < 4.8;
  }

  function spawn(kind, x, z, ry) {
    var def = SHAPES[kind]();
    var o = {
      kind: kind, x: x, z: z, y: 0, ry: ry === undefined ? rr(0, 6.28) : ry,
      rx: 0, rz: 0, s: 1, size: def.size, mass: def.mass, bomb: !!def.bomb,
      parts: def.parts, sh: def.sh || [def.size * 2.4, def.size * 2.4],
      falling: false, vx: 0, vy: 0, vz: 0, wob: 0, dead: false,
    };
    objs.push(o);
    return o;
  }

  function farEnough(x, z, d) {
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if ((o.x - x) * (o.x - x) + (o.z - z) * (o.z - z) < d * d) return false;
    }
    return true;
  }

  /** Cars sit on the road grid, everything else on the blocks between. */
  function populate(opts) {
    var i, x, z, tries;
    // vehicles along the roads
    for (i = 0; i < opts.cars; i++) {
      for (tries = 0; tries < 40; tries++) {
        var axis = rand() < 0.5;
        var band = Math.round(rr(-1.4, 1.4)) * 30;
        var along = rr(-BOUND, BOUND);
        var lane = rand() < 0.5 ? -2.6 : 2.6;
        x = axis ? band + lane : along;
        z = axis ? along : band + lane;
        if (Math.abs(x) > BOUND || Math.abs(z) > BOUND) continue;
        if (!farEnough(x, z, 9)) continue;
        var kind = rand() < 0.62 ? 'car' : (rand() < 0.6 ? 'van' : 'bus');
        spawn(kind, x, z, axis ? 0 : Math.PI / 2);
        break;
      }
    }
    // props on the blocks
    var props = ['tree', 'tree', 'bigtree', 'bench', 'cone', 'cone', 'hydrant', 'bin', 'lamp', 'house', 'house', 'tower'];
    for (i = 0; i < opts.props; i++) {
      for (tries = 0; tries < 50; tries++) {
        x = rr(-BOUND, BOUND); z = rr(-BOUND, BOUND);
        if (isRoad(x, z)) continue;
        var k = pick(props);
        var need = k === 'tower' ? 11 : k === 'house' ? 9 : 4.5;
        if (!farEnough(x, z, need)) continue;
        spawn(k, x, z);
        break;
      }
    }
    // a ring of easy food around the start so the first seconds always pay off
    if (opts.starter) {
      var starters = ['cone', 'hydrant', 'bin', 'bench', 'cone', 'tree', 'car', 'bin', 'cone', 'bench', 'tree', 'hydrant'];
      for (i = 0; i < starters.length; i++) {
        var ang = (i / starters.length) * 6.283 + 0.3;
        var rad = rr(7, 15);
        x = opts.sx + Math.cos(ang) * rad;
        z = opts.sz + Math.sin(ang) * rad;
        if (Math.abs(x) > BOUND || Math.abs(z) > BOUND) continue;
        if (!farEnough(x, z, 3.2)) continue;
        spawn(starters[i], x, z);
      }
    }

    // bombs, never right on top of the player's start
    for (i = 0; i < opts.bombs; i++) {
      for (tries = 0; tries < 60; tries++) {
        x = rr(-BOUND + 4, BOUND - 4); z = rr(-BOUND + 4, BOUND - 4);
        if (Math.hypot(x - opts.sx, z - opts.sz) < 19) continue;
        if (!farEnough(x, z, 7)) continue;
        spawn('bomb', x, z, 0);
        break;
      }
    }
  }

  /* ------------------------------------------------------------ the phases */

  function resetWorld() {
    objs.length = 0;
    debris.length = 0;
    score = 0;
  }

  function startIntro() {
    resetWorld();
    rand = rng(20260831);
    phase = 'intro';
    hole.r = C.introStartRadius || 3.4;
    hole.x = -26; hole.z = 21;
    cam.x = hole.x; cam.z = hole.z;

    // Hand-placed hero props so the attract loop always shows the same beats:
    // the tree is right under the hole at frame one, then bus, house, bomb.
    var tree = spawn('bigtree', -23.5, 18.5);
    var bus = spawn('bus', -12, 12, Math.PI / 2);
    var hut = spawn('house', 4, 0);
    var bomb = spawn('bomb', 17, -12, 0);
    spawn('car', -18, 15.5, Math.PI * 0.72);
    spawn('bench', -6.5, 6.5, 0.7);
    spawn('van', 11, -6, Math.PI * 0.72);
    intro = {
      path: [[-26, 21], [-23.5, 18.5], [-12, 12], [4, 0], [17, -12]],
      leg: 0, t: 0, hold: 0.35, bomb: bomb,
    };
    void bus; void tree; void hut;

    populate({ cars: 9, props: 34, bombs: 0, sx: 0, sz: 0 });

    hud.hidden = true;
    cornerCta.hidden = true;
    overlay.hidden = true;
    sizeBar.hidden = false;
    tier = tierOf(hole.r);
    updateSizeBar();
    banner.hidden = false;
    banner.textContent = C.introBannerText || 'WATCH';
    hint.hidden = true;
  }

  function startPlay() {
    resetWorld();
    phase = 'play';
    hole.r = C.playStartRadius || 2;
    hole.x = 0; hole.z = 0;
    hole.tx = 0; hole.tz = 0;
    cam.x = 0; cam.z = 0;
    timeLeft = C.roundSeconds || 20;
    populate({ cars: 14, props: 46, bombs: 6, starter: true, sx: 0, sz: 0 });

    overlay.hidden = true;
    banner.hidden = true;
    sizeBar.hidden = false;
    tier = tierOf(hole.r);
    updateSizeBar();
    hud.hidden = false;
    timerEl.style.display = C.roundSeconds ? '' : 'none';
    scoreEl.textContent = '0';
    cornerCta.hidden = !C.showCornerCta;
    hint.hidden = false;
    hintShown = true;
    Playable.start();          // real play begins here -> window.gameStart()
  }

  function showCard(badge, title, text, main, second) {
    cardBadge.textContent = badge || '';
    cardBadge.hidden = !badge;
    cardBadge.classList.toggle('good', /SWALLOWED/.test(badge || ''));
    cardTitle.textContent = title;
    cardText.textContent = text;
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

  function introGameOver() {
    phase = 'introOver';
    banner.hidden = true;
    sizeBar.hidden = true;
    setTimeout(function () {
      showCard('GAME OVER', C.introOverTitle, C.introOverText,
        { label: C.introOverBtn || 'TRY AGAIN', fn: startPlay });
    }, 1150);
  }

  function endRound(bombed) {
    if (phase === 'over') return;
    phase = 'over';
    hud.hidden = true;
    hint.hidden = true;
    sizeBar.hidden = true;
    cornerCta.hidden = true;
    Playable.end();            // the real end of the playable -> window.gameEnd()
    var titles = C.timeUpTitles || ['Nice!'];
    var t = bombed
      ? C.bombOverTitle
      : titles[clamp(Math.floor(score / 14), 0, titles.length - 1)];
    var txt = bombed ? C.bombOverText : C.timeUpText;
    setTimeout(function () {
      showCard(bombed ? 'GAME OVER' : score + ' SWALLOWED', t, txt,
        { label: C.ctaLabel || 'PLAY NOW', fn: function () { Playable.install('endcard'); } },
        { label: C.retryLabel || 'RETRY', fn: startPlay });
    }, bombed ? 850 : 450);
  }

  /* ------------------------------------------------------------- explosion */

  function explode(x, z) {
    cam.shake = 1;
    flash.classList.remove('go');
    void flash.offsetWidth;
    flash.classList.add('go');
    var hot = [col('#ff8b25'), col('#ffd24a'), col('#ff4b3a'), col('#3a3f48')];
    for (var i = 0; i < 26; i++) {
      var a = rand() * 6.28, sp = rr(4, 13);
      debris.push({
        x: x, y: rr(0.6, 2.2), z: z,
        vx: Math.cos(a) * sp, vy: rr(8, 16), vz: Math.sin(a) * sp,
        rx: rr(0, 6), ry: rr(0, 6), rz: rr(0, 6),
        sx: rr(0.4, 1.5), life: 1,
        mesh: rand() < 0.5 ? 'box' : 'sphere', c: pick(hot),
      });
    }
  }

  /* --------------------------------------------------------------- physics */

  function eat(o) {
    o.falling = true;
    var dx = hole.x - o.x, dz = hole.z - o.z;
    var d = Math.hypot(dx, dz) || 1;
    o.vx = (dx / d) * 3.5 + rr(-1, 1);
    o.vz = (dz / d) * 3.5 + rr(-1, 1);
    o.vy = 0;
    o.spinx = rr(-3, 3); o.spinz = rr(-3, 3);
  }

  function swallow(o) {
    score++;
    scoreEl.textContent = score;
    hole.r = Math.min(C.maxRadius || 8.5, hole.r + o.mass * (C.growth || 0.34) * 0.3);
    popText('+1');
    updateSizeBar();
  }

  var popTimer = 0;
  function popText(t) {
    if (clock - popTimer < 0.12) return;
    popTimer = clock;
    var el = document.createElement('span');
    el.className = 'pop';
    el.textContent = t;
    el.style.left = (46 + rand() * 8) + '%';
    pops.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
  }

  function stepObjects(dt) {
    for (var i = objs.length - 1; i >= 0; i--) {
      var o = objs[i];
      var dx = hole.x - o.x, dz = hole.z - o.z;
      var d = Math.hypot(dx, dz);

      if (!o.falling) {
        var canEat = o.bomb ? true : hole.r > o.size;
        if (canEat && d < hole.r * 0.92) {
          if (o.bomb) {
            explode(o.x, o.z);
            objs.splice(i, 1);
            if (phase === 'intro') introGameOver();
            else if (phase === 'play') endRound(true);
            continue;
          }
          eat(o);
          swallow(o);
        } else if (canEat && d < hole.r + o.size * 1.6) {
          // being tugged towards the rim
          var pull = (1 - (d - hole.r * 0.9) / (o.size * 1.8)) * dt * 2.4;
          if (pull > 0) { o.x += dx / (d || 1) * pull; o.z += dz / (d || 1) * pull; }
          o.wob = Math.min(1, o.wob + dt * 3);
        } else if (!canEat && d < hole.r + o.size) {
          o.wob = Math.min(1, o.wob + dt * 4);   // too big: it just shudders
        } else {
          o.wob = Math.max(0, o.wob - dt * 3);
        }
        continue;
      }

      // falling into the pit
      var fdx = hole.x - o.x, fdz = hole.z - o.z;
      var fd = Math.hypot(fdx, fdz) || 1;
      var grip = 26;
      o.vx += (fdx / fd) * grip * dt;
      o.vz += (fdz / fd) * grip * dt;
      o.vy -= 34 * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      o.rx += o.spinx * dt; o.rz += o.spinz * dt;
      if (o.y < -2) o.s = Math.max(0, o.s - dt * 0.55);
      if (o.y < -15 || o.s <= 0.02) objs.splice(i, 1);
    }

    for (var j = debris.length - 1; j >= 0; j--) {
      var p = debris[j];
      p.vy -= 30 * dt;
      p.fade = Math.min(1, p.life * 1.7);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += dt * 6; p.ry += dt * 5; p.rz += dt * 4;
      p.life -= dt * 0.8;
      if (p.life <= 0) debris.splice(j, 1);
    }
  }

  function stepIntro(dt) {
    if (intro.hold > 0) { intro.hold -= dt; return; }
    var p = intro.path;
    if (intro.leg >= p.length - 1) return;
    var a = p[intro.leg], b = p[intro.leg + 1];
    var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    intro.t += (C.introSpeed || 10) * dt / len;
    if (intro.t >= 1) { intro.t = 0; intro.leg++; if (intro.leg >= p.length - 1) return; a = p[intro.leg]; b = p[intro.leg + 1]; }
    // ease within the leg so the hole glides rather than snaps
    var t = intro.t;
    hole.x = a[0] + (b[0] - a[0]) * t;
    hole.z = a[1] + (b[1] - a[1]) * t;
  }

  /* ------------------------------------------------------------ the render */

  var tmpA = Engine.mat4(), tmpB = Engine.mat4(), tmpC = Engine.mat4();
  var drawArg = { mesh: '', mat: tmpC, color: null, mode: 0, glow: 0 };

  function drawObject(o) {
    Engine.model(tmpA, o.x, o.y, o.z, o.rx, o.ry, o.rz, o.s, o.s, o.s);
    var wob = o.wob ? Math.sin(clock * 26) * 0.05 * o.wob : 0;
    if (wob) {
      Engine.model(tmpA, o.x, o.y, o.z, wob, o.ry, wob * 0.6, o.s, o.s, o.s);
    }
    for (var i = 0; i < o.parts.length; i++) {
      var pt = o.parts[i];
      Engine.model(tmpB, pt.p[0], pt.p[1], pt.p[2], pt.r[0], pt.r[1], pt.r[2], pt.s[0], pt.s[1], pt.s[2]);
      Engine.multiply(tmpC, tmpA, tmpB);
      drawArg.mesh = pt.mesh;
      drawArg.mat = tmpC;
      drawArg.ns = pt.ns;
      drawArg.color = pt.c;
      drawArg.mode = 0;
      drawArg.glow = o.bomb && i !== 1 ? 0.25 + 0.25 * Math.sin(clock * 6) : 0;
      R.draw(drawArg);
    }
  }

  /** Cheap view cull: nothing behind the camera, nothing past the horizon. */
  function visible(x, z) {
    var dx = x - cam.x, dz = z - cam.z;
    if (dz > 30) return false;
    return dx * dx + dz * dz < 64 * 64;
  }

  var lookLift = 0;
  function render() {
    var sh = cam.shake > 0 ? cam.shake * 1.6 : 0;
    var camDist = 15 + hole.r * 2.4, camH = 30 + hole.r * 5.2;
    var ex = cam.x + (sh ? Math.sin(clock * 60) * sh : 0);
    var ez = cam.z + camDist + (sh ? Math.cos(clock * 53) * sh : 0);
    // While a card covers the middle of the screen, tilt the camera down a
    // little so the hole rides above the card instead of behind it.
    var wantLift = overlay.hidden ? 0 : 15;
    lookLift += (wantLift - lookLift) * 0.06;
    R.camera(ex, camH, ez, cam.x, 0, cam.z - hole.r * 0.4 + lookLift);
    R.begin(hole.x, hole.z, hole.r, true);

    // the pit: inward-facing tube from the ground down, plus a dark floor
    var d = 15;
    R.draw({ mesh: 'pit', x: hole.x, y: -d / 2, z: hole.z, sx: hole.r * 2, sy: d, sz: hole.r * 2, color: GROUND, mode: 2 });
    R.draw({ mesh: 'disc', x: hole.x, y: -d + 0.2, z: hole.z, sx: hole.r * 2, sy: 0.4, sz: hole.r * 2, color: GROUND, mode: 2 });

    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (!visible(o.x, o.z)) continue;
      drawObject(o);
    }
    for (var j = 0; j < debris.length; j++) {
      var p = debris[j];
      R.draw({ mesh: p.mesh, x: p.x, y: p.y, z: p.z, rx: p.rx, ry: p.ry, rz: p.rz,
        sx: p.sx * (p.fade || 1), sy: p.sx * (p.fade || 1), sz: p.sx * (p.fade || 1),
        color: p.c, glow: 0.35 });
    }

    R.draw({ mesh: 'ground', x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, color: GROUND, mode: 1 });

    // soft contact shadows, blended, no depth writes
    R.blend(true);
    for (var k = 0; k < objs.length; k++) {
      var so = objs[k];
      if (so.falling || so.bomb) continue;
      if (!visible(so.x, so.z)) continue;
      R.draw({ mesh: 'disc', x: so.x, y: 0.05, z: so.z, ry: so.ry,
        sx: so.sh[0] * 1.12, sy: 0.1, sz: so.sh[1] * 1.12,
        color: GROUND, mode: 3, alpha: 0.19 });
    }
    R.blend(false);

    drawTeeth();
    trackSizeBar();
  }

  /** A ring of pyramid fangs leaning in over the pit; it turns slowly so the
   *  mouth looks alive, and the count follows the hole's circumference. */
  var toothNS = [1, 1, 1];
  function drawTeeth() {
    var r = hole.r;
    var n = clamp(Math.round(r * 3.4), 9, 28);
    var tw = (6.2832 * r / n) * 0.62;
    var th = clamp(r * 0.7, 1.3, 4.6);
    var spin = clock * 0.2;
    toothNS[0] = 1 / tw; toothNS[1] = 1 / th; toothNS[2] = 1 / tw;
    for (var i = 0; i < n; i++) {
      var a = spin + (i / n) * 6.2832;
      Engine.model(tmpA, hole.x, 0, hole.z, 0, -a, 0, 1, 1, 1);
      // Yaw 45 deg puts a flat face outward, then the fang leans right over
      // the pit. Its outer half dips below y=0, where the opaque ground hides
      // it — so each tooth looks like it grows out of the rim.
      Engine.model(tmpB, r * 0.92, 0, 0, 0, Math.PI / 4, 1.15, tw, th, tw);
      Engine.multiply(tmpC, tmpA, tmpB);
      drawArg.mesh = 'roof';
      drawArg.mat = tmpC;
      drawArg.ns = toothNS;
      drawArg.color = TOOTH;
      drawArg.mode = 0;
      drawArg.glow = 0.05;
      R.draw(drawArg);
    }
  }

  /** Pins the size bar to a point just in front of the hole, in 3D. */
  function trackSizeBar() {
    if (sizeBar.hidden) return;
    var p = R.project(hole.x, 0.05, hole.z + hole.r * 1.3 + 2.2,
      stage.clientWidth, stage.clientHeight);
    if (!p) return;
    sizeBar.style.left = p.x.toFixed(1) + 'px';
    sizeBar.style.top = p.y.toFixed(1) + 'px';
  }

  /* ---------------------------------------------------------------- input */

  var drag = null, hintShown = false, minSide = 320;

  function toPoint(e) {
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }
  function onDown(e) {
    if (phase !== 'play') return;
    drag = toPoint(e);
    drag.ox = drag.x; drag.oy = drag.y;
    e.preventDefault();
  }
  function onMove(e) {
    if (phase !== 'play' || !drag) return;
    var p = toPoint(e);
    drag.x = p.x; drag.y = p.y;
    if (hintShown && Math.hypot(p.x - drag.ox, p.y - drag.oy) > 12) {
      hintShown = false; hint.hidden = true;
    }
    e.preventDefault();
  }
  function onUp() { drag = null; }

  var keys = {};
  window.addEventListener('keydown', function (e) { keys[e.key] = 1; });
  window.addEventListener('keyup', function (e) { keys[e.key] = 0; });

  function steer(dt) {
    var vx = 0, vz = 0;
    if (drag) {
      var dx = drag.x - drag.ox, dy = drag.y - drag.oy;
      var len = Math.hypot(dx, dy);
      if (len > 2) {
        var reach = minSide * 0.16;
        var sp = Math.min(1, len / reach);
        vx = (dx / len) * sp; vz = (dy / len) * sp;
      }
      // let the anchor trail the finger so long drags do not stick at full tilt
      var maxLen = minSide * 0.2;
      if (len > maxLen) {
        drag.ox = drag.x - (dx / len) * maxLen;
        drag.oy = drag.y - (dy / len) * maxLen;
      }
    }
    if (keys.ArrowLeft || keys.a) vx = -1;
    if (keys.ArrowRight || keys.d) vx = 1;
    if (keys.ArrowUp || keys.w) vz = -1;
    if (keys.ArrowDown || keys.s) vz = 1;

    var speed = (C.moveSpeed || 17) * (1 - Math.min(0.35, (hole.r - 2) * 0.05));
    hole.x = clamp(hole.x + vx * speed * dt, -BOUND, BOUND);
    hole.z = clamp(hole.z + vz * speed * dt, -BOUND, BOUND);
  }

  /* ----------------------------------------------------------------- loop */

  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    clock += dt;

    if (phase === 'intro') stepIntro(dt);
    if (phase === 'play') {
      steer(dt);
      if (C.roundSeconds) {
        timeLeft -= dt;
        timerFill.style.width = clamp(timeLeft / C.roundSeconds, 0, 1) * 100 + '%';
        if (timeLeft <= 0) { timeLeft = 0; endRound(false); }
      }
    }
    if (phase !== 'over' || debris.length) stepObjects(dt);

    cam.x += (hole.x - cam.x) * Math.min(1, dt * 6);
    cam.z += (hole.z - cam.z) * Math.min(1, dt * 6);
    if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 1.6);

    render();
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
      R = Engine.Renderer(canvas, C.sky || [0.68, 0.85, 0.95]);
    } catch (e) {
      R = null;
    }
    if (!R) { noWebGL(); return; }

    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', function () { setTimeout(fit, 150); });

    stage.addEventListener('touchstart', onDown, { passive: false });
    stage.addEventListener('touchmove', onMove, { passive: false });
    stage.addEventListener('touchend', onUp);
    stage.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    cornerCta.textContent = C.ctaLabel || 'PLAY NOW';
    cornerCta.addEventListener('click', function () { Playable.install('corner'); });
    hintText.textContent = 'DRAG TO MOVE THE HOLE';

    startIntro();
    requestAnimationFrame(frame);
    Playable.ready();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
