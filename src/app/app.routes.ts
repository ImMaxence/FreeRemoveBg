import type { Routes } from '@angular/router';
import { languageResolver, languageSegment } from './core/i18n';

const legal = () => import('./legal/legal').then((m) => m.Legal);

/** Public pages, prerendered once per language. `seo` names their title and description texts. */
const publicPages: Routes = [
  { path: '', loadComponent: () => import('./landing/landing').then((m) => m.Landing), data: { seo: 'home' } },
  { path: 'changelog', loadComponent: () => import('./changelog/changelog').then((m) => m.Changelog), data: { seo: 'changelog' } },
  { path: 'legal', loadComponent: legal, data: { doc: 'notice', seo: 'legal' } },
  { path: 'privacy', loadComponent: legal, data: { doc: 'privacy', seo: 'privacy' } },
  { path: 'terms', loadComponent: legal, data: { doc: 'terms', seo: 'terms' } },
  { path: 'accessibility', loadComponent: legal, data: { doc: 'accessibility', seo: 'accessibility' } },
];

export const routes: Routes = [
  // The tool: one URL, in the language chosen by the user, never indexed.
  { path: 'app', loadComponent: () => import('./tool/tool').then((m) => m.Tool), data: { seo: 'app', noindex: true } },
  // Public pages: /fr/… and English at the root.
  { path: ':lang', canMatch: [languageSegment], resolve: { language: languageResolver }, children: publicPages },
  { path: '', resolve: { language: languageResolver }, children: publicPages },
  { path: '**', redirectTo: '' },
];
