/**
 * Water Sort Puzzle — everything you are likely to change lives here.
 * Edit, run `npm run build`, re-upload. No other file needs touching.
 */
window.PLAYABLE_CONFIG = {
  /* ---- branding ---- */
  appName: 'Water Sort Puzzle',
  tagline: 'One colour per bottle',

  /* ---- store links (used only outside an ad network, e.g. on Netlify) ---- */
  appStoreUrl: 'https://apps.apple.com/app/id000000000',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.watersort',

  /* ---- liquid palette: index 0..n is what the level generator draws from ---- */
  colors: [
    '#ff4d6d', // strawberry
    '#ffb703', // amber
    '#2ec4ff', // lagoon
    '#34d17a', // mint
    '#a06bff', // grape
    '#ff7a1f', // tangerine
  ],

  /* ---- the scripted demo that opens the ad (teaches the rule) ---- */
  introBannerText: 'WATCH',
  introMoveDelay: 0.55,      // seconds between the demo's pours

  /* ---- the levels the player actually gets ----
     colors  = how many liquids (each fills exactly one bottle at the end)
     empty   = spare bottles to pour into
     minMoves = generator keeps rolling until the shortest solution is this long */
  levels: [
    { colors: 3, empty: 2, minMoves: 5 },
    { colors: 4, empty: 2, minMoves: 8, wantFourColourBottle: true },
  ],

  /* ---- pacing ---- */
  pourSeconds: 0.85,         // one bottle-to-bottle pour, start to finish
  hintAfterSeconds: 4.5,     // idle time before the ghost hand shows a valid move

  /* ---- copy ---- */
  introOverTitle: 'Your turn!',
  introOverText: 'Tap a bottle to lift its liquid, tap another to pour. Finish with one colour per bottle.',
  introOverBtn: 'PLAY',

  levelClearText: 'LEVEL CLEAR!',
  stuckToast: 'No moves left — resetting',

  winBadge: 'SOLVED',
  winTitle: 'All sorted!',
  winText: 'Thousands of relaxing puzzles are waiting in the app.',

  /* ---- CTA ---- */
  ctaLabel: 'PLAY NOW',
  showCornerCta: true,

  debug: false,
};
