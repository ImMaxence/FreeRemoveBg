import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChangelog } from '../changelog/changelog-parser';
import { BROWSERS, COMPARE, FAQ, FEATURES, PRIVACY_POINTS, STEPS } from './landing-content';
import { LANGUAGES, languageFor } from './languages';
import { MODEL_IDS } from './models';

type Tree = { [key: string]: Tree | string | Tree[] | string[] };

const load = (lang: string) => JSON.parse(readFileSync(new URL(`../../../public/i18n/${lang}.json`, import.meta.url), 'utf8')) as Tree;

/** Every text of a translation file, by its path: { 'nav.open': 'Remove a background', … }. */
function flatten(tree: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof tree === 'string') out[prefix] = tree;
  else if (tree && typeof tree === 'object') for (const [key, value] of Object.entries(tree)) flatten(value, prefix ? `${prefix}.${key}` : key, out);
  return out;
}

const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();

describe('translations', () => {
  const english = flatten(load('en'));

  for (const { code } of LANGUAGES.filter((l) => l.code !== 'en')) {
    it(`${code} has every text of English, and no other`, () => {
      const texts = flatten(load(code));
      expect(Object.keys(texts).sort()).toEqual(Object.keys(english).sort());
    });

    it(`${code} keeps every {{ placeholder }}`, () => {
      const texts = flatten(load(code));
      for (const [key, text] of Object.entries(english)) expect(placeholders(texts[key] ?? ''), key).toEqual(placeholders(text));
    });
  }

  it('has the texts of everything the home page lists', () => {
    const keys = [
      ...FEATURES.flatMap((f) => [`landing.features.${f.key}.title`, `landing.features.${f.key}.text`]),
      ...STEPS.flatMap((s) => [`landing.how.${s}.title`, `landing.how.${s}.text`]),
      ...COMPARE.flatMap((c) => [`landing.compare.rows.${c.key}`, `landing.compare.${c.them}`]),
      ...PRIVACY_POINTS.map((p) => `landing.privacy.${p}`),
      ...BROWSERS.flatMap((b) => [`landing.support.${b.key}`, `landing.support.${b.level}`]),
      ...FAQ.flatMap((q) => [`landing.faq.${q}.q`, `landing.faq.${q}.a`]),
      ...MODEL_IDS.map((id) => `landing.ai.${id}`),
    ];
    for (const key of keys) expect(english[key], key).toBeTruthy();
  });

  it('keeps titles and descriptions within what search engines show', () => {
    for (const { code } of LANGUAGES) {
      const texts = flatten(load(code));
      for (const [key, text] of Object.entries(texts)) {
        if (/^seo\.\w+\.title$/.test(key)) expect(text.length, `${code} ${key}`).toBeLessThanOrEqual(70);
        if (/^seo\.\w+\.description$/.test(key)) expect(text.length, `${code} ${key}`).toBeLessThanOrEqual(230);
      }
    }
  });
});

describe('languages', () => {
  it('maps browser languages to a version', () => {
    expect(languageFor('fr-CA')).toBe('fr');
    expect(languageFor('en_GB')).toBe('en');
    expect(languageFor('de')).toBeNull();
  });
});

describe('changelog', () => {
  it('parses the real CHANGELOG.md', () => {
    const releases = parseChangelog(readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8'));
    const { version } = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string };
    // The first release is the version being built, with at least one note.
    expect(releases[0].version).toBe(version);
    expect(releases[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(releases[0].sections[0].items.length).toBeGreaterThan(0);
    for (const r of releases) expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('splits inline code', () => {
    const [release] = parseChangelog('## [1.2.3] - 2026-01-01\n\n### Fixed\n- Paste with `Ctrl + V` again');
    expect(release.sections[0].items[0]).toEqual([
      { text: 'Paste with ', code: false },
      { text: 'Ctrl + V', code: true },
      { text: ' again', code: false },
    ]);
  });
});
