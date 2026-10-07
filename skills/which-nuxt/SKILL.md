---
name: which-nuxt
description: Detects the Nuxt, Vue and Nuxt module versions a public site runs and matches them against GitHub security advisories, with the which-nuxt CLI and library. Use when a task mentions which-nuxt, whichnuxt, detectNuxt, checkAdvisories, scanHtml, scanJs, moduleDetectors or a module preset, fingerprinting a Nuxt site, or gating CI on Nuxt advisories, or when a scan reports no Nuxt on a site that runs Nuxt.
---

# which-nuxt

`which-nuxt` 0.4.1 reads what any visitor can fetch from a site: the page, public endpoints and `/_nuxt/` chunks. It reports the Nuxt and Vue versions, 20 Nuxt modules and the host, then checks the versions against GitHub advisories.

## Setup

- ESM only, Node 22 or newer. `require('which-nuxt')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- The `cache` option takes an `unstorage` instance. Install `unstorage` in your project; under pnpm, the copy inside `which-nuxt` cannot be imported.
- CLI: `npx which-nuxt https://example.com`. The `whichnuxt` binary is the same command.

## Automatic behaviour

- By default, `detectNuxt(url)` sends up to 21 requests to the target: the page, 16 endpoint probes in parallel (`/_payload.json`, `/robots.txt`, `/sitemap.xml`, module `debug.json` routes and more), then up to 4 `/_nuxt/` chunks one at a time.
  `probeEndpoints: false` and `scanJs: false` (CLI `--no-endpoints`, `--no-js`) remove them. Hosting reads the page headers and sends nothing, unless `domainAge: true` (CLI `--age`) adds one RDAP lookup.
- `checkAdvisories()` sends one GitHub API request per package with an exact version or an inferred version range. Module versions read from `debug.json` routes count too, so one scan can cost 5 or more requests.
- `timeout` on `detectNuxt` (default `8000` ms) limits each request, not the whole scan. `checkAdvisories` takes its own `timeout` (default `10000` ms).
- Each request sends `User-Agent: which-nuxt/<version> (+https://github.com/harlan-zw/which-nuxt)`. `userAgent` on `detectNuxt` replaces it for the target and RDAP. `checkAdvisories` takes its own `userAgent`.
- `detectNuxt` runs every module preset unless you pass `moduleDetectors`. `moduleDetectors: false` keeps Nuxt and Vue detection only. The [README](https://github.com/harlan-zw/which-nuxt#module-presets) lists the preset arrays. Import a single preset, such as `nuxtSitemapModuleDetector`, from `which-nuxt/modules`, `which-nuxt/modules/official` or `which-nuxt/modules/community`.
- Passing a preset stops `detectNuxt` from loading the other presets at runtime. A bundler still emits every preset as a lazy chunk, because `detectNuxt` keeps a dynamic import for its default. For a smaller bundle, use `which-nuxt/scanners` with explicit presets.
- For a batch scan, or a site you do not own, keep the default User-Agent so the owner can identify you. Set `probeEndpoints: false` unless you need the endpoint signals; the probes include `/__nuxt_content/content/sql_dump.txt` and module debug routes.
- Nuxt SEO (`@nuxtjs/seo`) is inferred when 3 of its child modules are found. Only `detectNuxt` runs this inference.

## Common tasks

### Gate CI on advisories

The CLI exits `0` after every scan. That includes "Nuxt not detected", a failed fetch and matched advisories. Gate on the result instead.

```ts
import process from 'node:process'
import { checkAdvisories, detectNuxt } from 'which-nuxt'

const detected = await detectNuxt('https://example.com')
if (!detected.isNuxt)
  throw new Error(`Nuxt not detected. ${detected.errors.join('; ')}`)
if (detected.incomplete)
  throw new Error(`Scan incomplete: ${detected.errors.join('; ')}`)

const advisories = await checkAdvisories(detected, { token: process.env.GITHUB_TOKEN })
if (advisories.incomplete)
  throw new Error(`Advisory check failed: ${advisories.errors.join('; ')}`)

const unchecked = advisories.packages.filter(pkg => pkg.skipped).map(pkg => pkg.name)
if (unchecked.length > 0)
  console.warn(`No exact version, not checked: ${unchecked.join(', ')}`)

const serious = advisories.matches.filter(match => ['high', 'critical'].includes(match.severity))
for (const match of serious)
  console.error(`${match.packageName}@${match.version ?? match.versionRange}: ${match.severity} ${match.ghsaId} ${match.url}`)
if (serious.length > 0)
  process.exitCode = 1
```

The gate also fails on a `matchType: 'possible'` match, which comes from an inferred version range. Filter on `match.matchType === 'exact'` to fail only on exact versions. It fails on an incomplete scan, because a timed out chunk can hide the Nuxt version.

From a shell, run `which-nuxt https://example.com --json` and apply the same checks to `{ detected, advisories }`. `advisories` is `null` with `--no-advisories`. Never parse the human output: under `CI` it changes from a box to plain `[info]` lines.

### Scan HTML you already fetched

Pass the page as `{ html, url, headers }` and turn off both network steps. Without them, a `url` makes `detectNuxt` send up to 20 requests to that site.

```ts
import { detectNuxt } from 'which-nuxt'

const response = await fetch('https://example.com/')
const detected = await detectNuxt(
  {
    html: await response.text(),
    url: response.url,
    headers: Object.fromEntries(response.headers),
  },
  { scanJs: false, probeEndpoints: false },
)

console.log(detected.isNuxt, detected.modules.map(module => module.packageName), detected.hosting?.provider)
```

`scanHtml` and `scanJs` from `which-nuxt/scanners` never fetch. They return `signals`, `packages` and `modules`, with no `isNuxt` verdict.

### Cache results

```ts
import type { DetectCacheArtifact } from 'which-nuxt'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { detectNuxt } from 'which-nuxt'

const cache = createStorage<DetectCacheArtifact>({ driver: memoryDriver() })
const ONE_HOUR = 60 * 60 * 1000

let result = await detectNuxt('https://example.com', { cache, cacheMaxAge: ONE_HOUR })
if (result.incomplete)
  result = await detectNuxt('https://example.com', { cache, cacheMaxAge: ONE_HOUR, cacheBust: true })

console.log(result.cache)
```

## Traps

- A target without `http://` or `https://` is scanned as HTML. `detectNuxt('nuxt.com')` and `which-nuxt nuxt.com` report "Nuxt not detected" with no error and no request.
- `detectNuxt` does not throw on a network failure. An unreachable site gives `isNuxt: false`, `incomplete: true`, `errors: ['fetch failed']`. Read `errors` before you report "not Nuxt".
- `{ html, url }` input and `detectNuxt(html, { url })` still probe that URL. See [Scan HTML you already fetched](#scan-html-you-already-fetched).
- Header keys must be lowercase. `headers: { 'CF-Ray': 'abc' }` gives `hosting.provider: null`; `{ 'cf-ray': 'abc' }` gives `Cloudflare`.
- `scanHtml` and `scanJs` find no modules without `moduleDetectors`. Unlike `detectNuxt`, they do not default to every preset.
- `moduleDetectors` takes an array. Pass `[nuxtSitemapModuleDetector]`, never the preset alone.
- `cacheMaxAge` is milliseconds. `cacheMaxAge: 3600` expires after 3.6 seconds.
- An incomplete result is cached. A timed out chunk is replayed on every hit until a `cacheBust: true` scan.
- The README cache example fails strict type checking: plain `createStorage()` returns `Storage<StorageValue>`. Use `createStorage<DetectCacheArtifact>()`.
- The CLI prints `✔ No advisories matched exact detected package versions.` even when every GitHub request failed. The failure goes to stderr: `WARN GitHub advisory request failed for nuxt: 401`.
- No match can mean no check. A package with neither an exact version nor a version range is skipped: `skipped: true`, `reason: 'No exact valid semver version detected.'`. The Vue version can be missing, so Vue then goes unchecked.
- Without a token, GitHub allows 60 API requests an hour. Batch scans run out fast, and each failure lands in `advisories.errors` as `GitHub advisory request failed for nuxt: 403`. The CLI reads `GITHUB_TOKEN` or `--github-token`; the library reads only `token`. Prefer `GITHUB_TOKEN`: a `--github-token` value shows in shell history and `ps` output.
- `--timeout` and `--max-js-requests` take positive integers. `--timeout 1.5` exits `1` with a stack trace.

## Config

The [README](https://github.com/harlan-zw/which-nuxt#cli) lists the CLI flags. The `DetectOptions` and `AdvisoryOptions` types hold the library options, such as `maxJsBytes` and `includePackages`. Each function takes its own `fetch` to route its requests through your client.
