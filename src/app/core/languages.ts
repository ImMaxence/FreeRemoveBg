/**
 * Interface languages. Plain data without imports: scripts/seo.mjs reads it too.
 *
 * - `code`: URL segment (/fr/…), i18n file (public/i18n/fr.json) and Transloco id
 * - `tag`: BCP 47 tag of `<html lang>`
 * - `hreflang`: what search engines may serve this version for
 * - `og`: Open Graph locale
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', tag: 'en', hreflang: ['en'], og: 'en_US' },
  { code: 'fr', label: 'Français', tag: 'fr', hreflang: ['fr'], og: 'fr_FR' },
] as const;

export type Language = (typeof LANGUAGES)[number];
export type LangCode = Language['code'];

/**
 * Interface language for a browser language (navigator.languages): 'fr-CA' → 'fr'… null when
 * there is no version for it. Kept in sync with public/theme-init.js, which redirects before
 * Angular starts.
 */
export function languageFor(browserTag: string): LangCode | null {
  const base = browserTag.toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.some((l) => l.code === base) ? (base as LangCode) : null;
}
