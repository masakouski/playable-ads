/**
 * Fonty playable - light skin.
 *
 * Same flow as the dark build:
 *   demo (scripted: type -> styles -> copy -> story -> paste)
 *   -> "Your turn!" -> editor (player types on the drawn keyboard)
 *   -> tap a style row = copy -> story with a big Paste button
 *   -> pasted text -> end card.
 *
 * Extra here: a Themes tab with keyboard skins the player can really apply,
 * so the ad shows off the second half of the app too.
 *
 * SDK calls: ready on first paint, start on the player's first REAL input
 * (never the demo, never the skip tap), end when the end card shows.
 */
(function () {
  'use strict';

  var cfg = window.PLAYABLE_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var stage = $('stage'), app = $('app');
  var editor = $('editor'), story = $('story'), sheet = $('sheet');
  var typedEl = $('typed'), inputEl = $('input'), inputText = $('inputText');
  var placeholder = $('placeholder'), counter = $('counter');
  var listEl = $('list'), kbEl = $('kb');
  var paneFonts = $('paneFonts'), paneThemes = $('paneThemes');
  var tabFonts = $('tabFonts'), tabThemes = $('tabThemes'), tabPill = $('tabPill');
  var storyText = $('storyText'), pasteBtn = $('pasteBtn'), hearts = $('hearts');
  var toast = $('toast'), turn = $('turn'), skip = $('skip'), hand = $('hand');

  var MAX = cfg.maxChars || 40;
  var state = {
    phase: 'boot',        // boot | demo | edit | story | end
    tab: 'fonts',         // fonts | themes
    text: '',
    shift: true,
    page: 'abc',          // abc | 123
    clipboard: '',        // the in-playable clipboard; Paste reads ONLY this
    theme: 0,
  };
  var rows = [];          // { id, el, txt }
  var keyEls = {};        // char -> element (current page)
  var idleTimer = 0;

  function setPhase(p) { state.phase = p; document.body.setAttribute('data-phase', p); }

  /* ---------------- sizing ---------------- */

  function fit() {
    var r = stage.getBoundingClientRect();
    var w = Math.min(r.width, r.height * 0.62);
    app.style.width = w + 'px';
    app.style.height = r.height + 'px';
    stage.classList.toggle('framed', w < r.width - 2);
    root.style.setProperty('--u', (w / 100) + 'px');
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 150); });

  /* ---------------- branding ---------------- */

  function brand() {
    each('[data-app-name]', function (el) { el.textContent = cfg.appName || 'Fonty'; });
    each('[data-app-sub]', function (el) { el.textContent = cfg.appSubtitle || ''; });
    each('[data-icon]', function (el) { el.textContent = cfg.iconGlyph || 'F'; });
    (cfg.headline || ['Try Any Font.', 'Instantly']).forEach(function (line, i) {
      if (i) $('headline').appendChild(document.createElement('br'));
      $('headline').appendChild(document.createTextNode(line));
    });
    $('headerCta').textContent = cfg.headerCtaLabel || 'GET';
    $('cta').textContent = cfg.ctaLabel || 'Get the app';
    $('endTitle').textContent = cfg.endTitle || '';
    $('endNote').textContent = cfg.endNote || '';
    (cfg.endSteps || []).forEach(function (s) {
      var li = document.createElement('li');
      li.innerHTML = s;                      // config is ours; <b> is the only markup used
      $('steps').appendChild(li);
    });
    $('themesNote').textContent = cfg.themesNote || '';
    placeholder.textContent = cfg.placeholder || '';
    turn.firstElementChild.textContent = cfg.yourTurnLabel || 'Your turn!';
  }
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

  /* ---------------- tabs ---------------- */

  function setTab(name) {
    if (state.phase === 'demo') return;
    state.tab = name;
    var onThemes = name === 'themes';
    tabFonts.classList.toggle('on', !onThemes);
    tabThemes.classList.toggle('on', onThemes);
    tabPill.classList.toggle('right', onThemes);
    paneFonts.hidden = onThemes;
    paneThemes.hidden = !onThemes;
    clearIdle(); hideHand();
    armIdle(editHintTarget, onThemes ? 2600 : null);
  }
  tabFonts.addEventListener('click', function () { began(); setTab('fonts'); });
  tabThemes.addEventListener('click', function () { began(); setTab('themes'); });

  /* ---------------- themes ---------------- */

  function buildThemes() {
    (cfg.themes || []).forEach(function (t, i) {
      var el = document.createElement('button');
      el.type = 'button'; el.className = 'theme' + (i === 0 ? ' on' : '');
      el.style.background = t.bg;
      el.style.color = t.dark || /gradient/.test(t.bg) ? '#fff' : 'var(--ink)';
      el.innerHTML = '<b></b><span class="tick">✓</span>' +
        '<span class="mini"><i></i><i></i><i></i><i></i></span>' +
        '<span class="mini"><i></i><i></i><i></i></span>';
      el.firstChild.textContent = t.name;
      Array.prototype.forEach.call(el.querySelectorAll('.mini i'), function (k) {
        k.style.background = t.key;
      });
      el.addEventListener('click', function () { began(); applyTheme(i); });
      $('themeGrid').appendChild(el);
    });
  }

  function applyTheme(i) {
    var t = (cfg.themes || [])[i];
    if (!t) return;
    state.theme = i;
    app.style.setProperty('--kb-bg', t.bg);
    app.style.setProperty('--key', t.key);
    app.style.setProperty('--key-ink', t.ink);
    app.style.setProperty('--key-fn', t.dark ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.45)');
    Array.prototype.forEach.call($('themeGrid').children, function (el, j) {
      el.classList.toggle('on', j === i);
    });
  }

  /* ---------------- style rows ---------------- */

  var COPY_ICON = '<svg viewBox="0 0 24 24"><path d="M8 3h10a2 2 0 0 1 2 2v12h-2V5H8V3ZM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/></svg>';

  function buildRows() {
    (cfg.fonts || Object.keys(Fonts.list)).forEach(function (id) {
      if (!Fonts.list[id]) return;
      var el = document.createElement('button');
      el.type = 'button'; el.className = 'row';
      el.innerHTML = '<span class="txt"></span><span class="copy">' + COPY_ICON + 'Copy</span>';
      el.addEventListener('click', function () { if (state.phase === 'edit') { began(); copyRow(id); } });
      listEl.appendChild(el);
      rows.push({ id: id, el: el, txt: el.firstChild });
    });
  }

  function render() {
    var t = state.text;
    typedEl.textContent = t;
    placeholder.hidden = t.length > 0;
    inputText.classList.toggle('small', t.length > 22);
    counter.textContent = t.length + '/' + MAX;
    editor.classList.toggle('empty', !t.trim());
    rows.forEach(function (r) {
      // Empty input: show the style's own name as a sample, dimmed.
      r.txt.textContent = Fonts.convert(r.id, t.trim() ? t : Fonts.list[r.id].name);
      r.txt.classList.toggle('dim', !t.trim());
    });
  }

  /* ---------------- keyboard ---------------- */

  var PAGES = {
    abc: ['qwertyuiop', 'asdfghjkl', '^zxcvbnm<', '#, .?'],
    123: ['1234567890', '-/:;()&@"', "_.,?!'<", '#, .?'],
  };
  var BKSP = '<svg viewBox="0 0 24 24"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7Z"/><path d="M12 9.5l5 5m0-5l-5 5"/></svg>';
  var SHIFT = '<svg viewBox="0 0 24 24"><path d="M12 4l8 9h-4.5v6h-7v-6H4l8-9Z"/></svg>';

  function buildKeyboard() {
    kbEl.innerHTML = ''; keyEls = {};
    PAGES[state.page].forEach(function (line, li) {
      var rowEl = document.createElement('div'); rowEl.className = 'kb-row';
      Array.from(line).forEach(function (ch) {
        var k = document.createElement('div'); k.className = 'key';
        var code = ch;
        if (ch === '^') { code = 'shift'; k.className += ' fn w15'; k.innerHTML = SHIFT; }
        else if (ch === '<') { code = 'back'; k.className += ' fn w2'; k.innerHTML = BKSP; }
        else if (ch === '#' && li === 3) {
          code = 'page'; k.className += ' fn w2'; k.textContent = state.page === 'abc' ? '123' : 'ABC';
        }
        else if (ch === ' ') { k.className += ' space'; k.textContent = 'space'; }
        else k.textContent = ch;
        k.setAttribute('data-k', code);
        keyEls[code] = k;
        rowEl.appendChild(k);
      });
      kbEl.appendChild(rowEl);
    });
    paintShift();
  }

  function paintShift() {
    var on = state.shift && state.page === 'abc';
    if (keyEls.shift) keyEls.shift.classList.toggle('on', on);
    Object.keys(keyEls).forEach(function (c) {
      if (c.length === 1 && /[a-z]/.test(c)) keyEls[c].textContent = on ? c.toUpperCase() : c;
    });
  }

  function flash(el) {
    if (!el) return;
    el.classList.add('down');
    setTimeout(function () { el.classList.remove('down'); }, 110);
  }

  /** One key press, from the drawn keyboard, a hardware keyboard or the demo. */
  function press(code) {
    flash(keyEls[code]);
    if (code === 'shift') { state.shift = !state.shift; paintShift(); return; }
    if (code === 'page') { state.page = state.page === 'abc' ? '123' : 'abc'; buildKeyboard(); return; }
    if (code === 'back') {
      // Array.from keeps a surrogate pair (emoji from a hardware keyboard) whole.
      var a = Array.from(state.text); a.pop(); state.text = a.join('');
      if (!state.text) { state.shift = true; paintShift(); }
      render(); return;
    }
    if (state.text.length >= MAX) { nudge(); return; }
    if (code === ' ' && (!state.text || / $/.test(state.text))) return;   // no leading/double spaces
    var ch = code;
    if (state.shift && /[a-z]/.test(code)) { ch = code.toUpperCase(); state.shift = false; paintShift(); }
    state.text += ch;
    render();
  }

  function nudge() {
    if (state.tab !== 'fonts') return;
    inputEl.classList.remove('nudge'); void inputEl.offsetWidth; inputEl.classList.add('nudge');
    setTimeout(function () { inputEl.classList.remove('nudge'); }, 500);
  }

  var repeatT = 0;
  function stopRepeat() { clearTimeout(repeatT); clearInterval(repeatT); repeatT = 0; }

  kbEl.addEventListener('pointerdown', function (e) {
    var k = e.target.closest ? e.target.closest('.key') : null;
    if (!k || state.phase !== 'edit') return;
    e.preventDefault();
    began();
    // Typing always belongs to the Fonts tab - jump back if the player wandered off.
    if (state.tab !== 'fonts') setTab('fonts');
    var code = k.getAttribute('data-k');
    press(code);
    if (code === 'back') {                      // hold to delete
      stopRepeat();
      repeatT = setTimeout(function () {
        repeatT = setInterval(function () { press('back'); }, 70);
      }, 420);
    }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { window.addEventListener(ev, stopRepeat); });

  // Hardware keyboard (desktop preview, gallery). Never focuses an <input>, so a
  // phone's native keyboard is never summoned.
  window.addEventListener('keydown', function (e) {
    if (state.phase !== 'edit' || e.metaKey || e.ctrlKey || e.altKey) return;
    var code = null;
    if (e.key === 'Backspace') code = 'back';
    else if (e.key && e.key.length === 1 && e.key >= ' ' && e.key <= '~') code = e.key;
    if (!code) return;
    e.preventDefault();
    began();
    if (state.tab !== 'fonts') setTab('fonts');
    if (code === 'back') { press(code); return; }
    // Typed characters keep their own case; light the matching drawn key if there is one.
    flash(keyEls[code.toLowerCase()]);
    if (state.text.length >= MAX) { nudge(); return; }
    if (code === ' ' && (!state.text || / $/.test(state.text))) return;
    state.text += code;
    if (state.shift) { state.shift = false; paintShift(); }
    render();
  });

  /* ---------------- copy / paste ---------------- */

  /** Best-effort write to the device clipboard. The playable never depends on it. */
  function writeNativeClipboard(text) {
    if (cfg.realClipboard === false) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
        return;
      }
    } catch (e) { /* fall through */ }
    legacyCopy(text);
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');           // readonly => iOS does not raise its keyboard
      ta.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0;font-size:16px';
      document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, text.length);
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    } catch (e) { /* blocked by the WebView - the variable copy still works */ }
  }

  function showToast() {
    toast.hidden = true; void toast.offsetWidth; toast.hidden = false;
    setTimeout(function () { toast.hidden = true; }, 900);
  }

  function copyRow(id, isDemo) {
    var row = rows.filter(function (r) { return r.id === id; })[0];
    if (!state.text.trim()) { nudge(); return false; }
    state.clipboard = Fonts.convert(id, state.text.trim());
    if (!isDemo) writeNativeClipboard(state.clipboard);
    if (row) row.el.classList.add('done');
    showToast();
    if (!isDemo) {
      clearIdle(); hideHand();
      setPhase('story');
      setTimeout(function () { showStory(); armIdle(pasteBtn, 1800); }, 850);
    }
    return true;
  }

  function showStory() {
    storyText.textContent = ''; storyText.className = 'story-text';
    pasteBtn.classList.remove('gone'); pasteBtn.hidden = false;
    hearts.innerHTML = '';
    story.hidden = false; story.classList.add('off-right');
    void story.offsetWidth;
    story.classList.remove('off-right');
    editor.classList.add('off-left');
  }

  function paste() {
    var t = state.clipboard;
    var n = Array.from(t).length;
    storyText.textContent = t;
    storyText.className = 'story-text pop' + (n > 26 ? ' s' : n > 13 ? ' m' : '');
    pasteBtn.classList.add('gone');
    setTimeout(function () { pasteBtn.hidden = true; }, 260);
    burst();
  }

  function burst() {
    var set = ['❤️', '🔥', '😍', '✨', '💜'];
    for (var i = 0; i < 9; i++) {
      var s = document.createElement('span');
      s.textContent = set[i % set.length];
      s.style.left = (8 + Math.random() * 78) + '%';
      s.style.animationDelay = (i * 90) + 'ms';
      s.style.setProperty('--dx', ((Math.random() - 0.5) * 60) + 'px');
      hearts.appendChild(s);
    }
  }

  pasteBtn.addEventListener('click', function () {
    if (state.phase !== 'story') return;
    clearIdle(); hideHand();
    paste();
    setPhase('end');
    setTimeout(function () { sheet.hidden = false; Playable.end(); }, cfg.endDelayMs || 1700);
  });

  $('cta').addEventListener('click', function () { Playable.install('endcard'); });
  $('headerCta').addEventListener('click', function () { Playable.install('header'); });

  /* ---------------- guide hand ---------------- */

  function moveHand(el, fx, fy) {
    var a = app.getBoundingClientRect(), r = el.getBoundingClientRect();
    var x = r.left - a.left + r.width * (fx == null ? 0.5 : fx);
    var y = r.top - a.top + r.height * (fy == null ? 0.55 : fy);
    hand.hidden = false;
    hand.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }
  function tapHand() {
    hand.classList.remove('tap'); void hand.offsetWidth; hand.classList.add('tap');
  }
  function hideHand() { hand.hidden = true; hand.classList.remove('nudge', 'tap'); }

  /** After `ms` of inactivity, point the hand at `target` (element or a function returning one). */
  function armIdle(target, ms) {
    clearIdle();
    idleTimer = setTimeout(function () {
      var el = typeof target === 'function' ? target() : target;
      if (!el) return;
      moveHand(el); hand.classList.add('nudge');
    }, ms || cfg.idleHintMs || 3500);
  }
  function clearIdle() { clearTimeout(idleTimer); }

  function editHintTarget() {
    if (state.tab !== 'fonts') return tabFonts;               // wandered into Themes
    // Nothing typed yet -> point at the keyboard; otherwise at the first style row.
    return state.text.trim() ? rows[0].el.querySelector('.copy') : keyEls.h || kbEl;
  }

  var startedOnce = false;
  function began() {
    if (!startedOnce) { startedOnce = true; Playable.start(); }
    hideHand();
    armIdle(editHintTarget);
  }

  /* ---------------- demo ---------------- */

  var demo = { dead: false };
  function wait(ms) {
    return new Promise(function (res, rej) {
      setTimeout(function () { demo.dead ? rej(new Error('skip')) : res(); }, ms);
    });
  }

  function runDemo() {
    setPhase('demo');
    app.classList.add('demo');
    skip.hidden = false;
    var text = cfg.demoText || 'what a beautiful day';
    var fontId = Fonts.list[cfg.demoFont] ? cfg.demoFont : rows[0].id;
    var row = rows.filter(function (r) { return r.id === fontId; })[0] || rows[0];
    state.shift = false; paintShift();          // the sample phrase is lower-case on purpose

    var p = wait(500);
    Array.from(text).forEach(function (ch) {
      p = p.then(function () { press(ch); return wait(cfg.demoTypeMs || 60); });
    });
    p.then(function () { return wait(350); })
      .then(function () { moveHand(row.el.querySelector('.copy')); return wait(620); })
      .then(function () { tapHand(); row.el.classList.add('hit'); return wait(160); })
      .then(function () { row.el.classList.remove('hit'); copyRow(row.id, true); return wait(850); })
      .then(function () { hand.hidden = true; showStory(); return wait(650); })
      .then(function () { moveHand(pasteBtn, 0.62, 0.6); return wait(620); })
      .then(function () { tapHand(); return wait(170); })
      .then(function () { paste(); hand.hidden = true; return wait(1500); })
      .then(function () { turn.hidden = false; return wait(450); })
      .then(startPlay, function () { /* skipped: startPlay already ran */ });
  }

  function skipDemo(e) {
    if (state.phase !== 'demo') return;
    if (e) { e.preventDefault(); e.stopPropagation(); }
    demo.dead = true;
    startPlay();
  }
  stage.addEventListener('pointerdown', skipDemo, true);

  function startPlay() {
    if (state.phase === 'edit') return;
    setPhase('edit');
    app.classList.remove('demo');
    skip.hidden = true; toast.hidden = true; hideHand();
    state.text = ''; state.clipboard = ''; state.shift = true; state.page = 'abc';
    rows.forEach(function (r) { r.el.classList.remove('done', 'hit'); });
    buildKeyboard(); render();
    setTab('fonts');
    listEl.scrollTop = 0;
    // Bring the editor back without animating the story sliding away under the overlay.
    story.hidden = true; story.classList.add('off-right');
    editor.classList.remove('off-left');
    setTimeout(function () { turn.hidden = true; }, 600);
    armIdle(editHintTarget, 1600);
  }

  /* ---------------- boot ---------------- */

  brand();
  buildRows();
  buildThemes();
  buildKeyboard();
  applyTheme(0);
  render();
  fit();
  requestAnimationFrame(function () {
    fit();
    Playable.ready();
    if (/[?&]nodemo=1/.test(location.search)) startPlay(); else runDemo();
  });
})();
