/**
 * What the home page lists (texts in i18n `landing.*`). Plain data without imports: the page,
 * its schema.org data (core/seo.ts) and its Markdown version (scripts/seo.mjs) all read it, so
 * they always say the same thing.
 */

/** The steps of the tool, in its order: the AI model is only asked for the first time. */
export const STEPS = ['model', 'drop', 'prepare', 'export'];

/** The facts of each model's spec sheet on the home page (labels in i18n `landing.ai.facts`, values in `landing.ai.models.<id>.facts`). */
export const AI_FACTS = ['task', 'paper', 'input', 'weights', 'runtime', 'compute', 'sent'];

/** Bento of features: `size` is the room each takes in the grid. */
export const FEATURES = [
  { key: 'cutout', icon: 'sparkles', size: 'wide' },
  { key: 'background', icon: 'palette', size: 'tall' },
  { key: 'prepare', icon: 'crop', size: 'small' },
  { key: 'brush', icon: 'brush', size: 'small' },
  { key: 'batch', icon: 'images', size: 'small' },
  { key: 'hd', icon: 'zap', size: 'small' },
  { key: 'formats', icon: 'file', size: 'small' },
  { key: 'offline', icon: 'offline', size: 'small' },
];

/** The comparison with online background removers: `them` is what they usually offer. */
export const COMPARE = [
  { key: 'hd', them: 'paid' },
  { key: 'unlimited', them: 'paid' },
  { key: 'batch', them: 'paid' },
  { key: 'account', them: 'sometimes' },
  { key: 'upload', them: 'no' },
  { key: 'offline', them: 'no' },
  { key: 'open', them: 'no' },
];

export const PRIVACY_POINTS = ['upload', 'model', 'account', 'tracking', 'verify'];

export const BROWSERS = [
  { name: 'Chrome / Edge', level: 'ok', key: 'gpu' },
  { name: 'Firefox', level: 'ok', key: 'firefox' },
  { name: 'Safari', level: 'ok', key: 'safari' },
  { name: 'Android / iOS', level: 'partial', key: 'mobile' },
];

export const FAQ = ['free', 'model', 'which', 'sam', 'lasso', 'zones', 'download', 'alternative', 'quality', 'privacy', 'formats', 'batch', 'commercial', 'offline', 'iphone'];
