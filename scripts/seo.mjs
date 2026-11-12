// Runs after `ng build` (see the "build" script). Writes into the build, for search engines and
// AI assistants:
//   - sitemap.xml: every public page in every language, with its alternates;
//   - an index.md next to each prerendered page: its text as Markdown, also served to requests
//     asking for text/markdown (see docker/nginx.conf);
//   - llms.txt (what the site is and its pages) and llms-full.txt (every English page in one file).
// The texts come from the same translation files and lists as the pages.
// It also has the prerendered pages preload their two fonts (named by the build, with a hash), so
// that they are fetched with the stylesheet rather than after it. index.csr.html is left as it is:
// the service worker checks its hash.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { LANGUAGES } from '../src/app/core/languages.ts';
import { AI_FACTS, BROWSERS, COMPARE, FAQ, FEATURES, PRIVACY_POINTS, STEPS } from '../src/app/core/landing-content.ts';
import { AI_SHEETS, MODELS, SAM, SHEET_IDS } from '../src/app/core/models.ts';

const SITE = 'https://freeremovebg.mbonnici.fr';
const REPO = 'https://github.com/ImMaxence/FreeRemoveBg';
const NAME = 'FreeRemoveBg';
const OUT = new URL('../dist/freeremovebg/browser/', import.meta.url);
const PAGES = ['/', '/changelog', '/legal', '/privacy', '/terms', '/accessibility'];
const SEO_KEYS = { '/': 'home', '/changelog': 'changelog', '/legal': 'legal', '/privacy': 'privacy', '/terms': 'terms', '/accessibility': 'accessibility' };
const LEGAL_DOCS = { '/legal': 'notice', '/privacy': 'privacy', '/terms': 'terms', '/accessibility': 'accessibility' };
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

const url = (page, lang) => `${SITE}${lang === 'en' ? page : `/${lang}${page === '/' ? '' : page}`}`;
const dir = (page, lang) => `${lang === 'en' ? '' : `${lang}/`}${page === '/' ? '' : `${page.slice(1)}/`}`;
const write = (path, text) => writeFileSync(new URL(path, OUT), text);

const english = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));

/** A translation lookup like the app's: English when a key is missing, `{{ name }}` filled in. */
function translator(lang) {
  const texts = JSON.parse(readFileSync(new URL(`../public/i18n/${lang}.json`, import.meta.url), 'utf8'));
  const find = (tree, key) => key.split('.').reduce((node, k) => node?.[k], tree);
  return (key, params = {}) => {
    const value = find(texts, key) ?? find(english, key);
    if (value === undefined) throw new Error(`${lang}: no text for ${key}`);
    return typeof value === 'string' ? value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => String(params[name])) : value;
  };
}

/** `[label](/terms)` of the legal texts, with the absolute address of the page in this language. */
const links = (text, lang) => text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `[${label}](${href.startsWith('/') ? url(href, lang) : href})`);

const sections = (...blocks) => blocks.flat().filter(Boolean).join('\n\n');

// --- The pages ------------------------------------------------------------------------------

function home(t) {
  const names = SHEET_IDS.map((id) => `**${AI_SHEETS[id].name}**`).join(', ');
  return sections(
    `## ${t('landing.hero.title1')} ${t('landing.hero.title2')} ${t('landing.hero.title3')}`,
    `${t('landing.hero.ai')} ${names} · ${['free', 'noUpload', 'fullSize'].map((p) => t(`landing.hero.proof.${p}`)).join(' · ')}`,
    t('landing.hero.lead'),
    `[${t('landing.hero.cta')}](${SITE}/app) · [GitHub](${REPO})`,
    `## ${t('landing.ai.title1')} ${t('landing.ai.title2')}`,
    t('landing.ai.lead'),
    ['precise', 'choice', 'local', 'open'].map((p) => `- **${t(`landing.ai.points.${p}.title`)}**: ${t(`landing.ai.points.${p}.text`)}`).join('\n'),
    [
      `| ${t('landing.ai.specKicker')} | ${SHEET_IDS.map((id) => AI_SHEETS[id].name).join(' | ')} |`,
      `|---|${SHEET_IDS.map(() => '---').join('|')}|`,
      ...AI_FACTS.map((f) => `| ${t(`landing.ai.facts.${f}`)} | ${SHEET_IDS.map((id) => t(`landing.ai.models.${id}.facts.${f}`)).join(' | ')} |`),
    ].join('\n'),
    SHEET_IDS.map((id) => {
      const m = AI_SHEETS[id];
      return `- **${m.name}**: ${m.paperUrl ? `[${t('landing.ai.paper')}](${m.paperUrl}) · ` : ''}[${t('landing.ai.code')}](${m.url}) · [${t('landing.ai.hub')}](https://huggingface.co/${m.repo})`;
    }).join('\n'),
    `## ${t('landing.how.title')}`,
    t('landing.how.lead'),
    STEPS.map((step, i) => `### ${i + 1}. ${t(`landing.how.${step}.title`)}\n\n${t(`landing.how.${step}.text`)}`),
    `## ${t('landing.features.title')}`,
    FEATURES.map((f) => `### ${t(`landing.features.${f.key}.title`)}\n\n${t(`landing.features.${f.key}.text`)}`),
    `## ${t('landing.privacy.title')}`,
    t('landing.privacy.lead'),
    PRIVACY_POINTS.map((p) => `- ${t(`landing.privacy.${p}`)}`).join('\n'),
    `## ${t('landing.compare.title')}`,
    t('landing.compare.lead'),
    [`| | ${NAME} | ${t('landing.compare.them')} |`, '|---|---|---|', ...COMPARE.map((row) => `| ${t(`landing.compare.rows.${row.key}`)} | ${t('landing.compare.yes')} | ${t(`landing.compare.${row.them}`)} |`)].join('\n'),
    t('landing.compare.note'),
    `## ${t('landing.support.title')}`,
    BROWSERS.map((b) => `- **${b.name}** (${t(`landing.support.${b.level}`)}): ${t(`landing.support.${b.key}`)}`).join('\n'),
    `## ${t('landing.faq.title')}`,
    FAQ.map((q) => `### ${t(`landing.faq.${q}.q`)}\n\n${t(`landing.faq.${q}.a`)}`),
    `## ${t('landing.final.title')}`,
    t('landing.final.text'),
    `[${t('landing.hero.cta')}](${SITE}/app)`,
  );
}

/** The release notes, in English on every language's page, as on the site. */
function changelog(t) {
  const notes = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const releases = notes
    .slice(notes.indexOf('\n## '))
    .replace(/^## \[([^\]]+)\] - (.+)$/gm, '## $1 ($2)')
    .trim();
  return sections(t('changelog.lead'), releases);
}

function legal(t, lang, id) {
  const doc = t(`legal.${id}`);
  return sections(
    t('legal.updated'),
    doc.intro,
    doc.sections.map((s) => sections(`## ${s.title}`, s.body.map((p) => links(p, lang)))),
  );
}

/** One page as Markdown. `nav` adds the site's links and the page in the other languages. */
function pageMarkdown(page, lang, nav = true) {
  const t = translator(lang);
  const seo = SEO_KEYS[page];
  const body = page === '/' ? home(t) : page === '/changelog' ? changelog(t) : legal(t, lang, LEGAL_DOCS[page]);
  const item = (label, target) => `- [${label}](${target})`;
  return (
    sections(
      `# ${t(`seo.${seo}.title`)}`,
      `> ${t(`seo.${seo}.description`)}`,
      body,
      nav && [
        `## ${t('footer.product')}\n\n${[item(NAME, url('/', lang)), item(t('nav.open'), `${SITE}/app`), item(t('nav.changelog'), url('/changelog', lang)), item('GitHub', REPO)].join('\n')}`,
        `## ${t('footer.legal')}\n\n${Object.entries(LEGAL_DOCS)
          .map(([path, id]) => item(t(`legal.nav.${id}`), url(path, lang)))
          .join('\n')}`,
        `## ${t('nav.language')}\n\n${LANGUAGES.filter((l) => l.code !== lang)
          .map((l) => item(l.label, url(page, l.code)))
          .join('\n')}`,
      ],
      `---\n\n${NAME} ${version} · ${t('footer.noTracking')} · ${url(page, lang)}`,
    ) + '\n'
  );
}

// --- llms.txt and llms-full.txt ---------------------------------------------------------------

function llmsText() {
  const t = translator('en');
  const others = LANGUAGES.filter((l) => l.code !== 'en');
  const isnet = MODELS.isnet;
  const ormbg = MODELS.ormbg;
  const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`;
  return `# ${NAME}

> Free, open source background remover that runs entirely in the web browser. Pictures are never uploaded: the AI model that finds the subject, the background editor and the full-resolution export all run on the user's device. No account, no credits, no watermark.

${NAME} is a web app (installable as a PWA, works offline), version ${version}, available in ${LANGUAGES.map((l) => l.label).join(' and ')}. No tracking, MIT license. It is an independent alternative to online services such as remove.bg, with which it is not affiliated.

## What it does

- Removes the background of a picture automatically with an open source segmentation model of the user's choice, run in the browser by ONNX Runtime Web and Transformers.js:
  - ${isnet.name} (Qin et al., "Highly Accurate Dichotomous Image Segmentation", ECCV 2022; ${isnet.license}; ${mb(isnet.weights.fp32)}): any subject, the default
  - ${ormbg.name} ("Open Remove Background Model", IS-Net trained on people; ${ormbg.license}; ${mb(ormbg.weights.fp16)} on a graphics card, ${mb(ormbg.weights.fp32)} otherwise): people and portraits
- Asks before downloading the chosen model (once, from Hugging Face); nothing else is downloaded and no picture is uploaded
- A picture can be cut out again with the other model, to compare
- "Click" retouch tool: ${SAM.name} (Meta, "Segment Anything in Images and Videos", 2024; ${SAM.license}; ${Math.round(SAM.weights.fp16 / 1e6)} MB on a graphics card, ${Math.round(SAM.weights.fp32 / 1e6)} MB otherwise, downloaded only if used) selects the object the user clicks on, to add it to the cutout or take it away
- Optional preparation before the cutout: turn, mirror, crop with preset proportions
- Replaces the background: transparent, a color, a gradient, another picture, or the original blurred
- Erase and restore brush, and "rescue": draw around an object the AI missed so it looks again
- Lasso: place points around an area (or draw it freehand), close the shape, then restore it or cut it out, inside the shape or around it; Ctrl + Z removes the last point while drawing and undoes any retouch
- Batch processing: several pictures at once, the same background for all, one ZIP download
- Download at the photo's own size (up to about 6,000 × 4,000 pixels) as PNG or WebP (transparent) or JPG; copy to the clipboard
- Accepts every picture the browser can open: JPG, PNG, WebP, AVIF, GIF, BMP, and HEIC in Safari

## Requirements

- A recent browser. With WebGPU (Chrome, Edge, recent Firefox and Safari) a picture takes about a second; without it the processor is used (WebAssembly) and a picture takes a few seconds
- The chosen AI model (${mb(ormbg.weights.fp16)} to ${mb(isnet.weights.fp32)}) is downloaded once from Hugging Face, after the user agrees to it, then kept by the browser

## Pages

${PAGES.map((p) => `- [${t(`seo.${SEO_KEYS[p]}.title`)}](${url(p, 'en')}): ${t(`seo.${SEO_KEYS[p]}.description`)}`).join('\n')}
- [Open the tool](${SITE}/app)

## Markdown

Every page also exists as Markdown: add index.md to its address (${SITE}/index.md, ${SITE}/fr/privacy/index.md…) or ask for it with the header "Accept: text/markdown". Every English page in one file: ${SITE}/llms-full.txt

## Other languages

${others.map((l) => `- ${l.label}: [${translator(l.code)('seo.home.title')}](${url('/', l.code)})`).join('\n')}

## Optional

- [Source code on GitHub](${REPO})
- [Release notes (Markdown)](${SITE}/CHANGELOG.md)
- [Sitemap](${SITE}/sitemap.xml)
`;
}

function llmsFull() {
  return [
    `# ${NAME}: full text\n\n> Free, open source background remover that runs entirely in the browser, version ${version}. Below: every page in English. Each page in each language also exists on its own as Markdown, at its address followed by index.md (${SITE}/fr/index.md…); the list of pages is in ${SITE}/llms.txt.`,
    ...PAGES.map((p) => pageMarkdown(p, 'en', false)),
  ].join('\n\n---\n\n');
}

// --- sitemap.xml --------------------------------------------------------------------------------

function sitemap() {
  const entries = PAGES.flatMap((page) => {
    const alternates = [...LANGUAGES.flatMap((l) => l.hreflang.map((h) => [h, url(page, l.code)])), ['x-default', url(page, 'en')]]
      .map(([l, href]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${href}"/>`)
      .join('\n');
    const priority = page === '/' ? '1.0' : page === '/changelog' ? '0.5' : '0.3';
    return LANGUAGES.map(({ code }) => `  <url>\n    <loc>${url(page, code)}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${priority}</priority>\n${alternates}\n  </url>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

// --- Write ------------------------------------------------------------------------------------

/** The fonts of the first screen, as the build named them: Geist (text) and Bricolage Grotesque (titles). */
const FONTS = readdirSync(new URL('media/', OUT)).filter((f) => /^(geist-latin-wght-normal|bricolage-grotesque-latin-opsz-normal)-\w+\.woff2$/.test(f));
if (FONTS.length !== 2) throw new Error(`Expected the two latin fonts in media/, found ${FONTS.join(', ') || 'none'}`);
const preloads = FONTS.map((f) => `<link rel="preload" href="media/${f}" as="font" type="font/woff2" crossorigin>`).join('');

let count = 0;
for (const page of PAGES) {
  for (const { code } of LANGUAGES) {
    // Next to the prerendered page: a missing one means the routes and this list differ.
    const html = `${dir(page, code)}index.html`;
    if (!existsSync(new URL(html, OUT))) throw new Error(`No prerendered page for ${url(page, code)}`);
    write(`${dir(page, code)}index.md`, pageMarkdown(page, code));
    const source = readFileSync(new URL(html, OUT), 'utf8');
    if (!source.includes('rel="preload" href="media/')) write(html, source.replace('<link rel="stylesheet"', `${preloads}<link rel="stylesheet"`));
    count++;
  }
}
write('sitemap.xml', sitemap());
write('llms.txt', llmsText());
write('llms-full.txt', llmsFull());
console.log(`seo: ${count} index.md, sitemap.xml (${count} URLs), llms.txt, llms-full.txt`);
