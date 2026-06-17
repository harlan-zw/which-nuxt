import type { DetectedModule, DetectedPackage, DetectionSignal, DetectOptions } from '../types.ts'
import { joinURL } from 'ufo'
import { fetchText } from './fetch.ts'
import { addSignal, upsertModule, upsertPackage } from './signals.ts'

// Nuxt-specific tokens for a devalue-serialized payload. Bare `data`/`serverRendered`
// were too loose: any catch-all 200 JSON route (e.g. a soft-404 `{"data":null,...}`)
// matched and falsely scored the site toward the Nuxt threshold.
const NUXT_PAYLOAD_RE = /\bprerenderedAt\b|"_errors"|"_server_errors"|\["(?:Shallow)?Reactive"|\["NuxtError"/
const SITEMAP_MODULE_RE = /\/__sitemap__\/style\.xsl|\/__sitemap__\/debug\.json|nuxt sitemap|@nuxtjs\/sitemap/i
const ROBOTS_MODULE_RE = /# START nuxt-robots|# END nuxt-robots/i
const AI_READY_RE = /\bllms-full\.txt\b|\bllms\.txt\b|nuxt-ai-ready|AI-ready/i
const VERSION_PROP_RE = /\bversion["']?\s*[:=]\s*["']([^"',\s]+)["']/i
const VERSION_RE = /\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/

function moduleVersion(body: string) {
  return body.match(VERSION_PROP_RE)?.[1]
    || body.match(VERSION_RE)?.[0]
    || null
}

function isJsonLikeResponse(response: { body: string, contentType: string | null }) {
  const trimmed = response.body.trimStart()
  return response.contentType?.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')
}

export async function probeNuxtEndpoints(baseUrl: string, options: DetectOptions) {
  const signals: DetectionSignal[] = []
  const packages: DetectedPackage[] = []
  const modules: DetectedModule[] = []
  const errors: string[] = []

  let origin: string
  try {
    origin = new URL(baseUrl).origin
  }
  catch {
    return { signals, packages, modules, errors }
  }

  const urls = [
    joinURL(origin, '/_nuxt/builds/latest.json'),
    joinURL(baseUrl, '/_payload.json'),
    joinURL(origin, '/robots.txt'),
    joinURL(origin, '/sitemap.xml'),
    joinURL(origin, '/sitemap_index.xml'),
    joinURL(origin, '/__sitemap__/style.xsl'),
    joinURL(origin, '/__sitemap__/debug.json'),
    joinURL(origin, '/__robots__/debug.json'),
    joinURL(origin, '/__nuxt-seo-utils/debug.json'),
    joinURL(origin, '/__schema-org__/debug.json'),
    joinURL(origin, '/__site-config__/debug.json'),
    joinURL(origin, '/_og/debug.json'),
    joinURL(origin, '/__ai-ready/devtools'),
    joinURL(origin, '/llms.txt'),
  ]

  async function probeUrl(url: string) {
    try {
      const response = await fetchText(url, options)
      if (response.status < 200 || response.status >= 300)
        return

      if (url.endsWith('/_nuxt/builds/latest.json')) {
        addSignal(signals, 'endpoint:nuxt-build-latest', 5, 'endpoint', 'Fetched /_nuxt/builds/latest.json successfully.')
        upsertPackage(packages, {
          name: 'nuxt',
          version: null,
          confidence: 7,
          source: 'endpoint',
          signals: ['endpoint:nuxt-build-latest'],
        })
      }

      if (url.endsWith('/_payload.json') && isJsonLikeResponse(response) && NUXT_PAYLOAD_RE.test(response.body)) {
        addSignal(signals, 'endpoint:nuxt-payload', 4, 'payload', 'Fetched a route _payload.json successfully.')
        upsertPackage(packages, {
          name: 'nuxt',
          version: null,
          confidence: 6,
          source: 'payload',
          signals: ['endpoint:nuxt-payload'],
        })
      }

      if (url.endsWith('/robots.txt') && ROBOTS_MODULE_RE.test(response.body)) {
        upsertModule(modules, {
          name: 'Nuxt Robots',
          packageName: '@nuxtjs/robots',
          version: null,
          certainty: 'confirmed',
          confidence: 10,
          source: 'endpoint',
          signals: ['endpoint:nuxt-robots-credits'],
        })
      }

      if ((url.endsWith('/sitemap.xml') || url.endsWith('/sitemap_index.xml') || url.endsWith('/__sitemap__/style.xsl')) && SITEMAP_MODULE_RE.test(response.body)) {
        upsertModule(modules, {
          name: 'Nuxt Sitemap',
          packageName: '@nuxtjs/sitemap',
          version: null,
          certainty: 'confirmed',
          confidence: 9,
          source: 'endpoint',
          signals: ['endpoint:nuxt-sitemap-route'],
        })
      }

      if (url.endsWith('/__sitemap__/debug.json')) {
        if (!isJsonLikeResponse(response))
          return
        const version = moduleVersion(response.body)
        upsertModule(modules, {
          name: 'Nuxt Sitemap',
          packageName: '@nuxtjs/sitemap',
          version,
          certainty: version ? 'confirmed' : 'inferred',
          confidence: version ? 10 : 7,
          source: 'endpoint',
          signals: ['endpoint:nuxt-sitemap-debug'],
        })
        if (version) {
          upsertPackage(packages, {
            name: '@nuxtjs/sitemap',
            version,
            confidence: 10,
            source: 'endpoint',
            signals: ['endpoint:nuxt-sitemap-debug'],
          })
        }
      }

      if (url.endsWith('/__robots__/debug.json')) {
        if (!isJsonLikeResponse(response))
          return
        const version = moduleVersion(response.body)
        upsertModule(modules, {
          name: 'Nuxt Robots',
          packageName: '@nuxtjs/robots',
          version,
          certainty: version ? 'confirmed' : 'inferred',
          confidence: version ? 10 : 7,
          source: 'endpoint',
          signals: ['endpoint:nuxt-robots-debug'],
        })
        if (version) {
          upsertPackage(packages, {
            name: '@nuxtjs/robots',
            version,
            confidence: 10,
            source: 'endpoint',
            signals: ['endpoint:nuxt-robots-debug'],
          })
        }
      }

      if (url.endsWith('/__nuxt-seo-utils/debug.json')) {
        if (!isJsonLikeResponse(response))
          return
        const version = moduleVersion(response.body)
        upsertModule(modules, {
          name: 'Nuxt SEO Utils',
          packageName: 'nuxt-seo-utils',
          version,
          certainty: version ? 'confirmed' : 'inferred',
          confidence: version ? 10 : 7,
          source: 'endpoint',
          signals: ['endpoint:nuxt-seo-utils-debug'],
        })
        if (version) {
          upsertPackage(packages, {
            name: 'nuxt-seo-utils',
            version,
            confidence: 10,
            source: 'endpoint',
            signals: ['endpoint:nuxt-seo-utils-debug'],
          })
        }
      }

      if (url.endsWith('/__schema-org__/debug.json')) {
        if (!isJsonLikeResponse(response))
          return
        const version = moduleVersion(response.body)
        upsertModule(modules, {
          name: 'Nuxt Schema.org',
          packageName: 'nuxt-schema-org',
          version,
          certainty: version ? 'confirmed' : 'inferred',
          confidence: version ? 10 : 7,
          source: 'endpoint',
          signals: ['endpoint:nuxt-schema-org-debug'],
        })
        if (version) {
          upsertPackage(packages, {
            name: 'nuxt-schema-org',
            version,
            confidence: 10,
            source: 'endpoint',
            signals: ['endpoint:nuxt-schema-org-debug'],
          })
        }
      }

      if (url.endsWith('/__site-config__/debug.json')) {
        if (!isJsonLikeResponse(response))
          return
        const version = moduleVersion(response.body)
        upsertModule(modules, {
          name: 'Nuxt Site Config',
          packageName: 'nuxt-site-config',
          version,
          certainty: version ? 'confirmed' : 'inferred',
          confidence: version ? 10 : 7,
          source: 'endpoint',
          signals: ['endpoint:nuxt-site-config-debug'],
        })
        if (version) {
          upsertPackage(packages, {
            name: 'nuxt-site-config',
            version,
            confidence: 10,
            source: 'endpoint',
            signals: ['endpoint:nuxt-site-config-debug'],
          })
        }
      }

      if (url.endsWith('/_og/debug.json')) {
        if (!isJsonLikeResponse(response))
          return
        const version = moduleVersion(response.body)
        upsertModule(modules, {
          name: 'Nuxt OG Image',
          packageName: 'nuxt-og-image',
          version,
          certainty: version ? 'confirmed' : 'inferred',
          confidence: version ? 10 : 7,
          source: 'endpoint',
          signals: ['endpoint:nuxt-og-image-debug'],
        })
        if (version) {
          upsertPackage(packages, {
            name: 'nuxt-og-image',
            version,
            confidence: 10,
            source: 'endpoint',
            signals: ['endpoint:nuxt-og-image-debug'],
          })
        }
      }

      if (url.endsWith('/__ai-ready/devtools')) {
        if (!isJsonLikeResponse(response))
          return
        const version = moduleVersion(response.body)
        upsertModule(modules, {
          name: 'Nuxt AI Ready',
          packageName: 'nuxt-ai-ready',
          version,
          certainty: version ? 'confirmed' : 'inferred',
          confidence: version ? 10 : 7,
          source: 'endpoint',
          signals: ['endpoint:nuxt-ai-ready-devtools'],
        })
        if (version) {
          upsertPackage(packages, {
            name: 'nuxt-ai-ready',
            version,
            confidence: 10,
            source: 'endpoint',
            signals: ['endpoint:nuxt-ai-ready-devtools'],
          })
        }
      }

      if (url.endsWith('/llms.txt') && AI_READY_RE.test(response.body)) {
        upsertModule(modules, {
          name: 'Nuxt AI Ready',
          packageName: 'nuxt-ai-ready',
          version: null,
          certainty: 'possible',
          confidence: 5,
          source: 'endpoint',
          signals: ['endpoint:llms-txt'],
        })
      }
    }
    catch (error) {
      errors.push(`${url}: ${(error as Error).message}`)
    }
  }

  await Promise.all(urls.map(url => probeUrl(url)))

  return { signals, packages, modules, errors }
}
