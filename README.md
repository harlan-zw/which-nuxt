<h1>which-nuxt</h1>

[![npm version](https://img.shields.io/npm/v/which-nuxt?color=yellow)](https://npmjs.com/package/which-nuxt)
[![npm downloads](https://img.shields.io/npm/dm/which-nuxt?color=yellow)](https://npm.chart.dev/which-nuxt)
[![license](https://img.shields.io/github/license/harlan-zw/which-nuxt?color=yellow)](https://github.com/harlan-zw/which-nuxt/blob/main/LICENSE.md)

> 🔍 Point it at a URL. Get back the Nuxt and Vue versions, the Nuxt modules, the host, and any GitHub advisories that match.

<p align="center">
<table>
<tbody>
<td align="center">
<sub>Made possible by my <a href="https://github.com/sponsors/harlan-zw">Sponsor Program 💖</a><br> Follow me <a href="https://twitter.com/harlan_zw">@harlan_zw</a> 🐦 • Join <a href="https://discord.gg/275MBUBvgP">Discord</a> for help</sub><br>
</td>
</tbody>
</table>
</p>

## Features

- 🔍 Reads Nuxt and Vue versions from HTML, `/_nuxt/` chunks and public Nuxt endpoints.
- 🧩 Fingerprints 20 Nuxt modules, each tagged `confirmed`, `inferred` or `possible`.
- 🛡️ Checks versions against GitHub advisories. Exact versions give exact matches; inferred ranges give possible ones.
- 🌐 Names the host from response headers, with optional domain age from RDAP.
- 🌲 Treeshakable module presets, plus scanners that never touch the network, for crawlers that already hold the HTML.

## CLI

```sh
npx which-nuxt https://nuxt.com
```

`whichnuxt` works too.

```sh
which-nuxt https://nuxt.com --json
which-nuxt https://nuxt.com --no-advisories
which-nuxt https://nuxt.com --no-js --no-endpoints
which-nuxt https://nuxt.com --age --github-token $GITHUB_TOKEN
```

| Flag | Description |
| --- | --- |
| `--json` | Print the full detection and advisory result as JSON. |
| `--no-advisories` | Skip GitHub advisory checks. |
| `--no-js` | Skip fetching and scanning Nuxt JavaScript chunks. |
| `--no-endpoints` | Skip probing Nuxt public endpoints. |
| `--no-hosting` | Skip hosting provider detection from response headers. |
| `--age` | Fetch RDAP domain age metadata. |
| `--timeout <ms>` | Network timeout. Defaults to `8000`. |
| `--max-js-requests <count>` | Most Nuxt JavaScript chunks to fetch. Defaults to `4`. Stops early once it has both the Nuxt and Vue versions. |
| `--github-token <token>` | GitHub token for advisory API requests. Defaults to `GITHUB_TOKEN`. |
| `--user-agent <agent>` | User-Agent for requests to the target site. |

### What it requests

One scan fetches the page, up to 4 JavaScript chunks, and a set of public endpoints such as `/_payload.json`, `/_nuxt/builds/latest.json` and module debug routes. The advisory check calls the GitHub API. `--age` adds one RDAP lookup. Each `--no-*` flag turns its step off.

Every request identifies itself as `which-nuxt/<version> (+https://github.com/harlan-zw/which-nuxt)`. Pass `--user-agent` to change it for the target site.

## API

```ts
import { checkAdvisories, detectNuxt } from 'which-nuxt'

const detected = await detectNuxt('https://nuxt.com')
const advisories = await checkAdvisories(detected)
```

`detectNuxt()` returns, among other fields:

- `packages`: detected dependency versions. `checkAdvisories()` reads these.
- `modules`: Nuxt module fingerprints, each with a `certainty` of `confirmed`, `inferred` or `possible`.
- `hosting.provider`: the edge, CDN or platform named by the response headers.
- `hosting.domainAge`: registrar, creation date and age from RDAP, when you pass `domainAge: true`.

Every result carries a confidence score. `checkAdvisories()` reports an exact match for a detected version and a possible match for an inferred range.

### Module presets

By default `detectNuxt()` runs every bundled module mapping. Import one preset to ship less code:

```ts
import { detectNuxt } from 'which-nuxt'
import { officialNuxtModuleDetectors } from 'which-nuxt/modules/official'

const detected = await detectNuxt('https://nuxt.com', {
  moduleDetectors: officialNuxtModuleDetectors,
})
```

| Preset | Import | Covers |
| --- | --- | --- |
| `officialNuxtModuleDetectors` | `which-nuxt/modules/official` | `@nuxt/*` modules |
| `communityNuxtModuleDetectors` | `which-nuxt/modules/community` | `@nuxtjs/*`, `nuxt-*` and third-party modules |
| `nuxtModuleDetectors` | `which-nuxt/modules` | both |

Pass `moduleDetectors: false` to skip module fingerprinting and keep core Nuxt detection.

### Scanners

A crawler already has each page's HTML and its `/_nuxt/` assets. Hand them to the scanners and skip the requests `detectNuxt()` would make:

```ts
import { officialNuxtModuleDetectors } from 'which-nuxt/modules/official'
import { scanHtml, scanJs } from 'which-nuxt/scanners'

const page = scanHtml(html, url, { moduleDetectors: officialNuxtModuleDetectors })
const entry = scanJs(entryChunk, { moduleDetectors: officialNuxtModuleDetectors })
```

### Cache

Pass an `unstorage` instance to cache the full detection result:

```ts
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { detectNuxt } from 'which-nuxt'

const cache = createStorage({ driver: memoryDriver() })

const first = await detectNuxt('https://nuxt.com', { cache })
const cached = await detectNuxt('https://nuxt.com', { cache })
const fresh = await detectNuxt('https://nuxt.com', { cache, cacheBust: true })
```

`cacheMaxAge` expires entries. `cacheNamespace` and `cacheKey` control the storage keys.

## Supported Module Mappings

Every mapping reads public fingerprints, so a site can hide or fake any of them. The certainty on each result tells you how much weight the signal carries.

| Module | Package | Public mappings | Version mapping |
| --- | --- | --- | --- |
| Nuxt SEO | `@nuxtjs/seo` | Inferred when at least three supported SEO child modules are detected. | Not currently detected. |
| Nuxt Robots | `@nuxtjs/robots` | `robots.txt` Nuxt Robots credits, `/__robots__/debug.json`, JS fingerprints such as `nuxt-robots`, `@nuxtjs/robots`, `robots:bot-context` and `useRobotsRule`. | `/__robots__/debug.json`. |
| Nuxt Sitemap | `@nuxtjs/sitemap` | `sitemap.xml`, `sitemap_index.xml`, `/__sitemap__/style.xsl`, `/__sitemap__/debug.json`, JS fingerprints such as `__sitemap__`, `@nuxtjs/sitemap` and `sitemap:urls`. | `/__sitemap__/debug.json`. |
| Nuxt Schema.org | `nuxt-schema-org` | `data-nuxt-schema-org`, `<script id="schema-org-graph">`, `/__schema-org__/debug.json`, JS fingerprints such as `nuxt-schema-org`, `#schema-org` and `schema-org:meta`. Generic schema.org JSON-LD is not treated as a module signal. | `/__schema-org__/debug.json`. |
| Nuxt OG Image | `nuxt-og-image` | OG/Twitter image URLs under `/_og/` or `/__og-image__/`, `nuxt-og-image-options`, `nuxt-og-image-overrides`, `/_og/debug.json`, JS fingerprints such as `nuxt-og-image` and `defineOgImage`. | `/_og/debug.json`. |
| Nuxt SEO Utils | `nuxt-seo-utils` | `/__nuxt-seo-utils/debug.json`, JS fingerprints such as `nuxt-seo-utils`, `seo-utils`, `useSeoMeta`, `useBreadcrumbItems` and `useShareLinks`. | `/__nuxt-seo-utils/debug.json` or JS `nuxt-seo-utils-version`. |
| Nuxt Site Config | `nuxt-site-config` | `/__site-config__/debug.json`, JS fingerprints such as `nuxt-site-config`, `#site-config`, `useSiteConfig` and `site-config-stack`. | `/__site-config__/debug.json`. |
| Nuxt Link Checker | `nuxt-link-checker` | JS fingerprints such as `nuxt-link-checker`, `__link-checker__` and `link-checker:links`. | Not currently detected. |
| Nuxt AI Ready | `nuxt-ai-ready` | `/__ai-ready__/debug.json`, `llms.txt` containing a `Canonical Origin:` header line, `<link rel="alternate" type="text/markdown" href="*.md">`, JS fingerprints `nuxt-ai-ready` and `__ai-ready`. A bare llmstxt.org-format `llms.txt` is not treated as a module signal. | `/__ai-ready__/debug.json`. |
| Nuxt Scripts | `@nuxt/scripts` | Proxied/bundled script `src` under `/_scripts/`, JS fingerprints such as `/_scripts/`, `@nuxt/scripts`, `useScript` and `script-registry`. | Not currently detected. |
| Nuxt Image | `@nuxt/image` | IPX provider URLs under `/_ipx/` in `img`/`source` `src`/`srcset`, JS fingerprint `/_ipx/`. | Not currently detected. |
| Nuxt Fonts | `@nuxt/fonts` | Self-hosted font assets under `/_fonts/` in `link[rel=preload]` and `@font-face` `src`. | Not currently detected. |
| Nuxt Icon | `@nuxt/icon` | Rendered `class="iconify i-<collection>-<name>"` spans (inferred; the `@iconify/vue` `iconify--` form is excluded), JS fingerprints `/api/_nuxt_icon` and `@nuxt/icon`. | Not currently detected. |
| Nuxt UI | `@nuxt/ui` | `<style id="nuxt-ui-colors">` (or `data-nuxt-ui-colors`) injected by the colors plugin, JS fingerprint `nuxt-ui-colors`. | Not currently detected. |
| Vuetify | `vuetify-nuxt-module` | `<style id="vuetify-theme-stylesheet">` injected by Vuetify (inferred). | Not currently detected. |
| Nuxt Color Mode | `@nuxtjs/color-mode` | Inline `window.__NUXT_COLOR_MODE__` script, JS fingerprint `__NUXT_COLOR_MODE__`. | Not currently detected. |
| Nuxt Content | `@nuxt/content` | `/__nuxt_content/content/sql_dump.txt` (v3), `/api/_content/cache.json` (v2), JS fingerprints such as `/__nuxt_content/`, `queryCollection` and `/api/_content/`. | Not currently detected. |
| Nuxt i18n | `@nuxtjs/i18n` | `i18n_redirected` cookie (inferred). Generic `hreflang` alternates are not treated as a module signal. | Not currently detected. |
| Nuxt Security | `nuxt-security` | Default security header set such as `X-XSS-Protection: 0`, `Origin-Agent-Cluster: ?1` and `X-Permitted-Cross-Domain-Policies: none` (inferred), SRI `sha384` hashes on `/_nuxt/` assets. | Not currently detected. |
| Pinia | `@pinia/nuxt` | `pinia` key in the `__NUXT_DATA__` payload (possible; only when a store has SSR state). | Not currently detected. |

## License

Licensed under the [MIT license](https://github.com/harlan-zw/which-nuxt/blob/main/LICENSE.md).
