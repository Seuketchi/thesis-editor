# Researchere

Write your thesis in rich text. We handle the LaTeX.

Researchere is web application that lets you write academic documents in a word-processor-style editor while generating valid LaTeX behind the scenes. Pick a template, write your sections in bold and headings, look up citations by DOI, compile to PDF, and export a `.zip` ready for Overleaf — all without touching a LaTeX file.

---

## Features

- **Rich text editing** — H1–H3, bold, italic, lists, blockquotes, code blocks. Stored as structured JSON, compiled to LaTeX on demand.
- **Hidden LaTeX** — your section content is serialized to LaTeX at compile time. `main.tex` is still there for full control over the preamble.
- **Live PDF preview** — compile with one click using the cloud pdflatex API.
- **Starter templates** — General University (`report`), IEEE Conference (`IEEEtran`), APA Style (`article`), or paste your own preamble.
- **DOI citation lookup** — paste a DOI or `https://doi.org/...` URL, get a pre-filled BibTeX entry appended to `references.bib`.
- **Offline-capable** — IndexedDB persistence auto-saves your project. Reopen the app and pick up exactly where you left off.
- **Overleaf export** — download a `.zip` with all files serialized to raw `.tex`, ready to drag into Overleaf.
- **PWA** — installable on desktop and mobile.

---

## Getting Started

**Prerequisites:** [Bun](https://bun.sh/) (recommended) or Node.js 18+.

```bash
git clone https://github.com/leoboymasters/researchere.git
cd researchere
bun install
bun run dev
```

Open `http://localhost:3000`, click **New Project →**, pick a template, and start writing.

---

## How It Works

```
You type in rich text
        ↓
Tiptap JSON (stored in browser)
        ↓
jsonToLatex serializer (at compile time)
        ↓
Raw LaTeX sent to pdflatex API
        ↓
PDF rendered in the preview panel
```

Section files (`.tex`) are stored as Tiptap JSON. `main.tex` holds the raw preamble and `\input` statements and is always editable in code mode. The compiler bridge converts section files to LaTeX transparently — the underlying compiler never knows the difference.

---

## Development

```bash
bun run dev       # development server with HMR
bun run build     # production build
bun test          # run tests (Vitest)
```

---

## Deployment

### Cloudflare Pages (Recommended)

This project is configured for deployment on Cloudflare Pages.

#### Option 1: Automatic Deployment via Git Integration

1. **Connect your repository** to Cloudflare Pages
2. **Configure build settings** in the Cloudflare dashboard:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** (leave empty)
   - **Environment variables:** Add any required env vars (e.g., `GEMINI_API_KEY`)

3. **Important:** Do NOT add a custom deploy command. Cloudflare Pages automatically deploys the build output.

#### Option 2: Manual Deployment via CLI

```bash
npm run build
npm run deploy  # or: npx wrangler pages deploy dist
```

#### Troubleshooting

**Error: "Workers-specific command in a Pages project"**
- This means your Cloudflare dashboard has the wrong deploy command configured
- Solution: Remove any custom deploy commands; use only `npm run build` as the build command
- Cloudflare Pages will automatically deploy the `dist` folder after building

**First-time setup:**
```bash
npx wrangler login
npx wrangler pages project create researchere
npm run deploy
```

---

## Tech Stack

| | |
|---|---|
| Editor | [Tiptap](https://tiptap.dev/) (ProseMirror) |
| UI | React 19, Tailwind CSS |
| State | Zustand |
| Persistence | Dexie.js (IndexedDB) |
| Compilation | [YtoTech LaTeX API](https://latex.ytotech.com/) |
| Build | Vite 6, Bun |
| Tests | Vitest |
| PWA | vite-plugin-pwa, Workbox |

---

## Project Structure

```
src/
├── components/
│   ├── Editor/          # RichTextEditor, EditorToolbar, CodeEditor
│   ├── Layout/          # Sidebar, TopBar, SettingsModal
│   ├── Preview/         # PdfViewer, DocumentStructure
│   ├── Templates/       # TemplatePickerModal
│   └── Citations/       # CitationModal
├── lib/
│   ├── jsonToLatex.ts   # Tiptap JSON → LaTeX serializer
│   ├── compilerSerializer.ts  # bridge: serialize before compile
│   ├── compiler.ts      # pdflatex API client
│   ├── db.ts            # Dexie schema
│   ├── persistence.ts   # IndexedDB read/write
│   ├── doiLookup.ts     # CrossRef API + BibTeX formatter
│   └── exportZip.ts     # fflate ZIP export
├── store/
│   └── projectStore.ts  # Zustand store (all app state)
└── data/
    └── templates.ts     # built-in template definitions
```
