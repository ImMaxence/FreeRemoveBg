# Changelog

All notable changes to FreeRemoveBg. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/) — `MAJOR.MINOR.PATCH`: MAJOR for changes that break how the app is used or hosted, MINOR for new features, PATCH for fixes.

## [1.0.0] - 2026-11-11

### Added
- Background removal by AI, entirely in the browser: the IS-Net model on the graphics card (WebGPU), or on the processor (WebAssembly) when there is none or when it fails
- New background: transparent, color, gradient, your own picture, or the original blurred
- Erase and restore brush with zoom, undo, redo and "back to the AI result"
- Batch processing: several pictures at once, the same background for all, download as one ZIP
- Full-resolution download (up to 25 megapixels) as PNG, JPG or WebP, and copy to the clipboard
- Pictures come in by file picker, drag and drop, paste (`Ctrl + V`) or "Open with" once installed
- Installable app (PWA) that works offline once the AI model is downloaded
- Home page presenting the project, with a before / after comparison and sample pictures
- English and French, each public page with its own URL (`/` and `/fr`)
- Light, dark and system themes
- Legal notice, privacy policy, terms of use and accessibility statement
- SEO: prerendered pages, `sitemap.xml`, `hreflang`, schema.org data, `llms.txt` and a Markdown version of every page for AI assistants
- Accessibility: keyboard use of the main path, skip link, screen reader announcements, AA contrast, reduced motion
- Docker Compose deployment (nginx) for Coolify, with a strict Content-Security-Policy
