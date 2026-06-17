import type { DetectedModule, DetectedPackage, DetectionSignal } from '../types.ts'
import { addSignal, upsertModule, upsertPackage } from './signals.ts'

const VERSION_RE = /\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/g
const PACKAGE_VERSION_COMMENT_RE = /\/\*\*?\s*(?:\*\s*)?(@?[\w.-]+(?:\/[\w.-]+)?)\s+v(\d+\.\d+\.\d+(?:-[\w.-]+)?)\s*\*\//g
const PACKAGE_VERSION_BANNER_RE = /\/\*![\s\S]{0,800}?\b((?:@[\w.-]+\/)?[\w.-]+)\s+v(\d+\.\d+\.\d+(?:-[\w.-]+)?)/g
const NUXT_GETTER_VERSION_RE = /get\s+nuxt\(\)\s*\{\s*return\s*"([^"]+)"\s*\}/
const NUXT_RUNTIME_RE = /\bdefineNuxtPlugin\b|\buseNuxtApp\b|\bcreateNuxtApp\b|\b__NUXT__\b/
const NUXT_218_RELOAD_GUARD_RE = /try\{[^{}]{0,160}parseInt\(window\.sessionStorage\.getItem\("nuxt-reload"\)\)[\s\S]{0,240}\}catch\([^)]*\)\{\}/
const NUXT_VERSION_NEEDLE_RE = /\bnuxt\b|\b_Nuxt[A-Z]|\bcreateNuxtApp\b/gi
const VUE_VERSION_NEEDLE_RE = /\bvue\b|\bcreateApp\b|\bcreateSSRApp\b/gi
const SEO_UTILS_VERSION_RE = /nuxt-seo-utils-version["']?\s*[:=]\s*["']([^"']+)["']/

const MODULE_JS_FINGERPRINTS = [
  { name: 'Nuxt Schema.org', packageName: 'nuxt-schema-org', signal: 'js:nuxt-schema-org', re: /nuxt-schema-org|#schema-org|schema-org:meta|data-nuxt-schema-org/ },
  { name: 'Nuxt OG Image', packageName: 'nuxt-og-image', signal: 'js:nuxt-og-image', re: /nuxt-og-image|defineOgImage|\/_og\/[a-z]\/|\/__og-image__\// },
  { name: 'Nuxt Sitemap', packageName: '@nuxtjs/sitemap', signal: 'js:nuxt-sitemap', re: /__sitemap__|@nuxtjs\/sitemap|sitemap:urls/ },
  { name: 'Nuxt Robots', packageName: '@nuxtjs/robots', signal: 'js:nuxt-robots', re: /nuxt-robots|@nuxtjs\/robots|robots:bot-context|useRobotsRule/ },
  { name: 'Nuxt Site Config', packageName: 'nuxt-site-config', signal: 'js:nuxt-site-config', re: /nuxt-site-config|#site-config|useSiteConfig|site-config-stack/ },
  { name: 'Nuxt SEO Utils', packageName: 'nuxt-seo-utils', signal: 'js:nuxt-seo-utils', re: /nuxt-seo-utils|seo-utils|useSeoMeta|useBreadcrumbItems|useShareLinks/ },
  { name: 'Nuxt Link Checker', packageName: 'nuxt-link-checker', signal: 'js:nuxt-link-checker', re: /nuxt-link-checker|__link-checker__|link-checker:links/ },
  { name: 'Nuxt AI Ready', packageName: 'nuxt-ai-ready', signal: 'js:nuxt-ai-ready', re: /nuxt-ai-ready|__ai-ready|llms-full\.txt|llms\.txt/ },
  { name: 'Nuxt Scripts', packageName: 'nuxt-scripts', signal: 'js:nuxt-scripts', re: /nuxt-scripts|useScript|script-registry/ },
]

function versionsNearNeedle(js: string, needle: RegExp): string[] {
  const matches = new Set<string>()
  for (const match of js.matchAll(needle)) {
    const index = match.index || 0
    const window = js.slice(Math.max(0, index - 160), index + 240)
    for (const version of window.matchAll(VERSION_RE))
      matches.add(version[0])
  }
  return Array.from(matches)
}

function firstVersionNear(js: string, needle: RegExp) {
  return versionsNearNeedle(js, needle)[0] || null
}

function isPlausibleNuxtVersion(version: string) {
  const major = Number(version.split('.')[0])
  return major >= 1 && major <= 4
}

function isPlausibleVueVersion(version: string) {
  const major = Number(version.split('.')[0])
  return major >= 2 && major <= 3
}

function normalizePackageName(name: string) {
  return name === 'Vue.js' ? 'vue' : name
}

export function scanJs(js: string, options: { heuristicBytes?: number } = {}): { signals: DetectionSignal[], packages: DetectedPackage[], modules: DetectedModule[] } {
  const signals: DetectionSignal[] = []
  const packages: DetectedPackage[] = []
  const modules: DetectedModule[] = []
  // Precise, low-false-positive matchers (the version getter, banner/comment
  // version tags, module fingerprints) run on the full chunk. The fuzzy
  // version-near-needle heuristics run on a bounded prefix to cap cost and avoid
  // grabbing unrelated version strings from deep inside vendor code.
  const heuristicJs = options.heuristicBytes && options.heuristicBytes < js.length
    ? js.slice(0, options.heuristicBytes)
    : js
  const nuxtGetterVersion = js.match(NUXT_GETTER_VERSION_RE)?.[1] || null
  const seoUtilsVersion = js.match(SEO_UTILS_VERSION_RE)?.[1] || null

  for (const match of js.matchAll(PACKAGE_VERSION_COMMENT_RE)) {
    const name = match[1] ? normalizePackageName(match[1]) : undefined
    const version = match[2]
    if (!name || !version)
      continue

    upsertPackage(packages, {
      name,
      version,
      confidence: 10,
      source: 'js',
      signals: ['js:package-version-comment'],
    })
  }

  for (const match of js.matchAll(PACKAGE_VERSION_BANNER_RE)) {
    const name = match[1] ? normalizePackageName(match[1]) : undefined
    const version = match[2]
    if (!name || !version)
      continue

    upsertPackage(packages, {
      name,
      version,
      confidence: 10,
      source: 'js',
      signals: ['js:package-version-banner'],
    })
  }

  if (NUXT_RUNTIME_RE.test(js)) {
    addSignal(signals, 'js:nuxt-runtime-api', 4, 'js', 'Found Nuxt runtime API in JavaScript.')
    upsertPackage(packages, {
      name: 'nuxt',
      version: null,
      confidence: 6,
      source: 'js',
      signals: ['js:nuxt-runtime-api'],
    })
  }

  if (NUXT_218_RELOAD_GUARD_RE.test(js)) {
    addSignal(signals, 'js:nuxt-2-18-reload-guard', 4, 'inferred', 'Found Nuxt 2.18 chunk reload sessionStorage guard.')
    upsertPackage(packages, {
      name: 'nuxt',
      version: null,
      versionRange: '>=2.18.0 <=2.18.1',
      certainty: 'inferred',
      confidence: 7,
      source: 'inferred',
      signals: ['js:nuxt-2-18-reload-guard'],
    })
  }

  if (nuxtGetterVersion && isPlausibleNuxtVersion(nuxtGetterVersion)) {
    addSignal(signals, 'js:nuxt-getter-version', 8, 'js', 'Found exact Nuxt version getter in JavaScript.')
    upsertPackage(packages, {
      name: 'nuxt',
      version: nuxtGetterVersion,
      confidence: 10,
      source: 'js',
      signals: ['js:nuxt-getter-version'],
    })
  }

  for (const fingerprint of MODULE_JS_FINGERPRINTS) {
    if (!fingerprint.re.test(js))
      continue

    upsertModule(modules, {
      name: fingerprint.name,
      packageName: fingerprint.packageName,
      version: fingerprint.packageName === 'nuxt-seo-utils' ? seoUtilsVersion : null,
      certainty: fingerprint.packageName === 'nuxt-seo-utils' && seoUtilsVersion ? 'confirmed' : 'inferred',
      confidence: fingerprint.packageName === 'nuxt-seo-utils' && seoUtilsVersion ? 9 : 6,
      source: 'js',
      signals: [fingerprint.signal],
    })

    if (fingerprint.packageName === 'nuxt-seo-utils' && seoUtilsVersion) {
      upsertPackage(packages, {
        name: 'nuxt-seo-utils',
        version: seoUtilsVersion,
        confidence: 9,
        source: 'js',
        signals: ['js:nuxt-seo-utils-version'],
      })
    }
  }

  const nuxtVersion = nuxtGetterVersion || firstVersionNear(heuristicJs, NUXT_VERSION_NEEDLE_RE)
  if (nuxtVersion && isPlausibleNuxtVersion(nuxtVersion)) {
    addSignal(signals, 'js:nuxt-version', 6, 'js', 'Found Nuxt-adjacent version string in JavaScript.')
    upsertPackage(packages, {
      name: 'nuxt',
      version: nuxtVersion,
      confidence: 9,
      source: 'js',
      signals: ['js:nuxt-version'],
    })
  }

  // Exclude the Nuxt getter literal: the runtime emits
  // `versions:{get nuxt(){return"X"},get vue(){return app.version}}`, where the vue
  // getter returns an expression, so the literal nearest the vue needle is Nuxt's, not
  // Vue's. Attributing it to vue produced false positives (vue === nuxt version).
  const vueVersion = versionsNearNeedle(heuristicJs, VUE_VERSION_NEEDLE_RE)
    .find(version => version !== nuxtGetterVersion && isPlausibleVueVersion(version)) || null
  if (vueVersion) {
    upsertPackage(packages, {
      name: 'vue',
      version: vueVersion,
      confidence: 6,
      source: 'js',
      signals: ['js:vue-version'],
    })
  }

  return { signals, packages, modules }
}
