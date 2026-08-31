/**
 * Merge Master — everything you are likely to change lives here.
 * Edit, run `npm run build`, re-upload. No other file needs touching.
 *
 * Ported from the Cocos Creator project in ../../merge-master; the numbers
 * below are the same ones that lived in assets/scripts/data/Config.ts.
 */
window.PLAYABLE_CONFIG = {
  /* ---- branding ---- */
  appName: 'Merge Master',
  tagline: 'Build the ultimate backpack',

  /* ---- store links (used only outside an ad network, e.g. on Netlify) ---- */
  appStoreUrl: 'https://apps.apple.com/app/id000000000',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.mergemaster',

  /* ---- backpack grid ---- */
  grid: { cols: 4, rows: 4, cell: 132 },
  /* Cells that start locked ("Buy Slot" unlocks them, left-to-right/top-down). */
  lockedCells: ['3,0', '3,3'],

  /* ---- economy ---- */
  economy: {
    startCoins: 42,
    rerollCost: 19,
    buySlotCost: 19,
    shopSlots: 3,
  },

  /* ---- merging ---- */
  merge: {
    statMul: 2.1,   // stat multiplier applied per tier above 1
    maxTier: 3,
  },

  /* ---- battle (deliberately not a fair simulation, see README) ---- */
  battle: {
    enemyAtk: 34,
    enemyCd: 1.6,
    playerHp: 700,
    maxSeconds: 14,  // hard stop so the ad never drags on
    speed: 1,
  },

  /* ---- tutorial pacing ---- */
  tutorial: {
    nudgeAfter: 2.2,     // idle time before the hand hint re-appears
    autoPlayAfter: 7.5,  // idle time before the ad plays itself
  },

  /* ---- copy ---- */
  chapter: 2,
  startTrophies: 421,
  bossName: 'Chapter Boss',
  heroName: 'You',

  emptyInfoTitle: 'Tap an item',
  emptyInfoText: 'Drag items from the shop into your bag',
  mergedText: 'MERGED!',

  victoryTitle: 'VICTORY!',
  victorySubtitle: 'Chapter 2 cleared',
  rewardText: '+1 Trophy   +25 Coins',

  /* ---- CTA ---- */
  ctaLabel: 'PLAY NOW',
  ctaSubtitle: 'Build the ultimate backpack',
  battleLabel: 'Battle!',
  rerollLabel: 'Reroll',
  buySlotLabel: 'Buy Slot',

  debug: false,
};
