import type { DetectedModule, DetectedPackage, DetectionSignal, ModuleDetectorPreset } from '../types.ts'
import { createDetectionEvidence } from './signals.ts'

const VERSION_RE = /\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/g
const PACKAGE_VERSION_COMMENT_RE = /\/\*\*?\s*(?:\*\s*)?(@?[\w.-]+(?:\/[\w.-]+)?)\s+v(\d+\.\d+\.\d+(?:-[\w.-]+)?)\s*\*\//g
const PACKAGE_VERSION_BANNER_RE = /\/\*![\s\S]{0,800}?\b((?:@[\w.-]+\/)?[\w.-]+)\s+v(\d+\.\d+\.\d+(?:-[\w.-]+)?)/g
// Nuxt 3 minifies the literal with double quotes; Nuxt 4 builds emit a template literal.
const NUXT_GETTER_VERSION_RE = /get\s+nuxt\(\)\s*\{\s*return\s*(["'`])(\d+\.\d+\.\d+(?:-[\w.-]+)?)\1\s*\}/
const NUXT_RUNTIME_RE = /\bdefineNuxtPlugin\b|\buseNuxtApp\b|\bcreateNuxtApp\b|\b__NUXT__\b/
const NUXT_218_RELOAD_GUARD_RE = /try\{[^{}]{0,160}parseInt\(window\.sessionStorage\.getItem\("nuxt-reload"\)\)[\s\S]{0,240}\}catch\([^)]*\)\{\}/
// Vue 3 stores its version on the createApp object: `{_uid:X++,_component:e,...,version:Fs}`
// with `Fs="3.5.42"` declared elsewhere in the chunk.
const VUE_CREATE_APP_VERSION_ID_RE = /_uid:[\w$]+\+\+,_component:[\s\S]{0,300}?version:([\w$]+)/
const VUE_VERSION_NEEDLE_RE = /\bvue\b|\bcreateApp\b|\bcreateSSRApp\b/gi

export interface JsScanOptions {
  heuristicBytes?: number
  moduleDetectors?: readonly ModuleDetectorPreset[]
}

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

function isPlausibleNuxtVersion(version: string) {
  const major = Number(version.split('.')[0])
  return major >= 1 && major <= 5
}

function escapeRegExp(value: string) {
  return value.replace(/\$/g, '\\$&')
}

function vueCreateAppVersion(js: string) {
  const id = js.match(VUE_CREATE_APP_VERSION_ID_RE)?.[1]
  if (!id)
    return null

  const literal = new RegExp(`[,;{\\s(]${escapeRegExp(id)}=(["'\`])(\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?)\\1`)
  return js.match(literal)?.[2] || null
}

function isPlausibleVueVersion(version: string) {
  const major = Number(version.split('.')[0])
  return major >= 2 && major <= 3
}

function normalizePackageName(name: string) {
  return name === 'Vue.js' ? 'vue' : name
}

export function scanJs(js: string, options: JsScanOptions = {}): { signals: DetectionSignal[], packages: DetectedPackage[], modules: DetectedModule[] } {
  const evidence = createDetectionEvidence()
  // Precise, low-false-positive matchers (the version getter, banner/comment
  // version tags, module fingerprints) run on the full chunk. The fuzzy
  // version-near-needle heuristics run on a bounded prefix to cap cost and avoid
  // grabbing unrelated version strings from deep inside vendor code.
  const heuristicJs = options.heuristicBytes && options.heuristicBytes < js.length
    ? js.slice(0, options.heuristicBytes)
    : js
  const nuxtGetterVersion = js.match(NUXT_GETTER_VERSION_RE)?.[2] || null

  for (const match of js.matchAll(PACKAGE_VERSION_COMMENT_RE)) {
    const name = match[1] ? normalizePackageName(match[1]) : undefined
    const version = match[2]
    if (!name || !version)
      continue

    evidence.emitPackage({
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

    evidence.emitPackage({
      name,
      version,
      confidence: 10,
      source: 'js',
      signals: ['js:package-version-banner'],
    })
  }

  if (NUXT_RUNTIME_RE.test(js)) {
    evidence.addSignal('js:nuxt-runtime-api', 4, 'js', 'Found Nuxt runtime API in JavaScript.')
    evidence.emitPackage({
      name: 'nuxt',
      version: null,
      confidence: 6,
      source: 'js',
      signals: ['js:nuxt-runtime-api'],
    })
  }

  if (NUXT_218_RELOAD_GUARD_RE.test(js)) {
    evidence.addSignal('js:nuxt-2-18-reload-guard', 4, 'inferred', 'Found Nuxt 2.18 chunk reload sessionStorage guard.')
    evidence.emitPackage({
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
    evidence.addSignal('js:nuxt-getter-version', 8, 'js', 'Found exact Nuxt version getter in JavaScript.')
    evidence.emitPackage({
      name: 'nuxt',
      version: nuxtGetterVersion,
      confidence: 10,
      source: 'js',
      signals: ['js:nuxt-getter-version'],
    })
  }

  for (const detectorPreset of options.moduleDetectors || []) {
    for (const fingerprint of detectorPreset.jsFingerprints || []) {
      fingerprint.re.lastIndex = 0
      if (!fingerprint.re.test(js))
        continue

      const version = fingerprint.version?.(js) || null
      const certainty = typeof fingerprint.certainty === 'function'
        ? fingerprint.certainty(version)
        : fingerprint.certainty || (version ? 'confirmed' : 'inferred')
      const confidence = typeof fingerprint.confidence === 'function'
        ? fingerprint.confidence(version)
        : fingerprint.confidence ?? (version ? 9 : 6)

      evidence.emitModule({
        name: fingerprint.name,
        packageName: fingerprint.packageName,
        version,
        certainty,
        confidence,
        source: 'js',
        signals: [fingerprint.signal],
      })

      if (version) {
        evidence.emitPackage({
          name: fingerprint.packageName,
          version,
          confidence,
          source: 'js',
          signals: [fingerprint.packageSignal || fingerprint.signal],
        })
      }
    }
  }

  // No fuzzy "version near a nuxt token" fallback: it attributed unrelated SDK versions
  // (nuxt.com read as Nuxt 2.0.1), which would report a false end-of-life major.
  // Exclude the Nuxt getter literal: the runtime emits
  // `versions:{get nuxt(){return"X"},get vue(){return app.version}}`, where the vue
  // getter returns an expression, so the literal nearest the vue needle is Nuxt's, not
  // Vue's. Attributing it to vue produced false positives (vue === nuxt version).
  const vueCreateApp = vueCreateAppVersion(js)
  const vueVersion = (vueCreateApp && isPlausibleVueVersion(vueCreateApp) ? vueCreateApp : null)
    || versionsNearNeedle(heuristicJs, VUE_VERSION_NEEDLE_RE)
      .find(version => version !== nuxtGetterVersion && isPlausibleVueVersion(version))
      || null
  if (vueVersion) {
    evidence.emitPackage({
      name: 'vue',
      version: vueVersion,
      confidence: 6,
      source: 'js',
      signals: ['js:vue-version'],
    })
  }

  return {
    signals: evidence.signals,
    packages: evidence.packages,
    modules: evidence.modules,
  }
}
