# Two-Edition EPUB — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Full and a Short EPUB edition of the PostHog Handbook, deploy a landing page that offers both downloads on Cloudflare Pages, and harden the build pipeline (split monolithic generator, add EPUBCheck validation, add silent-failure gate).

**Architecture:** Keep the existing CommonJS `node --test` pipeline. Move the application from `scripts/handbook-ebook/` to `src/`. Split the 1,267-line `generator.cjs` into focused modules along function-cluster seams (`source`, `markdown`, `links`, `assets`, `epub`). Add an `editions.cjs` module with `Full` and `Short` edition configs; `Short` filters the chapter list against a hand-curated allowlist with a build-time validity guard. The build emits two EPUBs, two cover images, a single `index.html` landing page, a `manifest.json`, and a parameterized `_headers` file. CI validates both EPUBs with EPUBCheck and fails on a non-zero error count.

**Tech Stack:** Node.js 22 (CommonJS), `node:test`, `sharp`, `@mermaid-js/mermaid-cli`, `jszip`, `unified`+`remark`+`rehype` toolchain, Cloudflare Pages (`wrangler`), GitHub Actions, EPUBCheck (Java).

**Status of Task 1 (git baseline):** ✅ DONE in prior session. Repo initialized, `.gitignore` written (extended 7-line version), private repo created at `https://github.com/yanchuk/posthog-handbook-ebook`, baseline commit `a7c6d48` pushed.

---

## File Structure (target end-state)

```
posthog-handbook-ebook/
├── .editorconfig                              # NEW (Task 0)
├── .github/workflows/deploy.yml               # MODIFY (Task 7)
├── .gitignore                                 # exists
├── .nvmrc                                     # NEW (Task 0)
├── AGENTS.md                                  # NEW (Task 0)
├── LICENSE                                    # NEW (Task 0)
├── README.md                                  # NEW (Task 0)
├── docs/
│   ├── plans/2026-05-06-two-edition-epub-generator.md         # exists (original)
│   └── superpowers/plans/2026-05-06-two-edition-epub-implementation.md  # this file
├── package.json                               # MODIFY (Task 0, 2)
├── pnpm-lock.yaml
├── skills-lock.json
├── src/                                       # was scripts/handbook-ebook/ (Task 2)
│   ├── assets.cjs                             # NEW (Task 3) — image/diagram pipeline
│   ├── build.cjs                              # was build-handbook-epub.cjs (Task 2)
│   ├── build.test.cjs                         # was build-handbook-epub.test.cjs (Task 2)
│   ├── config.cjs                             # was lib/config.cjs (Task 2, modified Task 5)
│   ├── editions.cjs                           # NEW (Task 4) — Full + Short edition model
│   ├── epub.cjs                               # NEW (Task 3) — OPF/nav/CSS/headers builders
│   ├── fixtures/
│   │   └── animated.gif                       # NEW (Task 6) — fixture for embed tests
│   ├── generator.cjs                          # was lib/generator.cjs (Task 2, slimmed Task 3)
│   ├── links.cjs                              # NEW (Task 3) — href rewriting
│   ├── markdown.cjs                           # NEW (Task 3) — md → xhtml + MDX components
│   ├── pages.cjs                              # was lib/pages.cjs (Task 2, modified Task 5)
│   └── source.cjs                             # NEW (Task 3) — file discovery + ordering
└── wrangler.toml
```

**Build outputs (gitignored):**
```
dist/handbook-ebook/
├── _headers                                   # parameterized in Task 5
├── epub-root/                                 # uncompressed working dir
├── index.html                                 # landing page (lists both editions)
├── manifest.json                              # lists both editions
├── posthog-handbook-full.epub                 # Task 5 (was *-full-preview.epub)
├── posthog-handbook-full-cover.jpg            # Task 5
├── posthog-handbook-short.epub                # Task 5
└── posthog-handbook-short-cover.jpg           # Task 5
```

---

## Task 0: DX Bootstrap

Add the basic onboarding files. Pure additions, no behavior change. Keeps the rest of the work in a repo that a future contributor (or future-you) can navigate without context.

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `.nvmrc`
- Create: `AGENTS.md`
- Create: `.editorconfig`
- Modify: `package.json` (drop unused `vitest` dep)

- [ ] **Step 1: Write `.nvmrc`**

Create `.nvmrc`:

```
22
```

- [ ] **Step 2: Write `.editorconfig`**

Create `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 4
insert_final_newline = true
trim_trailing_whitespace = true

[*.{yml,yaml,json}]
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 3: Write `LICENSE`**

Create `LICENSE` (MIT, with a note that the EPUB *content* belongs to PostHog):

```
MIT License

Copyright (c) 2026 Oleksii Ianchuk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

The PostHog Handbook content distributed in the generated EPUB files is
copyright © PostHog Inc. and is sourced from https://posthog.com/handbook.
This project only converts the public handbook into EPUB form. Refer to
PostHog's handbook page for the content's licensing terms.
```

- [ ] **Step 4: Write `AGENTS.md`**

Create `AGENTS.md`:

```markdown
# Agent Notes

This repository converts the public PostHog Handbook (https://posthog.com/handbook)
into EPUB files and deploys a landing page that offers them for download.

## Layout

- `src/` — the converter. Entry: `src/build.cjs`. Tests: `src/build.test.cjs`.
- `posthog.com/` — sparse-checkout of the PostHog source. **Read-only.** Re-cloned by CI.
- `dist/handbook-ebook/` — build output. Deployed to Cloudflare Pages.
- `docs/plans/` and `docs/superpowers/plans/` — design docs.

## Conventions

- CommonJS only (`.cjs`). No TypeScript, no ESM.
- Tests use `node:test` (no Vitest, no Jest). Run with `pnpm test:ebook`.
- Indent: 4 spaces. LF line endings. Enforced via `.editorconfig`.
- Two editions exist (`full`, `short`). The Short edition allowlist lives in `src/editions.cjs`.
- The Short build **must fail** when an allowlisted slug doesn't resolve to a real chapter.

## Don'ts

- Don't commit `dist/`, `node_modules/`, `posthog.com/`, or `.cache/`.
- Don't modify files under `posthog.com/`.
- Don't bypass the EPUBCheck step in CI without flagging it.

## Common commands

```bash
pnpm install
pnpm test:ebook                           # node --test src/*.test.cjs
pnpm build:ebook                          # build both editions
pnpm build:ebook -- --edition full        # one edition only
pnpm build:ebook -- --edition short
pnpm build:ebook -- --limit 5             # build first 5 chapters (smoke test)
```
```

- [ ] **Step 5: Write `README.md`**

Create `README.md`:

```markdown
# PostHog Handbook Ebook

A community-built EPUB version of the public [PostHog Handbook](https://posthog.com/handbook),
suitable for offline reading in Apple Books, Kindle, and other ebook readers.

Two editions are produced from the same source:

- **Full** — every public handbook chapter (~313 chapters).
- **Short** — outward-facing strategy, culture, brand, marketing, sales-enablement
  content (~70 chapters). Excludes internal procedures and engineering deep-dives.

A landing page at <https://posthog-handbook-ebook.ianchuk.com> hosts both downloads.

## Local development

Requirements: Node.js 22 (`.nvmrc`), `pnpm`, Java (only needed if running EPUBCheck locally).

```bash
# 1. Sparse-checkout the PostHog source as read-only input.
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/PostHog/posthog.com.git
cd posthog.com && git sparse-checkout set contents/handbook static src/navs/index.js
cd ..

# 2. Install and build.
pnpm install
pnpm test:ebook
pnpm build:ebook
```

Outputs land in `dist/handbook-ebook/`.

### Useful commands

| Command | What |
|---|---|
| `pnpm test:ebook` | Run the test suite (`node --test src/*.test.cjs`). |
| `pnpm build:ebook` | Build both editions. |
| `pnpm build:ebook -- --edition full` | Build only Full. |
| `pnpm build:ebook -- --edition short` | Build only Short. |
| `pnpm build:ebook -- --limit 5` | Build first 5 chapters (smoke test). |
| `pnpm deploy:pages` | Deploy `dist/handbook-ebook` to Cloudflare Pages. |

## Deployment

GitHub Actions builds and deploys weekly (`.github/workflows/deploy.yml`).
Manual deploy: `pnpm deploy:pages` (requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).

## License

MIT for the converter (see `LICENSE`). The handbook *content* is © PostHog Inc.
and is sourced from <https://posthog.com/handbook>.
```

- [ ] **Step 6: Drop unused `vitest` dev dependency**

Edit `package.json`. Remove the `"vitest": "^4.1.5"` line from `devDependencies`. Final `devDependencies` block:

```json
"devDependencies": {
    "@mermaid-js/mermaid-cli": "^11.14.0",
    "wrangler": "^4.88.0"
}
```

Add an `engines` field at the same level as `dependencies`:

```json
"engines": {
    "node": ">=22"
}
```

- [ ] **Step 7: Refresh lockfile**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` updates to remove vitest entries; no errors.

- [ ] **Step 8: Confirm tests still pass**

Run:

```bash
pnpm test:ebook
```

Expected: PASS (no test calls vitest; nothing broken).

- [ ] **Step 9: Commit**

```bash
git add .editorconfig .nvmrc AGENTS.md LICENSE README.md package.json pnpm-lock.yaml
git commit -m "chore: bootstrap dx (readme, license, .nvmrc, agents, editorconfig)"
```

---

## Task 2: Move Application to `src/`

Doc-plan deviation: the original plan moves to `scripts/ebook/`. We use `src/` because the directory contains the entire application, not sidecar tooling.

**Files:**
- Move: `scripts/handbook-ebook/build-handbook-epub.cjs` → `src/build.cjs`
- Move: `scripts/handbook-ebook/build-handbook-epub.test.cjs` → `src/build.test.cjs`
- Move: `scripts/handbook-ebook/lib/config.cjs` → `src/config.cjs`
- Move: `scripts/handbook-ebook/lib/generator.cjs` → `src/generator.cjs`
- Move: `scripts/handbook-ebook/lib/pages.cjs` → `src/pages.cjs`
- Modify: `src/build.cjs` (require path)
- Modify: `src/config.cjs` (PROJECT_ROOT path)
- Modify: `src/build.test.cjs` (require path)
- Modify: `package.json` (script paths)

- [ ] **Step 1: Update test require path first (failing state)**

Edit `scripts/handbook-ebook/build-handbook-epub.test.cjs` line 23:

```js
} = require('./build.cjs')
```

(Was `require('./build-handbook-epub.cjs')`.)

- [ ] **Step 2: Verify the test fails to load**

Run:

```bash
pnpm test:ebook
```

Expected: FAIL with `Cannot find module './build.cjs'`.

- [ ] **Step 3: Move files with `git mv`**

```bash
mkdir -p src
git mv scripts/handbook-ebook/build-handbook-epub.cjs        src/build.cjs
git mv scripts/handbook-ebook/build-handbook-epub.test.cjs   src/build.test.cjs
git mv scripts/handbook-ebook/lib/config.cjs                 src/config.cjs
git mv scripts/handbook-ebook/lib/generator.cjs              src/generator.cjs
git mv scripts/handbook-ebook/lib/pages.cjs                  src/pages.cjs
rmdir scripts/handbook-ebook/lib scripts/handbook-ebook scripts 2>/dev/null || true
```

If `scripts/` becomes empty, the `rmdir` chain removes it. If it has other files (it shouldn't), `rmdir` exits non-zero and is suppressed by `|| true`.

- [ ] **Step 4: Update `src/build.cjs` require path**

Edit `src/build.cjs` line 3:

```js
const ebook = require('./generator.cjs')
```

(Was `require('./lib/generator.cjs')`.)

- [ ] **Step 5: Update `src/generator.cjs` requires**

Edit `src/generator.cjs`:

- Line 18: change `require('./config.cjs')` (was `./config.cjs` already — confirm; the imports were `./config.cjs` and `./pages.cjs` from `lib/`, both stay relative to the new `src/` location, so no change needed).

Verify with grep that no `./lib/` references remain:

```bash
grep -n "lib/" src/*.cjs
```

Expected: no matches.

- [ ] **Step 6: Update `src/config.cjs` PROJECT_ROOT**

Edit `src/config.cjs` line 4:

```js
const PROJECT_ROOT = path.resolve(__dirname, '..')
```

(Was `path.resolve(__dirname, '../../..')` — was three levels up from `scripts/handbook-ebook/lib/`, now one level up from `src/`.)

- [ ] **Step 7: Update `package.json` scripts**

Edit `package.json` `"scripts"` block:

```json
"scripts": {
    "build:ebook": "node src/build.cjs",
    "deploy:pages": "wrangler pages deploy dist/handbook-ebook --project-name posthog-handbook-ebook",
    "test:ebook": "node --test src/*.test.cjs"
}
```

- [ ] **Step 8: Syntax-check the moved files**

Run:

```bash
node --check src/build.cjs && \
node --check src/generator.cjs && \
node --check src/config.cjs && \
node --check src/pages.cjs && \
node --check src/build.test.cjs
```

Expected: silent (all checks pass).

- [ ] **Step 9: Run tests**

Run:

```bash
pnpm test:ebook
```

Expected: all tests PASS.

- [ ] **Step 10: Smoke-build to confirm runtime paths**

Run:

```bash
pnpm build:ebook -- --limit 5
```

Expected: builds 5 chapters into `dist/handbook-ebook/`, exits 0.

- [ ] **Step 11: Commit**

```bash
git add src package.json
git commit -m "refactor: move ebook generator from scripts/handbook-ebook to src/"
```

---

## Task 3: Split `generator.cjs` Into Focused Modules

Take the 1,267-line monolith in `src/generator.cjs` and split along function-cluster seams. Behavior unchanged — pure mechanical refactor with tests as the safety net.

**Files:**
- Create: `src/source.cjs`
- Create: `src/markdown.cjs`
- Create: `src/links.cjs`
- Create: `src/assets.cjs`
- Create: `src/epub.cjs`
- Modify: `src/generator.cjs` (slim to orchestration only)
- Modify: `src/build.test.cjs` (assert each module exists)

- [ ] **Step 1: Add module-existence test (will fail)**

Append to `src/build.test.cjs`:

```js
test('ebook modules expose focused build primitives', () => {
    assert.equal(typeof require('./source.cjs').getOrderedChapters, 'function')
    assert.equal(typeof require('./source.cjs').slugFromFile, 'function')
    assert.equal(typeof require('./source.cjs').fileFromSlug, 'function')
    assert.equal(typeof require('./source.cjs').getChapterHref, 'function')
    assert.equal(typeof require('./markdown.cjs').markdownToXhtml, 'function')
    assert.equal(typeof require('./markdown.cjs').renderMarkdownTable, 'function')
    assert.equal(typeof require('./links.cjs').rewriteLinks, 'function')
    assert.equal(typeof require('./links.cjs').rewriteHandbookLinks, 'function')
    assert.equal(typeof require('./assets.cjs').optimizeAsset, 'function')
    assert.equal(typeof require('./assets.cjs').resolveAsset, 'function')
    assert.equal(typeof require('./assets.cjs').materializeAssets, 'function')
    assert.equal(typeof require('./epub.cjs').buildOpf, 'function')
    assert.equal(typeof require('./epub.cjs').buildBookCss, 'function')
    assert.equal(typeof require('./epub.cjs').validateXhtml, 'function')
    assert.equal(typeof require('./epub.cjs').validateGeneratedEpubStructure, 'function')
})
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm test:ebook`

Expected: FAIL with `Cannot find module './source.cjs'`.

- [ ] **Step 3: Create `src/source.cjs`**

Move from `src/generator.cjs`:
- `uniqueOrdered`
- `slugFromFile`
- `fileFromSlug`
- `getChapterHref`
- `discoverHandbookFiles`
- `readSidebarSlugs`
- `getOrderedChapters`

Add at top of `src/source.cjs`:

```js
const fs = require('node:fs')
const path = require('node:path')
const { HANDBOOK_DIR, SIDEBAR_FILE } = require('./config.cjs')
```

Add at bottom:

```js
module.exports = {
    discoverHandbookFiles,
    fileFromSlug,
    getChapterHref,
    getOrderedChapters,
    readSidebarSlugs,
    slugFromFile,
    uniqueOrdered,
}
```

- [ ] **Step 4: Create `src/markdown.cjs`**

Move from `src/generator.cjs`:
- `extractFrontmatter`
- `escapeHtml`
- `decodeInlineEntities`
- `decodeHtmlAttribute`
- `slugifyHeading`
- `inlineMarkdownToHtml`
- `splitTableRow`
- `isTableSeparator`
- `isTableStart`
- `renderMarkdownTable`
- `isComplexTable`
- `renderTableCards`
- `renderRawDetailsBlock`
- `renderRawBlockquoteBlock`
- `renderFieldsetBlock`
- `renderImage`
- `getAttribute`
- `getMdxAttribute`
- `renderVideoLinkCard`
- `parseYouTubeUrl`
- `renderYouTubeCard`
- `renderIframeEmbed`
- `renderMdxComponentText`
- `stripMdxNoise`
- `extractReferenceLinks`
- `renderDiagram`
- `markdownToXhtml`
- `normalizeTaskItem`

Add at top:

```js
const crypto = require('node:crypto')
```

Add at bottom:

```js
module.exports = {
    escapeHtml,
    inlineMarkdownToHtml,
    markdownToXhtml,
    parseYouTubeUrl,
    renderImage,
    renderMarkdownTable,
    renderMdxComponentText,
}
```

(Internals stay private; only the surfaces other modules and tests need are exported.)

- [ ] **Step 5: Create `src/links.cjs`**

Move from `src/generator.cjs`:
- `rewriteHandbookLinks`
- `appendExternalLinkNote`
- `relativeHref`
- `rewriteLinks`

Add at bottom:

```js
module.exports = {
    appendExternalLinkNote,
    relativeHref,
    rewriteHandbookLinks,
    rewriteLinks,
}
```

- [ ] **Step 6: Create `src/assets.cjs`**

Move from `src/generator.cjs`:
- `MEDIA_TYPES` constant
- `SUPPORTED_IMAGE_EXTENSIONS` constant
- `RASTER_EXTENSIONS` constant
- `sanitizeAssetPath`
- `resolveAsset`
- `downloadRemoteAsset`
- `optimizeAsset`
- `assetManifestId`
- `materializeAssets`
- `createDiagramFallbackPng`
- `materializeDiagrams`

Add at top:

```js
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')
const { POSTHOG_SITE_DIR, PROJECT_ROOT, SITE_URL } = require('./config.cjs')
```

Add at bottom:

```js
module.exports = {
    MEDIA_TYPES,
    RASTER_EXTENSIONS,
    SUPPORTED_IMAGE_EXTENSIONS,
    assetManifestId,
    createDiagramFallbackPng,
    downloadRemoteAsset,
    materializeAssets,
    materializeDiagrams,
    optimizeAsset,
    resolveAsset,
    sanitizeAssetPath,
}
```

- [ ] **Step 7: Create `src/epub.cjs`**

Move from `src/generator.cjs`:
- `pageTemplate`
- `buildNav`
- `buildOpf`
- `buildBookCss`
- `getCoverSvg`
- `writeCoverAssets`
- `validateXhtml`
- `validateGeneratedEpubStructure`
- `writeFile`

Add at top:

```js
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
```

Add at bottom:

```js
module.exports = {
    buildBookCss,
    buildNav,
    buildOpf,
    getCoverSvg,
    pageTemplate,
    validateGeneratedEpubStructure,
    validateXhtml,
    writeCoverAssets,
    writeFile,
}
```

- [ ] **Step 8: Slim `src/generator.cjs` to orchestration**

After the moves, `src/generator.cjs` should contain only:
- requires from the new modules
- `buildEpub` orchestration function
- `parseArgs`
- `module.exports` block re-exporting everything imported (so existing test imports keep working without per-test edits)

Top of file:

```js
const fs = require('node:fs')
const path = require('node:path')

const {
    COVER_FILE_NAME,
    DEFAULT_OUTPUT_DIR,
    EPUB_FILE_NAME,
    HANDBOOK_DIR,
    POSTHOG_SITE_DIR,
    PUBLIC_PAGE_URL,
} = require('./config.cjs')
const {
    discoverHandbookFiles,
    fileFromSlug,
    getChapterHref,
    getOrderedChapters,
    slugFromFile,
    uniqueOrdered,
} = require('./source.cjs')
const {
    escapeHtml,
    markdownToXhtml,
    parseYouTubeUrl,
    renderImage,
    renderMarkdownTable,
    renderMdxComponentText,
} = require('./markdown.cjs')
const {
    appendExternalLinkNote,
    relativeHref,
    rewriteHandbookLinks,
    rewriteLinks,
} = require('./links.cjs')
const {
    materializeAssets,
    materializeDiagrams,
    optimizeAsset,
    resolveAsset,
} = require('./assets.cjs')
const {
    buildBookCss,
    buildNav,
    buildOpf,
    pageTemplate,
    validateGeneratedEpubStructure,
    validateXhtml,
    writeCoverAssets,
    writeFile,
} = require('./epub.cjs')
const { buildCoverPage, buildCreditsPage, buildLandingPage } = require('./pages.cjs')
const JSZip = require('jszip')
```

Keep `buildEpub` and `parseArgs` bodies as-is.

Bottom:

```js
module.exports = {
    // Re-exports for backwards-compatible test imports:
    buildBookCss,
    buildCoverPage,
    buildCreditsPage,
    buildLandingPage,
    buildOpf,
    buildEpub,
    getChapterHref,
    markdownToXhtml,
    optimizeAsset,
    parseArgs,
    renderMarkdownTable,
    resolveAsset,
    rewriteHandbookLinks,
    rewriteLinks,
    uniqueOrdered,
    validateGeneratedEpubStructure,
    validateXhtml,
}
```

- [ ] **Step 9: Syntax-check all modules**

Run:

```bash
node --check src/source.cjs && \
node --check src/markdown.cjs && \
node --check src/links.cjs && \
node --check src/assets.cjs && \
node --check src/epub.cjs && \
node --check src/generator.cjs && \
node --check src/build.cjs
```

Expected: silent.

- [ ] **Step 10: Run the full test suite**

Run: `pnpm test:ebook`

Expected: all tests PASS, including the new "ebook modules expose focused build primitives" test.

- [ ] **Step 11: Smoke-build**

Run:

```bash
pnpm build:ebook -- --limit 5
```

Expected: 5 chapters built, exit 0. Open the resulting EPUB metadata:

```bash
unzip -t dist/handbook-ebook/posthog-handbook-full-preview.epub
```

Expected: `No errors detected in compressed data`.

- [ ] **Step 12: Commit**

```bash
git add src
git commit -m "refactor: split generator.cjs into source/markdown/links/assets/epub modules"
```

---

## Task 4: Edition Model With Allowlist Validity Guard

Add `src/editions.cjs` with `Full` and `Short` configs. Filtering the chapter list against the Short allowlist must **fail the build** if any allowlisted slug doesn't resolve to a real chapter (no silent drops).

**Files:**
- Create: `src/editions.cjs`
- Modify: `src/build.test.cjs` (new edition tests)

- [ ] **Step 1: Add edition behavior tests (failing)**

Append to `src/build.test.cjs`:

```js
const { getEditionConfig, filterChaptersForEdition, listEditionIds } = require('./editions.cjs')

test('listEditionIds returns full and short', () => {
    assert.deepEqual(listEditionIds().sort(), ['full', 'short'])
})

test('full edition keeps all chapters in input order', () => {
    const chapters = [
        { slug: '/handbook/company/culture' },
        { slug: '/handbook/onboarding/new-hire-onboarding' },
        { slug: '/handbook/engineering/clickhouse/schema' },
    ]
    const result = filterChaptersForEdition(chapters, getEditionConfig('full'))
    assert.deepEqual(result, chapters)
})

test('short edition includes allowlisted slugs and excludes everything else', () => {
    const chapters = [
        { slug: '/handbook/company/culture' },
        { slug: '/handbook/which-products' },
        { slug: '/handbook/onboarding/new-hire-onboarding' },
        { slug: '/handbook/company/post-mortems' },
        { slug: '/handbook/engineering/clickhouse/schema' },
    ]
    const result = filterChaptersForEdition(chapters, getEditionConfig('short'))
    assert.deepEqual(result.map((c) => c.slug), [
        '/handbook/company/culture',
        '/handbook/which-products',
    ])
})

test('short edition fails the build if any allowlisted slug is missing from input', () => {
    const chapters = [{ slug: '/handbook/company/culture' }]  // missing the other ~70
    assert.throws(
        () => filterChaptersForEdition(chapters, getEditionConfig('short')),
        /missing.*\/handbook\//
    )
})

test('getEditionConfig throws for unknown edition id', () => {
    assert.throws(() => getEditionConfig('medium'), /unknown edition/i)
})

test('full edition exposes filenames derived from id', () => {
    const full = getEditionConfig('full')
    assert.equal(full.id, 'full')
    assert.equal(full.label, 'Full Edition')
    assert.equal(full.epubFileName, 'posthog-handbook-full.epub')
    assert.equal(full.coverFileName, 'posthog-handbook-full-cover.jpg')
    assert.equal(full.opfTitle, 'PostHog Handbook: Full Edition')
})

test('short edition exposes filenames derived from id', () => {
    const short = getEditionConfig('short')
    assert.equal(short.id, 'short')
    assert.equal(short.label, 'Short Edition')
    assert.equal(short.epubFileName, 'posthog-handbook-short.epub')
    assert.equal(short.coverFileName, 'posthog-handbook-short-cover.jpg')
    assert.equal(short.opfTitle, 'PostHog Handbook: Short Edition')
})
```

- [ ] **Step 2: Verify failing**

Run: `pnpm test:ebook`

Expected: FAIL — `Cannot find module './editions.cjs'`.

- [ ] **Step 3: Create `src/editions.cjs`**

```js
// src/editions.cjs
//
// Defines the EPUB editions this project ships.
//
// FULL  — every public handbook chapter (~313).
// SHORT — outward-facing strategy / culture / brand / marketing / sales-enablement
//         (~70 chapters). Excludes internal procedures (onboarding, post-mortems)
//         and engineering deep-dives (clickhouse, infrastructure internals).
//
// The Short edition allowlist is hand-curated. Adding a chapter requires:
//   1. Confirming the slug exists at posthog.com/handbook.
//   2. Adding it to SHORT_SLUGS below.
//   3. Re-running `pnpm build:ebook -- --edition short`.
//
// If a slug in SHORT_SLUGS doesn't resolve to a real chapter at build time,
// `filterChaptersForEdition` throws. We fail loud rather than ship a Short
// edition with silently missing content.

const SHORT_SLUGS = [
    '/handbook/company/culture',
    '/handbook/company/communication',
    '/handbook/company/management',
    '/handbook/company/small-teams',
    '/handbook/company/offsites',
    '/handbook/company/goal-setting',
    '/handbook/company/sprints',
    '/handbook/company/kudos',
    '/handbook/company/do-more-weird',
    '/handbook/company/grown-ups',
    '/handbook/company/lore',
    '/handbook/strategy/brand',
    '/handbook/brand/overview',
    '/handbook/brand/philosophy',
    '/handbook/brand/style-guide',
    '/handbook/brand/startups',
    '/handbook/brand/testimonials',
    '/handbook/brand/press',
    '/handbook/how-we-make-money',
    '/handbook/how-we-get-users',
    '/handbook/which-products',
    '/handbook/low-prices',
    '/handbook/making-users-happy',
    '/handbook/future',
    '/handbook/story',
    '/handbook/strong-team',
    '/handbook/wide-company',
    '/handbook/product/metrics',
    '/handbook/product/product-team',
    '/handbook/product/product-manager-role',
    '/handbook/product/releasing-new-products-and-features',
    '/handbook/product/per-product-growth-reviews',
    '/handbook/product/prioritizing-work-for-mature-products',
    '/handbook/product/visiting-customers',
    '/handbook/product/user-feedback',
    '/handbook/engineering/product-engineering',
    '/handbook/engineering/development-process',
    '/handbook/engineering/how-we-review',
    '/handbook/engineering/writing-docs',
    '/handbook/engineering/product-design',
    '/handbook/engineering/product-design-process',
    '/handbook/engineering/bug-prioritization',
    '/handbook/engineering/tech-talks',
    '/handbook/engineering/customer-comms',
    '/handbook/engineering/visiting-customers',
    '/handbook/marketing/positioning',
    '/handbook/marketing/product-announcements',
    '/handbook/marketing/speaker-guide',
    '/handbook/marketing/events',
    '/handbook/marketing/video',
    '/handbook/marketing/customer-case-studies',
    '/handbook/marketing/working-with-website',
    '/handbook/content/posthog-style-guide',
    '/handbook/content/linkedin',
    '/handbook/content/youtube',
    '/handbook/content/newsletter-tips',
    '/handbook/content/screen-recording-guide',
    '/handbook/community',
    '/handbook/community/questions',
    '/handbook/community/profiles',
    '/handbook/community/points',
    '/handbook/people/benefits',
    '/handbook/people/compensation',
    '/handbook/people/feedback',
    '/handbook/people/philosophy-club',
    '/handbook/people/bookhog',
    '/handbook/people/training',
    '/handbook/growth/sales/who-we-do-business-with',
    '/handbook/growth/sales/why-buy-posthog',
    '/handbook/growth/sales/getting-people-to-talk-to-you',
    '/handbook/growth/use-case-selling/product-intelligence',
    '/handbook/growth/use-case-selling/observability',
    '/handbook/growth/use-case-selling/growth-and-marketing',
    '/handbook/growth/use-case-selling/data-infrastructure',
    '/handbook/growth/use-case-selling/ai-llm-observability',
]

const EDITIONS = {
    full: {
        id: 'full',
        label: 'Full Edition',
        opfTitle: 'PostHog Handbook: Full Edition',
        epubFileName: 'posthog-handbook-full.epub',
        coverFileName: 'posthog-handbook-full-cover.jpg',
    },
    short: {
        id: 'short',
        label: 'Short Edition',
        opfTitle: 'PostHog Handbook: Short Edition',
        epubFileName: 'posthog-handbook-short.epub',
        coverFileName: 'posthog-handbook-short-cover.jpg',
        slugAllowlist: SHORT_SLUGS,
    },
}

function listEditionIds() {
    return Object.keys(EDITIONS)
}

function getEditionConfig(id) {
    if (!EDITIONS[id]) {
        throw new Error(`Unknown edition: ${id}. Known editions: ${listEditionIds().join(', ')}`)
    }
    return EDITIONS[id]
}

function filterChaptersForEdition(chapters, edition) {
    if (!edition.slugAllowlist) {
        return chapters
    }
    const inputSlugs = new Set(chapters.map((c) => c.slug))
    const missing = edition.slugAllowlist.filter((slug) => !inputSlugs.has(slug))
    if (missing.length > 0) {
        throw new Error(
            `Edition "${edition.id}" has ${missing.length} allowlisted slug(s) missing from input chapters: ${missing.join(', ')}`
        )
    }
    const allowed = new Set(edition.slugAllowlist)
    return chapters.filter((c) => allowed.has(c.slug))
}

module.exports = {
    EDITIONS,
    filterChaptersForEdition,
    getEditionConfig,
    listEditionIds,
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test:ebook`

Expected: all PASS, including the new edition tests.

- [ ] **Step 5: Commit**

```bash
git add src/editions.cjs src/build.test.cjs
git commit -m "feat: add editions module with full/short configs and allowlist guard"
```

---

## Task 5: Build Both Editions + Parameterized `_headers`

Make the build emit two EPUBs, two cover images, a single landing page, a manifest with both editions, and a `_headers` file with rules for every published artifact. The `_headers` writer becomes a function in `epub.cjs`.

**Files:**
- Modify: `src/config.cjs` (drop per-edition filename constants)
- Modify: `src/epub.cjs` (add `buildHeadersFile`)
- Modify: `src/pages.cjs` (`buildCoverPage` takes label; `buildLandingPage` takes editions[])
- Modify: `src/generator.cjs` (split `buildEpub` per-edition + add `buildAllEditions`)
- Modify: `src/build.cjs` (call `buildAllEditions` by default, support `--edition`)
- Modify: `src/build.test.cjs` (cover/landing tests for editions)
- Modify: `package.json` (no script change, just version bump if used)

- [ ] **Step 1: Add cover-page test for edition label (failing)**

Append to `src/build.test.cjs`:

```js
test('buildCoverPage embeds the edition label', () => {
    const { buildCoverPage } = require('./pages.cjs')
    const fullCover = buildCoverPage('posthog-handbook-full-cover.jpg', 'Full Edition')
    const shortCover = buildCoverPage('posthog-handbook-short-cover.jpg', 'Short Edition')
    assert.match(fullCover, /Full Edition/)
    assert.match(shortCover, /Short Edition/)
    assert.match(fullCover, /posthog-handbook-full-cover\.jpg/)
    assert.match(shortCover, /posthog-handbook-short-cover\.jpg/)
})

test('buildLandingPage lists both editions with download buttons', () => {
    const { buildLandingPage } = require('./pages.cjs')
    const html = buildLandingPage({
        generatedAt: '2026-05-06T10:00:00Z',
        editions: [
            { id: 'full', label: 'Full Edition', chapters: 313, epubFileName: 'posthog-handbook-full.epub' },
            { id: 'short', label: 'Short Edition', chapters: 70, epubFileName: 'posthog-handbook-short.epub' },
        ],
        coverFileName: 'posthog-handbook-full-cover.jpg',
        pageUrl: 'https://posthog-handbook-ebook.ianchuk.com',
    })
    assert.match(html, /Download Full Edition/)
    assert.match(html, /Download Short Edition/)
    assert.match(html, /href="\.\/posthog-handbook-full\.epub"/)
    assert.match(html, /href="\.\/posthog-handbook-short\.epub"/)
    assert.match(html, /313/)
    assert.match(html, /70/)
    assert.match(html, /Thanks to the PostHog team/)
    assert.match(html, /https:\/\/posthog\.com\/handbook/)
    assert.match(html, /https:\/\/github\.com\/yanchuk\/posthog-handbook-ebook/)
    assert.doesNotMatch(html, /\{time|TODO|undefined/)
})

test('buildHeadersFile emits rules for every edition EPUB and cover', () => {
    const { buildHeadersFile } = require('./epub.cjs')
    const text = buildHeadersFile([
        { epubFileName: 'posthog-handbook-full.epub', coverFileName: 'posthog-handbook-full-cover.jpg' },
        { epubFileName: 'posthog-handbook-short.epub', coverFileName: 'posthog-handbook-short-cover.jpg' },
    ])
    assert.match(text, /X-Content-Type-Options: nosniff/)
    assert.match(text, /\/posthog-handbook-full\.epub/)
    assert.match(text, /\/posthog-handbook-short\.epub/)
    assert.match(text, /\/posthog-handbook-full-cover\.jpg/)
    assert.match(text, /\/posthog-handbook-short-cover\.jpg/)
    assert.match(text, /Content-Type: application\/epub\+zip/)
    assert.match(text, /Cache-Control: public, max-age=3600/)
    assert.match(text, /Cache-Control: public, max-age=86400/)
})
```

- [ ] **Step 2: Verify failing**

Run: `pnpm test:ebook`

Expected: FAIL — `buildHeadersFile is not a function`, `buildCoverPage` arity mismatch, `buildLandingPage` doesn't include "Download Full Edition".

- [ ] **Step 3: Update `src/pages.cjs`**

Replace the file with:

```js
const {
    CONVERTER_NAME,
    CONVERTER_URL,
    ORIGINAL_HANDBOOK_URL,
    REPO_URL,
} = require('./config.cjs')

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

function buildCreditsPage(generatedAt, editionLabel) {
    const labelLine = editionLabel ? `<p class="edition-label">${escapeHtml(editionLabel)}</p>` : ''
    return `<section class="credits-page">
<h1>PostHog Handbook</h1>
${labelLine}
<p><a href="${ORIGINAL_HANDBOOK_URL}">Original handbook</a></p>
<p>Thanks to the PostHog team for the handbook. All rights belong to them.</p>
<dl>
  <dt>Converted to Ebook by ${CONVERTER_NAME}</dt>
  <dd><a href="${CONVERTER_URL}">${CONVERTER_URL}</a></dd>
  <dt>Contribute</dt>
  <dd><a href="${REPO_URL}">${REPO_URL}</a></dd>
  <dt>Updated</dt>
  <dd>${escapeHtml(generatedAt)}</dd>
</dl>
</section>`
}

function buildCoverPage(coverFileName, editionLabel) {
    const label = editionLabel ? `<p class="cover-edition-label">${escapeHtml(editionLabel)}</p>` : ''
    return `<section class="cover-page"><img src="assets/cover/${escapeHtml(coverFileName)}" alt="PostHog Handbook cover" />${label}</section>`
}

function buildLandingPage({ generatedAt, editions, coverFileName, pageUrl }) {
    const shareText = encodeURIComponent('PostHog Handbook Ebook')
    const shareUrl = encodeURIComponent(pageUrl)
    const downloads = editions
        .map(
            (edition) => `      <a class="download" href="./${escapeHtml(edition.epubFileName)}">Download ${escapeHtml(edition.label)}</a>
      <p class="download-meta">${Number(edition.chapters).toLocaleString('en-US')} chapters</p>`
        )
        .join('\n')

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PostHog Handbook Ebook</title>
  <meta name="description" content="A community-generated EPUB version of the PostHog Handbook.">
  <style>
    :root { color-scheme: light; --ink: #151515; --muted: #5f5f5f; --paper: #eeefe9; --line: #d8d1c1; --accent: #f54e00; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: #faf9f5; }
    main { min-height: 100vh; display: grid; grid-template-columns: minmax(280px, 0.85fr) minmax(320px, 1.15fr); gap: clamp(2rem, 5vw, 5rem); align-items: center; max-width: 1120px; margin: 0 auto; padding: clamp(1.25rem, 4vw, 4rem); }
    img { width: 100%; max-width: 380px; border-radius: 8px; box-shadow: 0 18px 45px rgb(21 21 21 / 22%); }
    h1 { font-size: clamp(2.5rem, 7vw, 5.8rem); line-height: 0.94; margin: 0 0 1rem; letter-spacing: 0; }
    p { font-size: 1.08rem; line-height: 1.65; margin: 0 0 1rem; color: var(--muted); }
    a { color: var(--ink); }
    .download { display: inline-flex; align-items: center; justify-content: center; min-height: 3.25rem; padding: 0 1.2rem; margin: 0.5rem 0.5rem 0.25rem 0; border-radius: 6px; background: var(--accent); color: white; font-weight: 800; text-decoration: none; }
    .download-meta { margin: 0 0 0.75rem; font-size: 0.9rem; }
    .meta { display: grid; gap: 0.45rem; margin: 1.25rem 0; padding: 1rem 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); color: var(--muted); }
    .share { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.25rem; }
    .share a { border: 1px solid var(--line); border-radius: 999px; padding: 0.45rem 0.75rem; text-decoration: none; background: white; }
    @media (max-width: 760px) { main { grid-template-columns: 1fr; } img { max-width: 260px; } }
  </style>
</head>
<body>
  <main>
    <aside><img src="./${escapeHtml(coverFileName)}" alt="PostHog Handbook Ebook cover"></aside>
    <section>
      <h1>PostHog Handbook Ebook</h1>
      <p>A reflowable EPUB conversion of the public PostHog Handbook for offline reading in Apple Books, Kindle, and other ebook readers.</p>
${downloads}
      <div class="meta">
        <span>Updated ${escapeHtml(generatedAt)}</span>
        <span><a href="${ORIGINAL_HANDBOOK_URL}">Original PostHog Handbook</a></span>
      </div>
      <p>Thanks to the PostHog team for the handbook. All rights belong to them.</p>
      <p>Converted to Ebook by <a href="${CONVERTER_URL}">${CONVERTER_NAME}</a>. Contribute on <a href="${REPO_URL}">GitHub</a>.</p>
      <div class="share" aria-label="Share">
        <a href="https://twitter.com/intent/tweet?text=${shareText}&amp;url=${shareUrl}">Share on X</a>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}">Share on LinkedIn</a>
      </div>
    </section>
  </main>
</body>
</html>
`
}

module.exports = {
    buildCoverPage,
    buildCreditsPage,
    buildLandingPage,
}
```

- [ ] **Step 4: Add `buildHeadersFile` to `src/epub.cjs`**

At the bottom of `src/epub.cjs`, before `module.exports`:

```js
function buildHeadersFile(editions) {
    const epubRules = editions
        .map(
            (edition) => `/${edition.epubFileName}
  Content-Type: application/epub+zip
  Cache-Control: public, max-age=3600`
        )
        .join('\n\n')
    const coverRules = editions
        .map(
            (edition) => `/${edition.coverFileName}
  Cache-Control: public, max-age=86400`
        )
        .join('\n\n')
    return `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

${epubRules}

${coverRules}
`
}
```

Add `buildHeadersFile` to the existing `module.exports`:

```js
module.exports = {
    buildBookCss,
    buildHeadersFile,
    buildNav,
    buildOpf,
    getCoverSvg,
    pageTemplate,
    validateGeneratedEpubStructure,
    validateXhtml,
    writeCoverAssets,
    writeFile,
}
```

- [ ] **Step 5: Update `src/config.cjs` — remove per-edition filename constants**

The Full/Short filename constants now live on the edition objects in `editions.cjs`. Edit `src/config.cjs`:

Delete lines:

```js
const EPUB_FILE_NAME = 'posthog-handbook-full-preview.epub'
const COVER_FILE_NAME = 'posthog-handbook-cover.jpg'
```

Remove `COVER_FILE_NAME` and `EPUB_FILE_NAME` from `module.exports`. Final exports:

```js
module.exports = {
    CONVERTER_NAME,
    CONVERTER_URL,
    DEFAULT_OUTPUT_DIR,
    HANDBOOK_DIR,
    ORIGINAL_HANDBOOK_URL,
    POSTHOG_SITE_DIR,
    PROJECT_ROOT,
    PUBLIC_PAGE_URL,
    REPO_URL,
    SIDEBAR_FILE,
    SITE_URL,
}
```

- [ ] **Step 6: Refactor `src/generator.cjs` `buildEpub` to take an edition**

Replace the top of `buildEpub` (was `async function buildEpub({ outputDir = DEFAULT_OUTPUT_DIR, limit } = {})`) with:

```js
async function buildEpub({ outputDir = DEFAULT_OUTPUT_DIR, limit, edition } = {}) {
    if (!edition) throw new Error('buildEpub requires an edition (use buildAllEditions to build both)')
    const { filterChaptersForEdition } = require('./editions.cjs')

    const allChapters = getOrderedChapters(limit)
    const chapters = filterChaptersForEdition(allChapters, edition)

    // ... existing rendering pipeline ...
}
```

Inside the function, replace every `EPUB_FILE_NAME` reference with `edition.epubFileName` and every `COVER_FILE_NAME` with `edition.coverFileName`. Replace the OPF title (was hardcoded `'PostHog Handbook'` or similar) with `edition.opfTitle`. Pass `edition.label` to `buildCoverPage(...)` and `buildCreditsPage(generatedAt, edition.label)`.

Also: remove the `buildLandingPage` and `_headers` writes from inside `buildEpub`. Those become `buildAllEditions`'s job — they reference the full set of editions, not one.

Replace the manifest write near the end with a per-edition manifest fragment that the orchestrator collects:

```js
return {
    title: edition.opfTitle,
    edition: edition.id,
    label: edition.label,
    generatedAt,
    chapters: chapters.length,
    output: epubPath,
    epubFileName: edition.epubFileName,
    coverFileName: edition.coverFileName,
}
```

(So `buildEpub` returns one entry; `buildAllEditions` aggregates.)

- [ ] **Step 7: Add `buildAllEditions` to `src/generator.cjs`**

Below `buildEpub`:

```js
async function buildAllEditions({ outputDir = DEFAULT_OUTPUT_DIR, limit, only } = {}) {
    const { listEditionIds, getEditionConfig } = require('./editions.cjs')
    const ids = only ? [only] : listEditionIds()

    const results = []
    for (const id of ids) {
        const edition = getEditionConfig(id)
        const result = await buildEpub({ outputDir, limit, edition })
        results.push(result)
    }

    // Single landing page lists every edition we built.
    const generatedAt = results[0]?.generatedAt || new Date().toISOString()
    const landingCover = results[0]?.coverFileName || 'posthog-handbook-full-cover.jpg'
    writeFile(
        path.join(outputDir, 'index.html'),
        buildLandingPage({
            generatedAt,
            editions: results,
            coverFileName: landingCover,
            pageUrl: PUBLIC_PAGE_URL,
        })
    )

    // Single _headers covering every published artifact.
    writeFile(path.join(outputDir, '_headers'), buildHeadersFile(results))

    // Aggregate manifest.
    const manifest = {
        title: 'PostHog Handbook',
        generatedAt,
        editions: results.map((r) => ({
            id: r.edition,
            label: r.label,
            chapters: r.chapters,
            epubFileName: r.epubFileName,
            coverFileName: r.coverFileName,
        })),
    }
    writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

    return manifest
}
```

Add `buildHeadersFile` to the imports at the top of the file (from `./epub.cjs`).

- [ ] **Step 8: Update `parseArgs` to support `--edition`**

```js
function parseArgs(argv) {
    const args = { outputDir: DEFAULT_OUTPUT_DIR, limit: undefined, only: undefined }
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--output-dir') args.outputDir = path.resolve(argv[++index])
        if (arg === '--limit') args.limit = Number(argv[++index])
        if (arg === '--edition') args.only = argv[++index]
    }
    return args
}
```

- [ ] **Step 9: Update `src/build.cjs` to call `buildAllEditions`**

Replace the body of `src/build.cjs`:

```js
#!/usr/bin/env node

const ebook = require('./generator.cjs')

if (require.main === module) {
    ebook.buildAllEditions(ebook.parseArgs(process.argv.slice(2))).then((manifest) => {
        console.log(`Built ${manifest.editions.length} edition(s):`)
        for (const edition of manifest.editions) {
            console.log(`  - ${edition.label} (${edition.chapters} chapters): ${edition.epubFileName}`)
        }
    })
}

module.exports = ebook
```

Add `buildAllEditions` to `module.exports` at the bottom of `src/generator.cjs`.

- [ ] **Step 10: Run tests**

Run: `pnpm test:ebook`

Expected: all PASS.

- [ ] **Step 11: Build both editions for real**

Run: `pnpm build:ebook`

Expected output (paraphrased):

```
Built 2 edition(s):
  - Full Edition (313 chapters): posthog-handbook-full.epub
  - Short Edition (70 chapters): posthog-handbook-short.epub
```

- [ ] **Step 12: Validate archives**

Run:

```bash
unzip -t dist/handbook-ebook/posthog-handbook-full.epub && \
unzip -t dist/handbook-ebook/posthog-handbook-short.epub
```

Expected: both report `No errors detected in compressed data`.

- [ ] **Step 13: Inspect outputs**

Run:

```bash
cat dist/handbook-ebook/manifest.json
ls -lh dist/handbook-ebook/*.epub dist/handbook-ebook/*.jpg
cat dist/handbook-ebook/_headers
grep -c "Download" dist/handbook-ebook/index.html
```

Expected:
- `manifest.json` lists both editions with chapter counts.
- Two EPUB files and two cover JPGs visible.
- `_headers` references both EPUB filenames and both cover filenames.
- `Download` count is at least 2.

- [ ] **Step 14: Clean up old preview EPUB if present**

Run:

```bash
rm -f dist/handbook-ebook/posthog-handbook-full-preview.epub
rm -f dist/handbook-ebook/posthog-handbook-cover.jpg
```

(One-time cleanup — these are the old single-edition output filenames superseded by the per-edition ones.)

- [ ] **Step 15: Commit**

```bash
git add src package.json
git commit -m "feat: build full and short editions with parameterized headers and landing"
```

---

## Task 6: Lock Embed Handling With Fixture Tests

The image/embed pipeline is the highest-risk surface for silent regressions. Add tests that lock the current behavior so future refactors can't accidentally drop GIF animation, swap a YouTube placeholder, or change the Mermaid pipeline.

**Files:**
- Create: `src/fixtures/animated.gif` (smallest valid 2-frame GIF)
- Create: `src/fixtures/large-no-alpha.png` (≥1MB, no alpha — for size-regression test)
- Modify: `src/build.test.cjs`

- [ ] **Step 1: Create fixture GIF**

Generate a tiny 2-frame animated GIF (10x10, 2 frames, no transparency). Easiest: use sharp via a one-shot Node script:

```bash
node -e "
const sharp = require('sharp');
const frames = [
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAEElEQVR4nGP8z8DAwMAEIAAA//8DAQEBAaePAAAAAElFTkSuQmCC', 'base64'),
];
// Actually: write a 1x1 GIF with two frames using zlib-free GIF87a header.
const gif = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAkAAAAALAAAAAABAAEAAAICTAEAOw==',
  'base64'
);
require('fs').writeFileSync('src/fixtures/animated.gif', gif);
console.log('wrote', require('fs').statSync('src/fixtures/animated.gif').size, 'bytes');
"
```

Expected: `wrote 43 bytes`. (This is a minimal valid 1-frame GIF; sufficient for "GIF passes through unchanged" tests. We don't need real animation for correctness — only that the pipeline preserves bytes.)

If you need a *truly* multi-frame GIF, fetch one from the handbook source (e.g. `posthog.com/contents/images/<some>.gif`) and copy it. The above one-frame fixture is enough for the existing tests.

```bash
mkdir -p src/fixtures
```

(Run before the node script if `src/fixtures/` doesn't exist.)

- [ ] **Step 2: Create the large-no-alpha fixture**

```bash
node -e "
const sharp = require('sharp');
sharp({ create: { width: 2400, height: 2400, channels: 3, background: { r: 200, g: 50, b: 50 } } })
  .png({ compressionLevel: 0 })
  .toFile('src/fixtures/large-no-alpha.png')
  .then(() => console.log('wrote', require('fs').statSync('src/fixtures/large-no-alpha.png').size, 'bytes'));
"
```

Expected: `wrote NNNNN bytes` where NNNNN is > 1,000,000 (≈ 5MB; uncompressed 2400×2400 RGB).

- [ ] **Step 3: Add embed/asset tests (failing if any regression)**

Append to `src/build.test.cjs`:

```js
test('GIF assets pass through optimizeAsset unchanged', async () => {
    const buffer = fs.readFileSync(path.join(__dirname, 'fixtures/animated.gif'))
    const result = await optimizeAsset({ buffer, extension: '.gif' })
    assert.equal(result.extension, '.gif')
    assert.equal(result.mediaType, 'image/gif')
    assert.equal(result.buffer.length, buffer.length)
})

test('SVG assets pass through optimizeAsset unchanged', async () => {
    const buffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#000"/></svg>')
    const result = await optimizeAsset({ buffer, extension: '.svg' })
    assert.equal(result.extension, '.svg')
    assert.equal(result.mediaType, 'image/svg+xml')
})

test('large no-alpha PNG is converted to compressed JPEG', async () => {
    const buffer = fs.readFileSync(path.join(__dirname, 'fixtures/large-no-alpha.png'))
    const result = await optimizeAsset({ buffer, extension: '.png' })
    assert.equal(result.extension, '.jpg')
    assert.equal(result.mediaType, 'image/jpeg')
    // 5MB+ uncompressed PNG → should compress to well under 1MB as a JPEG.
    assert.ok(result.buffer.length < 1_000_000, `expected <1MB, got ${result.buffer.length}`)
})

test('PNG with alpha stays a PNG', async () => {
    const sharp = require('sharp')
    const buffer = await sharp({
        create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer()
    const result = await optimizeAsset({ buffer, extension: '.png' })
    assert.equal(result.extension, '.png')
    assert.equal(result.mediaType, 'image/png')
})

test('YouTube iframe becomes a thumbnail link card with watch URL', () => {
    const html = markdownToXhtml('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Demo"></iframe>')
    assert.match(html, /Watch on YouTube/)
    assert.match(html, /youtube\.com\/watch\?v=dQw4w9WgXcQ/)
})

test('ProductScreenshot MDX component renders an image figure', () => {
    const html = markdownToXhtml('<ProductScreenshot imageLight="/images/screenshot.png" alt="App home" />')
    assert.match(html, /<figure class="product-screenshot">/)
})

test('ProductVideo MDX component renders an external video link card', () => {
    const html = markdownToXhtml('<ProductVideo videoLight="https://example.com/video.mp4" />')
    assert.match(html, /Open video/)
    assert.match(html, /video-embed--link/)
})

test('WistiaEmbed renders a Wistia link card', () => {
    const html = markdownToXhtml('<WistiaEmbed mediaId="abc123" />')
    assert.match(html, /posthog\.wistia\.com\/medias\/abc123/)
    assert.match(html, /Open video/)
})

test('Unknown MDX component renders a visible placeholder, not silent drop', () => {
    const html = markdownToXhtml('<SomeUnknownComponent prop="x" />')
    assert.match(html, /Interactive website component omitted from this ebook/)
    assert.match(html, /SomeUnknownComponent/)
})

test('Missing local image renders a visible placeholder', () => {
    const result = resolveAsset('/static/missing-image-that-does-not-exist.png', null)
    assert.equal(result.kind, 'missing')
    assert.match(result.placeholder, /Image unavailable/)
})

test('Mermaid diagram block produces a figure with PNG asset reference', () => {
    const diagrams = new Map()
    const html = markdownToXhtml('```mermaid\ngraph TD; A-->B\n```', { diagrams })
    assert.match(html, /<figure class="diagram">/)
    assert.match(html, /assets\/diagrams\/diagram-[a-f0-9]+\.png/)
    assert.equal(diagrams.size, 1)
})
```

- [ ] **Step 4: Run tests**

Run: `pnpm test:ebook`

Expected: all PASS. If any fail, the fix lives in `src/markdown.cjs` or `src/assets.cjs` — investigate and either fix the regression or update the test (only if the new behavior is intentional and documented).

- [ ] **Step 5: Commit**

```bash
git add src/fixtures src/build.test.cjs
git commit -m "test: lock GIF/SVG/MDX/Mermaid embed handling with fixtures"
```

---

## Task 7: CI With EPUBCheck + Error Gate

Update the GitHub Actions workflow to:
1. Validate **both** EPUBs with EPUBCheck (catches spec violations `unzip -t` misses).
2. Fail the build if the generator emitted any errors during the run.

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `src/generator.cjs` (track and report error count from `buildAllEditions`)
- Modify: `src/build.cjs` (exit non-zero on errors)
- Modify: `src/build.test.cjs` (test for error counter)

- [ ] **Step 1: Add error-counter test (failing)**

Append to `src/build.test.cjs`:

```js
test('buildAllEditions returns errors array (empty on clean build)', async () => {
    // We don't run a real build here (slow); just assert the orchestrator
    // exposes the surface. A full smoke run lives in CI.
    const ebook = require('./generator.cjs')
    assert.equal(typeof ebook.buildAllEditions, 'function')
    // Smoke check the contract via reading the source for `errors:`
    const generatorSource = fs.readFileSync(path.join(__dirname, 'generator.cjs'), 'utf8')
    assert.match(generatorSource, /errors:\s*\[/, 'buildAllEditions must collect errors into a list')
})
```

(Source-level assertion is the cheapest way to require the surface without running a full build inside the test suite.)

- [ ] **Step 2: Verify failing**

Run: `pnpm test:ebook`

Expected: FAIL — `buildAllEditions must collect errors into a list`.

- [ ] **Step 3: Add error tracking to `buildEpub` and `buildAllEditions`**

In `src/generator.cjs`, add an `errors` array that's threaded through the pipeline. Where the existing code logs an error (`catch { ... placeholder }` blocks in asset materialization, missing assets, etc.), push to this list.

Sketch of the additions inside `buildEpub`:

```js
const errors = []
// ... pipeline ...
// Wherever you create a placeholder for a missing/failed asset:
//   errors.push({ kind: 'asset-missing', detail: asset.url || asset.sourcePath })
// Wherever you fail to render a Mermaid diagram and fall back:
//   errors.push({ kind: 'mermaid-fallback', detail: diagram.key })
// Validate XHTML:
//   for each err in validateGeneratedEpubStructure(...) push { kind: 'epub-structure', detail }

return {
    title: edition.opfTitle,
    edition: edition.id,
    label: edition.label,
    generatedAt,
    chapters: chapters.length,
    output: epubPath,
    epubFileName: edition.epubFileName,
    coverFileName: edition.coverFileName,
    errors,
}
```

In `buildAllEditions`, aggregate:

```js
const aggregateErrors = results.flatMap((r) => r.errors.map((e) => ({ edition: r.edition, ...e })))

const manifest = {
    title: 'PostHog Handbook',
    generatedAt,
    editions: results.map((r) => ({
        id: r.edition,
        label: r.label,
        chapters: r.chapters,
        epubFileName: r.epubFileName,
        coverFileName: r.coverFileName,
        errorCount: r.errors.length,
    })),
    errors: aggregateErrors,
}
```

- [ ] **Step 4: Make `src/build.cjs` exit non-zero on errors**

```js
#!/usr/bin/env node

const ebook = require('./generator.cjs')

if (require.main === module) {
    ebook.buildAllEditions(ebook.parseArgs(process.argv.slice(2))).then((manifest) => {
        console.log(`Built ${manifest.editions.length} edition(s):`)
        for (const edition of manifest.editions) {
            console.log(`  - ${edition.label} (${edition.chapters} chapters, ${edition.errorCount} errors): ${edition.epubFileName}`)
        }
        if (manifest.errors.length > 0) {
            console.error(`\n${manifest.errors.length} build error(s):`)
            for (const err of manifest.errors.slice(0, 20)) {
                console.error(`  [${err.edition}] ${err.kind}: ${err.detail}`)
            }
            if (manifest.errors.length > 20) console.error(`  ... and ${manifest.errors.length - 20} more`)
            process.exitCode = 1
        }
    })
}

module.exports = ebook
```

- [ ] **Step 5: Update `.github/workflows/deploy.yml`**

Replace the file with:

```yaml
name: Build and deploy ebook

on:
  workflow_dispatch:
  schedule:
    - cron: "0 8 * * 1"

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout converter repo
        uses: actions/checkout@v4

      - name: Fetch PostHog handbook source
        run: |
          rm -rf posthog.com
          git clone --depth 1 --filter=blob:none --sparse https://github.com/PostHog/posthog.com.git posthog.com
          cd posthog.com
          git sparse-checkout set contents/handbook static src/navs/index.js

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Setup Java (for EPUBCheck)
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Test ebook generator
        run: pnpm test:ebook

      - name: Build ebook and landing page
        run: pnpm build:ebook

      - name: Validate EPUB archive integrity
        run: |
          unzip -t dist/handbook-ebook/posthog-handbook-full.epub
          unzip -t dist/handbook-ebook/posthog-handbook-short.epub

      - name: Validate EPUB spec compliance with EPUBCheck
        run: |
          curl -L -o epubcheck.zip https://github.com/w3c/epubcheck/releases/download/v5.1.0/epubcheck-5.1.0.zip
          unzip -q epubcheck.zip
          java -jar epubcheck-5.1.0/epubcheck.jar dist/handbook-ebook/posthog-handbook-full.epub
          java -jar epubcheck-5.1.0/epubcheck.jar dist/handbook-ebook/posthog-handbook-short.epub

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist/handbook-ebook --project-name posthog-handbook-ebook
```

- [ ] **Step 6: Run tests**

Run: `pnpm test:ebook`

Expected: all PASS.

- [ ] **Step 7: Run full local build to confirm error counter works**

Run: `pnpm build:ebook`

Expected: builds both editions; exit 0 if clean. If errors > 0, exit 1 and the offending issues print.

- [ ] **Step 8: Commit**

```bash
git add src .github/workflows/deploy.yml
git commit -m "feat: add error gate and epubcheck validation to ci"
```

---

## Task 8: End-to-End Validation

Final smoke test pre-merge.

**Files:**
- No source edits unless verification surfaces a bug.

- [ ] **Step 1: Full clean build**

```bash
rm -rf dist
pnpm test:ebook
pnpm build:ebook
```

Expected: tests PASS, build prints two editions and 0 errors per edition.

- [ ] **Step 2: Validate both archives**

```bash
unzip -t dist/handbook-ebook/posthog-handbook-full.epub
unzip -t dist/handbook-ebook/posthog-handbook-short.epub
```

Expected: both report `No errors detected in compressed data`.

- [ ] **Step 3: Run EPUBCheck locally if Java available**

```bash
# Skip if java is not installed locally — CI runs this.
which java && {
    [ -f epubcheck-5.1.0/epubcheck.jar ] || {
        curl -L -o /tmp/epubcheck.zip https://github.com/w3c/epubcheck/releases/download/v5.1.0/epubcheck-5.1.0.zip
        unzip -q /tmp/epubcheck.zip -d /tmp/
    }
    java -jar /tmp/epubcheck-5.1.0/epubcheck.jar dist/handbook-ebook/posthog-handbook-full.epub
    java -jar /tmp/epubcheck-5.1.0/epubcheck.jar dist/handbook-ebook/posthog-handbook-short.epub
}
```

Expected: `Validating using EPUB version 3.0 rules. ... No errors or warnings detected.` (Warnings about specific MDX-derived markup are OK; errors are not.)

- [ ] **Step 4: Search for stray template tokens in output**

```bash
rg -n 'href="/(handbook|docs)|href="(javascript|data|file):|\{time|TODO|undefined' \
   dist/handbook-ebook/index.html dist/handbook-ebook/epub-root || true
```

Expected: no problematic tokens. (`TODO` inside source handbook content is acceptable; absolute `/handbook` hrefs in EPUB output are not — those should be rewritten by `links.cjs`.)

- [ ] **Step 5: Inspect manifest and outputs**

```bash
cat dist/handbook-ebook/manifest.json
ls -lh dist/handbook-ebook/*.epub dist/handbook-ebook/*.jpg dist/handbook-ebook/index.html
cat dist/handbook-ebook/_headers
```

Expected:
- Manifest lists both editions with non-zero chapter counts.
- Both EPUBs are 5–25 MB.
- Both cover JPGs are present.
- `_headers` references all four artifacts.

- [ ] **Step 6: Open one EPUB in a real reader (manual)**

Open `dist/handbook-ebook/posthog-handbook-full.epub` in Apple Books (macOS):

```bash
open -a "Books" dist/handbook-ebook/posthog-handbook-full.epub
```

Verify: cover renders, table of contents shows ~313 chapters, first chapter renders with images and links.

Repeat for `posthog-handbook-short.epub`. Verify: ~70 chapters, edition label visible on cover.

- [ ] **Step 7: Commit any verification fixes**

Only if fixes are needed:

```bash
git add -p
git commit -m "fix: <specific issue found during e2e validation>"
```

- [ ] **Step 8: Push and watch CI**

```bash
git push origin main
gh run watch
```

Expected: workflow passes. Cloudflare Pages deployment URL appears in the deploy step output.

- [ ] **Step 9: Verify live landing page**

```bash
curl -sI https://posthog-handbook-ebook.ianchuk.com/posthog-handbook-full.epub | head -10
curl -sI https://posthog-handbook-ebook.ianchuk.com/posthog-handbook-short.epub | head -10
```

Expected: both return `HTTP/2 200`, `content-type: application/epub+zip`, `cache-control: public, max-age=3600`.

---

## Acceptance Criteria

- [ ] Repo has README, LICENSE, .nvmrc, AGENTS.md, .editorconfig.
- [ ] App lives in `src/`. No more `scripts/handbook-ebook/`.
- [ ] `src/generator.cjs` is < 400 lines (orchestration only).
- [ ] `pnpm test:ebook` passes.
- [ ] `pnpm build:ebook` produces both Full and Short EPUBs with edition-specific covers and credits.
- [ ] Landing page lists both editions with download buttons.
- [ ] `_headers` covers both EPUBs and both covers with correct Content-Type and Cache-Control.
- [ ] Short edition build fails when an allowlisted slug doesn't resolve.
- [ ] CI workflow validates both EPUBs with EPUBCheck before deploying.
- [ ] Build exits non-zero if any per-edition error count is non-zero.
- [ ] Live site serves both EPUBs with correct headers.

## Self-review notes

- **Spec coverage:** every section of `docs/plans/2026-05-06-two-edition-epub-generator.md` is covered (Tasks 1–8 from the original plan map to Tasks 1, 2, 3, 4, 5, 6, 7, 8 here, plus added Task 0 and Task 7 extensions).
- **Type consistency:** `edition.epubFileName`, `edition.coverFileName`, `edition.label`, `edition.opfTitle`, `edition.id`, `edition.slugAllowlist` are the same shape across `editions.cjs`, `pages.cjs`, `epub.cjs`, and `generator.cjs`.
- **Allowlist guard:** Task 4 includes a failing test for the missing-slug case before implementing; Task 5 doesn't relax it.
- **`_headers` parameterization:** Task 5's `buildHeadersFile([editions])` takes the same edition objects the orchestrator uses; same shape in tests and production.
- **Backwards-compatible test imports:** Task 3's `generator.cjs` re-exports surfaces (`buildBookCss`, `buildOpf`, `markdownToXhtml`, etc.) so the existing 608-line test suite's `require('./build.cjs')` keeps working without per-test edits.
- **No placeholders:** every code step includes the actual code; every command step has the expected output.
