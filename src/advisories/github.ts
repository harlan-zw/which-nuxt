import type { AdvisoryOptions, GithubAdvisory } from '../types.ts'

export async function fetchGithubAdvisories(packageName: string, options: AdvisoryOptions = {}): Promise<GithubAdvisory[]> {
  const fetcher = options.fetch || globalThis.fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 10000)
  const url = new URL('https://api.github.com/advisories')
  url.searchParams.set('ecosystem', 'npm')
  url.searchParams.set('affects', packageName)
  url.searchParams.set('per_page', '100')

  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: {
        'accept': 'application/vnd.github+json',
        'user-agent': options.userAgent || 'which-nuxt/0.0.0',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
    })

    if (!response.ok)
      throw new Error(`GitHub advisory request failed for ${packageName}: ${response.status}`)

    return await response.json() as GithubAdvisory[]
  }
  finally {
    clearTimeout(timer)
  }
}
