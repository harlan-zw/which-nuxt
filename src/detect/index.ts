import type { DetectedModule, DetectedPackage, DetectInput, DetectOptions, DetectResult } from '../types.ts'
import { defu } from 'defu'
import { createDetectCacheArtifact, createDetectCacheKey, readDetectCacheArtifact } from './cache.ts'
import { probeNuxtEndpoints } from './endpoints.ts'
import { fetchScriptText, fetchText } from './fetch.ts'
import { analyzeHosting } from './hosting.ts'
import { scanHtml } from './html.ts'
import { scanJs } from './js.ts'
import { mergeSignals, NUXT_CONFIDENCE_THRESHOLD, signalConfidence, upsertModule, upsertPackage } from './signals.ts'

const HTTP_URL_RE = /^https?:\/\//i

function isUrl(value: string) {
  return HTTP_URL_RE.test(value)
}

async function resolveInput(input: DetectInput, options: DetectOptions) {
  if (typeof input === 'object' && !(input instanceof URL) && 'html' in input) {
    return {
      html: input.html,
      url: input.url || options.url || null,
      finalUrl: input.finalUrl || input.url || options.url || null,
      headers: input.headers || {},
      errors: [] as string[],
    }
  }

  const url = input instanceof URL ? input.toString() : input
  if (typeof url === 'string' && isUrl(url)) {
    const response = await fetchText(url, options)
    return {
      html: response.body,
      url,
      finalUrl: response.finalUrl,
      headers: response.headers,
      errors: [] as string[],
    }
  }

  return {
    html: String(input),
    url: options.url || null,
    finalUrl: options.url || null,
    headers: {},
    errors: [] as string[],
  }
}

function mergePackages(...groups: DetectedPackage[][]) {
  const packages: DetectedPackage[] = []
  for (const group of groups) {
    for (const pkg of group)
      upsertPackage(packages, pkg)
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name))
}

function mergeModules(...groups: DetectedModule[][]) {
  const modules: DetectedModule[] = []
  for (const group of groups) {
    for (const module of group)
      upsertModule(modules, module)
  }

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
    upsertModule(modules, {
      name: 'Nuxt SEO',
      packageName: '@nuxtjs/seo',
      version: null,
      certainty: 'inferred',
      confidence: Math.min(detectedSeoChildren.length * 2, 8),
      source: 'inferred',
      signals: detectedSeoChildren.map(module => `inferred:${module.packageName}`),
    })
  }

  return modules.sort((a, b) => a.packageName.localeCompare(b.packageName))
}

export async function detectNuxt(input: DetectInput, detectOptions: DetectOptions = {}): Promise<DetectResult> {
  const options = defu(detectOptions, {
    scanJs: true,
    probeEndpoints: true,
    hosting: true,
    domainAge: false,
    maxJsRequests: 2,
    maxJsBytes: 300_000,
    timeout: 8000,
  } satisfies DetectOptions)
  const cacheKey = options.cache ? createDetectCacheKey(input, options) : null

  if (options.cache && !options.cacheBust && cacheKey) {
    const cached = readDetectCacheArtifact(await options.cache.getItem(cacheKey), options)
    if (cached) {
      return {
        ...cached,
        cache: {
          ...cached.cache!,
          key: cacheKey,
        },
      }
    }
  }

  const errors: string[] = []
  let html: string
  let url: string | null
  let finalUrl: string | null
  let headers: Record<string, string>

  try {
    const resolved = await resolveInput(input, options)
    html = resolved.html
    url = resolved.url
    finalUrl = resolved.finalUrl
    headers = resolved.headers
    errors.push(...resolved.errors)
  }
  catch (error) {
    return {
      isNuxt: false,
      confidence: 0,
      packages: [],
      modules: [],
      signals: [],
      url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url || null,
      finalUrl: null,
      title: null,
      rendering: {
        mode: 'unknown',
        confidence: 0,
        signals: [],
      },
      hosting: null,
      cache: cacheKey
        ? {
            key: cacheKey,
            hit: false,
            age: null,
          }
        : null,
      incomplete: true,
      errors: [(error as Error).message],
    }
  }

  const htmlScan = scanHtml(html, finalUrl || url)
  const signalGroups = [htmlScan.signals]
  const packageGroups = [htmlScan.packages]
  const moduleGroups = [htmlScan.modules]

  if (options.probeEndpoints && (finalUrl || url)) {
    const endpointScan = await probeNuxtEndpoints(finalUrl || url!, options)
    signalGroups.push(endpointScan.signals)
    packageGroups.push(endpointScan.packages)
    moduleGroups.push(endpointScan.modules)
    errors.push(...endpointScan.errors)
  }

  if (options.scanJs && (finalUrl || url)) {
    const scriptUrls = htmlScan.scripts
      .map(script => script.src)
      .filter((src): src is string => !!src && (src.includes('/_nuxt/') || src.startsWith(finalUrl || url!)))
      .slice(0, options.maxJsRequests)

    for (const scriptUrl of scriptUrls) {
      try {
        const js = await fetchScriptText(scriptUrl, options)
        const jsScan = scanJs(js, { heuristicBytes: options.maxJsBytes })
        signalGroups.push(jsScan.signals)
        packageGroups.push(jsScan.packages)
        moduleGroups.push(jsScan.modules)
      }
      catch (error) {
        errors.push(`${scriptUrl}: ${(error as Error).message}`)
      }
    }
  }

  const signals = mergeSignals(...signalGroups)
  const packages = mergePackages(...packageGroups)
  const modules = mergeModules(...moduleGroups)
  const confidence = signalConfidence(signals)
  const hosting = options.hosting
    ? await analyzeHosting(finalUrl || url, headers, options)
    : { hosting: null, errors: [] }
  errors.push(...hosting.errors)

  const result: DetectResult = {
    isNuxt: confidence >= NUXT_CONFIDENCE_THRESHOLD,
    confidence,
    packages,
    modules,
    signals,
    url,
    finalUrl,
    title: htmlScan.title,
    rendering: htmlScan.rendering,
    hosting: hosting.hosting,
    cache: cacheKey
      ? {
          key: cacheKey,
          hit: false,
          age: null,
        }
      : null,
    incomplete: errors.length > 0,
    errors,
  }

  if (options.cache && cacheKey)
    await options.cache.setItem(cacheKey, createDetectCacheArtifact(result))

  return result
}
