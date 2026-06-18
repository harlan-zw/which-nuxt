import type { DetectedModule, DetectedPackage, DetectionSignal, ModuleDetectorPreset, ModuleHtmlResource, RenderingResult, RenderingSignal } from '../types.ts'
import { joinURL, withLeadingSlash } from 'ufo'
import { ELEMENT_NODE, parse, walkSync } from 'ultrahtml'
import { createDetectionEvidence, signalConfidence } from './signals.ts'

const NUXT_PATH_RE = /\/_nuxt(?:\/|$)/
const NUXT_GENERATOR_RE = /\bnuxt\b/i
const NUXT_GENERATOR_VERSION_RE = /\bnuxt\s+v?(\d+\.\d+\.\d+(?:-[\w.-]+)?)/i
const WINDOW_NUXT_RE = /\bwindow\.__NUXT__\b/
const SERVER_RENDERED_TRUE_RE = /\bserverRendered["']?\s*[:=]\s*true\b/
const SERVER_RENDERED_FALSE_RE = /\bserverRendered["']?\s*[:=]\s*false\b/
const PRERENDERED_AT_RE = /\bprerenderedAt\b/

type HtmlResource = ModuleHtmlResource

export interface HtmlScanResult {
  signals: DetectionSignal[]
  packages: DetectedPackage[]
  modules: DetectedModule[]
  scripts: HtmlResource[]
  links: HtmlResource[]
  title: string | null
  rendering: RenderingResult
}

export interface HtmlScanOptions {
  moduleDetectors?: readonly ModuleDetectorPreset[]
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

export function scanHtml(html: string, baseUrl: string | null, options: HtmlScanOptions = {}): HtmlScanResult {
  const ast = parse(html)
  const evidence = createDetectionEvidence()
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
    let resource: HtmlResource | null = null

    if (name === 'html' && 'data-n-head-ssr' in attributes)
      addRenderingSignal(renderingSignals, 'ssr', 7, 'html', 'html[data-n-head-ssr]')

    if (attributes.id === '__nuxt')
      evidence.addSignal('html:nuxt-root', 3, 'html', 'Found #__nuxt root element.')

    if (attributes['data-server-rendered'] === 'true')
      addRenderingSignal(renderingSignals, 'ssr', 7, 'html', '[data-server-rendered=true]')

    if (name === 'title')
      title = textContent(node).trim() || null

    if (name === 'meta') {
      const metaName = attributes.name?.toLowerCase()
      const content = attributes.content || ''
      if (metaName === 'generator' && NUXT_GENERATOR_RE.test(content)) {
        evidence.addSignal('html:generator-nuxt', 4, 'html', 'Found Nuxt generator meta tag.')
        const version = content.match(NUXT_GENERATOR_VERSION_RE)?.[1] || null
        if (version) {
          evidence.emitPackage({
            name: 'nuxt',
            version,
            confidence: 9,
            source: 'html',
            signals: ['html:generator-nuxt'],
          })
        }
      }
    }

    if (name === 'script') {
      resource = {
        src: normalizeResourceUrl(attributes.src, baseUrl),
        type: attributes.type,
        id: attributes.id,
        attributes,
        innerHTML: textContent(node),
      }
      scripts.push(resource)

      if (resource.id === '__NUXT_DATA__') {
        evidence.addSignal('html:nuxt-data', 5, 'html', 'Found Nuxt 3/4 __NUXT_DATA__ payload script.')
        if (attributes['data-ssr'] === 'true')
          addRenderingSignal(renderingSignals, 'ssr', 6, 'html', '__NUXT_DATA__ data-ssr=true')

        if (attributes['data-ssr'] === 'false')
          addRenderingSignal(renderingSignals, 'spa', 8, 'html', '__NUXT_DATA__ data-ssr=false')

        if (PRERENDERED_AT_RE.test(resource.innerHTML || ''))
          addRenderingSignal(renderingSignals, 'ssg', 9, 'payload', '__NUXT_DATA__ contains prerenderedAt')

        evidence.emitPackage({
          name: 'nuxt',
          version: null,
          confidence: 7,
          source: 'html',
          signals: ['html:nuxt-data'],
        })

        if (attributes['data-src']) {
          evidence.addSignal('html:nuxt-data-src', 2, 'payload', 'Found external Nuxt payload data source.')
          addRenderingSignal(renderingSignals, 'ssg', 4, 'payload', '__NUXT_DATA__ data-src external payload')
          links.push({
            href: normalizeResourceUrl(attributes['data-src'], baseUrl),
            rel: 'nuxt-payload',
            attributes,
          })
        }
      }

      if (hasNuxtPath(resource.src))
        evidence.addSignal('html:nuxt-script-path', 3, 'html', 'Found script under /_nuxt/.')

      if (PRERENDERED_AT_RE.test(resource.innerHTML || ''))
        addRenderingSignal(renderingSignals, 'ssg', 9, 'payload', 'window.__NUXT__ contains prerenderedAt')

      if (WINDOW_NUXT_RE.test(resource.innerHTML || '')) {
        hasLegacyWindowNuxt = true
        evidence.addSignal('html:window-nuxt', 5, 'html', 'Found legacy window.__NUXT__ payload.')
      }

      if (SERVER_RENDERED_TRUE_RE.test(resource.innerHTML || ''))
        addRenderingSignal(renderingSignals, 'ssr', 5, 'html', 'window.__NUXT__.serverRendered=true')

      if (SERVER_RENDERED_FALSE_RE.test(resource.innerHTML || ''))
        addRenderingSignal(renderingSignals, 'spa', 8, 'html', 'window.__NUXT__.serverRendered=false')
    }

    if (name === 'link') {
      resource = {
        href: normalizeResourceUrl(attributes.href, baseUrl),
        rel: attributes.rel,
        type: attributes.type,
        attributes,
      }
      links.push(resource)

      if (hasNuxtPath(resource.href))
        evidence.addSignal('html:nuxt-link-path', 2, 'html', 'Found link under /_nuxt/.')

      if (resource.href?.includes('/_payload.json'))
        evidence.addSignal('html:nuxt-payload-link', 3, 'payload', 'Found route _payload.json link.')

      if (resource.href?.includes('/_nuxt/builds/meta/'))
        evidence.addSignal('html:nuxt-build-meta-link', 4, 'endpoint', 'Found Nuxt build metadata link.')
    }

    if (options.moduleDetectors?.length) {
      let nodeText: string | undefined
      for (const detectorPreset of options.moduleDetectors) {
        for (const detector of detectorPreset.htmlDetectors || []) {
          detector({
            nodeName: name,
            attributes,
            get text() {
              nodeText ??= textContent(node)
              return nodeText
            },
            baseUrl,
            resource,
            hasNuxtPath,
            emitModule: evidence.emitModule,
            emitPackage: evidence.emitPackage,
          })
        }
      }
    }
  })

  if (signalConfidence(evidence.signals) > 0) {
    evidence.emitPackage({
      name: 'nuxt',
      version: null,
      confidence: Math.min(signalConfidence(evidence.signals), 10),
      source: 'html',
      signals: evidence.signals.map(signal => signal.name),
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

  return {
    signals: evidence.signals,
    packages: evidence.packages,
    modules: evidence.modules,
    scripts,
    links,
    title,
    rendering: resolveRendering(renderingSignals),
  }
}
