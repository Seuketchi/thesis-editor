# Design: PDF Viewer Aesthetics + Bundled Offline Compile

**Date:** 2026-02-15
**Status:** Approved

---

## Overview

Two improvements to Researchere:

1. **PDF Viewer** — Replace the native browser `<object>` embed with a PDF.js canvas renderer. Clean minimal aesthetic: white pages centered on a muted background with drop shadows, hover-activated controls.
2. **Offline Compile** — Bundle the SwiftLaTeX WASM engine into `public/` so Local mode works without any network access.

---

## Feature 1: PDF Viewer Aesthetics

### Problem

The current `<object>` tag delegates rendering to the browser's native PDF viewer. This looks different across browsers, cannot be themed, and has no custom controls.

### Solution

Use `pdfjs-dist` to render each PDF page to a `<canvas>` element. Full control over layout, background, shadows, and controls.

### Visual Design

- Muted gray background (`bg-black/10 dark:bg-black/30`) fills the viewer area
- Each page renders as a white `<canvas>` centered horizontally
- `box-shadow: 0 4px 24px rgba(0,0,0,0.15)` per page
- Pages separated by 16px gap
- Floating control bar (page X / Y, zoom –/+) appears on hover using `motion` (already installed)
- Controls fade in with opacity transition, positioned at bottom-center of the viewer

### Architecture

- **New component:** `src/components/Preview/PdfCanvas.tsx` — handles PDF.js loading, page rendering loop, canvas management
- **Modified:** `src/components/Preview/PdfViewer.tsx` — replace `<object>` with `<PdfCanvas pdfUrl={compilationResult.pdfUrl} />`
- **Dependency:** `pdfjs-dist` (npm)
- PDF.js worker configured via Vite asset import

### State

`PdfCanvas` manages its own local state: `numPages`, `currentPage`, `scale`, `isLoading`. No store changes needed.

---

## Feature 2: Bundled WASM Offline Compile

### Problem

The Local (WASM) compilation mode loads `PdfTeXEngine.js` from external CDNs at runtime. This:
- Requires network access on first use
- Is fragile (CDN URLs go stale)
- Contradicts the "offline" promise

### Solution

Download SwiftLaTeX assets and place them in `public/swiftlatex/`. Load the engine from a local path. Delete the CDN fallback loop.

### Files to Add

```
public/
  swiftlatex/
    PdfTeXEngine.js      (~2MB JS)
    PdfTeXEngine.wasm    (~30MB WASM binary)
```

These are served as static assets by Vite's dev server and included in the production build output. They are not processed by Vite — just copied as-is.

### Code Changes

**`src/lib/compiler.ts`:**

- Remove `ENGINE_CDNS` array and the CDN fallback loop in `initLocalEngine`
- Replace with a single `loadScript('/swiftlatex/PdfTeXEngine.js')` call
- The WASM file is co-located — SwiftLaTeX automatically resolves it relative to the JS file

### Asset Source

Download from the `nicola-swiftlatex` GitHub repository:
- `https://nicola.github.io/nicola-swiftlatex/PdfTeXEngine.js`
- The `.wasm` file referenced inside `PdfTeXEngine.js`

### Build Impact

- ~30–50MB added to `public/` and production build
- No Vite bundle changes — static file serving only
- Local mode now loads instantly (no CDN latency) after the initial page load

---

## Files Affected

| File | Change |
|------|--------|
| `src/components/Preview/PdfViewer.tsx` | Replace `<object>` with `<PdfCanvas>` |
| `src/components/Preview/PdfCanvas.tsx` | New component |
| `src/lib/compiler.ts` | Remove CDN loop, load from `/swiftlatex/` |
| `public/swiftlatex/PdfTeXEngine.js` | New static asset |
| `public/swiftlatex/PdfTeXEngine.wasm` | New static asset |
| `package.json` | Add `pdfjs-dist` |

---

## Out of Scope

- Page thumbnail strip / sidebar navigation
- Text selection in PDF
- Annotation support
- Changing the SwiftLaTeX engine (stays as pdflatex)
