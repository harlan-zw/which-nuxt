import type { DetectOptions, ModuleDetectorPreset, ModuleEndpointProbe } from '../types.ts'
import { joinURL } from 'ufo'
import { fetchTargetText } from '../request.ts'
import { createDetectionEvidence } from './signals.ts'

// Nuxt-specific tokens for a devalue-serialized payload. Bare `data`/`serverRendered`
// were too loose: any catch-all 200 JSON route (e.g. a soft-404 `{"data":null,...}`)
// matched and falsely scored the site toward the Nuxt threshold.
const NUXT_PAYLOAD_RE = /\bprerenderedAt\b|"_errors"|"_server_errors"|\["(?:Shallow)?Reactive"|\["NuxtError"/
const VERSION_PROP_RE = /\bversion["']?\s*[:=]\s*["']([^"',\s]+)["']/i
const VERSION_RE = /\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/

interface EndpointProbeResponse {
  body: string
  status: number
  contentType: string | null
}

interface EndpointProbeRunner {
  url: string
  detect: (response: EndpointProbeResponse) => void
}

export interface EndpointProbeOptions {
  moduleDetectors?: readonly ModuleDetectorPreset[]
}

function moduleVersion(body: string) {
  return body.match(VERSION_PROP_RE)?.[1]
    || body.match(VERSION_RE)?.[0]
    || null
}

function isJsonLikeResponse(response: { body: string, contentType: string | null }) {
  const trimmed = response.body.trimStart()
  return response.contentType?.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')
}

function moduleProbeUrl(baseUrl: string, origin: string, probe: ModuleEndpointProbe) {
  return joinURL(probe.base === 'origin' ? origin : baseUrl, probe.path)
}

export async function probeNuxtEndpoints(baseUrl: string, options: DetectOptions, probeOptions: EndpointProbeOptions = {}) {
  const evidence = createDetectionEvidence()
  const errors: string[] = []

  let origin: string
  try {
    origin = new URL(baseUrl).origin
  }
  catch {
    return {
      signals: evidence.signals,
      packages: evidence.packages,
      modules: evidence.modules,
      errors,
    }
  }

  const probes: EndpointProbeRunner[] = [
    {
      url: joinURL(origin, '/_nuxt/builds/latest.json'),
      detect: () => {
        evidence.addSignal('endpoint:nuxt-build-latest', 5, 'endpoint', 'Fetched /_nuxt/builds/latest.json successfully.')
        evidence.emitPackage({
          name: 'nuxt',
          version: null,
          confidence: 7,
          source: 'endpoint',
          signals: ['endpoint:nuxt-build-latest'],
        })
      },
    },
    {
      url: joinURL(baseUrl, '/_payload.json'),
      detect: (response) => {
        if (!isJsonLikeResponse(response) || !NUXT_PAYLOAD_RE.test(response.body))
          return

        evidence.addSignal('endpoint:nuxt-payload', 4, 'payload', 'Fetched a route _payload.json successfully.')
        evidence.emitPackage({
          name: 'nuxt',
          version: null,
          confidence: 6,
          source: 'payload',
          signals: ['endpoint:nuxt-payload'],
        })
      },
    },
  ]

  for (const detectorPreset of probeOptions.moduleDetectors || []) {
    for (const probe of detectorPreset.endpointProbes || []) {
      probes.push({
        url: moduleProbeUrl(baseUrl, origin, probe),
        detect: response => probe.detect({
          url: moduleProbeUrl(baseUrl, origin, probe),
          body: response.body,
          status: response.status,
          contentType: response.contentType,
          isJsonLikeResponse: () => isJsonLikeResponse(response),
          moduleVersion: () => moduleVersion(response.body),
          emitModule: evidence.emitModule,
          emitPackage: evidence.emitPackage,
        }),
      })
    }
  }

  async function probeUrl(probe: EndpointProbeRunner) {
    try {
      const response = await fetchTargetText(probe.url, options)
      if (response.status < 200 || response.status >= 300)
        return

      probe.detect({
        body: response.body,
        status: response.status,
        contentType: response.contentType,
      })
    }
    catch (error) {
      errors.push(`${probe.url}: ${(error as Error).message}`)
    }
  }

  await Promise.all(probes.map(probe => probeUrl(probe)))

  return {
    signals: evidence.signals,
    packages: evidence.packages,
    modules: evidence.modules,
    errors,
  }
}
