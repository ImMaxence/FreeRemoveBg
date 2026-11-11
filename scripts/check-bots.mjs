// Checks that search engines and AI crawlers get the site: each one asks for robots.txt, the
// sitemap, llms.txt and a few pages (HTML, then Markdown) with its own User-Agent, as a crawler
// would through Cloudflare. Usage: npm run check:bots [-- https://localhost:4281]
const BASE = process.argv[2] ?? 'https://freeremovebg.mbonnici.fr';

const BOTS = {
  GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
  'ChatGPT-User': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  ClaudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'Claude-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)',
  'Claude-User': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
  PerplexityBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  'Perplexity-User': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
  Googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  Bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  Applebot: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
  CCBot: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
};

// [path, Accept header, expected content type, text the body must contain]
const CHECKS = [
  ['/robots.txt', '*/*', 'text/plain', 'User-agent: ClaudeBot'],
  ['/sitemap.xml', '*/*', 'text/xml', '/fr/privacy</loc>'],
  ['/llms.txt', '*/*', 'text/plain', '# FreeRemoveBg'],
  ['/llms-full.txt', '*/*', 'text/plain', '# FreeRemoveBg: full text'],
  ['/', 'text/html', 'text/html', '<html lang="en"'],
  ['/fr', 'text/html', 'text/html', '<html lang="fr"'],
  ['/fr/privacy', 'text/html', 'text/html', '<html lang="fr"'],
  ['/accessibility', 'text/html', 'text/html', '<html lang="en"'],
  ['/fr/changelog', 'text/html', 'text/html', '<html lang="fr"'],
  ['/fr', 'text/markdown', 'text/markdown', '# FreeRemoveBg — '],
  ['/fr/terms/index.md', '*/*', 'text/markdown', '(https://freeremovebg.mbonnici.fr/fr/terms)'],
];

let failures = 0;
for (const [bot, agent] of Object.entries(BOTS)) {
  const results = await Promise.all(
    CHECKS.map(async ([path, accept, type, text]) => {
      const response = await fetch(BASE + path, { headers: { 'User-Agent': agent, Accept: accept }, redirect: 'manual' }).catch((e) => ({ status: e.message }));
      const contentType = response.headers?.get('content-type') ?? '';
      const body = response.status === 200 ? await response.text() : '';
      const ok = response.status === 200 && contentType.startsWith(type) && body.includes(text);
      return ok ? null : `${path}${accept === 'text/markdown' ? ' (markdown)' : ''} → ${response.status} ${contentType}${body && !body.includes(text) ? `, without “${text}”` : ''}`;
    }),
  );
  const failed = results.filter(Boolean);
  failures += failed.length;
  console.log(`${bot.padEnd(17)} ${failed.length ? `FAIL ${failed.join(' · ')}` : `ok (${CHECKS.length} × 200)`}`);
}
process.exit(failures ? 1 : 0);
