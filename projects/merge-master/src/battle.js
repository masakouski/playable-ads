/**
 * battle.js — tutorial hand, the scripted auto-battle and the end card.
 * Port of assets/scripts/view/{HandHint,BattleView,EndCard}.ts.
 *
 * The fight is deliberately NOT a fair simulation: enemy HP is derived from the
 * player's actual DPS so it always lands in a 6-9 second window, the hero's HP
 * floors at 18% so they cannot lose, and CFG.battle.maxSeconds is a hard stop.
 * Ads should never end in a loss or drag on.
 */
(function (global) {
  'use strict';

  var E = global.E, A = global.ART, M = global.MM;
  var Color = E.Color, col = E.col, Vec3 = E.Vec3, tween = E.tween, Tween = E.Tween;
  var C = A.C, mkNode = A.mkNode, mkGraphics = A.mkGraphics, mkLabel = A.mkLabel;
  var plate = A.plate, poly = A.poly, star = A.star, bar = A.bar;
  var drawIcon = A.drawIcon, popIn = A.popIn, pulse = A.pulse, shake = A.shake;
  var UIButton = A.UIButton;
  var CFG = M.CFG;
  var UI = global.PLAYABLE_CONFIG || {};

  function P() { return global.Playable; }

  /* -------------------------------------------------------------- HandHint */

  /** Animated pointing hand + tap ring used to drive the tutorial. */
  function HandHint(parent) {
    this.node = mkNode(parent, 'HandHint', 140, 160);

    this.ringNode = mkNode(this.node, 'ring', 120, 120, 0, 30);
    var rg = this.ringNode.addGraphics();
    rg.lineWidth = 7;
    rg.strokeColor = new Color(255, 255, 255, 220);
    rg.circle(0, 0, 30);
    rg.stroke();

    this.handNode = mkNode(this.node, 'hand', 120, 140, 6, -30);
    this.drawHand(this.handNode.addGraphics());

    this.node.active = false;
  }

  HandHint.prototype.drawHand = function (g) {
    var s = 110;
    g.fillColor = col('#f4d9b8');
    g.roundRect(-s * 0.28, -s * 0.55, s * 0.56, s * 0.55, s * 0.16);
    g.fill();
    g.fillColor = col('#f9e6cb');
    g.roundRect(-s * 0.11, -s * 0.14, s * 0.22, s * 0.52, s * 0.11);
    g.fill();
    for (var i = 0; i < 3; i++) {
      g.fillColor = col('#e7c8a2');
      g.roundRect(-s * 0.26 + i * s * 0.17, -s * 0.22, s * 0.15, s * 0.14, s * 0.06);
      g.fill();
    }
    g.fillColor = col('#3b4a63');
    g.roundRect(-s * 0.3, -s * 0.62, s * 0.6, s * 0.14, s * 0.05);
    g.fill();
    g.lineWidth = 4;
    g.strokeColor = col('#6b4c2c');
    g.roundRect(-s * 0.28, -s * 0.55, s * 0.56, s * 0.55, s * 0.16);
    g.stroke();
  };

  HandHint.prototype.stopAll = function () {
    Tween.stopAllByTarget(this.node);
    Tween.stopAllByTarget(this.handNode);
    Tween.stopAllByTarget(this.ringNode);
  };

  HandHint.prototype.hide = function () {
    this.stopAll();
    this.node.active = false;
  };

  Object.defineProperty(HandHint.prototype, 'visible', {
    get: function () { return this.node.active; },
  });

  HandHint.prototype.ringPulse = function () {
    this.ringNode.setScale(0.5, 0.5);
    this.ringNode.opacity = 200;
    tween(this.ringNode).repeatForever(
      tween(this.ringNode)
        .set({ scale: new Vec3(0.5, 0.5, 1), opacity: 200 })
        .to(0.75, { scale: new Vec3(1.6, 1.6, 1), opacity: 0 }, { easing: 'quadOut' })
    ).start();
  };

  /** Looping tap animation at a world position. */
  HandHint.prototype.tapAt = function (world) {
    this.stopAll();
    this.node.active = true;
    this.node.setWorldPosition(world.x, world.y);
    this.node.opacity = 255;
    this.node.setScale(1, 1);
    tween(this.handNode).repeatForever(
      tween(this.handNode)
        .to(0.3, { scale: new Vec3(0.8, 0.8, 1) }, { easing: 'quadOut' })
        .to(0.32, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .delay(0.3)
    ).start();
    this.ringPulse();
  };

  /** Looping drag animation between two world positions. */
  HandHint.prototype.dragFrom = function (a, b) {
    this.stopAll();
    this.node.active = true;
    this.node.setScale(1, 1);
    // One full cycle is 1.83s; the loops below are kept in lock-step.
    tween(this.node).repeatForever(
      tween(this.node)
        .set({ worldPosition: new Vec3(a.x, a.y, 0), opacity: 0 })
        .to(0.18, { opacity: 255 })
        .to(0.95, { worldPosition: new Vec3(b.x, b.y, 0) }, { easing: 'quadInOut' })
        .to(0.22, { opacity: 0 })
        .delay(0.48)
    ).start();
    tween(this.handNode).repeatForever(
      tween(this.handNode)
        .to(0.22, { scale: new Vec3(0.84, 0.84, 1) }, { easing: 'quadOut' })
        .delay(1.1)
        .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .delay(0.31)
    ).start();
    this.ringPulse();
  };

  /* ------------------------------------------------------------- fighters */

  function drawHero(g, s) {
    // Cloak
    g.fillColor = col('#3d63a8');
    poly(g, [-s * 0.34, -s * 0.5, s * 0.34, -s * 0.5, s * 0.24, s * 0.18, -s * 0.24, s * 0.18]);
    g.fill();
    g.fillColor = col('#2b4a83');
    poly(g, [-s * 0.34, -s * 0.5, -s * 0.08, -s * 0.5, -s * 0.12, s * 0.18, -s * 0.24, s * 0.18]);
    g.fill();
    // Hood
    g.fillColor = col('#3d63a8');
    g.circle(0, s * 0.3, s * 0.24);
    g.fill();
    g.fillColor = col('#101828');
    g.circle(0, s * 0.28, s * 0.17);
    g.fill();
    // Eyes
    g.fillColor = col('#7fe0ff');
    g.circle(-s * 0.07, s * 0.29, s * 0.035);
    g.fill();
    g.circle(s * 0.07, s * 0.29, s * 0.035);
    g.fill();
    // Boots
    g.fillColor = col('#2a2118');
    g.roundRect(-s * 0.26, -s * 0.56, s * 0.2, s * 0.1, s * 0.03);
    g.fill();
    g.roundRect(s * 0.06, -s * 0.56, s * 0.2, s * 0.1, s * 0.03);
    g.fill();
  }

  function drawDemon(g, s) {
    // Body
    g.fillColor = col('#a5312a');
    g.roundRect(-s * 0.32, -s * 0.5, s * 0.64, s * 0.72, s * 0.14);
    g.fill();
    g.fillColor = col('#7d201a');
    g.roundRect(-s * 0.32, -s * 0.5, s * 0.26, s * 0.72, s * 0.14);
    g.fill();
    // Head
    g.fillColor = col('#c8433a');
    g.roundRect(-s * 0.26, s * 0.16, s * 0.52, s * 0.36, s * 0.12);
    g.fill();
    // Horns
    g.fillColor = col('#f0d9a8');
    poly(g, [-s * 0.26, s * 0.44, -s * 0.44, s * 0.68, -s * 0.12, s * 0.5]);
    g.fill();
    poly(g, [s * 0.26, s * 0.44, s * 0.44, s * 0.68, s * 0.12, s * 0.5]);
    g.fill();
    // Eyes
    g.fillColor = col('#ffe14d');
    poly(g, [-s * 0.2, s * 0.34, -s * 0.06, s * 0.3, -s * 0.2, s * 0.24]);
    g.fill();
    poly(g, [s * 0.2, s * 0.34, s * 0.06, s * 0.3, s * 0.2, s * 0.24]);
    g.fill();
    // Grin
    g.fillColor = col('#2a0b08');
    g.roundRect(-s * 0.14, s * 0.2, s * 0.28, s * 0.06, s * 0.02);
    g.fill();
    // Claws
    g.fillColor = col('#f0d9a8');
    for (var i = 0; i < 3; i++) {
      poly(g, [s * 0.32 + i * s * 0.02, -s * 0.1 + i * s * 0.1,
        s * 0.48, -s * 0.04 + i * s * 0.1, s * 0.32, -s * 0.16 + i * s * 0.1]);
      g.fill();
    }
  }

  /* ------------------------------------------------------------ BattleView */

  function BattleView(parent, w, h, state) {
    this.state = state;
    this.w = w;
    this.h = h;
    this.weapons = [];
    this.weaponRow = null;
    this.enemyTimer = 0;
    this.heroHp = 0; this.heroHpMax = 0;
    this.enemyHp = 0; this.enemyHpMax = 0;
    this.elapsed = 0;
    this.running = false;
    this.onWin = null;

    this.node = mkNode(parent, 'Battle', w, h);
    this.node.active = false;

    var dim = mkGraphics(this.node, 'dim', w, h);
    dim.fillColor = new Color(6, 8, 18, 232);
    dim.rect(-w / 2, -h / 2, w, h);
    dim.fill();
    // Arena floor
    dim.fillColor = col('#2a2033');
    dim.rect(-w / 2, -h * 0.06, w, h * 0.16);
    dim.fill();
    dim.fillColor = col('#3a2c47');
    dim.rect(-w / 2, h * 0.08, w, h * 0.02);
    dim.fill();

    this.fx = mkNode(this.node, 'fx', w, h);
    this.buildFighters();
    this.buildBars();
  }

  BattleView.prototype.buildFighters = function () {
    var y = this.h * 0.16;
    this.heroNode = mkNode(this.node, 'hero', 300, 300, -this.w * 0.24, y);
    drawHero(this.heroNode.addGraphics(), 300);
    this.enemyNode = mkNode(this.node, 'enemy', 340, 340, this.w * 0.24, y + 10);
    drawDemon(this.enemyNode.addGraphics(), 340);
    this.enemyNode.setScale(-1, 1);
  };

  BattleView.prototype.buildBars = function () {
    var self = this;
    var mk = function (name, x, y, title) {
      var root = mkNode(self.node, name, 420, 110, x, y);
      mkLabel(root, title, 0, 34, { size: 34, color: C.cream });
      var g = mkGraphics(root, 'bar', 400, 40, 0, -6);
      var l = mkLabel(root, '', 0, -6, {
        size: 28, color: C.white, outline: new Color(0, 0, 0, 180), outlineWidth: 4,
      });
      return { g: g, l: l };
    };
    var hero = mk('heroBar', -this.w * 0.24, this.h * 0.36, UI.heroName || 'You');
    var enemy = mk('enemyBar', this.w * 0.24, this.h * 0.36, UI.bossName || 'Chapter Boss');
    this.heroBar = hero.g;
    this.heroHpL = hero.l;
    this.enemyBar = enemy.g;
    this.enemyHpL = enemy.l;
  };

  BattleView.prototype.buildWeaponRow = function () {
    if (this.weaponRow) this.weaponRow.destroy();
    this.weapons = [];
    var list = this.state.weapons;
    var cell = 108;
    var total = Math.max(cell, list.length * (cell + 14));
    var row = mkNode(this.node, 'weaponRow', total, cell + 20, 0, -this.h * 0.22);
    this.weaponRow = row;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var x = -total / 2 + cell / 2 + 7 + i * (cell + 14);
      var n = mkNode(row, 'w' + i, cell, cell, x, 0);
      var bg = n.addGraphics();
      bg.fillColor = new Color(0, 0, 0, 130);
      bg.roundRect(-cell / 2, -cell / 2, cell, cell, 16);
      bg.fill();
      bg.lineWidth = 4;
      bg.strokeColor = C.rarity[item.rarity];
      bg.roundRect(-cell / 2, -cell / 2, cell, cell, 16);
      bg.stroke();
      drawIcon(mkGraphics(n, 'icon', cell, cell), item.def.kind, cell * 0.78, cell * 0.78);
      var ring = mkGraphics(n, 'ring', cell, cell);
      this.weapons.push({ item: item, timer: 0, node: n, ring: ring });
      popIn(n, 0.3, 0.05 * i);
    }
  };

  /** Kick off the fight. Enemy HP is derived from player DPS so it always ends well. */
  BattleView.prototype.start = function (onWin) {
    this.onWin = onWin;
    this.node.active = true;
    this.elapsed = 0;
    this.enemyTimer = 0;
    this.enemyNode.active = true;
    this.enemyNode.setScale(-1, 1);
    this.enemyNode.angle = 0;

    this.buildWeaponRow();

    var dps = this.state.weapons.reduce(function (a, i) {
      return a + (i.cd > 0 ? (i.totalAtk * (1 + i.crit)) / i.cd : 0);
    }, 0);
    var target = Math.max(6, Math.min(9, CFG.battle.maxSeconds * 0.6));
    this.enemyHpMax = Math.max(300, Math.round(dps * target));
    this.enemyHp = this.enemyHpMax;
    this.heroHpMax = CFG.battle.playerHp;
    this.heroHp = this.heroHpMax;
    this.redrawBars();

    this.node.opacity = 0;
    tween(this.node).to(0.25, { opacity: 255 }).start();
    this.node.setScale(1, 1);
    this.running = true;
  };

  BattleView.prototype.redrawBars = function () {
    this.heroBar.clear();
    bar(this.heroBar, 400, 40, this.heroHp / this.heroHpMax, C.ok, col('#22262f'), col('#0d1017'));
    this.enemyBar.clear();
    bar(this.enemyBar, 400, 40, this.enemyHp / this.enemyHpMax, C.hp, col('#22262f'), col('#0d1017'));
    this.heroHpL.string = String(Math.max(0, Math.ceil(this.heroHp)));
    this.enemyHpL.string = String(Math.max(0, Math.ceil(this.enemyHp)));
  };

  BattleView.prototype.update = function (dt) {
    if (!this.running) return;
    var d = dt * CFG.battle.speed;
    this.elapsed += d;

    for (var i = 0; i < this.weapons.length; i++) {
      var w = this.weapons[i];
      if (w.item.cd <= 0) continue;
      w.timer += d;
      this.drawCooldownRing(w);
      if (w.timer >= w.item.cd) { w.timer = 0; this.fire(w); }
    }

    this.enemyTimer += d;
    if (this.enemyTimer >= CFG.battle.enemyCd && this.enemyHp > 0) {
      this.enemyTimer = 0;
      this.enemyAttack();
    }

    // Safety valve: never let the ad drag on.
    if (this.elapsed > CFG.battle.maxSeconds && this.enemyHp > 0) {
      this.damageEnemy(this.enemyHp, false);
    }
  };

  BattleView.prototype.drawCooldownRing = function (w) {
    var p = Math.min(1, w.timer / w.item.cd);
    var g = w.ring;
    g.clear();
    if (p <= 0.001) return;
    g.lineWidth = 6;
    g.strokeColor = new Color(255, 255, 255, 90);
    g.arc(0, 0, 46, Math.PI / 2, Math.PI / 2 - Math.PI * 2 * p, true);
    g.stroke();
  };

  BattleView.prototype.fire = function (w) {
    var self = this;
    var crit = Math.random() < w.item.crit;
    var dmg = Math.round(w.item.totalAtk * (crit ? 2 : 1));
    tween(w.node)
      .to(0.07, { scale: new Vec3(1.25, 1.25, 1) })
      .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();

    // Projectile
    var from = this.heroNode.position;
    var to = this.enemyNode.position;
    var p = mkNode(this.fx, 'proj', 70, 70, from.x + 60, from.y + 20);
    drawIcon(p.addGraphics(), w.item.def.kind, 64, 64);
    tween(p)
      .to(0.22, { position: new Vec3(to.x - 40, to.y, 0) }, { easing: 'quadIn' })
      .call(function () {
        p.destroy();
        self.damageEnemy(dmg, crit);
      })
      .start();
    tween(p).by(0.22, { angle: -540 }).start();
  };

  BattleView.prototype.damageEnemy = function (dmg, crit) {
    if (this.enemyHp <= 0) return;
    this.enemyHp = Math.max(0, this.enemyHp - dmg);
    this.redrawBars();
    this.popNumber(this.enemyNode.position, dmg, crit ? col('#ffd34d') : C.white, crit);
    shake(this.enemyNode, crit ? 18 : 9, 0.2);
    if (this.enemyHp <= 0) this.win();
  };

  BattleView.prototype.enemyAttack = function () {
    var dmg = CFG.battle.enemyAtk + Math.round(Math.random() * 10);
    // The hero can be bloodied but never actually loses - this is an ad.
    this.heroHp = Math.max(this.heroHpMax * 0.18, this.heroHp - dmg);
    this.redrawBars();
    this.popNumber(this.heroNode.position, dmg, C.hp, false);
    shake(this.heroNode, 10, 0.2);
  };

  BattleView.prototype.popNumber = function (at, value, color, big) {
    var n = mkNode(this.fx, 'dmg', 200, 60, at.x + (Math.random() * 60 - 30), at.y + 90);
    mkLabel(n, (big ? 'CRIT ' : '') + value, 0, 0, {
      size: big ? 62 : 48, color: color, outline: new Color(0, 0, 0, 200), outlineWidth: 6,
    });
    n.setScale(0.5, 0.5);
    tween(n)
      .to(0.16, { scale: new Vec3(big ? 1.25 : 1, big ? 1.25 : 1, 1) }, { easing: 'backOut' })
      .by(0.5, { position: new Vec3(0, 110, 0) }, { easing: 'quadOut' })
      .call(function () { n.destroy(); })
      .start();
    tween(n).delay(0.28).to(0.38, { opacity: 0 }).start();
  };

  BattleView.prototype.win = function () {
    var self = this;
    this.running = false;
    tween(this.enemyNode)
      .to(0.18, { scale: new Vec3(-1.2, 1.2, 1) })
      .to(0.35, { scale: new Vec3(-0.1, 0.1, 1), angle: 120 }, { easing: 'backIn' })
      .call(function () { self.enemyNode.active = false; })
      .start();
    var burst = mkGraphics(this.fx, 'burst', 400, 400, this.enemyNode.x, this.enemyNode.y);
    burst.fillColor = col('#ffd34d');
    star(burst, 0, 0, 150, 60, 8);
    burst.fill();
    burst.node.setScale(0.2, 0.2);
    tween(burst.node)
      .to(0.3, { scale: new Vec3(2.2, 2.2, 1), opacity: 0 }, { easing: 'quadOut' })
      .call(function () { burst.node.destroy(); })
      .start();

    setTimeout(function () { if (self.onWin) self.onWin(); }, 900);
  };

  BattleView.prototype.hide = function () {
    this.running = false;
    this.node.active = false;
  };

  /* --------------------------------------------------------------- EndCard */

  /** Victory screen + call to action. Tapping anywhere fires the store redirect. */
  function EndCard(parent, w, h) {
    this.shown = false;
    this.node = mkNode(parent, 'EndCard', w, h);
    this.node.active = false;

    var dim = mkGraphics(this.node, 'dim', w, h);
    dim.fillColor = new Color(8, 10, 22, 225);
    dim.rect(-w / 2, -h / 2, w, h);
    dim.fill();

    // Rays behind the banner
    var rays = mkGraphics(this.node, 'rays', w, w, 0, h * 0.14);
    for (var i = 0; i < 16; i++) {
      var a = (i / 16) * Math.PI * 2;
      rays.fillColor = new Color(255, 210, 90, i % 2 === 0 ? 26 : 12);
      rays.moveTo(0, 0);
      rays.lineTo(Math.cos(a) * w, Math.sin(a) * w);
      rays.lineTo(Math.cos(a + 0.2) * w, Math.sin(a + 0.2) * w);
      rays.close();
      rays.fill();
    }
    tween(rays.node).repeatForever(tween(rays.node).by(14, { angle: 360 })).start();

    // Victory banner
    var banner = mkNode(this.node, 'banner', 900, 220, 0, h * 0.16);
    plate(banner.addGraphics(), 860, 190, 28, C.parch, col('#7a4a1c'), 10);
    mkLabel(banner, UI.victoryTitle || 'VICTORY!', 0, 26, {
      size: 96, color: col('#c8380f'), outline: new Color(255, 236, 190, 220), outlineWidth: 8,
    });
    mkLabel(banner, UI.victorySubtitle || 'Chapter 2 cleared', 0, -52, {
      size: 38, color: C.inkSoft, bold: false,
    });

    // Reward row
    var rew = mkNode(this.node, 'reward', 700, 120, 0, h * 0.005);
    var rg = rew.addGraphics();
    rg.fillColor = new Color(0, 0, 0, 110);
    rg.roundRect(-320, -56, 640, 112, 24);
    rg.fill();
    var sg = mkGraphics(rew, 'star', 90, 90, -252, 0);
    sg.fillColor = C.gold;
    star(sg, 0, 0, 42, 18, 5);
    sg.fill();
    // +55 rather than +40: system fonts render the reward line wider than the
    // Cocos bitmap font did, and the text was clipping into the star.
    mkLabel(rew, UI.rewardText || '+1 Trophy   +25 Coins', 55, 0, { size: 44, color: C.cream });

    // Whole-screen tap target, added before the CTA so the button wins the hit test.
    var tap = mkNode(this.node, 'tapAnywhere', w, h);
    tap.on('touchend', function () { P().install('endcard-background'); });

    var cta = new UIButton(this.node, 'cta', 0, -h * 0.16, {
      w: 700, h: 180, label: UI.ctaLabel || 'PLAY NOW', body: col('#3fbe57'), border: col('#1d7a2f'),
      labelColor: C.white, fontSize: 72, radius: 34,
      onClick: function () { P().install('endcard-cta'); },
    });
    pulse(cta.node, 1.05, 1.1);

    mkLabel(this.node, UI.ctaSubtitle || 'Build the ultimate backpack', 0, -h * 0.28, {
      size: 38, color: new Color(255, 255, 255, 190), bold: false,
    });
  }

  EndCard.prototype.show = function () {
    if (this.shown) return;
    this.shown = true;
    this.node.active = true;
    this.node.opacity = 0;
    tween(this.node).to(0.3, { opacity: 255 }).start();
    P().end();
  };

  global.BATTLE = { HandHint: HandHint, BattleView: BattleView, EndCard: EndCard };
})(window);
