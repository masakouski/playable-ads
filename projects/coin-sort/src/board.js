/**
 * board.js — the coin-sort rules, with no rendering and no globals of its own.
 *
 * A board is an array of columns; a column is an array of coin VALUES with
 * index 0 at the floor, so the last element is the coin you can pick up.
 *
 * Rules:
 *   - you pick up the whole run of equal coins on top of a column;
 *   - you may put it on an empty column, or on a column whose top coin has the
 *     same value; only as many coins as fit are moved, the rest stay behind;
 *   - `mergeRun` equal coins on top of each other collapse into `mergeOut`
 *     coins of the next value up, and that can cascade.
 */
(function (global) {
  'use strict';

  var C = global.PLAYABLE_CONFIG || {};
  var CAP = C.capacity || 10;
  var RUN = C.mergeRun || 10;
  var OUT = C.mergeOut || 2;

  function clone(cols) {
    var out = [];
    for (var i = 0; i < cols.length; i++) out.push(cols[i].slice());
    return out;
  }

  function top(col) { return col.length ? col[col.length - 1] : 0; }

  /** The run of equal coins on top of a column: what a tap picks up. */
  function topRun(col) {
    if (!col.length) return { value: 0, len: 0 };
    var v = col[col.length - 1], n = 1;
    for (var i = col.length - 2; i >= 0 && col[i] === v; i--) n++;
    return { value: v, len: n };
  }

  /**
   * How many coins a move from a to b would actually shift (0 = illegal).
   * `strict` also rejects moves that change nothing — a whole single-value
   * column shuffled onto an empty one. The player is allowed those (a tap
   * should always feel like it did something); the hint finder is not.
   */
  function canMove(cols, a, b, strict) {
    if (a === b || a < 0 || b < 0) return 0;
    var A = cols[a], B = cols[b];
    if (!A.length || B.length >= CAP) return 0;
    if (B.length && top(B) !== top(A)) return 0;
    var run = topRun(A);
    if (strict && !B.length && run.len === A.length) return 0;
    return Math.min(run.len, CAP - B.length);
  }

  /** Applies a move. Returns {n, value} or null. Does NOT merge. */
  function move(cols, a, b) {
    var n = canMove(cols, a, b, false);
    if (!n) return null;
    var v = top(cols[a]);
    for (var i = 0; i < n; i++) cols[b].push(cols[a].pop());
    return { n: n, value: v };
  }

  /**
   * Collapses every ready run on the board, cascading (two fresh coins can
   * land on top of enough of their own kind to merge again).
   * Returns the merges in the order they fired: [{col, from, to}].
   */
  function resolve(cols) {
    var events = [], guard = 0;
    for (;;) {
      var fired = false;
      for (var i = 0; i < cols.length; i++) {
        var run = topRun(cols[i]);
        if (run.len >= RUN) {
          for (var k = 0; k < RUN; k++) cols[i].pop();
          for (var j = 0; j < OUT; j++) cols[i].push(run.value + 1);
          events.push({ col: i, from: run.value, to: run.value + 1 });
          fired = true;
        }
      }
      if (!fired || ++guard > 12) break;
    }
    return events;
  }

  /** Coins on the board worth at least `value` — how a goal is scored. */
  function countAtLeast(cols, value) {
    var n = 0;
    for (var i = 0; i < cols.length; i++)
      for (var k = 0; k < cols[i].length; k++) if (cols[i][k] >= value) n++;
    return n;
  }

  function freeSlots(cols) {
    var n = 0;
    for (var i = 0; i < cols.length; i++) n += CAP - cols[i].length;
    return n;
  }

  function anyMove(cols, strict) {
    for (var a = 0; a < cols.length; a++)
      for (var b = 0; b < cols.length; b++) if (canMove(cols, a, b, strict)) return true;
    return false;
  }

  /**
   * The move the ghost hand points at. No search tree: stacking onto a
   * matching column always beats parking on an empty one, and the closer the
   * destination gets to a merge the better.
   */
  function bestMove(cols, goalValue) {
    var best = null, bestScore = 0;
    for (var a = 0; a < cols.length; a++) {
      for (var b = 0; b < cols.length; b++) {
        var n = canMove(cols, a, b, true);
        if (!n) continue;
        var run = topRun(cols[a]);
        var score;
        if (cols[b].length) {
          score = 300 + (cols[b].length + n) * 12 + n * 4;
          if (cols[b].length + n >= RUN) score += 400;         // completes a merge
          if (n === run.len) score += 30;                      // empties the run
        } else {
          score = 60 + (4 - Math.min(4, run.len)) * 8;         // parking a blocker
          if (goalValue && run.value < goalValue - 1) score += 20;
        }
        if (score > bestScore) { bestScore = score; best = [a, b]; }
      }
    }
    return best;
  }

  /** Where a DROP lands: [{col, value}], never overfilling a column. */
  function dropPlan(cols, count, values) {
    var space = [], i, k;
    for (i = 0; i < cols.length; i++) space.push(CAP - cols[i].length);
    var plan = [];
    for (k = 0; k < count; k++) {
      var open = [];
      for (i = 0; i < space.length; i++) if (space[i] > 0) open.push(i);
      if (!open.length) break;
      var col = open[(Math.random() * open.length) | 0];
      space[col]--;
      plan.push({ col: col, value: values[(Math.random() * values.length) | 0] });
    }
    return plan;
  }

  global.Board = {
    CAP: CAP, RUN: RUN, OUT: OUT,
    clone: clone, top: top, topRun: topRun, canMove: canMove, move: move,
    resolve: resolve, countAtLeast: countAtLeast, freeSlots: freeSlots,
    anyMove: anyMove, bestMove: bestMove, dropPlan: dropPlan,
  };
})(window);
