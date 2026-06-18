import type { AdvisoryMatch, AdvisoryOptions, AdvisoryPackageResult, AdvisoryResult, DetectResult } from '../types.ts'
import { fetchGithubAdvisories } from './github.ts'
import { checkAdvisoryTarget, failedAdvisoryTarget, selectAdvisoryTargets } from './match.ts'

export async function checkAdvisories(detected: DetectResult, options: AdvisoryOptions = {}): Promise<AdvisoryResult> {
  const matches: AdvisoryMatch[] = []
  const packages: AdvisoryPackageResult[] = []
  const errors: string[] = []
  const fetcher = options.advisoryFetcher || fetchGithubAdvisories
  let updatedAt: string | null = null
  const selection = selectAdvisoryTargets(detected.packages, options.includePackages)

  packages.push(...selection.packages)

  for (const target of selection.targets) {
    try {
      const advisories = await fetcher(target.name, options)
      const checked = checkAdvisoryTarget(target, advisories)
      updatedAt = [updatedAt, checked.updatedAt].filter(Boolean).sort().at(-1) || null
      matches.push(...checked.matches)
      packages.push(checked.package)
    }
    catch (error) {
      errors.push((error as Error).message)
      packages.push(failedAdvisoryTarget(target))
    }
  }

  return {
    matches,
    packages,
    source: options.advisoryFetcher ? 'custom' : 'github',
    updatedAt,
    incomplete: errors.length > 0,
    errors,
  }
}
