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
