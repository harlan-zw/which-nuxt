import type { AdvisoryOptions, DetectOptions } from './types.ts'
import net from 'node:net'
import pkg from '../package.json' with { type: 'json' }

interface FetchWithTimeoutOptions {
  fetch?: typeof fetch
  timeout?: number
  init?: RequestInit
  beforeGlobalFetch?: () => void
}

export interface FetchTextResult {
  body: string
  finalUrl: string
  status: number
  contentType: string | null
  headers: Record<string, string>
}

// Identify honestly so site owners can see who is scanning and filter or contact us.
const DEFAULT_USER_AGENT = `which-nuxt/${pkg.version} (+https://github.com/harlan-zw/which-nuxt)`

// Node's Happy Eyeballs fallback (IPv6 -> IPv4) uses a 250ms per-attempt timeout by
// default. For hosts whose IPv6 route blackholes and whose IPv4 connect is slow, that
// window is too short: the fallback never completes and surfaces as a fast ETIMEDOUT,
// even though curl reaches the site with a more patient window. Raise it to 2.5s.
// Idempotent and only ever increases the value, so it won't shorten a window an
// embedding application already widened.
function ensureHappyEyeballsFallback() {
  const get = net.getDefaultAutoSelectFamilyAttemptTimeout
  const set = net.setDefaultAutoSelectFamilyAttemptTimeout
  if (typeof get === 'function' && typeof set === 'function' && get() < 2500)
    set(2500)
}

// The timeout covers the body read as well as the headers. A server that sends headers
// and then stalls the body would otherwise hold the scan open with no limit.
async function fetchWithTimeout<T>(
  input: Parameters<typeof fetch>[0],
  options: FetchWithTimeoutOptions,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const fetcher = options.fetch || globalThis.fetch
  if (!options.fetch)
    options.beforeGlobalFetch?.()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 8000)

  try {
    const response = await fetcher(input, {
      ...options.init,
      signal: controller.signal,
    })
    return await read(response)
  }
  finally {
    clearTimeout(timer)
  }
}

export async function fetchTargetText(url: string, options: DetectOptions): Promise<FetchTextResult> {
  return await fetchWithTimeout(url, {
    fetch: options.fetch,
    timeout: options.timeout ?? 8000,
    beforeGlobalFetch: ensureHappyEyeballsFallback,
    init: {
      redirect: 'follow',
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': options.userAgent || DEFAULT_USER_AGENT,
      },
    },
  }, async response => ({
    body: await response.text(),
    finalUrl: response.url || url,
    status: response.status,
    contentType: response.headers.get('content-type'),
    headers: Object.fromEntries(response.headers.entries()),
  }))
}

// We download the full script body so the precise Nuxt version getter, which is
// emitted near the end of the entry chunk, is always available to scanJs(). The
// maxJsBytes budget only bounds the noisier heuristic scans, applied inside scanJs().
export async function fetchTargetScriptText(url: string, options: DetectOptions): Promise<string> {
  const result = await fetchTargetText(url, {
    ...options,
    timeout: options.timeout ?? 8000,
  })
  return result.body
}

export async function fetchRdapJson(url: string, options: DetectOptions): Promise<unknown | null> {
  return await fetchWithTimeout(url, {
    fetch: options.fetch,
    timeout: options.timeout ?? 8000,
    init: {
      headers: {
        'accept': 'application/rdap+json, application/json',
        'user-agent': options.userAgent || DEFAULT_USER_AGENT,
      },
    },
  }, async response => response.ok ? await response.json() : null)
}

export type GithubJsonResult = { ok: true, data: unknown } | { ok: false, status: number }

export async function fetchGithubJson(url: URL, options: AdvisoryOptions): Promise<GithubJsonResult> {
  return await fetchWithTimeout(url, {
    fetch: options.fetch,
    timeout: options.timeout ?? 10000,
    init: {
      headers: {
        'accept': 'application/vnd.github+json',
        'user-agent': options.userAgent || DEFAULT_USER_AGENT,
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
    },
  }, async response => response.ok
    ? { ok: true, data: await response.json() }
    : { ok: false, status: response.status })
}
