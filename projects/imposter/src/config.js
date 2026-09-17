/**
 * Everything you are likely to change lives here.
 * Edit, run `node build.js imposter`, re-upload. No other file needs touching.
 */
window.PLAYABLE_CONFIG = {
  /* ---- branding ---- */
  appName: 'Imposter',
  tagline: "Who's lying?",

  /* ---- store links (used only outside an ad network, e.g. on Netlify) ---- */
  appStoreUrl: 'https://apps.apple.com/app/id000000000',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.imposter',

  /* ---- the round ---- */
  secretWord: 'PIZZA',
  roundSeconds: 20,          // timer shown next to the secret word

  players: {
    // `word` is what appears in the speech bubble.
    p1: { name: 'Alex', word: 'Cheese' },  // connected to the secret word
    p2: { name: 'Max',  word: 'Ocean' },   // not connected
  },

  /* ---- pacing (ms) ---- */
  introMs: 1100,             // wide shot before the first cut
  cameraMs: 850,             // one camera move
  clueHoldMs: 1700,          // how long each bubble is held in close-up
  keepPlayingDrainMs: 2600,  // "keep playing": timer runs out this fast

  /* ---- copy ---- */
  introBanner: 'Give a clue. Find the liar.',
  question: 'Who is the imposter?',
  keepPlayingLabel: 'Keep playing',
  ctaLabel: 'TRY AGAIN',

  /* Outcome per choice. Alex = the player guessed right; Max and
   * "keep playing" (or letting the timer run out) = the imposter got away. */
  outcomes: {
    p1:   { win: true,  title: 'You caught the imposter!', sub: 'Alex was bluffing all along.', cta: 'PLAY MORE' },
    p2:   { win: false, title: 'Imposter won! Try again?', sub: 'Max was innocent. Alex fooled you.' },
    keep: { win: false, title: 'Imposter won! Try again?', sub: "Time's up — the imposter slipped away." },
  },
};
