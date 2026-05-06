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
