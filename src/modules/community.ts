import type { ModuleDetectorPreset } from '../types.ts'
import { debugVersionProbe, defineDetectorModule, defineModuleDetector, detectedModule, detectedPackage, moduleJsFingerprint } from './define.ts'

// nuxt-og-image route formats: `/_og/<type>/...` in v6+, `/__og-image__/...`
// before that.
const OG_IMAGE_ROUTE_RE = /\/_og\/[a-z]\/|\/__og-image__\//i
// @nuxtjs/color-mode injects an inline blocking script exposing this global.
const COLOR_MODE_RE = /__NUXT_COLOR_MODE__/
// @pinia/nuxt serializes hydrated store state under a `pinia` key in the payload.
const PINIA_PAYLOAD_RE = /"pinia"/
// nuxt-security adds Subresource Integrity hashes (sha384 by default) to bundled assets.
const SRI_SHA384_RE = /^sha384-/
const I18N_COOKIE_RE = /\bi18n_redirected=/
const SITEMAP_MODULE_RE = /\/__sitemap__\/style\.xsl|\/__sitemap__\/debug\.json|nuxt sitemap|@nuxtjs\/sitemap/i
const ROBOTS_MODULE_RE = /# START nuxt-robots|# END nuxt-robots/i
const HTML_DOC_RE = /^\s*<(?:!doctype|html)\b/i
// Distinctive keys from nuxt-ai-ready's /__ai-ready__/debug.json payload.
const AI_READY_DEBUG_RE = /"siteConfigUrl"|"llmsTxtCacheSeconds"/
// `Canonical Origin:` is nuxt-ai-ready's own llms.txt header line, not llmstxt.org spec.
const AI_READY_LLMS_RE = /^Canonical Origin:\s*https?:\/\//im
const SEO_UTILS_VERSION_RE = /nuxt-seo-utils-version["']?\s*[:=]\s*["']([^"']+)["']/

const SECURITY_DEFAULTS: Array<[name: string, value: string]> = [
  ['x-xss-protection', '0'],
  ['origin-agent-cluster', '?1'],
  ['x-permitted-cross-domain-policies', 'none'],
  ['x-download-options', 'noopen'],
  ['x-content-type-options', 'nosniff'],
]

const NuxtSeo = defineDetectorModule({
  presetName: 'nuxt-seo',
  name: 'Nuxt SEO',
  packageName: '@nuxtjs/seo',
  collection: 'community',
})

const NuxtRobots = defineDetectorModule({
  presetName: 'nuxt-robots',
  name: 'Nuxt Robots',
  packageName: '@nuxtjs/robots',
  collection: 'community',
})

const NuxtSitemap = defineDetectorModule({
  presetName: 'nuxt-sitemap',
  name: 'Nuxt Sitemap',
  packageName: '@nuxtjs/sitemap',
  collection: 'community',
})

const NuxtSchemaOrg = defineDetectorModule({
  presetName: 'nuxt-schema-org',
  name: 'Nuxt Schema.org',
  packageName: 'nuxt-schema-org',
  collection: 'community',
})

const NuxtOgImage = defineDetectorModule({
  presetName: 'nuxt-og-image',
  name: 'Nuxt OG Image',
  packageName: 'nuxt-og-image',
  collection: 'community',
})

const NuxtSeoUtils = defineDetectorModule({
  presetName: 'nuxt-seo-utils',
  name: 'Nuxt SEO Utils',
  packageName: 'nuxt-seo-utils',
  collection: 'community',
})

const NuxtSiteConfig = defineDetectorModule({
  presetName: 'nuxt-site-config',
  name: 'Nuxt Site Config',
  packageName: 'nuxt-site-config',
  collection: 'community',
})

const NuxtLinkChecker = defineDetectorModule({
  presetName: 'nuxt-link-checker',
  name: 'Nuxt Link Checker',
  packageName: 'nuxt-link-checker',
  collection: 'community',
})

const NuxtAiReady = defineDetectorModule({
  presetName: 'nuxt-ai-ready',
  name: 'Nuxt AI Ready',
  packageName: 'nuxt-ai-ready',
  collection: 'community',
})

const Vuetify = defineDetectorModule({
  presetName: 'vuetify-nuxt-module',
  name: 'Vuetify',
  packageName: 'vuetify-nuxt-module',
  collection: 'community',
})

const NuxtColorMode = defineDetectorModule({
  presetName: 'nuxt-color-mode',
  name: 'Nuxt Color Mode',
  packageName: '@nuxtjs/color-mode',
  collection: 'community',
})

const NuxtI18n = defineDetectorModule({
  presetName: 'nuxt-i18n',
  name: 'Nuxt i18n',
  packageName: '@nuxtjs/i18n',
  collection: 'community',
})

const NuxtSecurity = defineDetectorModule({
  presetName: 'nuxt-security',
  name: 'Nuxt Security',
  packageName: 'nuxt-security',
  collection: 'community',
})

const PiniaNuxt = defineDetectorModule({
  presetName: 'pinia-nuxt',
  name: 'Pinia',
  packageName: '@pinia/nuxt',
  collection: 'community',
})

export const nuxtSeoModuleDetector = defineModuleDetector(NuxtSeo, {
  inferModules: ({ modules, emitModule }) => {
    const seoChildModules = new Set([
      '@nuxtjs/robots',
      '@nuxtjs/sitemap',
      'nuxt-ai-ready',
      'nuxt-link-checker',
      'nuxt-og-image',
      'nuxt-schema-org',
      'nuxt-seo-utils',
      'nuxt-site-config',
    ])
    const detectedSeoChildren = modules.filter(module => seoChildModules.has(module.packageName))
    if (detectedSeoChildren.length >= 3) {
      emitModule(detectedModule(NuxtSeo, {
        version: null,
        certainty: 'inferred',
        confidence: Math.min(detectedSeoChildren.length * 2, 8),
        source: 'inferred',
        signals: detectedSeoChildren.map(module => `inferred:${module.packageName}`),
      }))
    }
  },
})

export const nuxtRobotsModuleDetector = defineModuleDetector(NuxtRobots, {
  jsFingerprints: [
    moduleJsFingerprint(NuxtRobots, { signal: 'js:nuxt-robots', re: /nuxt-robots|@nuxtjs\/robots|robots:bot-context|useRobotsRule/ }),
  ],
  endpointProbes: [
    {
      path: '/robots.txt',
      base: 'origin',
      detect: ({ body, emitModule }) => {
        if (ROBOTS_MODULE_RE.test(body)) {
          emitModule(detectedModule(NuxtRobots, {
            version: null,
            certainty: 'confirmed',
            confidence: 10,
            source: 'endpoint',
            signals: ['endpoint:nuxt-robots-credits'],
          }))
        }
      },
    },
    debugVersionProbe(NuxtRobots, '/__robots__/debug.json', 'endpoint:nuxt-robots-debug'),
  ],
})

export const nuxtSitemapModuleDetector = defineModuleDetector(NuxtSitemap, {
  jsFingerprints: [
    moduleJsFingerprint(NuxtSitemap, { signal: 'js:nuxt-sitemap', re: /__sitemap__|@nuxtjs\/sitemap|sitemap:urls/ }),
  ],
  endpointProbes: [
    {
      path: '/sitemap.xml',
      base: 'origin',
      detect: ({ body, emitModule }) => {
        if (SITEMAP_MODULE_RE.test(body)) {
          emitModule(detectedModule(NuxtSitemap, {
            version: null,
            certainty: 'confirmed',
            confidence: 9,
            source: 'endpoint',
            signals: ['endpoint:nuxt-sitemap-route'],
          }))
        }
      },
    },
    {
      path: '/sitemap_index.xml',
      base: 'origin',
      detect: ({ body, emitModule }) => {
        if (SITEMAP_MODULE_RE.test(body)) {
          emitModule(detectedModule(NuxtSitemap, {
            version: null,
            certainty: 'confirmed',
            confidence: 9,
            source: 'endpoint',
            signals: ['endpoint:nuxt-sitemap-route'],
          }))
        }
      },
    },
    {
      path: '/__sitemap__/style.xsl',
      base: 'origin',
      detect: ({ body, emitModule }) => {
        if (SITEMAP_MODULE_RE.test(body)) {
          emitModule(detectedModule(NuxtSitemap, {
            version: null,
            certainty: 'confirmed',
            confidence: 9,
            source: 'endpoint',
            signals: ['endpoint:nuxt-sitemap-route'],
          }))
        }
      },
    },
    debugVersionProbe(NuxtSitemap, '/__sitemap__/debug.json', 'endpoint:nuxt-sitemap-debug'),
  ],
})

export const nuxtSchemaOrgModuleDetector = defineModuleDetector(NuxtSchemaOrg, {
  htmlDetectors: [
    ({ nodeName, attributes, emitModule }) => {
      if ('data-nuxt-schema-org' in attributes || (nodeName === 'script' && attributes.id === 'schema-org-graph')) {
        emitModule(detectedModule(NuxtSchemaOrg, {
          version: null,
          certainty: 'confirmed',
          confidence: 9,
          source: 'html',
          signals: ['data-nuxt-schema-org' in attributes ? 'html:data-nuxt-schema-org' : 'html:schema-org-graph'],
        }))
      }
    },
  ],
  jsFingerprints: [
    moduleJsFingerprint(NuxtSchemaOrg, { signal: 'js:nuxt-schema-org', re: /nuxt-schema-org|#schema-org|schema-org:meta|data-nuxt-schema-org/ }),
  ],
  endpointProbes: [
    debugVersionProbe(NuxtSchemaOrg, '/__schema-org__/debug.json', 'endpoint:nuxt-schema-org-debug'),
  ],
})

export const nuxtOgImageModuleDetector = defineModuleDetector(NuxtOgImage, {
  htmlDetectors: [
    ({ nodeName, attributes, resource, emitModule }) => {
      const metaName = attributes.name?.toLowerCase()
      const metaProperty = attributes.property?.toLowerCase()
      const content = attributes.content || ''
      if ((metaProperty?.startsWith('og:image') || metaName?.startsWith('twitter:image')) && OG_IMAGE_ROUTE_RE.test(content)) {
        emitModule(detectedModule(NuxtOgImage, {
          version: null,
          certainty: 'confirmed',
          confidence: 9,
          source: 'html',
          signals: ['html:nuxt-og-image-url'],
        }))
      }

      if (nodeName === 'script' && (resource?.id === 'nuxt-og-image-options' || resource?.id === 'nuxt-og-image-overrides')) {
        emitModule(detectedModule(NuxtOgImage, {
          version: null,
          certainty: 'confirmed',
          confidence: 10,
          source: 'html',
          signals: [`html:${resource.id}`],
        }))
      }
    },
  ],
  jsFingerprints: [
    moduleJsFingerprint(NuxtOgImage, { signal: 'js:nuxt-og-image', re: /nuxt-og-image|defineOgImage|\/_og\/[a-z]\/|\/__og-image__\// }),
  ],
  endpointProbes: [
    debugVersionProbe(NuxtOgImage, '/_og/debug.json', 'endpoint:nuxt-og-image-debug'),
  ],
})

export const nuxtSeoUtilsModuleDetector = defineModuleDetector(NuxtSeoUtils, {
  jsFingerprints: [
    moduleJsFingerprint(NuxtSeoUtils, {
      signal: 'js:nuxt-seo-utils',
      re: /nuxt-seo-utils|seo-utils|useSeoMeta|useBreadcrumbItems|useShareLinks/,
      version: js => js.match(SEO_UTILS_VERSION_RE)?.[1] || null,
      certainty: version => version ? 'confirmed' : 'inferred',
      confidence: version => version ? 9 : 6,
      packageSignal: 'js:nuxt-seo-utils-version',
    }),
  ],
  endpointProbes: [
    debugVersionProbe(NuxtSeoUtils, '/__nuxt-seo-utils/debug.json', 'endpoint:nuxt-seo-utils-debug'),
  ],
})

export const nuxtSiteConfigModuleDetector = defineModuleDetector(NuxtSiteConfig, {
  jsFingerprints: [
    moduleJsFingerprint(NuxtSiteConfig, { signal: 'js:nuxt-site-config', re: /nuxt-site-config|#site-config|useSiteConfig|site-config-stack/ }),
  ],
  endpointProbes: [
    debugVersionProbe(NuxtSiteConfig, '/__site-config__/debug.json', 'endpoint:nuxt-site-config-debug'),
  ],
})

export const nuxtLinkCheckerModuleDetector = defineModuleDetector(NuxtLinkChecker, {
  jsFingerprints: [
    moduleJsFingerprint(NuxtLinkChecker, { signal: 'js:nuxt-link-checker', re: /nuxt-link-checker|__link-checker__|link-checker:links/ }),
  ],
})

export const nuxtAiReadyModuleDetector = defineModuleDetector(NuxtAiReady, {
  htmlDetectors: [
    ({ attributes, resource, emitModule }) => {
      if (resource?.rel?.toLowerCase().includes('alternate')
        && attributes.type?.toLowerCase() === 'text/markdown'
        && resource.href?.toLowerCase().endsWith('.md')) {
        emitModule(detectedModule(NuxtAiReady, {
          version: null,
          certainty: 'inferred',
          confidence: 7,
          source: 'html',
          signals: ['html:nuxt-ai-ready-md-alternate'],
        }))
      }
    },
  ],
  jsFingerprints: [
    moduleJsFingerprint(NuxtAiReady, { signal: 'js:nuxt-ai-ready', re: /nuxt-ai-ready|__ai-ready\b/ }),
  ],
  endpointProbes: [
    {
      path: '/__ai-ready__/debug.json',
      base: 'origin',
      detect: ({ body, isJsonLikeResponse, moduleVersion, emitModule, emitPackage }) => {
        if (!isJsonLikeResponse() || !AI_READY_DEBUG_RE.test(body))
          return

        const version = moduleVersion()
        emitModule(detectedModule(NuxtAiReady, {
          version,
          certainty: 'confirmed',
          confidence: 10,
          source: 'endpoint',
          signals: ['endpoint:nuxt-ai-ready-debug'],
        }))
        if (version) {
          emitPackage(detectedPackage(NuxtAiReady, {
            version,
            confidence: 10,
            source: 'endpoint',
            signals: ['endpoint:nuxt-ai-ready-debug'],
          }))
        }
      },
    },
    {
      path: '/llms.txt',
      base: 'origin',
      detect: ({ body, emitModule }) => {
        if (!HTML_DOC_RE.test(body) && AI_READY_LLMS_RE.test(body)) {
          emitModule(detectedModule(NuxtAiReady, {
            version: null,
            certainty: 'confirmed',
            confidence: 9,
            source: 'endpoint',
            signals: ['endpoint:nuxt-ai-ready-llms-txt'],
          }))
        }
      },
    },
  ],
})

export const vuetifyNuxtModuleDetector = defineModuleDetector(Vuetify, {
  htmlDetectors: [
    ({ nodeName, attributes, emitModule }) => {
      if (nodeName === 'style' && attributes.id === 'vuetify-theme-stylesheet') {
        emitModule(detectedModule(Vuetify, {
          version: null,
          certainty: 'inferred',
          confidence: 7,
          source: 'html',
          signals: ['html:vuetify-theme-stylesheet'],
        }))
      }
    },
  ],
})

export const nuxtColorModeModuleDetector = defineModuleDetector(NuxtColorMode, {
  htmlDetectors: [
    ({ resource, emitModule }) => {
      if (COLOR_MODE_RE.test(resource?.innerHTML || '')) {
        emitModule(detectedModule(NuxtColorMode, {
          version: null,
          certainty: 'confirmed',
          confidence: 9,
          source: 'html',
          signals: ['html:nuxt-color-mode-script'],
        }))
      }
    },
  ],
  jsFingerprints: [
    moduleJsFingerprint(NuxtColorMode, { signal: 'js:nuxt-color-mode', re: /__NUXT_COLOR_MODE__|@nuxtjs\/color-mode/ }),
  ],
})

export const nuxtI18nModuleDetector = defineModuleDetector(NuxtI18n, {
  headerDetectors: [
    ({ getHeader, emitModule }) => {
      const setCookie = getHeader('set-cookie') || ''
      if (I18N_COOKIE_RE.test(setCookie)) {
        emitModule(detectedModule(NuxtI18n, {
          version: null,
          certainty: 'inferred',
          confidence: 7,
          source: 'inferred',
          signals: ['header:i18n-redirected-cookie'],
        }))
      }
    },
  ],
})

export const nuxtSecurityModuleDetector = defineModuleDetector(NuxtSecurity, {
  htmlDetectors: [
    ({ resource, attributes, hasNuxtPath, emitModule }) => {
      if (SRI_SHA384_RE.test(attributes.integrity || '') && (hasNuxtPath(resource?.src) || hasNuxtPath(resource?.href))) {
        emitModule(detectedModule(NuxtSecurity, {
          version: null,
          certainty: 'inferred',
          confidence: 6,
          source: 'html',
          signals: ['html:nuxt-security-sri'],
        }))
      }
    },
  ],
  headerDetectors: [
    ({ getHeader, emitModule }) => {
      const securityHits = SECURITY_DEFAULTS.filter(([name, value]) => getHeader(name) === value).length
      if (securityHits >= 3) {
        emitModule(detectedModule(NuxtSecurity, {
          version: null,
          certainty: 'inferred',
          confidence: Math.min(securityHits * 2, 9),
          source: 'inferred',
          signals: ['header:nuxt-security-defaults'],
        }))
      }
    },
  ],
})

export const piniaNuxtModuleDetector = defineModuleDetector(PiniaNuxt, {
  htmlDetectors: [
    ({ resource, emitModule }) => {
      if (resource?.id === '__NUXT_DATA__' && PINIA_PAYLOAD_RE.test(resource.innerHTML || '')) {
        emitModule(detectedModule(PiniaNuxt, {
          version: null,
          certainty: 'possible',
          confidence: 4,
          source: 'payload',
          signals: ['html:pinia-payload-state'],
        }))
      }
    },
  ],
})

export const communityNuxtModuleDetectors = [
  nuxtSeoModuleDetector,
  nuxtRobotsModuleDetector,
  nuxtSitemapModuleDetector,
  nuxtSchemaOrgModuleDetector,
  nuxtOgImageModuleDetector,
  nuxtSeoUtilsModuleDetector,
  nuxtSiteConfigModuleDetector,
  nuxtLinkCheckerModuleDetector,
  nuxtAiReadyModuleDetector,
  vuetifyNuxtModuleDetector,
  nuxtColorModeModuleDetector,
  nuxtI18nModuleDetector,
  nuxtSecurityModuleDetector,
  piniaNuxtModuleDetector,
] as const satisfies readonly ModuleDetectorPreset[]
