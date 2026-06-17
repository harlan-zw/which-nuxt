import type { DetectOptions } from '../types.ts'
import net from 'node:net'

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

// Default to a browser-like User-Agent for target-site requests: many WAFs
// (Cloudflare et al.) serve a challenge or block outright on non-browser agents,
// which otherwise shows up as a `fetch failed` and a missed detection. Callers can
// override via options.userAgent. Registry/API calls (RDAP, GitHub) keep their own
// identifying agent.
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

export interface FetchTextResult {
  body: string
  finalUrl: string
  status: number
  contentType: string | null
  headers: Record<string, string>
}

export async function fetchText(url: string, options: DetectOptions): Promise<FetchTextResult> {
  const fetcher = options.fetch || globalThis.fetch
  if (!options.fetch)
    ensureHappyEyeballsFallback()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 8000)

  try {
    const response = await fetcher(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': options.userAgent || DEFAULT_USER_AGENT,
      },
    })

    const body = await response.text()
    return {
      body,
      finalUrl: response.url || url,
      status: response.status,
      contentType: response.headers.get('content-type'),
      headers: Object.fromEntries(response.headers.entries()),
    }
  }
  finally {
    clearTimeout(timer)
  }
}

// We download the full script body so the precise Nuxt version getter, which is
// emitted near the end of the entry chunk, is always available to scanJs(). The
// maxJsBytes budget only bounds the noisier heuristic scans, applied inside scanJs().
export async function fetchScriptText(url: string, options: DetectOptions): Promise<string> {
  const result = await fetchText(url, {
    ...options,
    timeout: options.timeout ?? 8000,
  })
  return result.body
}
