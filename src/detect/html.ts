import type { DetectedModule, DetectedPackage, DetectionSignal, RenderingResult, RenderingSignal } from '../types.ts'
import { joinURL, withLeadingSlash } from 'ufo'
import { ELEMENT_NODE, parse, walkSync } from 'ultrahtml'
import { addSignal, signalConfidence, upsertModule, upsertPackage } from './signals.ts'

const NUXT_PATH_RE = /\/_nuxt(?:\/|$)/
const NUXT_GENERATOR_RE = /\bnuxt\b/i
const NUXT_GENERATOR_VERSION_RE = /\bnuxt\s+v?(\d+\.\d+\.\d+(?:-[\w.-]+)?)/i
const WINDOW_NUXT_RE = /\bwindow\.__NUXT__\b/
const SERVER_RENDERED_TRUE_RE = /\bserverRendered["']?\s*[:=]\s*true\b/
const SERVER_RENDERED_FALSE_RE = /\bserverRendered["']?\s*[:=]\s*false\b/
const PRERENDERED_AT_RE = /\bprerenderedAt\b/
const SCHEMA_ORG_CONTEXT_RE = /https?:\/\/schema\.org|["@]context["']?\s*:\s*["']?schema\.org/i
// nuxt-og-image route formats: `/_og/<type>/…` in v6+, `/__og-image__/…` before that.
const OG_IMAGE_ROUTE_RE = /\/_og\/[a-z]\/|\/__og-image__\//i

interface HtmlResource {
  src?: string
  href?: string
  type?: string
  rel?: string
  id?: string
  innerHTML?: string
  attributes: Record<string, string>
}

export interface HtmlScanResult {
  signals: DetectionSignal[]
  packages: DetectedPackage[]
  modules: DetectedModule[]
  scripts: HtmlResource[]
  links: HtmlResource[]
  title: string | null
  rendering: RenderingResult
}

function addRenderingSignal(
  signals: RenderingSignal[],
  mode: RenderingSignal['mode'],
  confidence: number,
  source: RenderingSignal['source'],
  signal: string,
) {
  if (signals.some(existing => existing.mode === mode && existing.signal === signal))
    return
  signals.push({ mode, confidence, source, signal })
}

function resolveRendering(signals: RenderingSignal[]): RenderingResult {
  const scores = new Map<RenderingSignal['mode'], number>()
  for (const signal of signals)
    scores.set(signal.mode, (scores.get(signal.mode) || 0) + signal.confidence)

  const top = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0]

  return {
    mode: top?.[0] || 'unknown',
    confidence: top?.[1] || 0,
    signals,
  }
}

function textContent(node: any): string {
  if (!node?.children)
    return ''

  return node.children.map((child: any) => {
    if (typeof child.value === 'string')
      return child.value
    return textContent(child)
  }).join('')
}

function normalizeResourceUrl(value: string | undefined, baseUrl: string | null): string | undefined {
  if (!value)
    return undefined

  if (!baseUrl)
    return value

  try {
    return new URL(value, baseUrl).toString()
  }
  catch {
    return value
  }
}

function hasNuxtPath(value: string | undefined) {
  return !!value && NUXT_PATH_RE.test(value)
}

function endpointFrom(baseUrl: string | null, path: string) {
  if (!baseUrl)
    return null

  try {
    return joinURL(new URL(baseUrl).origin, withLeadingSlash(path))
  }
  catch {
    return null
  }
}

export function scanHtml(html: string, baseUrl: string | null): HtmlScanResult {
  const ast = parse(html)
  const signals: DetectionSignal[] = []
  const packages: DetectedPackage[] = []
  const modules: DetectedModule[] = []
  const scripts: HtmlResource[] = []
  const links: HtmlResource[] = []
  const renderingSignals: RenderingSignal[] = []
  let title: string | null = null
  let hasLegacyWindowNuxt = false

  walkSync(ast, (node) => {
    if (node.type !== ELEMENT_NODE)
      return

    const name = node.name.toLowerCase()
    const attributes = node.attributes || {}

    if (name === 'html' && 'data-n-head-ssr' in attributes)
      addRenderingSignal(renderingSignals, 'ssr', 7, 'html', 'html[data-n-head-ssr]')

    if (attributes.id === '__nuxt')
      addSignal(signals, 'html:nuxt-root', 3, 'html', 'Found #__nuxt root element.')

    if ('data-nuxt-schema-org' in attributes) {
      upsertModule(modules, {
        name: 'Nuxt Schema.org',
        packageName: 'nuxt-schema-org',
        version: null,
        certainty: 'confirmed',
        confidence: 9,
        source: 'html',
        signals: ['html:data-nuxt-schema-org'],
      })
    }

    if (attributes['data-server-rendered'] === 'true')
      addRenderingSignal(renderingSignals, 'ssr', 7, 'html', '[data-server-rendered=true]')

    if (name === 'title')
      title = textContent(node).trim() || null

    if (name === 'meta') {
      const metaName = attributes.name?.toLowerCase()
      const metaProperty = attributes.property?.toLowerCase()
      const content = attributes.content || ''
      if (metaName === 'generator' && NUXT_GENERATOR_RE.test(content)) {
        addSignal(signals, 'html:generator-nuxt', 4, 'html', 'Found Nuxt generator meta tag.')
        const version = content.match(NUXT_GENERATOR_VERSION_RE)?.[1] || null
        if (version) {
          upsertPackage(packages, {
            name: 'nuxt',
            version,
            confidence: 9,
            source: 'html',
            signals: ['html:generator-nuxt'],
          })
        }
      }

      if ((metaProperty?.startsWith('og:image') || metaName?.startsWith('twitter:image')) && OG_IMAGE_ROUTE_RE.test(content)) {
        upsertModule(modules, {
          name: 'Nuxt OG Image',
          packageName: 'nuxt-og-image',
          version: null,
          certainty: 'confirmed',
          confidence: 9,
          source: 'html',
          signals: ['html:nuxt-og-image-url'],
        })
      }
    }

    if (name === 'script') {
      const resource: HtmlResource = {
        src: normalizeResourceUrl(attributes.src, baseUrl),
        type: attributes.type,
        id: attributes.id,
        attributes,
        innerHTML: textContent(node),
      }
      scripts.push(resource)

      if (resource.id === '__NUXT_DATA__') {
        addSignal(signals, 'html:nuxt-data', 5, 'html', 'Found Nuxt 3/4 __NUXT_DATA__ payload script.')
        if (attributes['data-ssr'] === 'true')
          addRenderingSignal(renderingSignals, 'ssr', 6, 'html', '__NUXT_DATA__ data-ssr=true')

        if (attributes['data-ssr'] === 'false')
          addRenderingSignal(renderingSignals, 'spa', 8, 'html', '__NUXT_DATA__ data-ssr=false')

        if (PRERENDERED_AT_RE.test(resource.innerHTML || ''))
          addRenderingSignal(renderingSignals, 'ssg', 9, 'payload', '__NUXT_DATA__ contains prerenderedAt')

        upsertPackage(packages, {
          name: 'nuxt',
          version: null,
          confidence: 7,
          source: 'html',
          signals: ['html:nuxt-data'],
        })

        if (attributes['data-src']) {
          addSignal(signals, 'html:nuxt-data-src', 2, 'payload', 'Found external Nuxt payload data source.')
          addRenderingSignal(renderingSignals, 'ssg', 4, 'payload', '__NUXT_DATA__ data-src external payload')
          links.push({
            href: normalizeResourceUrl(attributes['data-src'], baseUrl),
            rel: 'nuxt-payload',
            attributes,
          })
        }
      }

      if (resource.id === 'nuxt-og-image-options' || resource.id === 'nuxt-og-image-overrides') {
        upsertModule(modules, {
          name: 'Nuxt OG Image',
          packageName: 'nuxt-og-image',
          version: null,
          certainty: 'confirmed',
          confidence: 10,
          source: 'html',
          signals: [`html:${resource.id}`],
        })
      }

      if (resource.type === 'application/ld+json' && SCHEMA_ORG_CONTEXT_RE.test(resource.innerHTML || '')) {
        upsertModule(modules, {
          name: 'Nuxt Schema.org',
          packageName: 'nuxt-schema-org',
          version: null,
          certainty: 'possible',
          confidence: 4,
          source: 'html',
          signals: ['html:schema-org-json-ld'],
        })
      }

      if (hasNuxtPath(resource.src))
        addSignal(signals, 'html:nuxt-script-path', 3, 'html', 'Found script under /_nuxt/.')

      if (PRERENDERED_AT_RE.test(resource.innerHTML || ''))
        addRenderingSignal(renderingSignals, 'ssg', 9, 'payload', 'window.__NUXT__ contains prerenderedAt')

      if (WINDOW_NUXT_RE.test(resource.innerHTML || '')) {
        hasLegacyWindowNuxt = true
        addSignal(signals, 'html:window-nuxt', 5, 'html', 'Found legacy window.__NUXT__ payload.')
      }

      if (SERVER_RENDERED_TRUE_RE.test(resource.innerHTML || ''))
        addRenderingSignal(renderingSignals, 'ssr', 5, 'html', 'window.__NUXT__.serverRendered=true')

      if (SERVER_RENDERED_FALSE_RE.test(resource.innerHTML || ''))
        addRenderingSignal(renderingSignals, 'spa', 8, 'html', 'window.__NUXT__.serverRendered=false')
    }

    if (name === 'link') {
      const resource: HtmlResource = {
        href: normalizeResourceUrl(attributes.href, baseUrl),
        rel: attributes.rel,
        type: attributes.type,
        attributes,
      }
      links.push(resource)

      if (hasNuxtPath(resource.href))
        addSignal(signals, 'html:nuxt-link-path', 2, 'html', 'Found link under /_nuxt/.')

      if (resource.href?.includes('/_payload.json'))
        addSignal(signals, 'html:nuxt-payload-link', 3, 'payload', 'Found route _payload.json link.')

      if (resource.href?.includes('/_nuxt/builds/meta/'))
        addSignal(signals, 'html:nuxt-build-meta-link', 4, 'endpoint', 'Found Nuxt build metadata link.')
    }
  })

  if (signalConfidence(signals) > 0) {
    upsertPackage(packages, {
      name: 'nuxt',
      version: null,
      confidence: Math.min(signalConfidence(signals), 10),
      source: 'html',
      signals: signals.map(signal => signal.name),
    })
  }

  if (hasLegacyWindowNuxt && renderingSignals.length === 0)
    addRenderingSignal(renderingSignals, 'spa', 5, 'html', 'legacy window.__NUXT__ without SSR markers')

  const latestBuildEndpoint = endpointFrom(baseUrl, '/_nuxt/builds/latest.json')
  if (latestBuildEndpoint) {
    links.push({
      href: latestBuildEndpoint,
      rel: 'nuxt-build-latest',
      attributes: {},
    })
  }

  return { signals, packages, modules, scripts, links, title, rendering: resolveRendering(renderingSignals) }
}
