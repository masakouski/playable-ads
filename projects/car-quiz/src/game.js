/* Car Quiz — playable ad logic. No dependencies, no network calls. */
(function () {
  'use strict';

  var CFG = window.PLAYABLE_CONFIG;
  var root = document.documentElement;
  var stage = document.getElementById('stage');
  var screenEl = document.getElementById('screen');
  var hud = document.getElementById('hud');
  var pips = document.getElementById('pips');
  var timer = document.getElementById('timer');
  var timerFill = document.getElementById('timerFill');
  var cornerCta = document.getElementById('cornerCta');

  var qIndex = 0;
  var score = 0;
  var results = [];
  var timeoutId = null;
  var tickId = null;

  /* ---------------- car silhouettes (inline SVG, zero bytes of assets) ------- */

  function wheels() {
    var out = '';
    for (var i = 0; i < arguments.length; i++) {
      var cx = arguments[i];
      out +=
        '<circle class="tyre" cx="' + cx + '" cy="72" r="12"/>' +
        '<circle class="rim" cx="' + cx + '" cy="72" r="4.6"/>';
    }
    return out;
  }

  var CARS = {
    sports: {
      color: '#ff5a1f',
      body:
        'M10 74 L12 58 C14 51 22 49 34 47 L64 43 C78 31 96 27 116 28 C134 29 148 35 158 45 ' +
        'L182 51 C192 54 195 59 195 66 L195 72 C195 75 193 76 189 76 L15 76 C10 76 9 76 10 74 Z',
      glass: 'M70 44 C82 34 97 31 112 32 C124 33 134 37 143 45 Z',
      wheels: [58, 150],
    },
    suv: {
      color: '#4f8cff',
      body:
        'M14 74 L14 24 C14 18 18 14 26 14 L140 14 C148 14 153 17 156 22 L167 36 L184 40 ' +
        'C190 42 193 46 193 52 L193 72 C193 75 191 76 187 76 L18 76 C15 76 14 76 14 74 Z',
      glass: 'M24 20 L138 20 C142 20 145 21 147 24 L156 35 L24 35 Z',
      wheels: [52, 154],
    },
    pickup: {
      color: '#f5c542',
      body:
        'M14 74 L14 50 L94 50 L100 22 C102 18 106 16 112 16 L146 16 C152 16 156 19 158 24 ' +
        'L167 44 L184 48 C190 50 193 54 193 60 L193 72 C193 75 191 76 187 76 L18 76 ' +
        'C15 76 14 76 14 74 Z',
      glass: 'M106 22 C107 20 109 19 112 19 L145 19 C149 19 151 20 152 23 L160 43 L101 43 Z',
      wheels: [50, 152],
    },
    van: {
      color: '#8b6bff',
      body:
        'M14 74 L14 18 C14 14 17 11 22 11 L172 11 C182 11 188 15 191 24 L193 34 L193 72 ' +
        'C193 75 191 76 187 76 L18 76 C15 76 14 76 14 74 Z',
      glass: 'M24 17 L170 17 C176 17 180 19 182 25 L184 33 L24 33 Z',
      wheels: [52, 154],
    },
    hatchback: {
      color: '#2ee27a',
      body:
        'M18 74 L18 48 C18 43 21 40 27 39 L46 36 L66 20 C69 17 73 15 79 15 L128 15 ' +
        'C136 15 141 18 145 24 L156 40 L178 45 C186 47 189 51 189 57 L189 72 ' +
        'C189 75 187 76 183 76 L22 76 C19 76 18 76 18 74 Z',
      glass: 'M72 22 C74 19 77 18 81 18 L126 18 C131 18 134 19 136 23 L146 39 L56 39 Z',
      wheels: [58, 148],
    },
  };

  function carSvg(kind, cls) {
    var c = CARS[kind] || CARS.sports;
    return (
      '<svg class="car ' + (cls || '') + '" viewBox="0 0 205 90" role="img" aria-label="' + kind + '" ' +
      'style="color:' + c.color + '">' +
      '<path class="body" d="' + c.body + '"/>' +
      '<path class="glass" d="' + c.glass + '"/>' +
      wheels.apply(null, c.wheels) +
      '</svg>'
    );
  }

  /* ---------------- responsive sizing ---------------- */

  function fit() {
    var r = stage.getBoundingClientRect();
    var base = Math.min(r.width, r.height) / 100;
    var u = base;
    root.style.setProperty('--u', u + 'px');

    // Shrink until the current screen fits without scrolling (small landscape phones).
    var guard = 0;
    while (screenEl.scrollHeight > screenEl.clientHeight + 1 && guard++ < 14) {
      u *= 0.93;
      root.style.setProperty('--u', u + 'px');
    }
  }

  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () {
    setTimeout(fit, 150);
  });
  document.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  /* ---------------- screens ---------------- */

  function show(html, cls) {
    screenEl.className = 'screen fade-in ' + (cls || '');
    screenEl.innerHTML = html;
    fit();
  }

  function renderIntro() {
    hud.classList.remove('on');
    show(
      carSvg('sports', 'hero') +
        '<div>' +
        '<h1 class="title">' + CFG.appName + '</h1>' +
        '<p class="subtitle">' + CFG.tagline + '</p>' +
        '</div>' +
        '<button class="cta" id="startBtn" type="button">START</button>',
      'intro'
    );
    document.getElementById('startBtn').addEventListener('click', begin);
  }

  function begin() {
    Playable.start();
    qIndex = 0;
    score = 0;
    results = [];
    hud.classList.add('on');
    renderQuestion();
  }

  function renderPips() {
    var html = '';
    for (var i = 0; i < CFG.questions.length; i++) {
      var cls = i < results.length ? (results[i] ? 'done' : 'miss') : i === qIndex ? 'now' : '';
      html += '<i class="' + cls + '"></i>';
    }
    pips.innerHTML = html;
  }

  function renderQuestion() {
    var q = CFG.questions[qIndex];
    renderPips();

    var answers = q.answers
      .map(function (a, i) {
        var inner =
          q.type === 'image'
            ? carSvg(a.car) + '<span class="cap">' + (a.label || '') + '</span>'
            : a.label;
        return '<button class="answer" type="button" data-i="' + i + '">' + inner + '</button>';
      })
      .join('');

    show(
      '<p class="prompt"><span class="qnum">Question ' + (qIndex + 1) + ' of ' + CFG.questions.length + '</span>' +
        q.prompt + '</p>' +
        '<div class="answers ' + (q.type === 'image' ? 'image' : 'text') + '">' + answers + '</div>'
    );

    var buttons = screenEl.querySelectorAll('.answer');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', onAnswer);
    }

    if (CFG.showCornerCta && qIndex >= 1) cornerCta.hidden = false;
    startTimer();
  }

  function onAnswer(e) {
    var picked = parseInt(e.currentTarget.getAttribute('data-i'), 10);
    resolve(picked);
  }

  function resolve(picked) {
    stopTimer();
    var q = CFG.questions[qIndex];
    var buttons = screenEl.querySelectorAll('.answer');
    var right = false;

    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
      var isCorrect = !!q.answers[i].correct;
      if (isCorrect) {
        buttons[i].classList.add('correct');
        if (i === picked) right = true;
      } else if (i === picked) {
        buttons[i].classList.add('wrong');
      } else {
        buttons[i].classList.add('dim');
      }
    }

    if (right) score++;
    results.push(right);
    renderPips();

    timeoutId = setTimeout(next, CFG.feedbackMs || 900);
  }

  function next() {
    qIndex++;
    if (qIndex < CFG.questions.length) renderQuestion();
    else renderEnd();
  }

  /* ---------------- timer ---------------- */

  function startTimer() {
    var secs = CFG.secondsPerQuestion;
    if (!secs) {
      timer.style.visibility = 'hidden';
      return;
    }
    timer.style.visibility = 'visible';
    timer.classList.remove('low');
    timerFill.style.transition = 'none';
    timerFill.style.transform = 'scaleX(1)';
    // force a reflow so the reset is applied before the animation starts
    void timerFill.offsetWidth;
    timerFill.style.transition = 'transform ' + secs + 's linear';
    timerFill.style.transform = 'scaleX(0)';

    tickId = setTimeout(function () {
      timer.classList.add('low');
    }, secs * 700);

    timeoutId = setTimeout(function () {
      resolve(-1); // ran out of time: reveal the answer, count it wrong
    }, secs * 1000);
  }

  function stopTimer() {
    clearTimeout(timeoutId);
    clearTimeout(tickId);
    timerFill.style.transition = 'none';
    timerFill.style.transform =
      'scaleX(' + (timerFill.getBoundingClientRect().width / (timer.clientWidth || 1)) + ')';
  }

  /* ---------------- end card ---------------- */

  function renderEnd() {
    hud.classList.remove('on');
    cornerCta.hidden = true;

    // The playable experience is over — tell the network before showing the CTA.
    Playable.end();

    var total = CFG.questions.length;
    var pct = Math.round((score / total) * 100);
    var title = CFG.endTitles[Math.min(score, CFG.endTitles.length - 1)];

    show(
      '<div class="score" style="--pct:' + pct + '%"><span>' + score + '<small>/' + total + '</small></span></div>' +
        '<div>' +
        '<h2 class="title">' + title + '</h2>' +
        '<p class="subtitle">' + CFG.endSubtitle + '</p>' +
        '</div>' +
        '<button class="cta" id="ctaBtn" type="button">' + CFG.ctaLabel + '</button>' +
        '<button class="replay" id="replayBtn" type="button">Try again</button>',
      'end'
    );

    document.getElementById('ctaBtn').addEventListener('click', function () {
      Playable.install('endcard');
    });
    document.getElementById('replayBtn').addEventListener('click', function () {
      hud.classList.add('on');
      qIndex = 0;
      score = 0;
      results = [];
      renderQuestion();
    });
  }

  cornerCta.addEventListener('click', function () {
    Playable.install('corner');
  });
  cornerCta.textContent = CFG.ctaLabel;

  /* ---------------- boot ---------------- */

  renderIntro();
  fit();
  Playable.ready();
})();
