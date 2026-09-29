# which-nuxt

Detect Nuxt, Vue, Nuxt modules and Nuxt-related package versions from public Nuxt sites, then check detected versions and inferred version ranges against GitHub advisories.

```ts
import { checkAdvisories, detectNuxt } from 'which-nuxt'

const detected = await detectNuxt('https://nuxt.com')
const advisories = await checkAdvisories(detected)
```

## CLI

Run against a public site:

```sh
npx which-nuxt https://nuxt.com
```

The package exposes both `which-nuxt` and `whichnuxt` bin aliases.

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
| `--no-js` | Do not fetch and scan Nuxt JavaScript chunks. |
| `--no-endpoints` | Do not probe Nuxt public endpoints. |
| `--no-hosting` | Skip hosting provider detection from response headers. |
| `--age` | Fetch RDAP domain age metadata. |
| `--timeout <ms>` | Set the network timeout. Defaults to `8000`. |
| `--max-js-requests <count>` | Set the maximum number of Nuxt JavaScript chunks to fetch. Defaults to `4`. Scanning stops early once the exact Nuxt version is found. |
| `--github-token <token>` | Use a GitHub token for advisory API requests. Defaults to `GITHUB_TOKEN`. |
| `--user-agent <agent>` | Use a custom User-Agent for target-site requests. |

The public API is intentionally small:

- `detectNuxt(input, options?)`
- `checkAdvisories(detected, options?)`
- module detector presets from `which-nuxt/modules`, `which-nuxt/modules/official` and `which-nuxt/modules/community`
- `scanHtml(html, baseUrl, options?)` and `scanJs(js, options?)` from `which-nuxt/scanners`, for callers that already fetched the HTML or JavaScript

Detection is confidence-scored. Advisory matches are exact for detected versions and possible for inferred version ranges.

`detectNuxt()` returns:

- `packages`: detected dependency versions, used by `checkAdvisories()`.
- `modules`: Nuxt module fingerprints with `confirmed`, `inferred` or `possible` certainty.
- `hosting.provider`: serving edge/CDN/platform inferred from HTTP headers.
- `hosting.domainAge`: optional RDAP registrar, creation date and age when `domainAge: true`.

Module detection defaults to all bundled official and community mappings. To make module
fingerprints tree-shakable, import the preset surface you want and pass it to
`moduleDetectors`:

```ts
import { detectNuxt } from 'which-nuxt'
import { officialNuxtModuleDetectors } from 'which-nuxt/modules/official'

const detected = await detectNuxt('https://nuxt.com', {
  moduleDetectors: officialNuxtModuleDetectors,
})
```

Use `communityNuxtModuleDetectors` from `which-nuxt/modules/community` for community
module mappings, combine both via `nuxtModuleDetectors` from `which-nuxt/modules`, or
pass `moduleDetectors: false` to disable module fingerprinting while keeping core Nuxt
detection.

A crawler already holds each page's HTML and its `/_nuxt/` assets. It can run the
scanners on those bodies and skip the requests `detectNuxt()` makes:

```ts
import { officialNuxtModuleDetectors } from 'which-nuxt/modules/official'
import { scanHtml, scanJs } from 'which-nuxt/scanners'

const page = scanHtml(html, url, { moduleDetectors: officialNuxtModuleDetectors })
const entry = scanJs(entryChunk, { moduleDetectors: officialNuxtModuleDetectors })
```

## Supported Module Mappings

Module mappings are best-effort public fingerprints. Results include `confirmed`, `inferred` or `possible` certainty depending on the signal quality.

The official preset covers the supported `@nuxt/*` module mappings. The community
preset covers the supported Nuxt Modules/community ecosystem mappings such as
`@nuxtjs/*`, `nuxt-*` and third-party Nuxt integrations.

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

## Cache

Pass an `unstorage` instance to cache and reuse the full detection artifact:

```ts
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { detectNuxt } from 'which-nuxt'

const cache = createStorage({ driver: memoryDriver() })

const first = await detectNuxt('https://nuxt.com', { cache })
const cached = await detectNuxt('https://nuxt.com', { cache })
const fresh = await detectNuxt('https://nuxt.com', { cache, cacheBust: true })
```

Use `cacheMaxAge` to expire artifacts and `cacheNamespace` or `cacheKey` to control storage keys.
