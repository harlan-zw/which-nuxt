import type { GithubAdvisory } from '../../src/types.ts'
import { describe, expect, it } from 'vitest'
import { checkAdvisories } from '../../src/index.ts'

const advisory: GithubAdvisory = {
  ghsa_id: 'GHSA-test-0000-0000',
  html_url: 'https://github.com/advisories/GHSA-test-0000-0000',
  severity: 'high',
  summary: 'Test Nuxt advisory',
  published_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  vulnerabilities: [
    {
      package: {
        ecosystem: 'npm',
        name: 'nuxt',
      },
      vulnerable_version_range: '>= 3.0.0, < 3.16.0',
      first_patched_version: '3.16.0',
    },
  ],
}

const nuxt2Advisory: GithubAdvisory = {
  ghsa_id: 'GHSA-test-2222-2222',
  html_url: 'https://github.com/advisories/GHSA-test-2222-2222',
  severity: 'medium',
  summary: 'Test Nuxt 2 advisory',
  published_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  vulnerabilities: [
    {
      package: {
        ecosystem: 'npm',
        name: 'nuxt',
      },
      vulnerable_version_range: '>= 2.0.0, < 2.18.1',
      first_patched_version: '2.18.1',
    },
  ],
}

describe('checkAdvisories', () => {
  it('matches advisories for exact detected package versions', async () => {
    const result = await checkAdvisories({
      isNuxt: true,
      confidence: 10,
      packages: [
        {
          name: 'nuxt',
          version: '3.15.0',
          confidence: 9,
          source: 'js',
          signals: ['js:nuxt-version'],
        },
      ],
      modules: [],
      signals: [],
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      title: null,
      rendering: {
        mode: 'unknown',
        confidence: 0,
        signals: [],
      },
      hosting: null,
      cache: null,
      incomplete: false,
      errors: [],
    }, {
      advisoryFetcher: async () => [advisory],
    })

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.matchType).toBe('exact')
    expect(result.matches[0]?.firstPatchedVersion).toBe('3.16.0')
  })

  it('returns possible advisory matches for inferred version ranges', async () => {
    const result = await checkAdvisories({
      isNuxt: true,
      confidence: 10,
      packages: [
        {
          name: 'nuxt',
          version: null,
          versionRange: '>=2.18.0 <=2.18.1',
          certainty: 'inferred',
          confidence: 7,
          source: 'inferred',
          signals: ['js:nuxt-2-18-reload-guard'],
        },
      ],
      modules: [],
      signals: [],
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      title: null,
      rendering: {
        mode: 'unknown',
        confidence: 0,
        signals: [],
      },
      hosting: null,
      cache: null,
      incomplete: false,
      errors: [],
    }, {
      advisoryFetcher: async () => [nuxt2Advisory],
    })

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.matchType).toBe('possible')
    expect(result.matches[0]?.versionRange).toBe('>=2.18.0 <=2.18.1')
  })

  it('skips packages without exact versions', async () => {
    const result = await checkAdvisories({
      isNuxt: true,
      confidence: 7,
      packages: [
        {
          name: 'nuxt',
          version: null,
          confidence: 7,
          source: 'html',
          signals: ['html:nuxt-data'],
        },
      ],
      modules: [],
      signals: [],
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      title: null,
      rendering: {
        mode: 'unknown',
        confidence: 0,
        signals: [],
      },
      hosting: null,
      cache: null,
      incomplete: false,
      errors: [],
    }, {
      advisoryFetcher: async () => [advisory],
    })

    expect(result.matches).toHaveLength(0)
    expect(result.packages[0]?.skipped).toBe(true)
  })
})
