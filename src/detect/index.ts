import type { DetectInput, DetectOptions, DetectResult, ModuleDetectorPreset } from '../types.ts'
import { defu } from 'defu'
import { fetchTargetScriptText, fetchTargetText } from '../request.ts'
import { createDetectCacheArtifact, createDetectCacheKey, readDetectCacheArtifact } from './cache.ts'
import { probeNuxtEndpoints } from './endpoints.ts'
import { scanHeaders } from './headers.ts'
import { analyzeHosting } from './hosting.ts'
import { scanHtml } from './html.ts'
import { scanJs } from './js.ts'
import { createDetectionEvidence, NUXT_CONFIDENCE_THRESHOLD, signalConfidence } from './signals.ts'

const HTTP_URL_RE = /^https?:\/\//i
const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i
const LOCALHOST_RE = /^localhost(?::\d{1,5})?(?:[/?#]\S*)?$/i

function isUrl(value: string) {
  return HTTP_URL_RE.test(value)
}

function isHostname(value: string) {
  return HOSTNAME_RE.test(value) || LOCALHOST_RE.test(value)
}

function lowerCaseHeaders(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]))
}

async function resolveInput(input: DetectInput, options: DetectOptions) {
  if (typeof input === 'object' && !(input instanceof URL) && 'html' in input) {
    return {
      html: input.html,
      url: input.url || options.url || null,
      finalUrl: input.finalUrl || input.url || options.url || null,
      headers: lowerCaseHeaders(input.headers || {}),
      errors: [] as string[],
    }
  }

  const requested = input instanceof URL ? input.toString() : input
  const url = typeof requested === 'string' && !isUrl(requested) && isHostname(requested)
    ? `https://${requested}`
    : requested
  if (typeof url === 'string' && isUrl(url)) {
    const response = await fetchTargetText(url, options)
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

async function resolveModuleDetectors(options: DetectOptions): Promise<readonly ModuleDetectorPreset[]> {
  if (options.moduleDetectors === false)
    return []

  if (options.moduleDetectors)
    return options.moduleDetectors

  const { nuxtModuleDetectors } = await import('../modules/index.ts')
  return nuxtModuleDetectors
}

const WHITESPACE_RE = /\s+/

function isModulePreload(rel: string | undefined) {
  return !!rel && rel.split(WHITESPACE_RE).includes('modulepreload')
}

export async function detectNuxt(input: DetectInput, detectOptions: DetectOptions = {}): Promise<DetectResult> {
  const options = defu(detectOptions, {
    scanJs: true,
    probeEndpoints: true,
    hosting: true,
    domainAge: false,
    maxJsRequests: 4,
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

  const moduleDetectors = await resolveModuleDetectors(options)
  const evidence = createDetectionEvidence()
  const htmlScan = scanHtml(html, finalUrl || url, { moduleDetectors })
  evidence.merge(htmlScan)
  evidence.merge(scanHeaders(headers, { moduleDetectors }))

  if (options.probeEndpoints && (finalUrl || url)) {
    const endpointScan = await probeNuxtEndpoints(finalUrl || url!, options, { moduleDetectors })
    evidence.merge(endpointScan)
    errors.push(...endpointScan.errors)
  }

  if (options.scanJs && (finalUrl || url)) {
    // The Nuxt version getter lives in the entry chunk or one of its modulepreload
    // siblings, so scan entry scripts first, then preloads, and stop once both versions are known.
    const isOwnScript = (src: string | undefined): src is string => !!src && (src.includes('/_nuxt/') || src.startsWith(finalUrl || url!))
    const scriptUrls = Array.from(new Set([
      ...htmlScan.scripts.map(script => script.src),
      ...htmlScan.links.filter(link => isModulePreload(link.rel)).map(link => link.href),
    ].filter(isOwnScript))).slice(0, options.maxJsRequests)

    for (const scriptUrl of scriptUrls) {
      try {
        const js = await fetchTargetScriptText(scriptUrl, options)
        const jsScan = scanJs(js, { heuristicBytes: options.maxJsBytes, moduleDetectors })
        evidence.merge(jsScan)
        const packages = evidence.packages
        if (packages.some(pkg => pkg.name === 'nuxt' && pkg.version) && packages.some(pkg => pkg.name === 'vue' && pkg.version))
          break
      }
      catch (error) {
        errors.push(`${scriptUrl}: ${(error as Error).message}`)
      }
    }
  }

  for (const detectorPreset of moduleDetectors) {
    detectorPreset.inferModules?.({
      modules: evidence.modules,
      emitModule: evidence.emitModule,
    })
  }

  const signals = evidence.signals
  const packages = evidence.packages.sort((a, b) => a.name.localeCompare(b.name))
  const modules = evidence.modules.sort((a, b) => a.packageName.localeCompare(b.packageName))
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

  if (options.cache && cacheKey && !result.incomplete)
    await options.cache.setItem(cacheKey, createDetectCacheArtifact(result))

  return result
}
