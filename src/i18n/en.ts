/** English source dictionary; every other language must provide exactly these keys. */
export const en = {
  'app.title': 'Pathlings',
  'app.tagline': 'Guide them home.',
  'app.loading': 'Loading…',
  'camera.wholeLevel': 'Show whole level',
  'filter.both': 'Select creatures walking either way',
  'filter.left': 'Select only creatures walking left',
  'filter.right': 'Select only creatures walking right',
} as const;

export type TranslationKey = keyof typeof en;
