/**
 * hud.js — the item inspector, synergy strip and the chrome around the board.
 * Port of assets/scripts/view/{InfoPanel,Hud}.ts.
 */
(function (global) {
  'use strict';

  var E = global.E, A = global.ART, M = global.MM;
  var Color = E.Color, col = E.col, Vec3 = E.Vec3, tween = E.tween;
  var C = A.C, shade = A.shade, mkNode = A.mkNode, mkGraphics = A.mkGraphics, mkLabel = A.mkLabel;
  var plate = A.plate, poly = A.poly, star = A.star;
  var drawIcon = A.drawIcon, drawCoin = A.drawCoin, drawDevil = A.drawDevil;
  var UIButton = A.UIButton;
  var CFG = M.CFG;
  var UI = global.PLAYABLE_CONFIG || {};

  var PANEL_W = 1000;
  var PANEL_H = 236;

  /* ------------------------------------------------------------- stat glyphs */

  function swordGlyph(g, s) {
    g.fillColor = col('#e6eef7');
    poly(g, [-s * 0.34, -s * 0.34, s * 0.28, s * 0.3, s * 0.4, s * 0.4, s * 0.3, s * 0.28,
      -s * 0.22, -s * 0.4]);
    g.fill();
    g.fillColor = col('#9a6a33');
    g.roundRect(-s * 0.42, -s * 0.46, s * 0.26, s * 0.16, s * 0.05);
    g.fill();
  }

  function burstGlyph(g, s) {
    g.fillColor = col('#ff8c2b');
    star(g, 0, 0, s * 0.46, s * 0.17, 6, -Math.PI / 2);
    g.fill();
    g.fillColor = col('#ffd76a');
    star(g, 0, 0, s * 0.26, s * 0.1, 6, -Math.PI / 2);
    g.fill();
  }

  function clockGlyph(g, s) {
    g.fillColor = col('#7fd3ff');
    g.circle(0, 0, s * 0.42);
    g.fill();
    g.fillColor = col('#123047');
    g.circle(0, 0, s * 0.33);
    g.fill();
    g.fillColor = col('#7fd3ff');
    g.roundRect(-s * 0.04, -s * 0.02, s * 0.08, s * 0.24, s * 0.03);
    g.fill();
    g.roundRect(-s * 0.02, -s * 0.04, s * 0.2, s * 0.08, s * 0.03);
    g.fill();
  }

  function gemGlyph(g, s, c) {
    g.fillColor = shade(c, 0.6);
    poly(g, [0, s * 0.5, s * 0.4, 0, 0, -s * 0.5, -s * 0.4, 0]);
    g.fill();
    g.fillColor = c;
    poly(g, [0, s * 0.38, s * 0.3, 0, 0, -s * 0.38, -s * 0.3, 0]);
    g.fill();
    g.fillColor = new Color(255, 255, 255, 170);
    poly(g, [0, s * 0.34, s * 0.16, s * 0.06, 0, -s * 0.02, -s * 0.16, s * 0.06]);
    g.fill();
  }

  /* ------------------------------------------------------------- InfoPanel */

  /** Top-of-screen item inspector: icon, name, stats, flavour text, tag pill. */
  function InfoPanel(parent, x, y) {
    this.current = null;
    this.node = mkNode(parent, 'InfoPanel', PANEL_W, PANEL_H, x, y);
    this.bg = mkGraphics(this.node, 'bg', PANEL_W, PANEL_H);

    var tileS = 168;
    var tileX = -PANEL_W / 2 + 24 + tileS / 2;
    this.iconTile = mkGraphics(this.node, 'tile', tileS, tileS, tileX, 0);
    this.iconG = mkGraphics(this.node, 'tileIcon', tileS, tileS, tileX, 0);

    // +44 rather than the Cocos +26: the rarity banner behind the icon tile ends
    // at -280, and left-aligned text starting at -282 clipped into it.
    var textX = tileX + tileS / 2 + 44;

    this.nameL = mkLabel(this.node, '', textX, PANEL_H * 0.30, {
      size: 50, color: C.ink, align: 'left', bold: true,
    });

    var chipY = PANEL_H * 0.03;
    var self = this;
    var chip = function (cx, cw, glyph) {
      var n = mkNode(self.node, 'chip', cw, 62, cx, chipY);
      var g = n.addGraphics();
      g.fillColor = new Color(0, 0, 0, 26);
      g.roundRect(-cw / 2, -31, cw, 62, 26);
      g.fill();
      var ig = mkGraphics(n, 'g', 46, 46, -cw / 2 + 34, 0);
      glyph(ig, 46);
      return n;
    };
    var c1 = chip(textX + 105, 230, swordGlyph);
    this.atkL = mkLabel(c1, '0', 24, 6, { size: 40, color: C.ink });
    this.atkBonusL = mkLabel(c1, '', 24, -22, { size: 26, color: col('#2f7a3c') });

    var c2 = chip(textX + 320, 180, burstGlyph);
    this.critL = mkLabel(c2, '0%', 22, 0, { size: 38, color: C.ink });

    var c3 = chip(textX + 500, 160, clockGlyph);
    this.cdL = mkLabel(c3, '0s', 20, 0, { size: 38, color: C.ink });

    this.descL = mkLabel(this.node, '', textX, -PANEL_H * 0.24, {
      size: 34, color: C.inkSoft, align: 'left', bold: false,
    });

    var tagN = mkNode(this.node, 'tag', 200, 52, PANEL_W / 2 - 130, -PANEL_H / 2 + 40);
    this.tagG = tagN.addGraphics();
    this.tagL = mkLabel(tagN, '', 0, 0, { size: 32, color: C.white });

    this.gemG = mkGraphics(this.node, 'gem', 60, 60, PANEL_W / 2 - 52, PANEL_H / 2 - 46);

    this.drawFrame(2);
    this.setItem(null);
  }

  InfoPanel.prototype.drawFrame = function (rarity) {
    var g = this.bg;
    g.clear();
    var rar = C.rarity[rarity];
    plate(g, PANEL_W, PANEL_H, 26, C.parch, shade(rar, 0.75), 10);
    // Rarity banner behind the icon tile
    g.fillColor = new Color(rar.r, rar.g, rar.b, 235);
    g.roundRect(-PANEL_W / 2 + 10, -PANEL_H / 2 + 10, 210, PANEL_H - 20, 18);
    g.fill();
  };

  InfoPanel.prototype.setItem = function (item) {
    this.current = item;
    this.node.active = true;
    if (!item) {
      this.nameL.string = UI.emptyInfoTitle || 'Tap an item';
      this.descL.string = UI.emptyInfoText || 'Drag items from the shop into your bag';
      this.atkL.string = '-';
      this.atkBonusL.string = '';
      this.critL.string = '-';
      this.cdL.string = '-';
      this.tagL.string = '';
      this.tagG.clear();
      this.iconG.clear();
      this.gemG.clear();
      this.drawFrame(0);
      this.iconTile.clear();
      return;
    }

    var rar = item.rarity;
    this.drawFrame(rar);

    this.iconTile.clear();
    this.iconTile.fillColor = new Color(0, 0, 0, 40);
    this.iconTile.roundRect(-78, -78, 156, 156, 20);
    this.iconTile.fill();

    this.iconG.clear();
    drawIcon(this.iconG, item.def.kind, 150, 150);

    this.gemG.clear();
    gemGlyph(this.gemG, 58, C.rarity[rar]);

    this.nameL.string = item.name;
    this.descL.string = item.def.desc;
    this.atkL.string = String(item.atk);
    this.atkBonusL.string = item.bonusAtk > 0 ? '(+' + item.bonusAtk + ')' : '';
    this.critL.string = Math.round(item.crit * 100) + '%';
    this.cdL.string = item.cd > 0 ? item.cd.toFixed(1) + 's' : '-';

    this.tagL.string = item.def.tag;
    var tw = Math.max(150, item.def.tag.length * 20 + 60);
    this.tagG.clear();
    this.tagG.fillColor = C.tagGreen;
    this.tagG.roundRect(-tw / 2, -26, tw, 52, 14);
    this.tagG.fill();
    this.tagG.fillColor = shade(C.tagGreen, 1.25);
    this.tagG.roundRect(-tw / 2 + 4, 4, tw - 8, 18, 9);
    this.tagG.fill();
  };

  /** Re-read the current item (after a merge changed its stats). */
  InfoPanel.prototype.refresh = function () { this.setItem(this.current); };

  InfoPanel.prototype.flash = function () {
    tween(this.node)
      .to(0.1, { scale: new Vec3(1.03, 1.03, 1) })
      .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  };

  /* ------------------------------------------------------------ SynergyBar */

  /** The "+35% ATK per [Shuriken] in zone" strip under the info panel. */
  function SynergyBar(parent, x, y) {
    var w = 1000, h = 62;
    this.node = mkNode(parent, 'SynergyBar', w, h, x, y);
    var g = mkGraphics(this.node, 'bg', w, h);
    g.fillColor = col('#1c3a2c');
    g.roundRect(-w / 2, -h / 2, w, h, 16);
    g.fill();
    g.lineWidth = 3;
    g.strokeColor = col('#3f7a55');
    g.roundRect(-w / 2, -h / 2, w, h, 16);
    g.stroke();

    this.label = mkLabel(this.node, '', -w / 2 + 26, 0, {
      size: 32, color: col('#c8f0d2'), align: 'left',
    });

    this.icons = mkNode(this.node, 'icons', 200, h, w / 2 - 110, 0);
    var kinds = ['dagger', 'shuriken', 'star'];
    for (var i = 0; i < kinds.length; i++) {
      var n = mkNode(this.icons, 'ico', 54, 54, -60 + i * 60, 0);
      var bg = n.addGraphics();
      bg.fillColor = new Color(0, 0, 0, 110);
      bg.circle(0, 0, 27);
      bg.fill();
      bg.lineWidth = 3;
      bg.strokeColor = C.rarity[i];
      bg.circle(0, 0, 27);
      bg.stroke();
      drawIcon(mkGraphics(n, 'g', 44, 44), kinds[i], 42, 42);
    }
  }

  SynergyBar.prototype.set = function (text, highlight) {
    this.label.string = text;
    this.label.color = highlight ? col('#8dffb0') : col('#c8f0d2');
    if (highlight) {
      tween(this.node)
        .to(0.1, { scale: new Vec3(1.02, 1.06, 1) })
        .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .start();
    }
  };

  /* --------------------------------------------------------------- chrome */

  /** "Chapter 2" header. */
  function ChapterHeader(parent, x, y) {
    this.node = mkNode(parent, 'Chapter', 500, 60, x, y);
    this.label = mkLabel(this.node, 'Chapter ' + CFG.chapter, 0, 0, {
      size: 40, color: C.cream, outline: new Color(0, 0, 0, 160), outlineWidth: 5,
    });
  }
  ChapterHeader.prototype.set = function (t) { this.label.string = t; };

  /** Trophy / shield / heart strip that sits below the backpack. */
  function ResourceBar(parent, x, y) {
    var w = 760, h = 84;
    this.node = mkNode(parent, 'ResourceBar', w, h, x, y);
    var g = mkGraphics(this.node, 'bg', w, h);
    g.fillColor = col('#241a10');
    g.roundRect(-w / 2, -h / 2, w, h, 20);
    g.fill();
    g.fillColor = col('#3a2a17');
    g.roundRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 16);
    g.fill();

    // Trophy
    var t = mkGraphics(this.node, 'trophy', 56, 56, -w / 2 + 60, 0);
    t.fillColor = C.gold;
    poly(t, [-18, 14, 18, 14, 12, -6, -12, -6]);
    t.fill();
    t.fillColor = shade(C.gold, 0.8);
    t.roundRect(-14, -18, 28, 12, 4);
    t.fill();
    t.fillColor = C.gold;
    t.roundRect(-20, -26, 40, 10, 4);
    t.fill();
    this.trophyL = mkLabel(this.node, '0', -w / 2 + 165, 0, { size: 40, color: C.cream });

    // Shield
    var s = mkGraphics(this.node, 'shield', 56, 56, -20, 0);
    s.fillColor = C.shield;
    poly(s, [0, 26, 22, 12, 22, -8, 0, -26, -22, -8, -22, 12]);
    s.fill();
    s.fillColor = shade(C.shield, 1.3);
    poly(s, [0, 18, 14, 8, 14, -6, 0, -16, -14, -6, -14, 8]);
    s.fill();
    this.shieldL = mkLabel(this.node, '0', 40, 0, { size: 40, color: C.cream });

    // Heart
    var hg = mkGraphics(this.node, 'heart', 56, 56, w / 2 - 200, 0);
    hg.fillColor = C.hp;
    hg.circle(-10, 8, 12);
    hg.fill();
    hg.circle(10, 8, 12);
    hg.fill();
    poly(hg, [-21, 4, 21, 4, 0, -22]);
    hg.fill();
    this.heartL = mkLabel(this.node, '0', w / 2 - 130, 0, { size: 40, color: C.cream });
  }

  ResourceBar.prototype.set = function (trophies, shields, hearts) {
    this.trophyL.string = String(trophies);
    this.shieldL.string = String(shields);
    this.heartL.string = String(hearts);
  };

  ResourceBar.prototype.bumpTrophy = function () {
    tween(this.trophyL)
      .to(0.1, { scale: new Vec3(1.3, 1.3, 1) })
      .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  };

  /** Coin purse above the action buttons. */
  function CoinBar(parent, x, y) {
    var h = 66;
    this.w = 420;
    this.node = mkNode(parent, 'CoinBar', this.w, h, x, y);
    var g = mkGraphics(this.node, 'bg', this.w, h);
    g.fillColor = col('#2a1f12');
    g.roundRect(-this.w / 2, -h / 2, this.w, h, 20);
    g.fill();
    g.fillColor = col('#120d07');
    g.roundRect(-this.w / 2 + 60, -h / 2 + 7, this.w - 70, h - 14, 14);
    g.fill();

    drawCoin(mkGraphics(this.node, 'coin', 62, 62, -this.w / 2 + 36, 0), 62);
    this.label = mkLabel(this.node, '0', 30, 0, { size: 40, color: C.cream });
  }

  CoinBar.prototype.set = function (coins) { this.label.string = String(coins); };

  CoinBar.prototype.bump = function () {
    tween(this.label)
      .to(0.08, { scale: new Vec3(1.35, 1.35, 1) })
      .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  };

  /** Buy Slot / Reroll / Battle row. */
  function ActionBar(parent, x, y, cb) {
    this.node = mkNode(parent, 'ActionBar', 1020, 170, x, y);

    this.buySlot = new UIButton(this.node, 'buySlot', -340, 0, {
      w: 300, h: 150, label: UI.buySlotLabel || 'Buy Slot', cost: CFG.economy.buySlotCost,
      body: C.btnStone, border: C.btnStoneDark, labelColor: col('#3b2c16'),
      fontSize: 42, onClick: cb.onBuySlot,
    });
    this.reroll = new UIButton(this.node, 'reroll', 0, 0, {
      w: 300, h: 150, label: UI.rerollLabel || 'Reroll', cost: CFG.economy.rerollCost,
      body: C.btnStone, border: C.btnStoneDark, labelColor: col('#3b2c16'),
      fontSize: 42, onClick: cb.onReroll,
    });
    this.battle = new UIButton(this.node, 'battle', 340, 0, {
      w: 320, h: 158, label: UI.battleLabel || 'Battle!',
      body: C.btnGold, border: C.btnGoldDark, labelColor: col('#5a3200'),
      fontSize: 56, onClick: cb.onBattle,
    });
    drawDevil(mkGraphics(this.battle.node, 'devil', 70, 70, 120, 66), 70);
  }

  /** Dark dungeon backdrop with a floor band, drawn once. */
  function drawBackground(parent, w, h) {
    var n = mkNode(parent, 'BG', w, h);
    var g = n.addGraphics();
    var bands = 20;
    for (var i = 0; i < bands; i++) {
      var t = i / (bands - 1);
      g.fillColor = new Color(
        Math.round(C.bgTop.r + (C.bgBottom.r - C.bgTop.r) * t),
        Math.round(C.bgTop.g + (C.bgBottom.g - C.bgTop.g) * t),
        Math.round(C.bgTop.b + (C.bgBottom.b - C.bgTop.b) * t),
        255
      );
      g.rect(-w / 2, h / 2 - (i + 1) * (h / bands) - 1, w, h / bands + 2);
      g.fill();
    }
    // Stone floor band behind the shop
    g.fillColor = col('#c9a878');
    g.rect(-w / 2, -h * 0.5, w, h * 0.30);
    g.fill();
    g.fillColor = col('#dcbd8e');
    g.rect(-w / 2, -h * 0.5 + h * 0.02, w, h * 0.26);
    g.fill();
    g.fillColor = new Color(0, 0, 0, 40);
    for (var j = 0; j < 6; j++) {
      g.rect(-w / 2 + j * (w / 6), -h * 0.5, 6, h * 0.28);
      g.fill();
    }
    return n;
  }

  global.HUD = {
    InfoPanel: InfoPanel, SynergyBar: SynergyBar, ChapterHeader: ChapterHeader,
    ResourceBar: ResourceBar, CoinBar: CoinBar, ActionBar: ActionBar,
    drawBackground: drawBackground,
  };
})(window);
