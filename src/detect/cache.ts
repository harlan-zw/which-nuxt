import type { DetectCacheArtifact, DetectInput, DetectOptions, DetectResult } from '../types.ts'
import { hash } from 'ohash'

const CACHE_ARTIFACT_VERSION = 2

function inputFingerprint(input: DetectInput, options: DetectOptions) {
  if (options.cacheKey)
    return options.cacheKey

  if (input instanceof URL)
    return input.toString()

  if (typeof input === 'string')
    return input

  return {
    url: input.url || options.url || null,
    finalUrl: input.finalUrl || null,
    html: input.html,
    headers: input.headers || {},
  }
}

export function createDetectCacheKey(input: DetectInput, options: DetectOptions) {
  const namespace = options.cacheNamespace || 'which-nuxt:detect'
  const key = hash({
    input: inputFingerprint(input, options),
    options: {
      url: options.url,
      scanJs: options.scanJs,
      probeEndpoints: options.probeEndpoints,
      maxJsRequests: options.maxJsRequests,
      maxJsBytes: options.maxJsBytes,
      hosting: options.hosting,
      domainAge: options.domainAge,
    },
  })
  return `${namespace}:${key}`
}

export function createDetectCacheArtifact(result: DetectResult): DetectCacheArtifact {
  return {
    version: CACHE_ARTIFACT_VERSION,
    createdAt: Date.now(),
    result: {
      ...result,
      cache: null,
    },
  }
}

export function readDetectCacheArtifact(artifact: DetectCacheArtifact | null, options: DetectOptions): DetectResult | null {
  if (!artifact || artifact.version !== CACHE_ARTIFACT_VERSION)
    return null

  const age = Date.now() - artifact.createdAt
  if (typeof options.cacheMaxAge === 'number' && age > options.cacheMaxAge)
    return null

  return {
    ...artifact.result,
    cache: {
      key: '',
      hit: true,
      age,
    },
  }
}
