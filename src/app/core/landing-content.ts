/**
 * What the home page lists (texts in i18n `landing.*`). Plain data without imports: the page,
 * its schema.org data (core/seo.ts) and its Markdown version (scripts/seo.mjs) all read it, so
 * they always say the same thing.
 */
export const FEATURES = [
  { key: 'cutout', icon: 'sparkles' },
  { key: 'background', icon: 'palette' },
  { key: 'brush', icon: 'brush' },
  { key: 'batch', icon: 'images' },
  { key: 'hd', icon: 'zap' },
  { key: 'formats', icon: 'file' },
  { key: 'offline', icon: 'offline' },
  { key: 'open', icon: 'code' },
];

export const STEPS = ['drop', 'ai', 'save'];

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

export const PRIVACY_POINTS = ['upload', 'account', 'tracking', 'verify'];

export const BROWSERS = [
  { name: 'Chrome / Edge', level: 'ok', key: 'gpu' },
  { name: 'Firefox', level: 'ok', key: 'firefox' },
  { name: 'Safari', level: 'ok', key: 'safari' },
  { name: 'Android / iOS', level: 'partial', key: 'mobile' },
];

export const FAQ = ['free', 'alternative', 'quality', 'privacy', 'formats', 'batch', 'commercial', 'offline', 'slow'];
