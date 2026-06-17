# which-nuxt

Detect Nuxt, Vue, Nuxt modules and Nuxt-related package versions from public Nuxt sites, then check exact detected versions against GitHub advisories.

```ts
import { checkAdvisories, detectNuxt } from 'which-nuxt'

const detected = await detectNuxt('https://nuxt.com')
const advisories = await checkAdvisories(detected)
```

The public API is intentionally small:

- `detectNuxt(input, options?)`
- `checkAdvisories(detected, options?)`

Detection is confidence-scored. Advisory matches are only produced for exact package versions.

`detectNuxt()` returns:

- `packages`: detected dependency versions, used by `checkAdvisories()`.
- `modules`: Nuxt module fingerprints with `confirmed`, `inferred` or `possible` certainty.
- `hosting.provider`: serving edge/CDN/platform inferred from HTTP headers.
- `hosting.domainAge`: optional RDAP registrar, creation date and age when `domainAge: true`.

Nuxt SEO modules currently have first-pass fingerprints for `@nuxtjs/seo`, `@nuxtjs/robots`, `@nuxtjs/sitemap`, `nuxt-schema-org`, `nuxt-og-image`, `nuxt-seo-utils`, `nuxt-site-config`, `nuxt-link-checker`, `nuxt-ai-ready` and `nuxt-scripts`.

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
