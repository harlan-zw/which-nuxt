# which-nuxt

Library and CLI that detects Nuxt, Vue and Nuxt module versions from a public site, then checks them against GitHub advisories. Every signal must come from something any visitor can fetch.

## Read first

- [`GLOSSARY.md`](GLOSSARY.md): every concept name. Read before naming an export, option, or README heading.
- [`README.md`](README.md): the public contract, including the Supported Module Mappings table.

## Rules

- A module signal must be specific to that module. Generic markup such as `hreflang` alternates, schema.org JSON-LD, or a bare `llms.txt` is never a module signal.
- A new or changed module detector updates its row in the README Supported Module Mappings table in the same PR.
- Scanner tests call `scanHtml`, `scanJs`, `scanHeaders` or `probeNuxtEndpoints`, not `detectNuxt`.
- Network access goes through `src/request.ts`. Never call `fetch` or `$fetch` from a detector.
- `sideEffects: false` is published. Keep module scope free of side effects so presets stay treeshakable.

## Traps

- `scripts/smoke-nuxt-fyi.mjs` imports `dist/`. Run `pnpm build` first, or it tests a stale build.

## Consumers

- `~/sites/nuxtseo.com` `layers/pro/sites` depends on `which-nuxt`. A change to `DetectResult` or a preset export ripples there.
