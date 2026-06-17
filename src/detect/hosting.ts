import type { DetectOptions, DomainAgeResult, HostingProviderSignal, HostingResult } from '../types.ts'
import { parse as parseDomain } from 'tldts'

const CLOUDFLARE_RE = /\bcloudflare\b/i
const VERCEL_RE = /\bvercel\b/i
const NETLIFY_RE = /\bnetlify\b/i
const CLOUDFRONT_RE = /\bcloudfront\b/i
const FASTLY_CACHE_RE = /\bcache-[\w-]+\b/i
const FLY_RE = /\bfly\b/i
const RENDER_RE = /\brender\b/i
const GOOGLE_CLOUD_RE = /\bgoogle frontend\b|\bgfe\b/i
const PAGES_DEV_RE = /\bpages\.dev\b/i

function header(headers: Record<string, string>, name: string) {
  return headers[name.toLowerCase()]
}

function addProviderSignal(signals: HostingProviderSignal[], provider: string, confidence: number, signal: string) {
  signals.push({
    provider,
    confidence,
    source: 'header',
    signal,
  })
}

function detectHeaderProviders(headers: Record<string, string>) {
  const signals: HostingProviderSignal[] = []
  const server = header(headers, 'server') || ''
  const via = header(headers, 'via') || ''
  const poweredBy = header(headers, 'x-powered-by') || ''

  if (header(headers, 'cf-ray') || header(headers, 'cf-cache-status') || CLOUDFLARE_RE.test(server))
    addProviderSignal(signals, 'Cloudflare', 9, 'Cloudflare response headers.')

  if (header(headers, 'x-vercel-id') || header(headers, 'x-vercel-cache') || VERCEL_RE.test(server))
    addProviderSignal(signals, 'Vercel', 9, 'Vercel response headers.')

  if (header(headers, 'x-nf-request-id') || NETLIFY_RE.test(server))
    addProviderSignal(signals, 'Netlify', 9, 'Netlify response headers.')

  if (header(headers, 'x-amz-cf-id') || CLOUDFRONT_RE.test(via) || CLOUDFRONT_RE.test(header(headers, 'x-cache') || ''))
    addProviderSignal(signals, 'AWS CloudFront', 8, 'AWS CloudFront response headers.')

  if (header(headers, 'x-served-by') && FASTLY_CACHE_RE.test(header(headers, 'x-served-by') || ''))
    addProviderSignal(signals, 'Fastly', 7, 'Fastly cache headers.')

  if (header(headers, 'fly-request-id') || FLY_RE.test(server))
    addProviderSignal(signals, 'Fly.io', 8, 'Fly.io response headers.')

  if (header(headers, 'x-render-origin-server') || RENDER_RE.test(server))
    addProviderSignal(signals, 'Render', 7, 'Render response headers.')

  if (GOOGLE_CLOUD_RE.test(server) || header(headers, 'x-goog-generation'))
    addProviderSignal(signals, 'Google Cloud', 7, 'Google Cloud response headers.')

  if (PAGES_DEV_RE.test(poweredBy))
    addProviderSignal(signals, 'Cloudflare Pages', 8, 'Cloudflare Pages powered-by header.')

  return signals
}

function topProvider(signals: HostingProviderSignal[]) {
  const scores = new Map<string, number>()
  for (const signal of signals)
    scores.set(signal.provider, (scores.get(signal.provider) || 0) + signal.confidence)

  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0] || null
}

function createdEvent(events: any[]) {
  return events.find(event => ['registration', 'domain registration'].includes(String(event.eventAction).toLowerCase()))
    || events.find(event => String(event.eventAction).toLowerCase() === 'created')
}

function registrarName(entities: any[]) {
  for (const entity of entities || []) {
    if (!Array.isArray(entity.roles) || !entity.roles.includes('registrar'))
      continue
    const fn = entity.vcardArray?.[1]?.find((entry: any[]) => entry[0] === 'fn')?.[3]
    if (typeof fn === 'string')
      return fn
  }
  return null
}

async function fetchDomainAge(url: string, options: DetectOptions): Promise<DomainAgeResult | null> {
  const hostname = new URL(url).hostname
  const domain = parseDomain(hostname).domain
  if (!domain)
    return null

  const fetcher = options.fetch || globalThis.fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 8000)

  try {
    const response = await fetcher(`https://rdap.org/domain/${domain}`, {
      signal: controller.signal,
      headers: {
        'accept': 'application/rdap+json, application/json',
        'user-agent': options.userAgent || 'which-nuxt/0.0.0',
      },
    })

    if (!response.ok)
      return null

    const data = await response.json() as any
    const createdAt = createdEvent(data.events || [])?.eventDate || null
    const ageDays = createdAt
      ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
      : null

    return {
      domain,
      createdAt,
      ageDays,
      registrar: registrarName(data.entities || []),
      nameservers: (data.nameservers || [])
        .map((nameserver: any) => nameserver.ldhName || nameserver.unicodeName)
        .filter((value: unknown): value is string => typeof value === 'string'),
    }
  }
  finally {
    clearTimeout(timer)
  }
}

export async function analyzeHosting(url: string | null, headers: Record<string, string>, options: DetectOptions): Promise<{ hosting: HostingResult | null, errors: string[] }> {
  const errors: string[] = []
  const signals = detectHeaderProviders(headers)
  const top = topProvider(signals)
  let domainAge: DomainAgeResult | null = null

  if (url && options.domainAge) {
    try {
      domainAge = await fetchDomainAge(url, options)
    }
    catch (error) {
      errors.push(`rdap: ${(error as Error).message}`)
    }
  }

  if (!top && !domainAge && Object.keys(headers).length === 0)
    return { hosting: null, errors }

  return {
    hosting: {
      provider: top?.[0] || null,
      confidence: top?.[1] || 0,
      signals,
      headers,
      domainAge,
    },
    errors,
  }
}
