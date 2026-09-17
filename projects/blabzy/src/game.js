/* Blabzy — "Shy or GOAT?" playable ad. No dependencies, no network calls. */
(function () {
  'use strict';

  var CFG = window.PLAYABLE_CONFIG;
  var root = document.documentElement;
  var stage = document.getElementById('stage');
  var screenEl = document.getElementById('screen');
  var meterIn = document.getElementById('meterIn');
  var gauge = document.getElementById('gauge');
  var reactEl = document.getElementById('react');
  var cornerCta = document.getElementById('cornerCta');
  var burstEl = document.getElementById('burst');

  var MAX_DEG = 80;            // needle sweep either side of straight up
  var qIndex = 0;
  var sum = 0;                 // picked spice so far
  var maxSum = 0;              // largest |spice| reachable
  var mode = 'intro';          // intro | quiz | end
  var timers = [];

  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearTimers() { while (timers.length) clearTimeout(timers.pop()); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  CFG.questions.forEach(function (q) {
    var m = 0;
    q.answers.forEach(function (a) { m = Math.max(m, Math.abs(a.spice || 0)); });
    maxSum += m;
  });

  /* ---------------- gauge (inline SVG built here: zero asset bytes) ---------- */

  // left = SHY (calm green) -> right = GOAT (hot red)
  var STOPS = [
    [0, [11, 155, 69]], [0.25, [155, 209, 58]], [0.5, [255, 225, 26]],
    [0.75, [244, 115, 31]], [1, [229, 32, 43]],
  ];
  function colorAt(t) {
    for (var i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i], k = (t - a[0]) / (b[0] - a[0]);
        return 'rgb(' + [0, 1, 2].map(function (c) { return Math.round(a[1][c] + (b[1][c] - a[1][c]) * k); }).join(',') + ')';
      }
    }
    return 'rgb(229,32,43)';
  }

  var needle;
  function buildGauge() {
    var N = 60, R = 72, W = 36, cx = 100, cy = 100, html = '';
    function pt(a) { return (cx + R * Math.cos(a)).toFixed(2) + ' ' + (cy - R * Math.sin(a)).toFixed(2); }
    for (var i = 0; i < N; i++) {
      // a hair of overlap hides the seams between segments
      var a0 = Math.PI - (i / N) * Math.PI + (i ? 0.006 : 0);
      var a1 = Math.PI - ((i + 1) / N) * Math.PI - (i < N - 1 ? 0.006 : 0);
      html += '<path d="M' + pt(a0) + ' A' + R + ' ' + R + ' 0 0 1 ' + pt(a1) + '" fill="none" stroke="' +
        colorAt((i + 0.5) / N) + '" stroke-width="' + W + '"/>';
    }
    html +=
      '<g id="needle">' +
      '<path d="M100 20 L107.5 100 A7.5 7.5 0 0 1 92.5 100 Z" fill="#fff" stroke="#1a0b2e" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle cx="100" cy="100" r="12" fill="#fff" stroke="#1a0b2e" stroke-width="2.5"/>' +
      '<circle cx="100" cy="100" r="4.5" fill="#ff2e7e"/>' +
      '</g>';
    gauge.innerHTML = html;
    needle = document.getElementById('needle');
  }

  /* ---------------- needle spring ---------------- */

  var pos = 0, vel = 0, target = 0, lastT = 0, sweepT0 = 0;

  function frame(t) {
    var dt = Math.min(0.033, (t - lastT) / 1000 || 0.016);
    lastT = t;
    var goal = target;
    if (mode === 'intro') goal = Math.sin((t - sweepT0) / 1000 * 1.7) * 0.8;   // attract sweep
    else goal += Math.sin(t / 1000 * 9) * 0.012;                               // alive, not frozen
    var k = mode === 'intro' ? 30 : 110, c = mode === 'intro' ? 9 : 8.5;
    vel += ((goal - pos) * k - vel * c) * dt;
    pos += vel * dt;
    if (pos > 1.08) { pos = 1.08; vel *= -0.4; }
    if (pos < -1.08) { pos = -1.08; vel *= -0.4; }
    needle.setAttribute('transform', 'rotate(' + (pos * MAX_DEG).toFixed(2) + ' 100 100)');
    requestAnimationFrame(frame);
  }

  function score() { return maxSum ? sum / maxSum : 0; }

  /* ---------------- responsive sizing ---------------- */

  function overflowing() {
    return screenEl.scrollHeight > screenEl.clientHeight + 1 ||
      stage.scrollHeight > stage.clientHeight + 1 ||
      screenEl.scrollWidth > screenEl.clientWidth + 1;
  }
  function fit() {
    stage.scrollLeft = 0; stage.scrollTop = 0;
    var r = stage.getBoundingClientRect();
    stage.classList.toggle('wide', r.width > r.height * 1.15);
    var u = Math.min(r.width, r.height) / 100;
    root.style.setProperty('--u', u + 'px');
    var guard = 0;
    while (overflowing() && guard++ < 16) {
      u *= 0.94;
      root.style.setProperty('--u', u + 'px');
    }
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 150); });
  document.addEventListener('touchmove', function (e) { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  function show(html, animate) {
    screenEl.className = 'screen' + (animate ? ' swap' : '');
    screenEl.innerHTML = html;
    fit();
  }

  function brand() {
    return '<div class="brand"><b>' + esc(CFG.appName) + '</b> · ' + esc(CFG.tagline.replace(/^.*?·\s*/, '') || CFG.tagline) + '</div>';
  }

  /* ---------------- intro ---------------- */

  function renderIntro() {
    mode = 'intro';
    sweepT0 = performance.now();
    var n = 0, step = CFG.introWordMs || 170;
    var lines = CFG.introLines.map(function (line, li) {
      if (li) n += 2; // a beat between the two lines
      var words = line.split(/\s+/).map(function (w) {
        var hi = /^\*.*\*[^\w]*$/.test(w);
        var txt = w.replace(/\*/g, '');
        return '<span class="w' + (hi ? ' hi' : '') + '" style="animation-delay:' + (n++ * step) + 'ms">' + esc(txt) + '</span>';
      });
      return '<span class="ln">' + words.join(' ') + '</span>';
    });
    var after = n * step + 150;
    show(
      brand() +
      '<h1 class="hook">' + lines.join('') + '</h1>' +
      '<button class="cta late" id="startBtn" type="button" style="animation-delay:' + after + 'ms"><span class="in">' + esc(CFG.startLabel) + '</span></button>'
    );
    document.getElementById('startBtn').addEventListener('click', begin);
  }

  function begin() {
    Playable.start();
    mode = 'quiz';
    qIndex = 0; sum = 0; target = 0;
    renderQuestion();
  }

  /* ---------------- questions ---------------- */

  function renderQuestion() {
    var q = CFG.questions[qIndex], dots = '';
    for (var i = 0; i < CFG.questions.length; i++) dots += '<i class="' + (i <= qIndex ? 'on' : '') + '">🌶️</i>';
    var answers = q.answers.map(function (a, i) {
      return (i ? '<span class="or">OR</span>' : '') +
        '<button class="answer" type="button" data-i="' + i + '"><span class="em">' + (a.emoji || '') + '</span><span>' + esc(a.label) + '</span></button>';
    }).join('');
    show('<div class="qnum">' + dots + '</div><p class="prompt">' + esc(q.prompt) + '</p><div class="answers">' + answers + '</div>', true);

    var buttons = screenEl.querySelectorAll('.answer');
    for (var b = 0; b < buttons.length; b++) buttons[b].addEventListener('click', onAnswer);
    if (CFG.showCornerCta && qIndex >= 1) cornerCta.hidden = false;
  }

  function onAnswer(e) {
    var picked = parseInt(e.currentTarget.getAttribute('data-i'), 10);
    var a = CFG.questions[qIndex].answers[picked];
    var buttons = screenEl.querySelectorAll('.answer');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
      buttons[i].classList.add(i === picked ? 'picked' : 'dim');
      if (i === picked) buttons[i].classList.add((a.spice || 0) > 0 ? 'hot' : 'cold');
    }
    sum += a.spice || 0;
    target = score();
    vel += (a.spice > 0 ? 1 : -1) * 2.2;          // a kick so the swing feels physical

    if (a.react) {
      reactEl.textContent = a.react;
      reactEl.classList.remove('on');
      void reactEl.offsetWidth;
      reactEl.classList.add('on');
    }
    later(next, CFG.feedbackMs || 1100);
  }

  function next() {
    qIndex++;
    if (qIndex < CFG.questions.length) renderQuestion();
    else renderEnd();
  }

  /* ---------------- end: meter to centre, verdict, CTA ---------------- */

  function verdictFor(s) {
    for (var i = 0; i < CFG.verdicts.length; i++) if (s <= CFG.verdicts[i].upTo + 1e-6) return CFG.verdicts[i];
    return CFG.verdicts[CFG.verdicts.length - 1];
  }

  function renderEnd() {
    mode = 'end';
    cornerCta.hidden = true;
    reactEl.classList.remove('on');
    Playable.end();

    var s = score(), v = verdictFor(s), goat = s > 0;

    // FLIP: remember where the meter is, switch layout, then animate from the
    // old box to the new one so it glides to the centre and grows.
    var first = meterIn.getBoundingClientRect();
    stage.classList.add('end');
    var title = esc(v.title).replace(/([\u{1F300}-\u{1FAFF}☀-➿]️?)/gu, '<span class="e">$1</span>');
    show(
      '<h2 class="verdict' + (goat ? ' goat' : '') + '" id="verdict" style="visibility:hidden">' + title + '</h2>' +
      '<p class="sub" id="sub" style="visibility:hidden">' + esc(v.sub) + '</p>' +
      '<button class="cta" id="ctaBtn" type="button" style="visibility:hidden"><span class="in">' + esc(CFG.ctaLabel) + '</span></button>' +
      '<button class="replay" id="replayBtn" type="button" style="visibility:hidden">Play again</button>'
    );
    var last = meterIn.getBoundingClientRect();
    var dx = (first.left + first.width / 2) - (last.left + last.width / 2);
    var dy = (first.top + first.height / 2) - (last.top + last.height / 2);
    var sc = first.width / last.width;
    meterIn.style.transition = 'none';
    meterIn.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')';
    void meterIn.offsetWidth;
    meterIn.style.transition = 'transform .9s cubic-bezier(.3, 1.35, .45, 1)';
    meterIn.style.transform = 'none';

    // drumroll: needle slams both ends, then lands on the result
    target = -1;
    later(function () { target = 1; }, 380);
    later(function () { target = s; vel += (s >= 0 ? 1 : -1) * 1.5; }, 900);

    later(function () {
      reveal('verdict'); burst(goat);
    }, 1500);
    later(function () { reveal('sub'); }, 1800);
    later(function () { reveal('ctaBtn'); }, 2100);
    later(function () { reveal('replayBtn'); }, 2600);

    document.getElementById('ctaBtn').addEventListener('click', function () { Playable.install('endcard'); });
    document.getElementById('replayBtn').addEventListener('click', replay);
  }

  function reveal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.visibility = '';
    el.classList.add('pop');
  }

  function burst(goat) {
    var set = goat ? ['🐐', '🔥', '🌶️', '😈', '🐐'] : ['🙈', '😇', '🫣', '💤'];
    var r = stage.getBoundingClientRect(), html = '';
    for (var i = 0; i < 16; i++) {
      var ang = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
      var dist = (0.35 + Math.random() * 0.4) * Math.max(r.width, r.height);
      html += '<i style="--x:' + (Math.cos(ang) * dist).toFixed(0) + 'px;--y:' + (Math.sin(ang) * dist).toFixed(0) +
        'px;--r:' + ((Math.random() * 2 - 1) * 200).toFixed(0) + 'deg;--s:' + (6 + Math.random() * 6).toFixed(1) +
        ';--d:' + (1.1 + Math.random() * 0.7).toFixed(2) + 's">' + set[i % set.length] + '</i>';
    }
    burstEl.innerHTML = html;
  }

  function replay() {
    clearTimers();
    burstEl.innerHTML = '';
    stage.classList.remove('end');
    meterIn.style.transition = 'none';
    meterIn.style.transform = 'none';
    mode = 'quiz';
    qIndex = 0; sum = 0; target = 0;
    renderQuestion();
  }

  cornerCta.textContent = CFG.ctaLabel;
  cornerCta.addEventListener('click', function () { Playable.install('corner'); });
  document.getElementById('endL').textContent = CFG.meterLeft;
  document.getElementById('endR').textContent = CFG.meterRight;

  /* e2e hook: read-only peek at the state, used by headless tests */
  window.__blabzy = { state: function () { return { mode: mode, q: qIndex, score: score(), needle: pos }; } };

  /* ---------------- boot ---------------- */

  buildGauge();
  renderIntro();
  fit();
  requestAnimationFrame(frame);
  Playable.ready();
})();
