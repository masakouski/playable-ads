/**
 * Everything you are likely to change lives here.
 * Edit, run `npm run build`, re-upload. No other file needs touching.
 */
window.PLAYABLE_CONFIG = {
  /* ---- branding ---- */
  appName: 'Car Quiz',
  tagline: 'How well do you know cars?',

  /* ---- store links (used only outside an ad network, e.g. on Netlify) ---- */
  appStoreUrl: 'https://apps.apple.com/app/id000000000',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.carquiz',

  /* ---- pacing ---- */
  secondsPerQuestion: 10,   // 0 disables the timer
  feedbackMs: 900,          // how long the right/wrong flash stays up

  /* ---- CTA ---- */
  ctaLabel: 'PLAY NOW',
  showCornerCta: true,      // small persistent CTA from question 2 onwards

  /* ---- copy on the end card, by score ---- */
  endTitles: [
    'Time to brush up!',   // 0 correct
    'Not bad!',            // 1
    'Nice driving!',       // 2
    'Perfect score!',      // 3
  ],
  endSubtitle: 'Hundreds more questions in the app.',

  /* ---- the quiz ----
   * type: 'text'  -> answers are words
   *       'image' -> answers are car silhouettes (see CARS in game.js:
   *                  sports, suv, pickup, van, hatchback). `label` is NOT
   *                  drawn on screen for these — printing it would give the
   *                  answer away — it is only the screen-reader name.
   */
  questions: [
    {
      type: 'image',
      prompt: 'Tap the sports car',
      answers: [
        { car: 'suv', label: 'SUV' },
        { car: 'sports', label: 'Sports car', correct: true },
        { car: 'pickup', label: 'Pickup' },
      ],
    },
    {
      type: 'text',
      prompt: 'What does "EV" stand for?',
      answers: [
        { label: 'Extreme Velocity' },
        { label: 'Electric Vehicle', correct: true },
        { label: 'Engine Volume' },
      ],
    },
    {
      type: 'text',
      prompt: 'Which brand uses a prancing horse as its badge?',
      answers: [
        { label: 'Lamborghini' },
        { label: 'Porsche' },
        { label: 'Ferrari', correct: true },
      ],
    },
  ],
};
