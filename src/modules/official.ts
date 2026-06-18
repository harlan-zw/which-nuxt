import type { ModuleDetectorPreset } from '../types.ts'
import { defineDetectorModule, defineModuleDetector, detectedModule, moduleJsFingerprint } from './define.ts'

// @nuxt/image IPX provider serves optimized images from `/_ipx/<modifiers>/...`
// by default.
const IPX_IMAGE_RE = /\/_ipx\//
// @nuxt/fonts self-hosts processed fonts under `/_fonts/` by default.
const FONTS_ASSET_RE = /\/_fonts\//
// @nuxt/scripts proxies/bundles third-party scripts under `/_scripts/` by default.
const SCRIPTS_PROXY_RE = /\/_scripts\//
// @nuxt/icon's CSS render mode emits `<span class="iconify i-<collection>-<name>">`.
const ICON_NUXT_CLASS_RE = /\biconify\b/
const ICON_NUXT_CSS_PREFIX_RE = /\bi-[a-z0-9]+[-:]/
const HTML_DOC_RE = /^\s*<(?:!doctype|html)\b/i

const NuxtScripts = defineDetectorModule({
  presetName: 'nuxt-scripts',
  name: 'Nuxt Scripts',
  packageName: '@nuxt/scripts',
  collection: 'official',
})

const NuxtImage = defineDetectorModule({
  presetName: 'nuxt-image',
  name: 'Nuxt Image',
  packageName: '@nuxt/image',
  collection: 'official',
})

const NuxtFonts = defineDetectorModule({
  presetName: 'nuxt-fonts',
  name: 'Nuxt Fonts',
  packageName: '@nuxt/fonts',
  collection: 'official',
})

const NuxtIcon = defineDetectorModule({
  presetName: 'nuxt-icon',
  name: 'Nuxt Icon',
  packageName: '@nuxt/icon',
  collection: 'official',
})

const NuxtContent = defineDetectorModule({
  presetName: 'nuxt-content',
  name: 'Nuxt Content',
  packageName: '@nuxt/content',
  collection: 'official',
})

const NuxtUi = defineDetectorModule({
  presetName: 'nuxt-ui',
  name: 'Nuxt UI',
  packageName: '@nuxt/ui',
  collection: 'official',
})

export const nuxtScriptsModuleDetector = defineModuleDetector(NuxtScripts, {
  htmlDetectors: [
    ({ resource, emitModule }) => {
      if (resource?.src && SCRIPTS_PROXY_RE.test(resource.src)) {
        emitModule(detectedModule(NuxtScripts, {
          version: null,
          certainty: 'confirmed',
          confidence: 9,
          source: 'html',
          signals: ['html:nuxt-scripts-proxy'],
        }))
      }
    },
  ],
  jsFingerprints: [
    moduleJsFingerprint(NuxtScripts, { signal: 'js:nuxt-scripts', re: /\/_scripts\/|@nuxt\/scripts|useScript|script-registry/ }),
  ],
})

export const nuxtImageModuleDetector = defineModuleDetector(NuxtImage, {
  htmlDetectors: [
    ({ nodeName, attributes, emitModule }) => {
      if ((nodeName === 'img' || nodeName === 'source') && IPX_IMAGE_RE.test(`${attributes.src || ''} ${attributes.srcset || ''}`)) {
        emitModule(detectedModule(NuxtImage, {
          version: null,
          certainty: 'confirmed',
          confidence: 9,
          source: 'html',
          signals: ['html:nuxt-image-ipx'],
        }))
      }
    },
  ],
  jsFingerprints: [
    moduleJsFingerprint(NuxtImage, { signal: 'js:nuxt-image', re: /\/_ipx\/|@nuxt\/image|#image\/provider/ }),
  ],
})

export const nuxtFontsModuleDetector = defineModuleDetector(NuxtFonts, {
  htmlDetectors: [
    ({ nodeName, resource, text, emitModule }) => {
      if ((nodeName === 'style' && FONTS_ASSET_RE.test(text)) || (resource?.href && FONTS_ASSET_RE.test(resource.href))) {
        emitModule(detectedModule(NuxtFonts, {
          version: null,
          certainty: 'confirmed',
          confidence: 8,
          source: 'html',
          signals: ['html:nuxt-fonts-asset'],
        }))
      }
    },
  ],
})

export const nuxtIconModuleDetector = defineModuleDetector(NuxtIcon, {
  htmlDetectors: [
    ({ attributes, emitModule }) => {
      if (attributes.class
        && ICON_NUXT_CLASS_RE.test(attributes.class)
        && ICON_NUXT_CSS_PREFIX_RE.test(attributes.class)
        && !attributes.class.includes('iconify--')) {
        emitModule(detectedModule(NuxtIcon, {
          version: null,
          certainty: 'inferred',
          confidence: 6,
          source: 'html',
          signals: ['html:nuxt-icon-iconify-class'],
        }))
      }
    },
  ],
  jsFingerprints: [
    moduleJsFingerprint(NuxtIcon, { signal: 'js:nuxt-icon', re: /\/api\/_nuxt_icon|@nuxt\/icon/ }),
  ],
})

export const nuxtContentModuleDetector = defineModuleDetector(NuxtContent, {
  jsFingerprints: [
    moduleJsFingerprint(NuxtContent, { signal: 'js:nuxt-content', re: /\/__nuxt_content\/|@nuxt\/content|queryCollection|\/api\/_content\// }),
  ],
  endpointProbes: [
    {
      path: '/__nuxt_content/content/sql_dump.txt',
      base: 'origin',
      detect: ({ body, emitModule }) => {
        if (!HTML_DOC_RE.test(body)) {
          emitModule(detectedModule(NuxtContent, {
            version: null,
            certainty: 'confirmed',
            confidence: 10,
            source: 'endpoint',
            signals: ['endpoint:nuxt-content-sql-dump'],
          }))
        }
      },
    },
    {
      path: '/api/_content/cache.json',
      base: 'origin',
      detect: ({ isJsonLikeResponse, emitModule }) => {
        if (isJsonLikeResponse()) {
          emitModule(detectedModule(NuxtContent, {
            version: null,
            certainty: 'confirmed',
            confidence: 10,
            source: 'endpoint',
            signals: ['endpoint:nuxt-content-cache'],
          }))
        }
      },
    },
  ],
})

export const nuxtUiModuleDetector = defineModuleDetector(NuxtUi, {
  htmlDetectors: [
    ({ nodeName, attributes, emitModule }) => {
      if (nodeName === 'style' && (attributes.id === 'nuxt-ui-colors' || 'data-nuxt-ui-colors' in attributes)) {
        emitModule(detectedModule(NuxtUi, {
          version: null,
          certainty: 'confirmed',
          confidence: 10,
          source: 'html',
          signals: ['html:nuxt-ui-colors'],
        }))
      }
    },
  ],
  jsFingerprints: [
    moduleJsFingerprint(NuxtUi, { signal: 'js:nuxt-ui', re: /nuxt-ui-colors|@nuxt\/ui\b/ }),
  ],
})

export const officialNuxtModuleDetectors = [
  nuxtScriptsModuleDetector,
  nuxtImageModuleDetector,
  nuxtFontsModuleDetector,
  nuxtIconModuleDetector,
  nuxtContentModuleDetector,
  nuxtUiModuleDetector,
] as const satisfies readonly ModuleDetectorPreset[]
