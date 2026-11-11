import { RenderMode, type ServerRoute } from '@angular/ssr';
import { PREFIXED_LANGS } from './core/i18n';

const languages = async () => PREFIXED_LANGS.map((lang) => ({ lang }));
const localized = (path: string): ServerRoute => ({
  path: path ? `:lang/${path}` : ':lang',
  renderMode: RenderMode.Prerender,
  getPrerenderParams: languages,
});

/**
 * Build-time rendering: the public pages are prerendered in every language (HTML that search
 * engines and link previews can read), the tool is rendered in the browser only.
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'app', renderMode: RenderMode.Client },
  ...['', 'changelog', 'legal', 'privacy', 'terms', 'accessibility'].map(localized),
  { path: '**', renderMode: RenderMode.Prerender },
];
