import type { AdvisoryMatch, AdvisoryPackageResult, DetectedPackage, GithubAdvisory, GithubAdvisoryVulnerability } from '../types.ts'
import { intersects, satisfies, valid } from 'semver'

export type AdvisoryPackageTarget
  = | {
    name: string
    version: string
    versionRange: null
    matchType: 'exact'
  }
  | {
    name: string
    version: null
    versionRange: string
    matchType: 'possible'
  }

export interface AdvisoryTargetSelection {
  targets: AdvisoryPackageTarget[]
  packages: AdvisoryPackageResult[]
}

export interface AdvisoryTargetCheck {
  matches: AdvisoryMatch[]
  package: AdvisoryPackageResult
  updatedAt: string | null
}

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

function advisoryPackageTarget(pkg: DetectedPackage): AdvisoryPackageTarget | null {
  if (pkg.version && valid(pkg.version)) {
    return {
      name: pkg.name,
      version: pkg.version,
      versionRange: null,
      matchType: 'exact',
    }
  }

  if (!pkg.version && pkg.versionRange) {
    return {
      name: pkg.name,
      version: null,
      versionRange: pkg.versionRange,
      matchType: 'possible',
    }
  }

  return null
}

function skippedAdvisoryPackage(pkg: DetectedPackage): AdvisoryPackageResult {
  return {
    name: pkg.name,
    version: pkg.version || '',
    versionRange: null,
    advisoryCount: 0,
    skipped: true,
    reason: 'No exact valid semver version detected.',
  }
}

export function failedAdvisoryTarget(target: AdvisoryPackageTarget): AdvisoryPackageResult {
  return {
    name: target.name,
    version: target.version || '',
    versionRange: target.versionRange,
    advisoryCount: 0,
    skipped: true,
    reason: 'Failed to load advisories.',
  }
}

function checkedAdvisoryPackage(target: AdvisoryPackageTarget, advisoryCount: number): AdvisoryPackageResult {
  return {
    name: target.name,
    version: target.version || '',
    versionRange: target.versionRange,
    advisoryCount,
    skipped: false,
  }
}

function vulnerabilityMatches(target: AdvisoryPackageTarget, vulnerability: GithubAdvisoryVulnerability) {
  const vulnerableRange = normalizeGithubRange(vulnerability.vulnerable_version_range)

  if (target.matchType === 'exact')
    return satisfies(target.version, vulnerableRange, { includePrerelease: true })

  return intersects(target.versionRange, vulnerableRange, { includePrerelease: true })
}

function matchAdvisories(target: AdvisoryPackageTarget, advisories: GithubAdvisory[]) {
  const matches: AdvisoryMatch[] = []

  for (const advisory of advisories) {
    for (const vulnerability of advisory.vulnerabilities || []) {
      if (vulnerability.package.ecosystem !== 'npm' || vulnerability.package.name !== target.name)
        continue

      if (!vulnerabilityMatches(target, vulnerability))
        continue

      matches.push({
        packageName: target.name,
        version: target.version,
        versionRange: target.versionRange,
        matchType: target.matchType,
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

  return matches
}

export function selectAdvisoryTargets(packages: DetectedPackage[], includePackages?: readonly string[]): AdvisoryTargetSelection {
  const include = includePackages ? new Set(includePackages) : null
  const targets: AdvisoryPackageTarget[] = []
  const skippedPackages: AdvisoryPackageResult[] = []

  for (const pkg of packages) {
    if (include && !include.has(pkg.name))
      continue

    const target = advisoryPackageTarget(pkg)
    if (target) {
      targets.push(target)
    }
    else {
      skippedPackages.push(skippedAdvisoryPackage(pkg))
    }
  }

  return {
    targets: [
      ...targets.filter(target => target.matchType === 'exact'),
      ...targets.filter(target => target.matchType === 'possible'),
    ],
    packages: skippedPackages,
  }
}

export function checkAdvisoryTarget(target: AdvisoryPackageTarget, advisories: GithubAdvisory[]): AdvisoryTargetCheck {
  const matches = matchAdvisories(target, advisories)
  return {
    matches,
    package: checkedAdvisoryPackage(target, matches.length),
    updatedAt: advisoryUpdatedAt(advisories),
  }
}
