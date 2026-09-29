import type { AdvisoryOptions, GithubAdvisory } from '../types.ts'
import { fetchGithubJson } from '../request.ts'

export async function fetchGithubAdvisories(packageName: string, options: AdvisoryOptions = {}): Promise<GithubAdvisory[]> {
  const url = new URL('https://api.github.com/advisories')
  url.searchParams.set('ecosystem', 'npm')
  url.searchParams.set('affects', packageName)
  url.searchParams.set('per_page', '100')

  const result = await fetchGithubJson(url, options)

  if (!result.ok)
    throw new Error(`GitHub advisory request failed for ${packageName}: ${result.status}`)

  return result.data as GithubAdvisory[]
}
