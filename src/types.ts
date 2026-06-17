import type { Storage } from 'unstorage'

export type DetectionSource = 'html' | 'endpoint' | 'js' | 'payload' | 'inferred'

export interface DetectInputObject {
  html: string
  url?: string
  finalUrl?: string
  headers?: Record<string, string>
}

export type DetectInput = string | URL | DetectInputObject

export interface DetectOptions {
  url?: string
  fetch?: typeof fetch
  userAgent?: string
  timeout?: number
  scanJs?: boolean
  probeEndpoints?: boolean
  maxJsRequests?: number
  maxJsBytes?: number
  hosting?: boolean
  domainAge?: boolean
  cache?: Storage<DetectCacheArtifact> | false
  cacheKey?: string
  cacheNamespace?: string
  cacheMaxAge?: number
  cacheBust?: boolean
}

export interface DetectionSignal {
  name: string
  weight: number
  source: DetectionSource
  description?: string
}

export interface DetectedPackage {
  name: string
  version: string | null
  versionRange?: string | null
  certainty?: 'confirmed' | 'inferred'
  confidence: number
  source: DetectionSource
  signals: string[]
}

export interface DetectedModule {
  name: string
  packageName: string
  version: string | null
  versionRange?: string | null
  certainty: 'confirmed' | 'inferred' | 'possible'
  confidence?: number
  source: DetectionSource
  signals: string[]
}

export interface DetectResult {
  isNuxt: boolean
  confidence: number
  packages: DetectedPackage[]
  modules: DetectedModule[]
  signals: DetectionSignal[]
  url: string | null
  finalUrl: string | null
  title: string | null
  rendering: RenderingResult
  hosting: HostingResult | null
  cache: DetectCacheState | null
  incomplete: boolean
  errors: string[]
}

export interface DetectCacheState {
  key: string
  hit: boolean
  age: number | null
}

export interface DetectCacheArtifact {
  version: 2
  createdAt: number
  result: DetectResult
}

export type RenderingMode = 'ssr' | 'ssg' | 'spa' | 'unknown'

export interface RenderingSignal {
  mode: Exclude<RenderingMode, 'unknown'>
  confidence: number
  source: DetectionSource
  signal: string
}

export interface RenderingResult {
  mode: RenderingMode
  confidence: number
  signals: RenderingSignal[]
}

export interface HostingProviderSignal {
  provider: string
  confidence: number
  source: 'header' | 'dns' | 'rdap'
  signal: string
}

export interface DomainAgeResult {
  domain: string
  createdAt: string | null
  ageDays: number | null
  registrar: string | null
  nameservers: string[]
}

export interface HostingResult {
  provider: string | null
  confidence: number
  signals: HostingProviderSignal[]
  headers: Record<string, string>
  domainAge: DomainAgeResult | null
}

export interface AdvisoryOptions {
  fetch?: typeof fetch
  token?: string
  userAgent?: string
  timeout?: number
  includePackages?: string[]
  advisoryFetcher?: AdvisoryFetcher
}

export interface AdvisoryPackageResult {
  name: string
  version: string
  versionRange?: string | null
  advisoryCount: number
  skipped: boolean
  reason?: string
}

export interface AdvisoryMatch {
  packageName: string
  version: string | null
  versionRange: string | null
  matchType: 'exact' | 'possible'
  ghsaId: string
  severity: string
  summary: string
  url: string
  vulnerableVersionRange: string
  firstPatchedVersion: string | null
  publishedAt: string | null
  updatedAt: string | null
}

export interface AdvisoryResult {
  matches: AdvisoryMatch[]
  packages: AdvisoryPackageResult[]
  source: 'github' | 'custom'
  updatedAt: string | null
  incomplete: boolean
  errors: string[]
}

export interface GithubAdvisoryPackage {
  ecosystem: string
  name: string
}

export interface GithubAdvisoryVulnerability {
  package: GithubAdvisoryPackage
  vulnerable_version_range: string
  first_patched_version: string | null | { identifier?: string } | { version?: string }
}

export interface GithubAdvisory {
  ghsa_id: string
  html_url: string
  severity: string
  summary: string
  published_at: string | null
  updated_at: string | null
  vulnerabilities: GithubAdvisoryVulnerability[]
}

export type AdvisoryFetcher = (packageName: string, options: AdvisoryOptions) => Promise<GithubAdvisory[]>
