# Changelog

All notable changes to FreeRemoveBg. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/) — `MAJOR.MINOR.PATCH`: MAJOR for changes that break how the app is used or hosted, MINOR for new features, PATCH for fixes.

## [2.2.0] - 2026-11-12

### Added
- "Click" tool in the cutout step, powered by SAM 2.1 (Meta AI, Apache-2.0): click an object, or draw a box around it, then add it to the cutout or remove it from it. More clicks refine the selection ("Include", "Exclude" or Alt + click). SAM is downloaded only when the tool is first opened, after you agree (78 MB on a graphics card)
- A notice on phones, and on computers without a usable graphics card, that the AI runs slower there and may fail on very large pictures
- The "Install" button is always in the menu: it opens the browser's install prompt, or shows the steps for Safari, Firefox, Edge, Chrome and Android
- Install screenshots and a vector icon in the app manifest

### Changed
- New file names for the app icons, so browsers and installed apps show the new logo; iPhone and iPad get their own home screen icon
- Lighter pictures on the home page for phones, whose title and introduction show from the first frame
- The sharing picture, the descriptions and the footer name the three AIs: IS-Net, ORMBG and SAM 2.1

### Fixed
- The navigation bar moved a few seconds after the start, when the install icon appeared
- On the tool page, the footer jumped down while the tool was drawn

## [2.1.0] - 2026-11-11

### Added
- A second AI model to choose from: ORMBG, made for people (portraits, hair), half the download on a graphics card (88 MB). IS-Net stays the default for any subject
- "Try ORMBG" / "Try IS-Net" on a result: the picture is cut out again with the other model, to compare
- The mouse wheel zooms in and out around the pointer; with "Move", dragging moves the zoomed picture
- Real QR codes on the home page's spec sheets, opening each model's page on Hugging Face (they replace a decorative barcode)
- Legal notice: fonts, sample pictures (authors and license) and icons (Lucide, Feather, with their license) are credited

### Fixed
- Zoom reset as soon as a brush stroke was made (or the thumbnail refreshed)
- A crop being drawn could be cancelled by the thumbnail refreshing
- Thumbnails of tall pictures went past their frame; the remove button sat off the corner
- The brush size is only shown with the eraser and the restore brush

## [2.0.0] - 2026-11-11

### Changed
- The tool works in four steps: the AI model is downloaded only after you agree to it (once), pictures wait to be prepared instead of being cut out as soon as they are added, then the cutout and the export
- New look of its own: warm paper, black ink and yellow, Bricolage Grotesque and Geist fonts, a new logo (a sticker peeling off), new icons and sharing picture
- Home page rebuilt, with the AI it uses, IS-Net, presented right after the top: spec sheet, paper, license, links
- Navigation bar: four links with room between them; language and theme are one button each
- Every picture the browser can open is accepted; sizes are given in pixels ("up to about 6,000 × 4,000") rather than megapixels

### Added
- "Prepare" step, optional: turn, mirror, crop with set proportions (free, original, square, 4:5, 3:2, 16:9), also with the keyboard, and back to the original
- "Rescue" tool: draw around an object the AI missed, it looks there again and adds it
- The model keeps downloading while pictures are added and prepared; it is ready at once on the next visits
- Questions answered on the home page: which AI is used, why a model is downloaded, does it work on iPhone

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
