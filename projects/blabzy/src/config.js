/**
 * Everything you are likely to change lives here.
 * Edit, run `node build.js blabzy`, re-upload. No other file needs touching.
 */
window.PLAYABLE_CONFIG = {
  /* ---- branding ---- */
  appName: 'Blabzy',
  tagline: 'Never Have I Ever · Adults',

  /* ---- store links (used only outside an ad network, e.g. on Netlify) ---- */
  appStoreUrl: 'https://apps.apple.com/app/id000000000',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.blabzy',

  /* ---- intro: words pop in one by one. Wrap a word in *stars* to highlight it. ---- */
  introLines: [
    'Are you a *shy* *little* *bean*…',
    'or the *GOAT* of the party? 🐐',
  ],
  introWordMs: 130,          // delay between words
  startLabel: 'FIND OUT 😈',

  /* ---- meter ---- */
  meterLeft: '🙈 SHY',
  meterRight: 'GOAT 🐐',
  feedbackMs: 1100,          // pause after an answer while the needle swings

  /* ---- CTA ---- */
  ctaLabel: 'TRY THE APP',
  showCornerCta: true,       // small persistent CTA from question 2 onwards

  /* ---- the questions ----
   * Every answer has `spice`: negative pushes the needle to SHY, positive to
   * GOAT. The needle position is the sum of picked spice / sum of max spice,
   * so with three ±1 questions it ends at -1, -1/3, +1/3 or +1.
   * `react` is the little word that pops next to the meter.
   */
  questions: [
    {
      prompt: 'What are you ordering at the bar?',
      answers: [
        { label: 'Zero-alc beer, please', emoji: '🍺', spice: -1, react: 'Responsible 😇' },
        { label: 'Vodka + energy drink', emoji: '⚡', spice: 1, react: 'Oh no 🔥' },
      ],
    },
    {
      prompt: 'Your ex texts “u up?” at 2 AM…',
      answers: [
        { label: '“Come over”', emoji: '😏', spice: 1, react: 'Dangerous 🔥' },
        { label: 'Seen. Sleep. Block.', emoji: '😴', spice: -1, react: 'Safe choice 😇' },
      ],
    },
    {
      prompt: 'Spin the bottle lands on your crush',
      answers: [
        { label: '“I need the bathroom”', emoji: '🏃', spice: -1, react: 'Run, bean, run 🙈' },
        { label: 'Finally. Come here.', emoji: '💋', spice: 1, react: 'No hesitation 🔥' },
      ],
    },
  ],

  /* ---- verdicts, from SHY to GOAT. Picked by needle position (-1..1). ---- */
  verdicts: [
    { upTo: -0.6, title: 'Certified shy bean 🙈', sub: 'Blabzy will fix that in one round.' },
    { upTo: 0,    title: 'Shy… with potential 👀', sub: 'A few rounds of Blabzy and you’re dangerous.' },
    { upTo: 0.6,  title: 'Almost a GOAT 😏', sub: 'One more bad decision and you’re there.' },
    { upTo: 1,    title: 'Oh, you’re a REAL GOAT 🐐', sub: 'Prove it. Your friends won’t survive these questions.' },
  ],
};
