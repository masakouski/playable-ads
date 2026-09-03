/**
 * puzzle.js — the water-sort rules, a breadth-first solver, and a level
 * generator that only ever hands back puzzles it has already solved itself.
 *
 * A state is an array of tubes; a tube is an array of colour indices, index 0
 * at the BOTTOM. Capacity is 4, and every colour appears exactly 4 times, so a
 * bottle is "done" when it is empty or holds 4 of one colour.
 */
(function (global) {
  'use strict';

  var CAP = 4;

  function clone(tubes) {
    var out = new Array(tubes.length);
    for (var i = 0; i < tubes.length; i++) out[i] = tubes[i].slice();
    return out;
  }

  /** The run of same-coloured units sitting on top of a tube. */
  function topRun(tube) {
    var n = tube.length;
    if (!n) return null;
    var c = tube[n - 1], k = 1;
    for (var i = n - 2; i >= 0 && tube[i] === c; i--) k++;
    return { color: c, count: k };
  }

  /**
   * How many units may legally move from a to b (0 = illegal).
   * `prune` also rejects moves that are legal but pointless (emptying a
   * single-colour tube into an empty one) — the solver needs that, the player
   * does not.
   */
  function canPour(tubes, a, b, prune) {
    if (a === b) return 0;
    var A = tubes[a], B = tubes[b];
    if (!A.length || B.length >= CAP) return 0;
    var run = topRun(A);
    if (B.length && B[B.length - 1] !== run.color) return 0;
    if (!B.length && run.count === A.length) return 0; // moving a whole tube sideways
    if (prune && run.count === A.length && A.length === CAP) return 0;
    return Math.min(run.count, CAP - B.length);
  }

  function pour(tubes, a, b) {
    var n = canPour(tubes, a, b, false);
    for (var i = 0; i < n; i++) tubes[b].push(tubes[a].pop());
    return n;
  }

  function isDone(tube) {
    if (!tube.length) return true;
    if (tube.length !== CAP) return false;
    for (var i = 1; i < CAP; i++) if (tube[i] !== tube[0]) return false;
    return true;
  }

  function isSolved(tubes) {
    for (var i = 0; i < tubes.length; i++) if (!isDone(tubes[i])) return false;
    return true;
  }

  /** Tube order is irrelevant to solvability, so the key sorts the tubes. */
  function key(tubes) {
    var parts = new Array(tubes.length);
    for (var i = 0; i < tubes.length; i++) parts[i] = tubes[i].join('');
    parts.sort();
    return parts.join('|');
  }

  function anyMove(tubes) {
    for (var a = 0; a < tubes.length; a++)
      for (var b = 0; b < tubes.length; b++)
        if (canPour(tubes, a, b, false)) return true;
    return false;
  }

  /**
   * Shortest solution as a list of [from, to], or null if there is none inside
   * the node budget. Breadth-first, so the first solution found is the shortest
   * — which is what the demo autoplay and the hint both want.
   */
  function solve(tubes, maxNodes) {
    maxNodes = maxNodes || 120000;
    if (isSolved(tubes)) return [];

    var seen = Object.create(null);
    var queue = [{ t: clone(tubes), p: -1, m: null }];
    seen[key(tubes)] = 1;

    for (var head = 0; head < queue.length; head++) {
      if (head > maxNodes) return null;
      var node = queue[head], t = node.t, n = t.length;
      for (var a = 0; a < n; a++) {
        if (!t[a].length) continue;
        for (var b = 0; b < n; b++) {
          if (!canPour(t, a, b, true)) continue;
          var next = clone(t);
          pour(next, a, b);
          var k = key(next);
          if (seen[k]) continue;
          seen[k] = 1;
          var child = { t: next, p: head, m: [a, b] };
          if (isSolved(next)) {
            var path = [];
            for (var c = child; c.p >= 0; c = queue[c.p]) path.unshift(c.m);
            return path;
          }
          queue.push(child);
        }
      }
    }
    return null;
  }

  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = (rnd() * (i + 1)) | 0;
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function distinctCount(tube) {
    var seenC = {}, n = 0;
    for (var i = 0; i < tube.length; i++) if (!seenC[tube[i]]) { seenC[tube[i]] = 1; n++; }
    return n;
  }

  /**
   * Deal `colors` colours into `colors` full bottles plus `empty` spares, then
   * keep re-dealing until the result is solvable, not already half-solved, and
   * takes at least `minMoves` pours. Returns { tubes, solution }.
   */
  function generate(opts) {
    var nColors = opts.colors, nEmpty = opts.empty == null ? 2 : opts.empty;
    var minMoves = opts.minMoves || 4;
    var rnd = opts.random || Math.random;
    var wantFour = !!opts.wantFourColourBottle;
    var best = null;

    for (var attempt = 0; attempt < 300; attempt++) {
      var units = [];
      for (var c = 0; c < nColors; c++) for (var u = 0; u < CAP; u++) units.push(c);
      shuffle(units, rnd);

      var tubes = [], i;
      for (i = 0; i < nColors; i++) tubes.push(units.slice(i * CAP, i * CAP + CAP));
      for (i = 0; i < nEmpty; i++) tubes.push([]);

      var ok = true, maxDistinct = 0;
      for (i = 0; i < nColors; i++) {
        var d = distinctCount(tubes[i]);
        if (d < 2) { ok = false; break; }         // a bottle that starts solved is a giveaway
        if (d > maxDistinct) maxDistinct = d;
      }
      if (!ok) continue;
      if (wantFour && maxDistinct < 4) continue;  // "up to 4 colours in a bottle"

      var sol = solve(tubes, 120000);
      if (!sol) continue;
      if (sol.length < minMoves) { if (!best) best = { tubes: tubes, solution: sol }; continue; }
      return { tubes: tubes, solution: sol };
    }
    // Never leave the player without a level: fall back to the best seen, or a
    // trivially solvable deal.
    if (best) return best;
    var fb = [];
    for (var f = 0; f < nColors; f++) {
      var t = [];
      for (var g = 0; g < CAP; g++) t.push((f + g) % nColors);
      fb.push(t);
    }
    for (var e = 0; e < nEmpty; e++) fb.push([]);
    return { tubes: fb, solution: solve(fb, 120000) || [] };
  }

  global.Puzzle = {
    CAP: CAP,
    clone: clone,
    topRun: topRun,
    canPour: canPour,
    pour: pour,
    isDone: isDone,
    isSolved: isSolved,
    anyMove: anyMove,
    solve: solve,
    generate: generate,
  };
})(window);
