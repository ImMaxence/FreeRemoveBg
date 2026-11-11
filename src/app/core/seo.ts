import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { DEFAULT_LANG, LANGUAGES, applyLanguage, localizedPath, unlocalizedPath } from './i18n';
import { FAQ, FEATURES, STEPS } from './landing-content';
import { APP_NAME, APP_VERSION, REPO_URL, SITE_URL } from './version';

/**
 * Title, description, canonical URL and language alternates of every page, from the `seo` key
 * of its route (texts in i18n `seo.<key>`). Runs on the server too, so prerendered pages
 * carry them, with schema.org data (the app, how to use it, the FAQ) that search engines and AI
 * assistants read. The tool itself (/app) is not indexed.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.update());
    // The tool follows language changes without a navigation.
    this.transloco.langChanges$.subscribe(() => this.update());
  }

  private update(): void {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    const key = (route.data['seo'] as string | undefined) ?? 'app';
    const indexed = !!route.data['seo'] && !route.data['noindex'];
    const lang = this.transloco.getActiveLang();
    const language = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
    const t = (field: string) => this.transloco.translate(`seo.${key}.${field}`);
    const path = unlocalizedPath(this.router.url);
    const url = `${SITE_URL}${localizedPath(path, lang)}`;

    this.title.setTitle(t('title'));
    this.meta.updateTag({ name: 'description', content: t('description') });
    this.meta.updateTag({ name: 'robots', content: indexed ? 'index, follow, max-image-preview:large' : 'noindex' });
    this.meta.updateTag({ property: 'og:title', content: t('title') });
    this.meta.updateTag({ property: 'og:description', content: t('description') });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:locale', content: language.og });
    applyLanguage(this.document, lang);

    // Canonical URL, the alternates of every language (x-default: English) and the Markdown
    // version of the page (written by scripts/seo.mjs).
    this.document.head.querySelectorAll('link[rel="canonical"], link[rel="alternate"], script[type="application/ld+json"]').forEach((l) => l.remove());
    if (!indexed) return;
    for (const data of this.structuredData(key, url, language.tag)) {
      const script = this.document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.textContent = JSON.stringify(data);
      this.document.head.appendChild(script);
    }
    this.link({ rel: 'canonical', href: url });
    for (const l of LANGUAGES) {
      for (const hreflang of l.hreflang) this.link({ rel: 'alternate', hreflang, href: `${SITE_URL}${localizedPath(path, l.code)}` });
    }
    this.link({ rel: 'alternate', hreflang: 'x-default', href: `${SITE_URL}${localizedPath(path, DEFAULT_LANG)}` });
    this.link({ rel: 'alternate', type: 'text/markdown', href: `${url.replace(/\/$/, '')}/index.md` });
  }

  /** schema.org descriptions of the home page: the web app, how to use it and the FAQ. */
  private structuredData(key: string, url: string, lang: string): object[] {
    if (key !== 'home') return [];
    const t = (k: string) => this.transloco.translate(k);
    const author = { '@type': 'Person', name: 'Maxence Bonnici', url: 'https://mbonnici.fr' };
    const app = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: APP_NAME,
      url,
      description: t('seo.home.description'),
      image: `${SITE_URL}/og-image.png`,
      inLanguage: lang,
      applicationCategory: 'MultimediaApplication',
      applicationSubCategory: 'Background remover',
      operatingSystem: 'Any',
      browserRequirements: 'A recent browser; WebGPU (Chrome, Edge, recent Firefox and Safari) gives the best quality',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      license: 'https://opensource.org/licenses/MIT',
      softwareVersion: APP_VERSION,
      author,
      sameAs: [REPO_URL],
      featureList: FEATURES.map((f) => t(`landing.features.${f.key}.title`)),
    };
    const howTo = {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: t('landing.how.title'),
      inLanguage: lang,
      totalTime: 'PT10S',
      tool: { '@type': 'HowToTool', name: APP_NAME },
      step: STEPS.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: t(`landing.how.${s}.title`), text: t(`landing.how.${s}.text`), url: `${url}#how` })),
    };
    const faq = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: lang,
      mainEntity: FAQ.map((id) => ({
        '@type': 'Question',
        name: t(`landing.faq.${id}.q`),
        acceptedAnswer: { '@type': 'Answer', text: t(`landing.faq.${id}.a`) },
      })),
    };
    return [app, howTo, faq];
  }

  private link(attributes: Record<string, string>): void {
    const link = this.document.createElement('link');
    for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
    this.document.head.appendChild(link);
  }
}
