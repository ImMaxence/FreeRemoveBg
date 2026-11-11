/** Framework-free, so unit tests can read the real CHANGELOG.md with it. */
export interface Segment {
  text: string;
  code: boolean;
}

export interface Release {
  version: string;
  date: string;
  sections: { title: string; items: Segment[][] }[];
}

/**
 * Parses CHANGELOG.md (Keep a Changelog format). The file at the repository root is copied
 * into the build, so the page and GitHub always show the same history.
 */
export function parseChangelog(md: string): Release[] {
  const releases: Release[] = [];
  let release: Release | null = null;
  let section: Release['sections'][number] | null = null;
  for (const line of md.split(/\r?\n/)) {
    const h2 = line.match(/^## \[?([^\]\s]+)\]?(?:\s*-\s*(.+))?/);
    if (h2) {
      release = { version: h2[1], date: h2[2]?.trim() ?? '', sections: [] };
      releases.push(release);
      section = null;
      continue;
    }
    const h3 = line.match(/^### (.+)/);
    if (h3 && release) {
      section = { title: h3[1].trim(), items: [] };
      release.sections.push(section);
      continue;
    }
    const item = line.match(/^[-*] (.+)/);
    if (item && section) {
      section.items.push(item[1].split('`').map((text, i) => ({ text, code: i % 2 === 1 })));
    }
  }
  return releases;
}
