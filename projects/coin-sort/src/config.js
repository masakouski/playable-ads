/**
 * Coin Sort Vault — everything you are likely to change lives here.
 * Edit, run `npm run build`, re-upload. No other file needs touching.
 *
 * Boards are written bottom-up, one array per column:
 *   [1, 1, 2]  =  two 1-coins on the floor of the column, a 2-coin on top.
 * A column holds `capacity` coins; `mergeRun` of the same value sitting on
 * top of each other collapse into `mergeOut` coins of the next value up.
 */
window.PLAYABLE_CONFIG = {
  /* ---- branding ---- */
  appName: 'Coin Sort Vault',
  tagline: 'Ten of a kind, twice as rich',

  /* ---- store links (used only outside an ad network, e.g. on Netlify) ---- */
  appStoreUrl: 'https://apps.apple.com/app/id000000000',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.coinsort',

  /* ---- coin palette: index 0 is coin value 1, index 1 is value 2, ... ---- */
  coinColors: [
    '#c3d3e2', // 1  silver
    '#ff9c4a', // 2  copper
    '#ffcf3a', // 3  gold
    '#35d986', // 4  emerald
    '#3ab6ff', // 5  sapphire
    '#b06bff', // 6  amethyst
    '#ff4d6d', // 7  ruby
    '#f4f8ff', // 8  platinum
  ],

  /* ---- rules ---- */
  columns: 6,      // vault slots on screen (6 = two rows of three)
  capacity: 10,    // coins per column
  mergeRun: 10,    // this many of a kind on top of each other...
  mergeOut: 2,     // ...become this many coins of the next value up

  /* ---- the scripted demo that opens the ad (teaches move + merge) ---- */
  intro: {
    banner: 'WATCH',
    hint: '10 OF A KIND = 2 BIGGER COINS',
    board: [[1, 1, 1, 1, 1, 1, 1], [1, 1], [2, 1], [], [1], [2]],
    moves: [[2, 1], [1, 0], [2, 0], [5, 0]],
    moveDelay: 0.42,          // seconds of pause between demo moves
  },

  /* ---- the levels the player actually gets ---- */
  levels: [
    {
      board: [[2, 2, 2], [1, 2, 2], [2, 2, 1], [2, 2], [1, 1], [2]],
      goal: { value: 3, count: 2 },
      dropValues: [1, 2, 2],  // what the DROP button can rain in
      hint: 'TAP A STACK, THEN WHERE TO PUT IT',
    },
    {
      board: [[5, 3], [4, 4, 4], [5, 4, 4], [3], [5, 4, 4, 3], [4, 4, 4]],
      goal: { value: 5, count: 5 },
      dropValues: [3, 4, 4],
      hint: 'STUCK? TAP DROP FOR MORE COINS',
    },
  ],

  /* ---- the DROP helper ---- */
  dropMin: 2,                 // coins per tap...
  dropMax: 4,                 // ...picked at random in this range
  dropCooldown: 1.2,          // seconds before the button recharges
  dropLabel: '+ DROP COINS',

  /* ---- pacing ---- */
  moveSeconds: 0.34,          // flight time of one coin
  moveStagger: 0.055,         // gap between coins of the same move
  hintAfterSeconds: 4.5,      // idle time before the ghost hand shows a move

  /* ---- copy ---- */
  introOverTitle: 'Your turn!',
  introOverText: 'Tap a stack of matching coins, then tap where to drop them. Ten of a kind merge into two bigger coins.',
  introOverBtn: 'PLAY',

  goalLabel: 'COLLECT',
  readyToast: '10 OF A KIND!',
  mergeToast: 'MERGE!',
  levelClearText: 'VAULT CLEARED!',
  stuckToast: 'No moves left — resetting',
  fullToast: 'Vault is full!',

  winBadge: 'RICH',
  winTitle: 'Vault sorted!',
  winText: 'Hundreds of coin vaults are waiting in the app.',

  /* ---- CTA ---- */
  ctaLabel: 'PLAY NOW',
  showCornerCta: true,

  debug: false,
};
