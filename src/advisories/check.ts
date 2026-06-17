import type { AdvisoryMatch, AdvisoryOptions, AdvisoryPackageResult, AdvisoryResult, DetectResult, GithubAdvisory, GithubAdvisoryVulnerability } from '../types.ts'
import { intersects, satisfies, valid } from 'semver'
import { fetchGithubAdvisories } from './github.ts'

function patchedVersion(value: GithubAdvisoryVulnerability['first_patched_version']) {
  if (!value)
    return null
  if (typeof value === 'string')
    return value
  if ('identifier' in value)
    return value.identifier || null
  if ('version' in value)
    return value.version || null
  return null
}

function advisoryUpdatedAt(advisories: GithubAdvisory[]) {
  const timestamps = advisories
    .map(advisory => advisory.updated_at)
    .filter((value): value is string => !!value)
    .sort()

  return timestamps.at(-1) || null
}

function normalizeGithubRange(range: string) {
  return range.replace(/,\s*/g, ' ')
}

export async function checkAdvisories(detected: DetectResult, options: AdvisoryOptions = {}): Promise<AdvisoryResult> {
  const matches: AdvisoryMatch[] = []
  const packages: AdvisoryPackageResult[] = []
  const errors: string[] = []
  const include = options.includePackages ? new Set(options.includePackages) : null
  const fetcher = options.advisoryFetcher || fetchGithubAdvisories
  let updatedAt: string | null = null

  const exactPackages = detected.packages
    .filter(pkg => pkg.version && valid(pkg.version))
    .filter(pkg => !include || include.has(pkg.name))
  const rangedPackages = detected.packages
    .filter(pkg => !pkg.version && pkg.versionRange)
    .filter(pkg => !include || include.has(pkg.name))

  for (const pkg of detected.packages) {
    if (include && !include.has(pkg.name))
      continue

    if ((!pkg.version || !valid(pkg.version)) && !pkg.versionRange) {
      packages.push({
        name: pkg.name,
        version: pkg.version || '',
        versionRange: null,
        advisoryCount: 0,
        skipped: true,
        reason: 'No exact valid semver version detected.',
      })
    }
  }

  for (const pkg of exactPackages) {
    try {
      const advisories = await fetcher(pkg.name, options)
      updatedAt = [updatedAt, advisoryUpdatedAt(advisories)].filter(Boolean).sort().at(-1) || null
      let advisoryCount = 0

      for (const advisory of advisories) {
        for (const vulnerability of advisory.vulnerabilities || []) {
          if (vulnerability.package.ecosystem !== 'npm' || vulnerability.package.name !== pkg.name)
            continue

          if (!satisfies(pkg.version!, normalizeGithubRange(vulnerability.vulnerable_version_range), { includePrerelease: true }))
            continue

          advisoryCount += 1
          matches.push({
            packageName: pkg.name,
            version: pkg.version!,
            versionRange: null,
            matchType: 'exact',
            ghsaId: advisory.ghsa_id,
            severity: advisory.severity,
            summary: advisory.summary,
            url: advisory.html_url,
            vulnerableVersionRange: vulnerability.vulnerable_version_range,
            firstPatchedVersion: patchedVersion(vulnerability.first_patched_version),
            publishedAt: advisory.published_at,
            updatedAt: advisory.updated_at,
          })
        }
      }

      packages.push({
        name: pkg.name,
        version: pkg.version!,
        versionRange: null,
        advisoryCount,
        skipped: false,
      })
    }
    catch (error) {
      errors.push((error as Error).message)
      packages.push({
        name: pkg.name,
        version: pkg.version!,
        versionRange: null,
        advisoryCount: 0,
        skipped: true,
        reason: 'Failed to load advisories.',
      })
    }
  }

  for (const pkg of rangedPackages) {
    try {
      const advisories = await fetcher(pkg.name, options)
      updatedAt = [updatedAt, advisoryUpdatedAt(advisories)].filter(Boolean).sort().at(-1) || null
      let advisoryCount = 0

      for (const advisory of advisories) {
        for (const vulnerability of advisory.vulnerabilities || []) {
          if (vulnerability.package.ecosystem !== 'npm' || vulnerability.package.name !== pkg.name)
            continue

          const vulnerableRange = normalizeGithubRange(vulnerability.vulnerable_version_range)
          if (!intersects(pkg.versionRange!, vulnerableRange, { includePrerelease: true }))
            continue

          advisoryCount += 1
          matches.push({
            packageName: pkg.name,
            version: null,
            versionRange: pkg.versionRange!,
            matchType: 'possible',
            ghsaId: advisory.ghsa_id,
            severity: advisory.severity,
            summary: advisory.summary,
            url: advisory.html_url,
            vulnerableVersionRange: vulnerability.vulnerable_version_range,
            firstPatchedVersion: patchedVersion(vulnerability.first_patched_version),
            publishedAt: advisory.published_at,
            updatedAt: advisory.updated_at,
          })
        }
      }

      packages.push({
        name: pkg.name,
        version: '',
        versionRange: pkg.versionRange,
        advisoryCount,
        skipped: false,
      })
    }
    catch (error) {
      errors.push((error as Error).message)
      packages.push({
        name: pkg.name,
        version: '',
        versionRange: pkg.versionRange,
        advisoryCount: 0,
        skipped: true,
        reason: 'Failed to load advisories.',
      })
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
