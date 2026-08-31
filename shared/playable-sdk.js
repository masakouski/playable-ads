/**
 * playable-sdk.js — one thin layer over the ad networks' playable APIs.
 *
 * Ad networks inject their own globals into the playable at runtime. Mintegral
 * (MindWorks) expects these four, and its validator scans the file for them:
 *
 *   window.gameReady()  — the playable has loaded and is interactive
 *   window.gameStart()  — the user started playing
 *   window.gameEnd()    — the playable experience finished
 *   window.install()    — open the app store (call this from every CTA)
 *
 * None of them exist when you open the file in a normal browser, so every call
 * here is guarded and falls back to something sensible for local/Netlify testing.
 *
 * Usage:
 *   Playable.ready();            // once, after first paint
 *   Playable.start();            // on first interaction
 *   Playable.end();              // when the end card appears
 *   Playable.install('endcard'); // on any CTA tap
 */
(function (global) {
  'use strict';

  var cfg = global.PLAYABLE_CONFIG || {};
  var state = { ready: false, started: false, ended: false };
  var log = [];

  var DEBUG =
    /[?&]debug=1/.test(global.location ? global.location.search : '') || cfg.debug === true;

  function note(msg) {
    log.push(msg);
    if (global.console && console.log) console.log('[playable] ' + msg);
    if (DEBUG) paintDebug();
  }

  function call(name, fn) {
    try {
      fn();
    } catch (e) {
      note(name + ' threw: ' + (e && e.message));
    }
  }

  var API = {
    /** Tell the network the playable finished loading. */
    ready: function () {
      if (state.ready) return;
      state.ready = true;
      call('gameReady', function () {
        if (typeof window.gameReady === 'function') {
          window.gameReady();
          note('gameReady() -> network');
        } else {
          note('gameReady() (no SDK, local preview)');
        }
      });
    },

    /** Tell the network the user began interacting. */
    start: function () {
      if (state.started) return;
      state.started = true;
      call('gameStart', function () {
        if (typeof window.gameStart === 'function') {
          window.gameStart();
          note('gameStart() -> network');
        } else {
          note('gameStart() (no SDK, local preview)');
        }
        // IronSource / AppLovin equivalents, harmless when absent.
        if (global.dapi && typeof global.dapi.reportAdEvent === 'function') {
          global.dapi.reportAdEvent('start');
        }
      });
    },

    /**
     * Tell the network the playable is done. Safe to call more than once;
     * only the first call reaches the SDK.
     */
    end: function () {
      if (state.ended) return;
      state.ended = true;
      call('gameEnd', function () {
        if (typeof window.gameEnd === 'function') {
          window.gameEnd();
          note('gameEnd() -> network');
        } else {
          note('gameEnd() (no SDK, local preview)');
        }
        if (global.dapi && typeof global.dapi.reportAdEvent === 'function') {
          global.dapi.reportAdEvent('complete');
        }
      });
    },

    /**
     * Open the app store. Networks require gameEnd() before the store opens,
     * so it is fired here too (no-op if already sent).
     *
     * @param {string} [source] label for your own logs, e.g. 'endcard'
     */
    install: function (source) {
      API.end();
      note('install() from ' + (source || 'cta'));

      // 1. Mintegral / MindWorks — the primary target.
      if (typeof window.install === 'function') {
        call('install', function () {
          window.install();
        });
        return;
      }
      // 2. MRAID (IronSource, Vungle, AppLovin and most others).
      if (global.mraid && typeof global.mraid.open === 'function') {
        call('mraid.open', function () {
          global.mraid.open(storeUrl());
        });
        return;
      }
      // 3. Facebook / Meta playable.
      if (typeof global.FbPlayableAd === 'object' && global.FbPlayableAd &&
          typeof global.FbPlayableAd.onCTAClick === 'function') {
        call('FbPlayableAd.onCTAClick', function () {
          global.FbPlayableAd.onCTAClick();
        });
        return;
      }
      // 4. Google / AdWords playable.
      if (typeof global.ExitApi === 'object' && global.ExitApi &&
          typeof global.ExitApi.exit === 'function') {
        call('ExitApi.exit', function () {
          global.ExitApi.exit();
        });
        return;
      }
      // 5. Plain browser (local file or Netlify) — open the store page.
      note('no ad SDK present, opening store URL in a new tab');
      try {
        global.open(storeUrl(), '_blank');
      } catch (e) {
        /* popup blocked; nothing else to do */
      }
    },

    isEnded: function () {
      return state.ended;
    },
  };

  function storeUrl() {
    var isIOS = /iPad|iPhone|iPod/i.test(global.navigator ? navigator.userAgent : '');
    return (isIOS ? cfg.appStoreUrl : cfg.playStoreUrl) || cfg.playStoreUrl || cfg.appStoreUrl || '#';
  }

  /* ---- debug overlay: only with ?debug=1, never in a shipped ad ---- */
  var panel;
  function paintDebug() {
    if (!DEBUG || !global.document || !document.body) return;
    if (!panel) {
      panel = document.createElement('div');
      panel.setAttribute('style',
        'position:fixed;left:0;bottom:0;z-index:99999;max-width:100%;padding:6px 8px;' +
        'font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#7ef0a0;' +
        'background:rgba(0,0,0,.78);pointer-events:none;white-space:pre-wrap');
      document.body.appendChild(panel);
    }
    panel.textContent = log.slice(-6).join('\n');
  }

  global.Playable = API;
})(window);
